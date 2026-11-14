// フックの登録と、セッションの状態（atom）。帯は band.tsx、ショップは shop.tsx が描く

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Character, DiaryKind, RoomHeld, Friend, Game, Holding, Mood, MoodKind, Pets, Synced, Tick, TouchKind, TreatId, Weather, Work } from '../types'
import { bandView } from './band'
import { dayOf, record, tidyDiary } from './diary'
import type { Deal, Situation } from './game'
import {
  HOOK_FRAME_MS,
  accrue,
  isLit,
  lookOf,
  giftOf,
  giveGift,
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
  treatOf,
  unlocked,
} from './game'
import { messageOf } from './message'
import { HOLIDAY_NAMES, SEASON_NAMES, calendarOf, parseMonthDay, timeOfDay } from './palette'
import { ACTIVITY_NAMES, ROOM_ITEMS, RULER_SCENE, activityOf, holdActivity, parseScene, roomSvg, rulerSvg, sceneName } from './room'
import type { RoomScene, Side } from './room'
import { isMarching } from './scene'
import { WEATHER_NAMES, WEATHER_WORDS, weatherAt } from './weather'
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
// /parade debug 12/25 で選んだ、見てみたい日（季節と行事の飾りを確かめるため）。このセッションだけで、保存しない
const dateOverride = atom({ plugin: 'clawd-parade', key: 'dateOverride' } as const, null as { month: number; day: number } | null)
// /parade debug rain で選んだ天気（#42。天気の絵を確かめるため）。このセッションだけで、保存しない
const weatherOverride = atom({ plugin: 'clawd-parade', key: 'weatherOverride' } as const, null as Weather | null)
// 前回 store から読んだ（store に書いた）ゲームとなでた回数。次に保存するときは、ここからの差分を足し込む
const synced = atom({ plugin: 'clawd-parade', key: 'synced' } as const, { game: newGame(0, 0), pets: 0 } as Synced)
const holding = atom({ plugin: 'clawd-parade', key: 'holding' } as const, null as Holding)
// /parade theme：デスクトップの背景に Clawd のおへやを描く
const backdrop = atom({ plugin: 'clawd-parade', key: 'backdrop' } as const, false)
const backdropSide = atom({ plugin: 'clawd-parade', key: 'backdropSide' } as const, 'right' as Side)
const roomHeld = atom({ plugin: 'clawd-parade', key: 'roomHeld' } as const, null as RoomHeld | null)
const roomScene = atom({ plugin: 'clawd-parade', key: 'roomScene' } as const, null as string | null)

const PETS_KEY = 'pets'
const GAME_KEY = 'game'
// どのセッションかが最後に放置収入を払った時刻（放置収入を二重に払わないため）
const IDLE_KEY = 'idlePaidAt'
// 保存は 5 秒に 1 回まで
const SAVE_EVERY_MS = 5000
// /parade theme を入れているか（次のセッションでも背景に描く）と、おへやを置く側
const THEME_KEY = 'theme'
const THEME_SIDE_KEY = 'themeSide'
const THEME_WORDS = ['theme', 'テーマ', '背景', 'はいけい']
// 背景を描く面は、会話のパネルを少しすりガラスにする。おへやは暗めなので、画面は暗い色にそろえてもらう
const GLASS = { blur: 8, opacity: 0.5 }

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
  // 日記の古い日は、合わせたあとのものから消す（差分にしないので、ほかのセッションと同時に消しても負にならない）
  const written = tidyDiary(mergeGame(theirs, base.game, g), dayOf(now))
  const writtenPets = (Number(await $.store.get(PETS_KEY)) || 0) + p.total - base.pets
  await $.store.set(GAME_KEY, written)
  await $.store.set(PETS_KEY, writtenPets)
  // 書いてから読み直すまでに別のセッションが書いていたら、そちらを今の保存とする。
  // そのセッションはこちらの書いたものを読んでから足し込んだはずとみなし、こちらのぶんをもう一度は足さない。
  // 二重に足して ♡ が増えることはないが、こちらが書く前に読まれていたら、こちらの差分は落ちる
  // （compare-and-set が無いので、これは防げない。読み書きの間をせまくしているだけ）
  const merged = restore(await $.store.get(GAME_KEY), written)
  const storedPets = await $.store.get(PETS_KEY)
  const total = typeof storedPets === 'number' && Number.isFinite(storedPets) ? storedPets : writtenPets
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

// きょうの日記（#43）に数を足す。日は時計の今の日付（PC のタイムゾーン）で、/parade debug 12/25 の日付は使わない。
// 数だけを渡す（ツールの名前やプロンプトは渡さない）。読み込む前（passiveAt が 0）は数えない
async function jot($: EngineInterface, add: Partial<Record<DiaryKind, number>>) {
  const day = dayOf(await $.clock.now())
  await update($, game, g => (g.passiveAt === 0 ? g : record(g, day, add)))
}

// 放置収入は、開いているセッションのどれか 1 つが払う。最後に払った時刻を store で分け合う
async function payIdleIncome($: EngineInterface, now: number) {
  if (idlePerSecond(await read($, game), now) === 0) return
  const paidAt = Number(await $.store.get(IDLE_KEY)) || 0
  if (paidAt >= now) return
  await $.store.set(IDLE_KEY, now)
  // 同じ時刻を読んだ別のセッションが、あとから書いていたら、そちらが（こちらのぶんもまとめて）払う。
  // 別のセッションの読み書きがこちらの読み直しより前に終わっていると気づけず、重なったぶんを二重に払うことがある
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
  await jot($, { pets: 1 })
  await award($, now, after.total, at)
}

// 買い物：足りなければ理由をトーストで、買えたら知らせて実績も見て、すぐ保存する。
// 贈り物なら、Clawd がかかえてお礼を言う。ショップのボタンと、帯のワンぽちの贈り物のボタンから呼ぶ
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

// 帯に出した贈り物を贈る（帯のボタンと、広いデスクトップの札から）
const giveTreat = ($: EngineInterface, id: TreatId) => buy($, `🎁 ${giftOf(id).name} をあげたよ！`, (one, when) => giveGift(one, id, when))

// ---- 背景のおへや（/parade theme） --------------------------------------------

// いまの state から、背景に描く場面を作る。絵を決めるものは全部ここに入れる（背景のフックは名前しか見ない）
async function roomOf($: EngineInterface, now: number): Promise<RoomScene> {
  const [m, list, w, who, g, held, pinned, forced, side, prev] = await Promise.all([
    read($, mood),
    read($, friends),
    read($, work),
    read($, character),
    read($, game),
    read($, holding),
    read($, dateOverride),
    read($, weatherOverride),
    read($, backdropSide),
    read($, roomHeld),
  ])
  const clock = new Date(now)
  const hour = clock.getHours()
  const date = pinned ?? { month: clock.getMonth() + 1, day: clock.getDate() }
  const weather = forced ?? weatherAt(clock.getFullYear(), date.month, date.day, hour)
  const { season, holiday } = calendarOf(date.month, date.day)
  const look = lookOf(g, now, held, holiday)
  const kept = holdActivity(prev, activityOf(m, w.isRunning ? w.tool : null, now), now)
  if (kept !== prev) await update($, roomHeld, () => kept)
  return {
    activity: kept.kind,
    friends: list.filter(f => f.doneAt === null).length,
    time: timeOfDay(hour),
    weather,
    season,
    holiday,
    character: who,
    hat: look.hat,
    items: ROOM_ITEMS.filter(id => isLit(g, id)),
    sky: {
      stars: look.stars === 0 ? 0 : look.stars < 12 ? 1 : 2,
      aurora: look.aurora,
      shootingStars: look.shootingStars,
      moonTrip: look.dreams.includes('moonTrip'),
      noBugs: look.dreams.includes('noBugs'),
      telescope: look.dreams.includes('telescope'),
      library: look.dreams.includes('library'),
    },
    side,
  }
}

// 背景を出していれば、場面の名前が変わったときだけ $.theme.set を呼ぶ（描き直しは、そのときだけ）
async function refreshRoom($: EngineInterface) {
  if (!(await read($, backdrop))) return
  const current = await read($, roomScene)
  // 目盛り（/parade theme ruler）を出している間は、おへやで上書きしない
  if (current === RULER_SCENE) return
  const name = sceneName(await roomOf($, await $.clock.now()))
  if (name === current) return
  await update($, roomScene, () => name)
  return $.theme.set({ backdrop: { scene: name, glass: GLASS }, overrideColorScheme: 'dark' })
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

    // 背景のおへやは 1 秒ごとに見る（場面が変わったときだけ描き直してもらう）
    if (beat % ACCRUE_EVERY === 0) await refreshRoom($)

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
    // テーマは --resume で戻らず、読み込み直しでも消えるので、入れていればセッションの始めに毎回描いてもらう
    await update($, roomScene, () => null)
    if ((await $.store.get(THEME_KEY)) === true) {
      const side = await $.store.get(THEME_SIDE_KEY)
      await update($, backdropSide, () => (side === 'left' ? 'left' : 'right'))
      await update($, backdrop, () => true)
      await refreshRoom($)
    }
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
    // /parade theme で背景のおへやを出す・しまう。/parade theme left・right で置く側を決めて出す
    const [word, sideWord] = arg.split(/\s+/)
    // /parade theme ruler：背景の枠の目盛りを出す（置き場所を確かめるため。/parade theme でおへやにもどる）
    if (word !== undefined && THEME_WORDS.includes(word) && sideWord === 'ruler') {
      await update($, backdrop, () => true)
      await update($, roomScene, () => RULER_SCENE)
      await $.theme.set({ backdrop: { scene: RULER_SCENE, glass: false }, overrideColorScheme: 'dark' })

      return { text: '背景に目盛りを出したよ（/parade theme でおへやにもどる）' }
    }
    if (word !== undefined && THEME_WORDS.includes(word)) {
      const side = sideWord === 'left' || sideWord === '左' ? 'left' : sideWord === 'right' || sideWord === '右' ? 'right' : null
      // 目盛りを出しているときの /parade theme は、おへやにもどす
      const isOn = side !== null || (await read($, roomScene)) === RULER_SCENE || !(await read($, backdrop))
      if (side) {
        await update($, backdropSide, () => side)
        await $.store.set(THEME_SIDE_KEY, side)
      }
      await update($, backdrop, () => isOn)
      await $.store.set(THEME_KEY, isOn)
      await update($, roomScene, () => null)
      if (!isOn) {
        // テーマは 1 つだけ。外すときは、ほかのプラグインのテーマも外れる（頼まれたときだけ外す）
        await $.theme.clear()

        return { text: 'おへやの背景をしまったよ（/parade theme でまた出せる）' }
      }
      const set = await refreshRoom($)
      const where = (await read($, backdropSide)) === 'left' ? '左' : '右'

      return {
        text:
          set && !set.isDrawn
            ? `おへやの背景は、デスクトップのアプリで出るよ（いまは描けないみたい：${set.reason}）`
            : `デスクトップの背景を Clawd のおへやにしたよ！（窓の${where}側。なでるのは入力欄の上の帯でね。/parade theme left・right で置く側、/parade theme でしまう）`,
      }
    }
    if (arg === 'debug') {
      const isOn = await update($, touchDebug, v => !v)

      return { text: isOn ? 'なでなでの当たり判定を、ピンクの枠で見えるようにしたよ（/parade debug で消える）' : '当たり判定の枠を消したよ' }
    }
    // /parade debug 12/25 でその日として描き、/parade debug rain でその天気で描き、/parade debug today で両方を今日にもどす
    // （季節と行事の飾り・天気の絵を確かめるため）
    if (arg.startsWith('debug ')) {
      const when = arg.slice('debug '.length).trim()
      if (when === 'today' || when === 'きょう' || when === '今日') {
        await update($, dateOverride, () => null)
        const hadWeather = (await read($, weatherOverride)) !== null
        await update($, weatherOverride, () => null)

        return { text: hadWeather ? '日付と天気を今日にもどしたよ' : '日付を今日にもどしたよ' }
      }
      const forced = WEATHER_WORDS[when]
      if (forced) {
        await update($, weatherOverride, () => forced)

        return { text: `${WEATHER_NAMES[forced]}の日として描くよ（ほんとうの天気ではないよ。/parade debug today でもどる）` }
      }
      const date = parseMonthDay(when)
      if (!date) return { text: '日付は 月/日 で打ってね（例: /parade debug 12/25。天気は /parade debug rain・snow・cloudy・clear。もどすときは /parade debug today）' }
      await update($, dateOverride, () => date)
      const { season, holiday } = calendarOf(date.month, date.day)
      const label = holiday ? `${HOLIDAY_NAMES[holiday]}・${SEASON_NAMES[season]}` : SEASON_NAMES[season]

      return { text: `${date.month}/${date.day}（${label}）として描くよ（/parade debug today で今日にもどる）` }
    }
    const picked = CHARACTERS[arg]
    if (picked) {
      await update($, character, () => picked)
      await update($, isHidden, () => false)
      await $.store.set(CHARACTER_KEY, picked)

      return { text: picked === 'clawd' ? 'Clawd がやってきた！' : 'ねこたちがやってきた！' }
    }
    if (arg !== '') return { text: '使い方: /parade（表示切り替え） / /parade shop / /parade theme（left・right） / /parade clawd / /parade cat / /parade debug / /parade debug 12/25 / /parade debug rain' }

    const hidden = await update($, isHidden, v => !v)

    return { text: hidden ? 'みんなお昼寝に行きました（/parade でまた呼べます）' : 'みんな戻ってきました！' }
  })

  on('ui.message', async ($, e, next) => {
    const message = e.element === 'parade' || e.element === 'touch' ? messageOf(e.data) : null
    if (!message) return next(e)

    if (message.kind === 'gift') {
      // 札は帯に出した贈り物。押したあとに下ろされていたら何もしない
      const { favorite } = await read($, game)
      if (favorite !== null && treatOf(favorite)) await giveTreat($, favorite)
    } else if (message.kind === 'hug') await pet($, 'hug', message.id !== undefined ? { friend: message.id } : {})
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

    // ツールを使うたびに、おだちんの ♡。日記には回数だけ（仲間が使ったぶんも）
    await update($, game, g => (g.passiveAt === 0 ? g : toolTip(g)))
    await jot($, { tools: 1 })
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
      await jot($, { agents: 1 })
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
    // 働いた時間は帯の「1:23 でおわり」と同じ、ターンの始めから終わりまで。日をまたいだターンは、終わった日にまとめて数える
    await jot($, { turns: 1, workMs: e.durationMs })
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

    const [m, list, w, t, who, p, g, isDebug, held, pinned, forced] = await Promise.all([
      read($, mood),
      read($, friends),
      read($, work),
      read($, tick),
      read($, character),
      read($, pets),
      read($, game),
      read($, touchDebug),
      read($, holding),
      read($, dateOverride),
      read($, weatherOverride),
    ])
    // フックの中の Date は使う人のタイムゾーンで動く（claude plugin test の中は UTC）。
    // tick.at は始めのコマまで 0 なので、時計から読む。季節と行事（#41）も、同じ時計の月と日から決める
    const clock = new Date(await $.clock.now())
    const hour = clock.getHours()
    const date = pinned ?? { month: clock.getMonth() + 1, day: clock.getDate() }
    // 天気（#42）も同じ日付と時刻から決める（ほんとうの天気ではない）。見たい日を選んでいれば、その日の天気（年は今年）
    const weather = forced ?? weatherAt(clock.getFullYear(), date.month, date.day, hour)
    // 帯は 1 つの枠をプラグインで分け合う。下のプラグイン（AK Studio の帯など）が描いたものは消さず、上に並べる
    const ui = $.ui.resolve(e)
    const below = await next(e)
    const mine = bandView(ui, {
      hour,
      date,
      weather,
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
      // 背景におへやを描いている間は、デスクトップの帯はセリフと「なでる」ボタンだけ
      isCompact: await read($, backdrop),
      onPet: () => void pet($, 'pet'),
      onGift: id => void giveTreat($, id),
    })
    if (below == null) return mine
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {below}
        {mine}
      </Box>
    )
  })

  // 背景のおへや（/parade theme）。場面の名前だけから描く（state を読まないので、名前が変わらないかぎり描き直されない）。
  // ほかのプラグインの背景は、そのプラグインにまかせる
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== 'clawd-parade') return next(e)
    const ui = $.ui.resolve(e)
    if (e.props.scene === RULER_SCENE && 'Svg' in ui) return <ui.Svg source={rulerSvg()} alt="背景の目盛り" isInteractive />
    const scene = parseScene(e.props.scene)
    if (scene === null || !('Svg' in ui)) return next(e)
    const who = scene.character === 'clawd' ? 'Clawd' : 'ねこ'

    return <ui.Svg source={roomSvg(scene)} alt={`${who}のおへや（${ACTIVITY_NAMES[scene.activity]}）`} isInteractive />
  })

  // なでなでショップ（/parade shop で開くパネル）
  on('ui.render', { component: 'Pane', requestId: SHOP }, async ($, e) => {
    const [g, w, list, p, who] = await Promise.all([read($, game), read($, work), read($, friends), read($, pets), read($, character)])
    // 日記のきょうも、時計の今の日付（/parade debug 12/25 の日付ではない）
    const today = dayOf(await $.clock.now())
    return shopView($.ui.resolve(e), {
      today,
      game: g,
      at: situationOf(w, list),
      petsTotal: p.total,
      character: who,
      buy: (label, deal) => () => buy($, label, deal),
    })
  })
}
