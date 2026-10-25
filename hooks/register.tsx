import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Character, Friend, Game, Holding, Mood, MoodKind, Pets, Synced, Tick, Work } from '../types'
import type { Scene } from './game'
import {
  ACHIEVEMENTS,
  COSMETICS,
  DREAMS,
  TREATS,
  UPGRADES,
  accrue,
  affectionOf,
  buyCosmetic,
  buyUpgrade,
  formatHearts,
  formatRate,
  giftOf,
  giveGift,
  grant,
  heldGift,
  idleDue,
  idlePerSecond,
  isDream,
  isFever,
  isHappy,
  isMaxed,
  isSame,
  levelOf,
  liveCombo,
  lookOf,
  mergeGame,
  newGame,
  payIdle,
  perPet,
  perSecond,
  priceOf,
  restore,
  toolTip,
  touchGame,
  unlocked,
  wear,
} from './game'
import type { ViewProps } from './parade-view'
import type { TouchProps } from './touch-pad'
import { SCENE_ROWS, clawdText, coatOf, drawScene, encodeCells, frameOf, hex, isMarching, kaomoji, layout, putHeart, toSvg } from './scene'

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

const CHARACTER_KEY = 'character'
const PETS_KEY = 'pets'
const GAME_KEY = 'game'
// どのセッションかが最後に放置収入を払った時刻（放置収入を二重に払わないため）
const IDLE_KEY = 'idlePaidAt'
const PET_SHOW_MS = 4000
const CHARACTERS: Record<string, Character> = { clawd: 'clawd', neko: 'neko', cat: 'neko', ねこ: 'neko', 猫: 'neko' }
const SHOP = 'parade-shop'
const SHOP_WORDS = ['shop', 'game', 'ショップ', 'みせ', 'おみせ', 'ゲーム']

const FRAME_MS = 200
// 落ち着いている間は 3 コマに 1 回だけ描き直す
const CALM_EVERY = 3
// 放置収入は 5 コマ（1 秒）ごとに足し、保存は 5 秒に 1 回まで
const ACCRUE_EVERY = 5
const SAVE_EVERY_MS = 5000
// 取った実績を帯に出しておく時間
const UNLOCK_SHOW_MS = 5000
// デスクトップの星は大きく見えてせわしないので、またたきを 1/4 の速さにする
const DESKTOP_TWINKLE_TICKS = 4
// SVG 本来の 1 ドットの大きさ。舞台の幅まで縮められるよう、大きめにしておく
const DESKTOP_MARKUP_PIXEL = 16
// 手ざわり層の高さ（行）。上端から置き、地面まで届くよう絵より少し高めにとる。
// 下にはみ出たぶんは舞台で切る（デスクトップは bottom での配置が効かず、層ごと消えた）。
// デスクトップの 1 行はおよそ 28px、夜空はおよそ 160px なので 7 行で足りる
const TOUCH_ROWS = 7
// ぎゅっとされた仲間が跳ねているコマ数
const HOP_FRAMES = 6
const SLEEP_AFTER_MS = 3 * 60 * 1000
const GOODBYE_MS = 2500

const ASKING: MoodKind[] = ['permission', 'question', 'plan']

const LINES: Record<MoodKind, string[]> = {
  idle: ['よろしくね！なんでも言ってね'],
  working: ['おしごと中…カタカタ', 'がんばってるよ！', 'もうちょっと待ってね', 'ふむふむ…なるほど'],
  permission: ['これ、やってもいい？おねがい〜'],
  question: ['ちょっと聞きたいことがあるの'],
  plan: ['プランできたよ！見てみて'],
  done: ['おわったよ！ほめてほめて〜'],
  waiting: ['どうする？おへんじ待ってるね'],
  aborted: ['あっ、とめられちゃった…'],
  error: ['エラーになっちゃった…ごめんね'],
  refusal: ['それはできないの…ごめんね'],
  sleeping: ['すやすや…（話しかけたら起きるよ）'],
}

const PETTED_LINES: Partial<Record<MoodKind, string>> = {
  working: 'えへへ…おしごと中だけどうれしい♡',
  permission: 'なでなでより先に、おへんじほしいな…♡',
  error: 'ぐすん…なぐさめてくれるの？♡',
  aborted: 'ううん、だいじょうぶ…♡',
  sleeping: 'むにゃ…なでなで…♡',
}

const TONE: Record<MoodKind, string> = {
  idle: '#d97757',
  working: '#d97757',
  permission: '#ff7a59',
  question: '#ffd166',
  plan: '#ffe066',
  done: '#ff6b9a',
  waiting: '#ffd166',
  aborted: '#9ec9ff',
  error: '#6ec6ff',
  refusal: '#ff5c5c',
  sleeping: '#9ec9ff',
}

const clockText = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// 最後の段落が問いかけで終わっていたら「指示待ち」
const asksBack = (answer: string) => /[?？]\s*[)）」』]*\s*$/.test(answer.trim().split('\n').filter(l => l.trim()).at(-1) ?? '')

const setMood = async ($: EngineInterface, kind: MoodKind) => {
  const at = await $.clock.now()
  await update($, mood, () => ({ kind, at }))
}

// ゲームから見た今のようす：Claude が働いているか、働いている仲間の数
const sceneOf = (w: Work, list: Friend[]): Scene => ({
  isWorking: w.isRunning,
  workers: list.filter(f => f.doneAt === null).length,
})

let savedAt = 0
let saving = Promise.resolve()

// 同じ差分を 2 回足さないよう、保存は 1 つずつ順番に
function save($: EngineInterface, now: number) {
  const run = saving.then(() => saveNow($, now))
  saving = run.catch(() => undefined)
  return run
}

// ほかのセッションの保存に、このセッションで増えた（減った）ぶんだけを足し込んで書く
async function saveNow($: EngineInterface, now: number) {
  const [g, p, base] = await Promise.all([read($, game), read($, pets), read($, synced)])
  if (g.passiveAt === 0) return
  savedAt = now
  // まだ保存が無い・壊れている項目は、前回読んだ（書いた）ものとみなす
  const theirs = restore(await $.store.get(GAME_KEY), base.game)
  const merged = mergeGame(theirs, base.game, g)
  const total = (Number(await $.store.get(PETS_KEY)) || 0) + p.total - base.pets
  await $.store.set(GAME_KEY, merged)
  await $.store.set(PETS_KEY, total)
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
  const ms = idleDue(paidAt, now)
  if (ms > 0) await update($, game, one => payIdle(one, ms, now))
}

// 条件を満たした実績を渡して、トーストで知らせる
async function award($: EngineInterface, now: number, petsTotal: number, at: Scene) {
  const facts = (g: Game) => ({ game: g, pets: petsTotal, rate: perSecond(g, at) })
  const fresh = unlocked(facts(await read($, game)))
  if (fresh.length === 0) return
  await update($, game, g => grant(g, unlocked(facts(g)), now))
  for (const a of fresh) $.ui.toast(`🏆 実績「${a.name}」ゲット！`)
  await save($, now)
}

// 端末の Client、デスクトップの手ざわり層、「なでる」ボタンのどれからも呼ぶ
async function pet($: EngineInterface, kind: Pets['kind'], touch: { hand?: number; friend?: string } = {}) {
  const now = await $.clock.now()
  const after = await update($, pets, (p): Pets => ({
    total: p.total + 1,
    at: now,
    // 手を止めずになで続けている間は、ハートの流れを始めからやり直さない
    from: p.at > 0 && now - p.at < PET_SHOW_MS && p.kind === kind ? p.from : now,
    kind,
    hand: touch.hand ?? null,
    friend: touch.friend ?? null,
  }))
  const [m, w, list] = await Promise.all([read($, mood), read($, work), read($, friends)])
  const wasSleeping = m.kind === 'sleeping'
  if (wasSleeping) await update($, mood, () => ({ kind: 'idle', at: now }))

  const at = sceneOf(w, list)
  let isFeverStart = false
  await update($, game, g => {
    const touched = touchGame(g, now, at, { kind, wasSleeping })
    isFeverStart = touched.isFeverStart
    return touched.game
  })
  if (isFeverStart) $.ui.toast('★ フィーバー！ ♡ 3 倍！ ★')
  await award($, now, after.total, at)
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
      const at = sceneOf(w, list)
      await update($, game, one => accrue(one, now, at))
      await payIdleIncome($, now)
      await award($, now, p.total, at)
      if (now - savedAt >= SAVE_EVERY_MS) await save($, now)
    }

    // なでられている間とフィーバー中は、ハートが滑らかに動くよう毎コマ描く
    const isPetted = p.at > 0 && now - p.at < PET_SHOW_MS
    const isHolding = heldGift(held, now) !== null
    const isLively = isMarching(m.kind, list) || m.kind === 'done' || isPetted || isFever(g, now) || isHolding
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
    timer = $.clock.every(FRAME_MS, () => void step($))

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
    const data = e.data as { kind?: unknown; x?: unknown; id?: unknown } | null
    const kind = data?.kind
    if ((e.element !== 'parade' && e.element !== 'touch') || (kind !== 'pet' && kind !== 'stroke' && kind !== 'hug')) {
      return next(e)
    }

    await pet($, kind === 'hug' ? 'hug' : 'pet', {
      ...(typeof data?.x === 'number' ? { hand: data.x } : {}),
      ...(typeof data?.id === 'string' ? { friend: data.id } : {}),
    })

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

    const [m, list, w, t, who, petted, g, isDebug, held] = await Promise.all([
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
    const isPetted = petted.at > 0 && t.at - petted.at < PET_SHOW_MS
    // 贈り物をもらった直後は、なにより先にその贈り物へのお礼を言う
    const holdingId = heldGift(held, t.at)
    const thanked = holdingId ? giftOf(holdingId) : undefined
    const lines = LINES[m.kind]
    const say = thanked
      ? thanked.thanks
      : isPetted
        ? petted.kind === 'hug' ? 'なかまもよろこんでるよ♡' : PETTED_LINES[m.kind] ?? 'えへへ…♡ もっとなでて〜'
        : lines[Math.floor(t.n / 25) % lines.length] ?? lines[0]
    // 取ったばかりの実績は、しばらくなでなで回数やタイマーの行に出す
    const unlock = g.lastUnlock && t.at - g.lastUnlock.at < UNLOCK_SHOW_MS ? ACHIEVEMENTS.find(a => a.id === g.lastUnlock?.id) : undefined
    const info =
      unlock ? `🏆 実績「${unlock.name}」ゲット！` :
      thanked ? `🎁 ${thanked.name}${isDream(thanked.id) ? ' がやってきた！' : ` · ${g.gifts[thanked.id] ?? 1} 個目`}` :
      isPetted ? `なでなで ${petted.total} 回目 ♡` :
      w.isRunning ? `⏱ ${clockText(t.at - w.startedAt)}${w.tool ? ` · ${w.tool}` : ''}` :
      w.durationMs !== null ? `⏱ ${clockText(w.durationMs)} でおわり${w.helpers ? ` · なかま ${w.helpers}匹がてつだったよ` : ''}` :
      ''

    // なでなでゲームの行：フィーバー中はのこり時間、ふだんは ♡ と放置収入とコンボ
    const at = sceneOf(w, list)
    const combo = liveCombo(g, t.at)
    const isFeverNow = isFever(g, t.at)
    const happy = isHappy(g, t.at) ? ` · ごきげん ${clockText(g.happyUntil - t.at)}` : ''
    const score = isFeverNow
      ? `★ フィーバー ★ ♡×3 あと ${Math.ceil((g.feverUntil - t.at) / 1000)} 秒 · ♡ ${formatHearts(g.hearts)}`
      : `♡ ${formatHearts(g.hearts)} · +${formatRate(perSecond(g, at, t.at))}/秒${combo >= 2 ? ` · ${combo} コンボ！` : happy}`
    const scoreColor = isFeverNow ? '#ffb347' : '#ff9ec7'
    const look = lookOf(g, t.at, held)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const isDesktop = e.surface === 'desktop'

    const scoreLine = (
      <Text key="score" color={scoreColor} bold={isFeverNow} wrap="truncate-end">
        {score}
      </Text>
    )

    const legend = list.map(f => (
      <Box key={`f-${f.id}`}>
        <Text color={hex(coatOf(f.type))}>● {f.type} </Text>
        <Text dimColor wrap="truncate-end">
          {f.doneAt !== null ? 'おつかれさま！' : `${f.label}${f.tool ? ` · ${f.tool}` : ''}`}
        </Text>
      </Box>
    ))

    // デスクトップでも絵があれば手ざわり層で直接なでられる。絵が出せないほど狭いときだけボタンで
    const petRow = isDesktop && (
      <Box key="pet-row" paddingTop={1}>
        <Button key="pet" label="なでる ♡" onPress={() => void pet($, 'pet')} />
      </Box>
    )

    const words = (
      <Box key="words" flexDirection="column" flexShrink={1}>
        <Text color={isPetted || thanked ? '#ff6b9a' : TONE[m.kind]} bold wrap="truncate-end">
          {say}
        </Text>
        {info !== '' && (
          <Text dimColor wrap="truncate-end">
            {info}
          </Text>
        )}
        {scoreLine}
        {legend}
      </Box>
    )

    // 夜空に重ねる版：右端に寄せ、空の高さに収まるよう仲間は色つきの名札 1 行にまとめる
    const skyWords = (
      <Box key="words" flexDirection="column" alignItems="flex-end" paddingRight={2}>
        <Text color={isPetted || thanked ? '#ff6b9a' : TONE[m.kind]} bold wrap="truncate-end">
          {say}
        </Text>
        {info !== '' && (
          <Text dimColor wrap="truncate-end">
            {info}
          </Text>
        )}
        {scoreLine}
        {list.length > 0 && (
          <Box key="chips" columnGap={1} overflow="hidden">
            {[...Map.groupBy(list, f => f.type)].map(([type, crew]) => (
              <Text key={`c-${type}`} color={hex(coatOf(type))} wrap="truncate-end">
                ● {type}
                {crew.length > 1 ? ` ×${crew.length}` : ''}
                {crew.every(f => f.doneAt !== null) ? ' ♡' : ''}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )

    const cols = e.props.bodyColumns
    // デスクトップは夜空を帯の幅いっぱいに広げ、広いときは右側の空をセリフに空けておく
    const frame = frameOf(isDesktop ? 'desktop' : 'terminal', cols)
    const { isWide, columns: sceneColumns, paradeColumns, headroom } = frame
    const room = SCENE_ROWS + (isWide ? 0 : 3 + list.length)
    const sceneProps: ViewProps = { columns: sceneColumns, mood: m.kind, tick: t.n, friends: list, character: who, look }
    // デスクトップの絵は px で描くので、行数の余裕は見ない
    const canDraw = cols >= 40 && (isDesktop || (e.surface === 'terminal' && e.props.maxRows >= room))

    // デスクトップは SVG に、さわったぶんのハート・傾き・仲間のジャンプを足して描く
    const desktopScene = () => {
      const age = Math.floor((t.at - petted.from) / FRAME_MS)
      const isStroked = isPetted && petted.kind === 'pet'
      const hugged = isPetted && petted.kind === 'hug' && petted.friend !== null && age < HOP_FRAMES ? [petted.friend] : []
      const spots = layout(sceneColumns, paradeColumns, list, who)
      const { x, w } = spots.leader
      const sway = petted.hand !== null ? Math.round((petted.hand - (x + w / 2)) / 3) : [0, 1, 0, -1][age % 4] ?? 0
      const g = drawScene({
        ...sceneProps,
        paradeColumns,
        twinkleTicks: DESKTOP_TWINKLE_TICKS,
        headroom,
        petted: isStroked ? { sway } : null,
        hopping: hugged,
      })
      if (isStroked) {
        // なでている間は 2 コマごとにハートを出し、両脇から昇らせる
        const { hearts } = spots
        const lastTouch = Math.floor((petted.at - petted.from) / FRAME_MS)
        for (let k = Math.max(0, Math.ceil((age - 11) / 2)); k * 2 <= Math.min(age, lastTouch + 4); k++) {
          putHeart(g, hearts[k % hearts.length]!, headroom + 8 - (age - k * 2), k % 2 === 0)
        }
      }
      return toSvg(g, DESKTOP_MARKUP_PIXEL)
    }

    // 端末はなでなでできる Client を優先し、無い面では絵だけの Raster にする。
    // デスクトップは SVG の上に、同じ大きさの見えない手ざわり層（Client）を重ねる
    const scene =
      canDraw && isDesktop && 'Svg' in ui ? (
        (() => {
          const svg = desktopScene()
          const alt = `${who === 'clawd' ? 'Clawd' : 'ねこ'}${list.length ? `となかま ${list.length} 匹` : ''}のパレード`
          const touchProps: TouchProps = {
            columns: sceneColumns,
            paradeColumns,
            rows: TOUCH_ROWS,
            friends: list,
            character: who,
            isDebug,
          }
          const stageCells = cols
          // 割合（100%）の大きさはデスクトップで効かず層が左上に縮んだので、層も絵も同じマス数で置く。
          // セリフは手ざわり層より後に置き、層の上に重ねる
          return (
            <Box key="stage" width={stageCells} overflow="hidden">
              <ui.Svg source={svg.source} alt={alt} />
              {'Client' in ui && (
                <Box key="touch-layer" position="absolute" top={0} left={0} width={stageCells} height={TOUCH_ROWS}>
                  <ui.Client key="touch" module="./touch-pad.tsx" props={touchProps} width={stageCells} height={TOUCH_ROWS} />
                </Box>
              )}
              {isWide && (
                <Box
                  key="sky-words"
                  position="absolute"
                  top={0}
                  bottom={0}
                  right={0}
                  width={frame.wordsCells}
                  flexDirection="column"
                  justifyContent="center"
                  overflow="hidden"
                >
                  {skyWords}
                </Box>
              )}
            </Box>
          )
        })()
      ) : canDraw && 'Client' in ui ? (
        <ui.Client key="parade" module="./parade-view.tsx" props={sceneProps} width={sceneColumns} height={SCENE_ROWS} />
      ) : canDraw && 'Raster' in ui ? (
        (() => {
          const cells = encodeCells(drawScene(sceneProps))
          return <ui.Raster key="scene" columns={cells.columns} rows={cells.rows} cells={cells.cells} />
        })()
      ) : null

    // 広いデスクトップはセリフも夜空の中にあるので、絵だけを返す
    if (scene && isDesktop && isWide) return scene

    if (scene) {
      return (
        <Box flexDirection={isWide ? 'row' : 'column'}>
          {scene}
          <Box key="side" flexDirection="column" paddingLeft={isWide ? 1 : 0} paddingTop={isWide ? 1 : 0}>
            {words}
          </Box>
        </Box>
      )
    }

    const crew = list.map(f => (
      <Text key={`k-${f.id}`} color={hex(coatOf(f.type))}>
        {who === 'clawd'
          ? f.doneAt !== null ? '▗▛▜▖♡' : (t.n + f.id.length) % 2 ? '▗▛▜▖' : ' ▗▛▜▖'
          : f.doneAt !== null ? '(=^ᴗ^=)ﾉ' : (t.n + f.id.length) % 2 ? '(=･ω･=)' : '(=･ω･=)ﾉ'}{' '}
      </Text>
    ))

    return (
      <Box flexDirection="column">
        <Box key="row">
          {crew}
          <Text color={TONE[m.kind]} bold>
            {who === 'clawd' ? clawdText(m.kind, t.n) : kaomoji(m.kind, t.n)}{' '}
          </Text>
          <Text color={TONE[m.kind]}>{say}</Text>
        </Box>
        {info !== '' && <Text dimColor>{info}</Text>}
        {scoreLine}
        {petRow}
      </Box>
    )
  })

  // ---- なでなでショップ（/parade shop で開くパネル） ----

  on('ui.render', { component: 'Pane', requestId: SHOP }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [g, w, list, p, who] = await Promise.all([read($, game), read($, work), read($, friends), read($, pets), read($, character)])
    const at = sceneOf(w, list)
    // 放置収入は 1 秒ごとに足されるので、その時刻を「いま」とみなす
    const now = g.passiveAt

    // 買い物：足りなければ理由をトーストで、買えたら実績も見て、すぐ保存する
    const shop = (label: string, deal: (one: Game, when: number) => Game | string) => async () => {
      const when = await $.clock.now()
      let refusal: string | undefined
      let gave: Game['lastGift'] | undefined
      await update($, game, one => {
        const dealt = deal(one, when)
        refusal = typeof dealt === 'string' ? dealt : undefined
        gave = typeof dealt !== 'string' && dealt.lastGift !== one.lastGift ? dealt.lastGift : null
        return typeof dealt === 'string' ? one : dealt
      })
      if (refusal !== undefined) {
        $.ui.toast(refusal)
        return
      }
      // 贈り物なら、Clawd がかかえてお礼を言う
      if (gave) {
        const { id } = gave
        await update($, holding, () => ({ id, from: when }))
      }
      $.ui.toast(label)
      await award($, when, p.total, at)
      await save($, when)
    }

    const header = (title: string) => (
      <Box key={`h-${title}`} paddingTop={1}>
        <Text bold color="#ff9ec7">
          ── {title} ──
        </Text>
      </Box>
    )

    const workBoost = at.isWorking ? `（お仕事中 ×${2 + 0.5 * levelOf(g, 'coffee')}）` : ''
    const done = ACHIEVEMENTS.filter(a => g.achievements.includes(a.id)).length
    const affection = affectionOf(g.given)
    const lasts = (ms: number) => (ms >= 60_000 ? `${ms / 60_000} 分` : `${ms / 1000} 秒`)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="#ff6b9a">
          ♡ {formatHearts(g.hearts)}
        </Text>
        <Text dimColor>
          放置 +{formatRate(perSecond(g, at))}/秒 · 1 なで {formatRate(perPet(g, at, now, 0))} ♡{workBoost}
        </Text>
        <Text dimColor>なで続けると コンボ、30 コンボで フィーバー（♡×3）！</Text>

        {header('おかいもの')}
        {UPGRADES.map(u => {
          const level = levelOf(g, u.id)
          const isTop = isMaxed(u, level)
          const price = priceOf(u, level)
          return (
            <Box key={`u-${u.id}`} columnGap={1}>
              <Button
                key={`buy-${u.id}`}
                variant={!isTop && g.hearts >= price ? 'primary' : 'secondary'}
                onPress={shop(`${u.name} を Lv${level + 1} にしたよ！`, one => buyUpgrade(one, u.id))}
              >
                {u.name} Lv{level} <Text dimColor>{isTop ? 'MAX' : `${formatHearts(price)}♡`}</Text>
              </Button>
              <Text dimColor wrap="truncate-end">
                {u.about}
              </Text>
            </Box>
          )
        })}

        {header('きせかえ')}
        {COSMETICS.map(c => {
          const isOwned = g.owned.includes(c.id)
          const isWorn = c.hat !== undefined && g.hat === c.hat
          const label = !isOwned ? `${c.name} ${formatHearts(c.price)}♡` : isWorn ? `${c.name} ✓かぶってる` : c.hat ? `${c.name} をかぶる` : `${c.name} ✓`
          const press = !isOwned
            ? shop(`${c.name} を買ったよ！`, one => buyCosmetic(one, c.id))
            : c.hat
              ? shop(isWorn ? `${c.name} をはずしたよ` : `${c.name} をかぶったよ！`, one => wear(one, isWorn ? null : c.hat ?? null))
              : async () => $.ui.toast(`${c.name} はもう夜空にあるよ`)
          const about = c.id === 'catEars' && who === 'neko' ? 'ねこはもとからねこみみ（Clawd だけ）' : c.about
          return (
            <Box key={`c-${c.id}`} columnGap={1}>
              <Button key={`dress-${c.id}`} variant={!isOwned && g.hearts >= c.price ? 'primary' : 'secondary'} onPress={press}>
                {label}
              </Button>
              <Text dimColor wrap="truncate-end">
                {about}
              </Text>
            </Box>
          )
        })}

        {header(`プレゼント · なかよし度「${affection.name}」`)}
        <Text dimColor>
          {affection.next
            ? `あと ♡${formatHearts(affection.next.at - g.given)} 贈ると「${affection.next.name}」`
            : 'これ以上ないくらいなかよし！'}
          {isHappy(g, now) ? ` · ごきげん中 ♡×1.5（あと ${clockText(g.happyUntil - now)}）` : ''}
        </Text>
        {TREATS.map(treat => {
          const count = g.gifts[treat.id] ?? 0
          return (
            <Box key={`t-${treat.id}`} columnGap={1}>
              <Button
                key={`gift-${treat.id}`}
                variant={g.hearts >= treat.price ? 'primary' : 'secondary'}
                onPress={shop(`🎁 ${treat.name} をあげたよ！`, (one, when) => giveGift(one, treat.id, when))}
              >
                {treat.name} <Text dimColor>{formatHearts(treat.price)}♡</Text>
              </Button>
              <Text dimColor wrap="truncate-end">
                ごきげん {lasts(treat.happyMs)}
                {count > 0 ? ` · ${count} 回あげた` : ''}
              </Text>
            </Box>
          )
        })}

        {header('夢のプレゼント（ひとつごとに ♡ ずっと +10%）')}
        {DREAMS.map(dream => {
          const isGiven = (g.gifts[dream.id] ?? 0) > 0
          return (
            <Box key={`d-${dream.id}`} columnGap={1}>
              {isGiven ? (
                <Button key={`gift-${dream.id}`} onPress={async () => $.ui.toast(`${dream.name} はもう飾ってあるよ`)}>
                  {dream.name} ✓
                </Button>
              ) : (
                <Button
                  key={`gift-${dream.id}`}
                  variant={g.hearts >= dream.price ? 'primary' : 'secondary'}
                  onPress={shop(`🎁 ${dream.name} を贈ったよ！`, (one, when) => giveGift(one, dream.id, when))}
                >
                  {dream.name} <Text dimColor>{formatHearts(dream.price)}♡</Text>
                </Button>
              )}
              <Text dimColor wrap="truncate-end">
                {dream.shows}
              </Text>
            </Box>
          )
        })}

        {header(`実績 ${done}/${ACHIEVEMENTS.length}`)}
        {ACHIEVEMENTS.map(a => {
          const isMine = g.achievements.includes(a.id)
          return (
            <Box key={`a-${a.id}`} columnGap={1}>
              <Text {...(isMine ? { color: '#ffd166' } : { dimColor: true })}>
                {isMine ? '🏆' : '・'} {a.name}
              </Text>
              <Text dimColor wrap="truncate-end">
                {a.about}
              </Text>
            </Box>
          )
        })}

        {header('きろく')}
        <Text dimColor>
          なでた回数 {formatHearts(p.total)} 回 · 稼いだ ♡ {formatHearts(g.earned)} · 贈った ♡ {formatHearts(g.given)}
        </Text>
        <Text dimColor>
          最高コンボ {g.maxCombo} · フィーバー {g.fevers} 回 · お仕事中のなでなで {formatHearts(g.workPets)} 回 · ぎゅっ {g.hugs} 回
        </Text>
      </Box>
    )
  })
}
