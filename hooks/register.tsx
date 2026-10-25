// フックの登録と、セッションの状態（atom）。帯は band.tsx、ショップは shop.tsx が描く

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Character, Friend, Game, Holding, Mood, MoodKind, Pets, Synced, Tick, TouchKind, Work } from '../types'
import { bandView } from './band'
import type { Deal, Situation } from './game'
import {
  HOOK_FRAME_MS,
  accrue,
  grant,
  heldGift,
  idleDue,
  idlePerSecond,
  isFever,
  isPetted,
  isSame,
  mergeGame,
  newGame,
  payIdle,
  perSecond,
  restore,
  situationOf,
  toolTip,
  touchGame,
  unlocked,
} from './game'
import { messageOf } from './message'
import { isMarching } from './scene'
import { SHOP, shopView } from './shop'

const CHARACTER_KEY = 'character'
const CHARACTERS: Record<string, Character> = { clawd: 'clawd', neko: 'neko', cat: 'neko', ねこ: 'neko', 猫: 'neko' }
const SHOP_WORDS = ['shop', 'game', 'ショップ', 'みせ', 'おみせ', 'ゲーム']

// 落ち着いている間は 3 コマに 1 回だけ描き直す
const CALM_EVERY = 3
// 放置収入は 5 コマ（1 秒）ごとに足す
const ACCRUE_EVERY = 5
const SLEEP_AFTER_MS = 3 * 60 * 1000
const GOODBYE_MS = 2500

const ASKING: MoodKind[] = ['permission', 'question', 'plan']

// 最後の段落が問いかけで終わっていたら「指示待ち」
const asksBack = (answer: string) => /[?？]\s*[)）」』]*\s*$/.test(answer.trim().split('\n').filter(l => l.trim()).at(-1) ?? '')

const mood = atom({ plugin: 'clawd-parade', key: 'mood' } as const, { kind: 'idle', at: 0 } as Mood)
const friends = atom({ plugin: 'clawd-parade', key: 'friends' } as const, [] as Friend[])
const work = atom({ plugin: 'clawd-parade', key: 'work' } as const, {
  startedAt: 0,
  tool: null,
  durationMs: null,
  helpers: 0,
  isRunning: false,
} as Work)
const tick = atom({ plugin: 'clawd-parade', key: 'tick' } as const, { n: 0, at: 0 } as Tick)
const isHidden = atom({ plugin: 'clawd-parade', key: 'isHidden' } as const, false)
const character = atom({ plugin: 'clawd-parade', key: 'character' } as const, 'clawd' as Character)

const pets = atom({ plugin: 'clawd-parade', key: 'pets' } as const, {
  total: 0,
  at: 0,
  from: 0,
  kind: 'pet',
  hand: null,
  friend: null,
} as Pets)

// passiveAt が 0 のうちは、まだ保存から読み込んでいない
const game = atom({ plugin: 'clawd-parade', key: 'game' } as const, newGame(0, 0) as Game)
const touchDebug = atom({ plugin: 'clawd-parade', key: 'touchDebug' } as const, false)
// 前回 store から読んだ（store に書いた）ゲームとなでた回数。次に保存するときは、ここからの差分を足し込む
const synced = atom({ plugin: 'clawd-parade', key: 'synced' } as const, { game: newGame(0, 0), pets: 0 } as Synced)
const holding = atom({ plugin: 'clawd-parade', key: 'holding' } as const, null as Holding)

const PETS_KEY = 'pets'
const GAME_KEY = 'game'
// どのセッションかが最後に放置収入を払った時刻（放置収入を二重に払わないため）
const IDLE_KEY = 'idlePaidAt'
// 保存は 5 秒に 1 回まで
const SAVE_EVERY_MS = 5000

async function setMood($: EngineInterface, kind: MoodKind) {
  const at = await $.clock.now()
  await update($, mood, () => ({ kind, at }))
}

// ---- 保存 ----------------------------------------------------------------

let savedAt = 0
let saving = Promise.resolve()

// 同じ差分を 2 回足さないよう、保存は 1 つずつ順番に
function save($: EngineInterface, now: number) {
  const run = saving.then(() => saveNow($, now))
  saving = run.catch(() => undefined)
  return run
}

// 前の保存から SAVE_EVERY_MS たっていれば保存する
async function saveIfDue($: EngineInterface, now: number) {
  if (now - savedAt >= SAVE_EVERY_MS) await save($, now)
}

// ほかのセッションの保存に、このセッションで増えた（減った）ぶんだけを足し込んで書く
async function saveNow($: EngineInterface, now: number) {
  const [g, p, base] = await Promise.all([read($, game), read($, pets), read($, synced)])
  if (g.passiveAt === 0) return
  savedAt = now
  // まだ保存が無い・壊れている項目は、前回読んだ（書いた）ものとみなす
  // store には compare-and-set が無いので、書く直前に読み、書いたあとに読み直して確かめる
  const theirs = restore(await $.store.get(GAME_KEY), base.game)
  const written = mergeGame(theirs, base.game, g)
  const writtenPets = (Number(await $.store.get(PETS_KEY)) || 0) + p.total - base.pets
  await $.store.set(GAME_KEY, written)
  await $.store.set(PETS_KEY, writtenPets)
  // 書いてから読み直すまでに別のセッションが書いていたら、そちらを今の保存とする。
  // そのセッションはこちらの書いたものを読んでから足し込んだはずなので、こちらのぶんをもう一度は足さない
  // （二重に足して ♡ が増えることはない。こちらが書く前に読まれていたら、こちらの差分は落ちることがある）
  const merged = restore(await $.store.get(GAME_KEY), written)
  const total = Number(await $.store.get(PETS_KEY)) || writtenPets
  await update($, synced, () => ({ game: merged, pets: total }))
  // 保存している間になでたぶんも落とさずに、ほかのセッションのぶんを取り込む
  await update($, game, one => mergeGame(merged, g, one))
  // 別のセッションで贈った贈り物が届いたら、こちらでも今からかかえてお礼を言う
  if (merged.lastGift && !isSame(merged.lastGift, g.lastGift)) {
    const { id } = merged.lastGift
    await update($, holding, () => ({ id, from: now }))
  }
  await update($, pets, one => ({ ...one, total: total + one.total - p.total }))
}

// 放置収入は、開いているセッションのどれか 1 つが払う。最後に払った時刻を store で分け合う
async function payIdleIncome($: EngineInterface, now: number) {
  if (idlePerSecond(await read($, game), now) === 0) return
  const paidAt = Number(await $.store.get(IDLE_KEY)) || 0
  if (paidAt >= now) return
  await $.store.set(IDLE_KEY, now)
  // 同じ時刻を読んだ別のセッションが、あとから書いていたら、そちらが（こちらのぶんもまとめて）払う
  if (Number(await $.store.get(IDLE_KEY)) !== now) return
  const ms = idleDue(paidAt, now)
  if (ms > 0) await update($, game, one => payIdle(one, ms, now))
}

// ---- 実績・なでる・買う ------------------------------------------------------

// 条件を満たした実績を渡して、トーストで知らせる
async function award($: EngineInterface, now: number, petsTotal: number, at: Situation) {
  const facts = (g: Game) => ({ game: g, pets: petsTotal, rate: perSecond(g, at) })
  const fresh = unlocked(facts(await read($, game)))
  if (fresh.length === 0) return
  await update($, game, g => grant(g, unlocked(facts(g)), now))
  for (const a of fresh) $.ui.toast(`🏆 実績「${a.name}」ゲット！`)
  await save($, now)
}

// 端末の Client、デスクトップの手ざわり層、「なでる」ボタンのどれからも呼ぶ
async function pet($: EngineInterface, kind: TouchKind, touch: { hand?: number; friend?: string } = {}) {
  const now = await $.clock.now()
  const after = await update($, pets, (p): Pets => ({
    total: p.total + 1,
    at: now,
    // 手を止めずになで続けている間は、ハートの流れを始めからやり直さない
    from: isPetted(p, now) && p.kind === kind ? p.from : now,
    kind,
    hand: touch.hand ?? null,
    friend: touch.friend ?? null,
  }))
  const [m, w, list] = await Promise.all([read($, mood), read($, work), read($, friends)])
  const wasSleeping = m.kind === 'sleeping'
  if (wasSleeping) await update($, mood, () => ({ kind: 'idle', at: now }))

  const at = situationOf(w, list)
  let isFeverStart = false
  await update($, game, g => {
    const touched = touchGame(g, now, at, { kind, wasSleeping })
    isFeverStart = touched.isFeverStart
    return touched.game
  })
  if (isFeverStart) $.ui.toast('★ フィーバー！ ♡ 3 倍！ ★')
  await award($, now, after.total, at)
}

// 買い物：足りなければ理由をトーストで、買えたら知らせて実績も見て、すぐ保存する。
// 贈り物なら、Clawd がかかえてお礼を言う。いまはショップのボタンから呼ぶ（帯のボタンからも呼べる形にしてある）
async function buy($: EngineInterface, label: string, deal: Deal) {
  const now = await $.clock.now()
  let refusal: string | undefined
  let gave: Game['lastGift'] | undefined
  await update($, game, g => {
    const dealt = deal(g, now)
    if (!dealt.ok) {
      refusal = dealt.reason
      return g
    }
    refusal = undefined
    gave = dealt.game.lastGift !== g.lastGift ? dealt.game.lastGift : null
    return dealt.game
  })
  if (refusal !== undefined) {
    $.ui.toast(refusal)
    return
  }
  if (gave) {
    const { id } = gave
    await update($, holding, () => ({ id, from: now }))
  }
  $.ui.toast(label)
  const [p, w, list] = await Promise.all([read($, pets), read($, work), read($, friends)])
  await award($, now, p.total, situationOf(w, list))
  await save($, now)
}

let timer: { cancel: () => void } | undefined
let beat = 0
let isStepping = false

async function step($: EngineInterface) {
  if (isStepping) return
  isStepping = true
  try {
    beat += 1
    const [m, list, p, g, w, held] = await Promise.all([
      read($, mood),
      read($, friends),
      read($, pets),
      read($, game),
      read($, work),
      read($, holding),
    ])
    const now = await $.clock.now()

    if (beat % ACCRUE_EVERY === 0 && g.passiveAt > 0) {
      const at = situationOf(w, list)
      await update($, game, one => accrue(one, now, at))
      await payIdleIncome($, now)
      await award($, now, p.total, at)
      await saveIfDue($, now)
    }

    // なでられている間とフィーバー中は、ハートが滑らかに動くよう毎コマ描く
    const isHolding = heldGift(held, now) !== null
    const isLively = isMarching(m.kind, list) || m.kind === 'done' || isPetted(p, now) || isFever(g, now) || isHolding
    if (!isLively && beat % CALM_EVERY !== 0) return

    const isCalm = !isMarching(m.kind, list) && !ASKING.includes(m.kind)
    if (isCalm && m.kind !== 'sleeping' && m.at > 0 && now - m.at > SLEEP_AFTER_MS) {
      await update($, mood, () => ({ kind: 'sleeping', at: now }))
    }
    if (list.some(f => f.doneAt !== null && now - f.doneAt > GOODBYE_MS)) {
      await update($, friends, all => all.filter(f => f.doneAt === null || now - f.doneAt <= GOODBYE_MS))
    }
    await update($, tick, t => ({ n: t.n + 1, at: now }))
  } finally {
    isStepping = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'parade',
      description: 'パレードを表示する／隠す（/parade shop でなでなでショップ、/parade clawd・/parade cat でキャラ切り替え）',
    })
    const saved = CHARACTERS[String(await $.store.get(CHARACTER_KEY))]
    if (saved) await update($, character, () => saved)
    // 読み込み直し（ホットリロード）のときは、セッションに残っている新しいほうを使う
    const now = await $.clock.now()
    if ((await read($, game)).passiveAt === 0) {
      const total = Number(await $.store.get(PETS_KEY)) || 0
      await update($, pets, p => ({ ...p, total }))
      const loaded = restore(await $.store.get(GAME_KEY), newGame(total, now))
      await update($, game, () => loaded)
      await update($, synced, () => ({ game: loaded, pets: total }))
    } else {
      // 前の版のセッションの値に、この版で足した項目（v など）を埋める
      const fill = (g: Game) => restore(g, newGame(g.hearts, g.passiveAt))
      await update($, game, fill)
      await update($, synced, s => ({ ...s, game: fill(s.game) }))
    }
    savedAt = now
    timer?.cancel()
    timer = $.clock.every(HOOK_FRAME_MS, () => void step($))

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await save($, await $.clock.now())

    return next(e)
  })

  on('command.run', { command: 'parade' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (SHOP_WORDS.includes(arg)) {
      const opened = await $.ui.open({ id: SHOP, title: 'なでなでショップ' })

      return { text: opened.isPlaced ? 'なでなでショップを開いたよ！' : `ショップはまだ開けないみたい（${opened.reason}）` }
    }
    if (arg === 'debug') {
      const isOn = await update($, touchDebug, v => !v)

      return { text: isOn ? 'なでなでの当たり判定を、ピンクの枠で見えるようにしたよ（/parade debug で消える）' : '当たり判定の枠を消したよ' }
    }
    const picked = CHARACTERS[arg]
    if (picked) {
      await update($, character, () => picked)
      await update($, isHidden, () => false)
      await $.store.set(CHARACTER_KEY, picked)

      return { text: picked === 'clawd' ? 'Clawd がやってきた！' : 'ねこたちがやってきた！' }
    }
    if (arg !== '') return { text: '使い方: /parade（表示切り替え） / /parade shop / /parade clawd / /parade cat / /parade debug' }

    const hidden = await update($, isHidden, v => !v)

    return { text: hidden ? 'みんなお昼寝に行きました（/parade でまた呼べます）' : 'みんな戻ってきました！' }
  })

  on('ui.message', async ($, e, next) => {
    const message = e.element === 'parade' || e.element === 'touch' ? messageOf(e.data) : null
    if (!message) return next(e)

    if (message.kind === 'hug') await pet($, 'hug', message.id !== undefined ? { friend: message.id } : {})
    else await pet($, 'pet', message.x !== undefined ? { hand: message.x } : {})

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, work, () => ({ startedAt: now, tool: null, durationMs: null, helpers: 0, isRunning: true }))
    await update($, mood, () => ({ kind: 'working', at: now }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (e.agentId !== undefined) {
      const id = e.agentId
      await update($, friends, all => all.map(f => (f.id === id ? { ...f, tool } : f)))
    } else {
      await update($, work, w => ({ ...w, tool }))
      if (tool === 'AskUserQuestion') await setMood($, 'question')
      if (tool === 'ExitPlanMode') await setMood($, 'plan')
    }

    const ran = await next(e)

    // ツールを使うたびに、おだちんの ♡
    await update($, game, g => (g.passiveAt === 0 ? g : toolTip(g)))
    const [m, w] = await Promise.all([read($, mood), read($, work)])
    if (w.isRunning && ASKING.includes(m.kind)) await setMood($, 'working')

    return ran
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await setMood($, 'permission')

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny === undefined && spawned.agentId !== undefined) {
      const friend: Friend = {
        id: spawned.agentId,
        type: e.subagentType,
        label: e.description,
        tool: null,
        doneAt: null,
      }
      await update($, friends, all => [...all.filter(f => f.id !== friend.id), friend])
      await update($, work, w => ({ ...w, helpers: w.helpers + 1 }))
    }

    return spawned
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()

    if (e.agentId !== undefined) {
      const id = e.agentId
      await update($, friends, all => all.map(f => (f.id === id && f.doneAt === null ? { ...f, doneAt: now } : f)))

      return next(e)
    }

    const kind: MoodKind =
      e.reason === 'aborted' ? 'aborted' :
      e.reason === 'error' ? 'error' :
      e.reason === 'refusal' ? 'refusal' :
      asksBack(e.answer) ? 'waiting' : 'done'
    await update($, work, w => ({ ...w, durationMs: e.durationMs, isRunning: false }))
    await update($, mood, () => ({ kind, at: now }))
    if (kind === 'aborted') {
      await update($, friends, all => all.map(f => (f.doneAt === null ? { ...f, doneAt: now } : f)))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    // 画像を貼った下書きの間は、paste-preview などの下のプラグインに帯をゆずる
    const draft = await $.prompt.read().catch(() => ({ text: '' }))
    if (/\[Image #\d+\]/.test(draft.text)) return next(e)

    const [m, list, w, t, who, p, g, isDebug, held] = await Promise.all([
      read($, mood),
      read($, friends),
      read($, work),
      read($, tick),
      read($, character),
      read($, pets),
      read($, game),
      read($, touchDebug),
      read($, holding),
    ])
    return bandView($.ui.resolve(e), {
      mood: m,
      work: w,
      friends: list,
      pets: p,
      game: g,
      holding: held,
      tick: t,
      surface: e.surface,
      cols: e.props.bodyColumns,
      maxRows: e.props.maxRows,
      character: who,
      isDebug,
      onPet: () => void pet($, 'pet'),
    })
  })

  // なでなでショップ（/parade shop で開くパネル）
  on('ui.render', { component: 'Pane', requestId: SHOP }, async ($, e) => {
    const [g, w, list, p, who] = await Promise.all([read($, game), read($, work), read($, friends), read($, pets), read($, character)])
    return shopView($.ui.resolve(e), {
      game: g,
      at: situationOf(w, list),
      petsTotal: p.total,
      character: who,
      buy: (label, deal) => () => buy($, label, deal),
      say: text => async () => $.ui.toast(text),
    })
  })
}
