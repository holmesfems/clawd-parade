// きょうの日記（#43）の純粋な関数の単体テスト。$ を使わず、値を渡して返りを見る

import { expect, test } from 'claude-code/testing'

import type { Game } from '../types'
import { DIARY_KEY, HEART_CAP, grant, mergeGame, newGame, restore, unlocked } from '../hooks/game'
import {
  KEEP_DAYS,
  countsText,
  dayCounts,
  dayOf,
  diaryLine,
  formatDuration,
  isActive,
  pruneDiary,
  record,
  runEndingAt,
  shiftDay,
  streakOf,
  tidyDiary,
  weekBars,
  weekdayOf,
} from '../hooks/diary'

const TODAY = '2026-11-10'
const HOUR = 3_600_000

const game = (over: Partial<Game> = {}): Game => ({ ...newGame(0, 1_000), ...over })

// day から前へ n 日、毎日 1 ターンずつ働いた日記
const workedDays = (day: string, n: number, from = 0) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${shiftDay(day, -(i + from))}.turns`, 1]))

// 日記の値がどれも 0 より大きい有限の数で、鍵が「日付.数えるもの」の形か
const expectClean = (diary: Game['diary']) => {
  for (const [k, v] of Object.entries(diary)) {
    expect(DIARY_KEY.test(k)).toBe(true)
    expect(Number.isFinite(v)).toBe(true)
    expect(v ?? 0).toBeGreaterThan(0)
  }
}

// ---- 日付 ----

test('dayOf：PC のタイムゾーンの日付（テストの時計は UTC）。0 時ちょうどで次の日', () => {
  expect(dayOf(0)).toBe('1970-01-01')
  expect(dayOf(24 * HOUR - 1)).toBe('1970-01-01')
  expect(dayOf(24 * HOUR)).toBe('1970-01-02')
  // どの時刻でも、Date のその土地の年・月・日と同じ（タイムゾーンは Date に任せる）
  for (const at of [Date.UTC(2026, 10, 10, 23, 59, 59, 999), Date.UTC(2026, 10, 11), Date.UTC(2024, 1, 29, 12), 1_234_567_890_123]) {
    const d = new Date(at)
    expect(dayOf(at)).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
})

test('shiftDay・weekdayOf：月・年・うるう年をまたいで数え、曜日を 1 文字で', () => {
  expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29')
  expect(shiftDay('2023-02-28', 1)).toBe('2023-03-01')
  expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  expect(shiftDay(TODAY, -29)).toBe('2026-10-12')
  expect(shiftDay(TODAY, 0)).toBe(TODAY)
  expect(weekdayOf(TODAY)).toBe('火')
  expect(Array.from({ length: 7 }, (_, i) => weekdayOf(shiftDay('2026-11-09', i))).join('')).toBe('月火水木金土日')
})

// ---- 数える ----

test('record：その日の数とこれまでの合計に足す。なでた回数は合計に入れない（store の pets が合計）', () => {
  let g = record(game(), '2026-11-09', { turns: 2, workMs: HOUR })
  g = record(g, TODAY, { turns: 1, workMs: 90_000, tools: 3 })
  g = record(g, TODAY, { tools: 2, agents: 1, pets: 4 })
  expect(dayCounts(g.diary, TODAY)).toEqual({ workMs: 90_000, turns: 1, tools: 5, agents: 1, pets: 4 })
  expect(dayCounts(g.diary, '2026-11-09')).toEqual({ workMs: HOUR, turns: 2, tools: 0, agents: 0, pets: 0 })
  expect(g.totals).toEqual({ workMs: HOUR + 90_000, turns: 3, tools: 5, agents: 1 })
  expect(g.bestStreak).toBe(2)
  expectClean(g.diary)
})

test('record：NaN・負・Infinity・0 は数えず、何も足さなければ同じゲーム。とても大きくても上限で止まる', () => {
  const g = game()
  expect(record(g, TODAY, { workMs: NaN, tools: -3, agents: Infinity, pets: 0 })).toBe(g)
  const big = record(game({ diary: { [`${TODAY}.workMs`]: HEART_CAP }, totals: { workMs: HEART_CAP } }), TODAY, { workMs: HEART_CAP })
  expect(big.diary[`${TODAY}.workMs`]).toBe(HEART_CAP)
  expect(big.totals.workMs).toBe(HEART_CAP)
  expect(JSON.parse(JSON.stringify(big)).totals.workMs).toBe(HEART_CAP)
})

// ---- つづけた日数 ----

test('streakOf：きょうまでつづいた日数。きょうがまだなら、きのうまで。1 日でもあくと 0 から', () => {
  expect(streakOf({}, TODAY)).toBe(0)
  const three = workedDays(TODAY, 3)
  expect(streakOf(three, TODAY)).toBe(3)
  // きょうはまだ働いていない：きのうまでの 3 日（きょう働けば 4 日）
  expect(streakOf(three, shiftDay(TODAY, 1))).toBe(3)
  // 2 日あくと切れる
  expect(streakOf(three, shiftDay(TODAY, 2))).toBe(0)
  // あいだに 1 日あいた
  const gap = { ...workedDays(TODAY, 2), ...workedDays(TODAY, 4, 3) }
  expect(streakOf(gap, TODAY)).toBe(2)
  expect(runEndingAt(gap, shiftDay(TODAY, -3))).toBe(4)
  // なでただけ・ツールだけの日は数えない（ターンが終わった日だけ）
  expect(isActive({ [`${TODAY}.pets`]: 5, [`${TODAY}.tools`]: 2 }, TODAY)).toBe(false)
})

// ---- 古い日を消す ----

test('pruneDiary：きょうを入れて 30 日だけ残す。何度やっても同じ', () => {
  const diary = { ...workedDays(TODAY, 40), [`${shiftDay(TODAY, -35)}.tools`]: 9, [`${TODAY}.tools`]: 4 }
  const pruned = pruneDiary(diary, TODAY)
  const days = new Set(Object.keys(pruned).map(k => k.slice(0, 10)))
  // 30 日ぶんと、消した日までの日数を残す 1 つの鍵
  expect(days.size).toBe(KEEP_DAYS + 1)
  expect(pruned[`${shiftDay(TODAY, -29)}.turns`]).toBe(1)
  expect(pruned[`${shiftDay(TODAY, -30)}.turns`]).toBeUndefined()
  expect(pruned[`${shiftDay(TODAY, -30)}.streak`]).toBe(10)
  expect(pruned[`${shiftDay(TODAY, -35)}.tools`]).toBeUndefined()
  expect(pruned[`${TODAY}.tools`]).toBe(4)
  // つづいた日数は消す前と同じ
  expect(streakOf(pruned, TODAY)).toBe(40)
  expect(pruneDiary(pruned, TODAY)).toEqual(pruned)
  // 消すものが無ければ、そのまま
  const fresh = workedDays(TODAY, 5)
  expect(pruneDiary(fresh, TODAY)).toBe(fresh)
  expectClean(pruned)
})

test('pruneDiary：30 日より長くつづいても、毎日消しながら数えられる。あくと 0 にもどり、いちばん長い日数は残る', () => {
  let g = game()
  let day = '2026-09-01'
  for (let i = 0; i < 45; i++) {
    g = tidyDiary(record(g, day, { turns: 1, workMs: HOUR }), day)
    day = shiftDay(day, 1)
  }
  const last = shiftDay(day, -1)
  expect(streakOf(g.diary, last)).toBe(45)
  expect(g.bestStreak).toBe(45)
  expect(Object.keys(g.diary).filter(k => k.endsWith('.streak'))).toHaveLength(1)
  expect(Object.keys(g.diary).length).toBeLessThanOrEqual(KEEP_DAYS * 2 + 1)
  // 2 日休んでから戻る：つづいた日数は 0 から。いちばん長い 45 日は残り、これまでの合計も減らない
  const back = shiftDay(last, 3)
  g = tidyDiary(record(g, back, { turns: 1 }), back)
  expect(streakOf(g.diary, back)).toBe(1)
  expect(g.bestStreak).toBe(45)
  expect(g.totals.turns).toBe(46)
  expect(g.totals.workMs).toBe(45 * HOUR)
})

test('pruneDiary：40 日休んでいたら、古い日は全部消え、つづいた日数も残さない', () => {
  const diary = { ...workedDays('2026-09-30', 10), '2026-09-30.tools': 7 }
  const pruned = pruneDiary(diary, TODAY)
  expect(pruned).toEqual({})
  expect(streakOf(pruned, TODAY)).toBe(0)
})

// ---- 保存（restore・mergeGame） ----

test('restore：日記は「日付.数えるもの」の鍵の、0 以上の数だけを読む。壊れていたら空', () => {
  const g = restore(
    {
      hearts: 5,
      diary: {
        [`${TODAY}.tools`]: 3,
        [`${TODAY}.future`]: 2,
        [`${TODAY}.turns`]: -1,
        [`${TODAY}.workMs`]: 'たくさん',
        [`${TODAY}.agents`]: Infinity,
        [`${TODAY}.pets`]: NaN,
        'Bash を使った': 1,
        [`${TODAY}.tools2`]: 1,
        [`${TODAY}.prompt`]: { text: 'ひみつ' },
      },
      totals: { workMs: 10, turns: -2, tools: 'x', future: 4 },
      bestStreak: 'ながい',
    },
    newGame(0, 5_000),
  )
  // 新しい版の数えるもの（future）は持ち回る
  expect(g.diary).toEqual({ [`${TODAY}.tools`]: 3, [`${TODAY}.future`]: 2 })
  expect(g.totals).toEqual({ workMs: 10, future: 4 })
  expect(g.bestStreak).toBe(0)
  for (const junk of [null, 'x', 3, [], [1, 2]]) {
    const one = restore({ hearts: 1, diary: junk, totals: junk, bestStreak: typeof junk === 'number' ? NaN : junk }, newGame(0, 5_000))
    expect(one.diary).toEqual({})
    expect(one.totals).toEqual({})
    expect(one.bestStreak).toBe(0)
  }
})

test('restore：1.9.0 のセーブ（日記の無いころ）は、ほかの項目がそのままで、日記は空で読める', () => {
  const saved = {
    v: 1,
    hearts: 4.2e15,
    earned: 9e15,
    combo: 3,
    comboAt: 12,
    maxCombo: 150,
    feverUntil: 0,
    fevers: 1_200,
    workPets: 40_000,
    hugs: 70,
    wakes: 12,
    levels: { glove: 90, brush: 50, coffee: 40, fan: 80, toolTip: 60, allowance: 50, feverTime: 5, stardust: 100 },
    owned: ['ribbon', 'catEars', 'santa', 'shootingStars', 'crown', 'aurora'],
    hat: 'crown',
    achievements: ['pets1', 'dream1', 'family', 'dreamHill'],
    lastUnlock: { id: 'dreamHill', at: 80 },
    gifts: { cake: 9, greenTests: 1, starHill: 1, star: 40 },
    given: 2e13,
    happyUntil: 0,
    lastGift: { id: 'star', at: 70 },
    favorite: 'keyboard',
    shown: ['greenTests', 'starHill'],
    off: ['aurora'],
    passiveAt: 66,
  }
  const g = restore(JSON.parse(JSON.stringify(saved)), newGame(0, 5_000))
  expect(g).toEqual({ ...saved, diary: {}, totals: {}, bestStreak: 0, passiveAt: 5_000 } as Game)
  // 合わせても、古い日を消しても、ほかの項目は変わらない
  expect(tidyDiary(g, TODAY)).toBe(g)
  expect(mergeGame(g, g, g)).toEqual(g)
  // 日記の実績は、まだ取れない
  const fresh = unlocked({ game: g, pets: 0, rate: 0 }).map(a => a.id)
  for (const id of ['streak3', 'tools100', 'agents100', 'hours100', 'turns1000'] as const) expect(fresh).not.toContain(id)
})

test('mergeGame：同じ日の数は、2 つのセッションで増えたぶんを足す。合計も足し、いちばん長い日数は大きいほう', () => {
  const base = record(game(), TODAY, { turns: 2, tools: 10, workMs: HOUR })
  const theirs = record(base, TODAY, { tools: 5, agents: 1 })
  const mine = record({ ...base, bestStreak: 7 }, TODAY, { tools: 3, turns: 1, workMs: HOUR })
  const merged = mergeGame(theirs, base, mine)
  expect(dayCounts(merged.diary, TODAY)).toEqual({ workMs: 2 * HOUR, turns: 3, tools: 18, agents: 1, pets: 0 })
  expect(merged.totals).toEqual({ workMs: 2 * HOUR, turns: 3, tools: 18, agents: 1 })
  expect(merged.bestStreak).toBe(7)
  // もう一度合わせても、二重に足さない
  expect(mergeGame(merged, merged, merged)).toEqual(merged)
  // 上限近くの足し合わせも、上限で止まる
  const huge = game({ diary: { [`${TODAY}.tools`]: HEART_CAP } })
  expect(mergeGame(huge, game(), huge).diary[`${TODAY}.tools`]).toBe(HEART_CAP)
})

// ---- 同時に開いているセッション（register.tsx の saveNow と同じ手順を、まねっこの store で） ----

type Session = { base: Game; game: Game }

// store を読み、合わせて、古い日を消して書き、書いたものを base にして、こちらのゲームにも取り込む
const readMerge = (store: Game, s: Session, today: string) => tidyDiary(mergeGame(store, s.base, s.game), today)
const adopt = (s: Session, written: Game): Session => ({ base: written, game: mergeGame(written, s.game, s.game) })

const open = (store: Game): Session => ({ base: store, game: store })

test('同時の保存：2 つのセッションが同じ古い日を同時に消しても、負にならず、残りの数も変わらない', () => {
  const yesterday = shiftDay(TODAY, -1)
  let store = game({ diary: { ...workedDays(yesterday, 40), [`${shiftDay(TODAY, -35)}.tools`]: 9 } })
  let a = open(store)
  let b = open(store)
  a = { ...a, game: record(a.game, TODAY, { turns: 1, tools: 2 }) }
  b = { ...b, game: record(b.game, TODAY, { turns: 1, tools: 3 }) }
  // どちらも同じ store を読んでから書いた（b があとから上書きした）
  const fromA = readMerge(store, a, TODAY)
  const fromB = readMerge(store, b, TODAY)
  store = fromB
  // a は書いたあとに読み直して、b の書いたものを今の保存とする（a の差分はここで落ちる。register.tsx に書いたとおり）
  a = adopt({ base: fromA, game: a.game }, store)
  b = adopt(b, fromB)
  expectClean(store.diary)
  expect(store.diary[`${shiftDay(TODAY, -35)}.tools`]).toBeUndefined()
  // 続けて両方が保存しても、消した日はよみがえらず、負にもならない
  for (const s of ['a', 'b'] as const) {
    const one = s === 'a' ? a : b
    store = readMerge(store, one, TODAY)
    if (s === 'a') a = adopt(a, store)
    else b = adopt(b, store)
  }
  expectClean(store.diary)
  expect(Object.keys(store.diary).filter(k => k.slice(0, 10) < shiftDay(TODAY, -29) && !k.endsWith('.streak'))).toEqual([])
  expect(streakOf(store.diary, TODAY)).toBe(41)
  expect(store.diary[`${TODAY}.tools`]).toBe(3)
})

test('同時の保存：片方が古い日を消しているあいだに、もう片方がきょうに足しても、両方のぶんが残る', () => {
  const yesterday = shiftDay(TODAY, -1)
  // きのうまでは、きのうの日付で消してあった
  let store = tidyDiary(game({ diary: workedDays(yesterday, 30) }), yesterday)
  let a = open(store)
  let b = open(store)
  // 日付が変わって、a はきょうの日付で消し（31 日前の日が消える）、b はきょうに数を足す
  a = { ...a, game: record(a.game, TODAY, { tools: 4 }) }
  store = readMerge(store, a, TODAY)
  a = adopt(a, store)
  expect(store.diary[`${shiftDay(TODAY, -30)}.turns`]).toBeUndefined()
  b = { ...b, game: record(b.game, TODAY, { tools: 6, turns: 1 }) }
  store = readMerge(store, b, TODAY)
  b = adopt(b, store)
  expect(store.diary[`${TODAY}.tools`]).toBe(10)
  expect(store.diary[`${TODAY}.turns`]).toBe(1)
  expect(store.diary[`${shiftDay(TODAY, -30)}.turns`]).toBeUndefined()
  expectClean(store.diary)
  // a も b を取り込み、もう一度保存しても変わらない
  store = readMerge(store, a, TODAY)
  expect(store.diary[`${TODAY}.tools`]).toBe(10)
  expect(streakOf(store.diary, TODAY)).toBe(31)
})

test('同時の保存：40 日休んでいたセッションが戻ってきても、古い日はよみがえらず、ほかのセッションの数も消さない', () => {
  const long = '2026-09-25'
  // c は 40 日前の日記を持ったまま、休んでいた
  const old = game({ diary: { ...workedDays(long, 5), [`${long}.tools`]: 50 } })
  let c = open(old)
  // そのあいだに、ほかのセッションがきょうまで使い、古い日を消してあった
  let store = tidyDiary(record(old, TODAY, { turns: 2, tools: 7 }), TODAY)
  expect(store.diary[`${long}.tools`]).toBeUndefined()
  // c が戻ってきて、きょう 1 ターン働いてから保存する
  c = { ...c, game: record(c.game, TODAY, { turns: 1, tools: 1 }) }
  store = readMerge(store, c, TODAY)
  c = adopt(c, store)
  expect(store.diary[`${long}.tools`]).toBeUndefined()
  expect(store.diary[`${long}.turns`]).toBeUndefined()
  expect(dayCounts(store.diary, TODAY)).toMatchObject({ turns: 3, tools: 8 })
  expectClean(store.diary)
  // c の手もとも、消えた日を持たない
  expect(c.game.diary[`${long}.tools`]).toBeUndefined()
})

// ---- 実績 ----

test('実績：3・7・30 日つづける、1 日にツール 100 回、仲間 100 匹、100 時間、1,000 ターン。♡ はもらえない', () => {
  const ids = (over: Partial<Game>) => unlocked({ game: game(over), pets: 0, rate: 0 }).map(a => a.id)
  expect(ids({ bestStreak: 2 })).not.toContain('streak3')
  expect(ids({ bestStreak: 3 })).toContain('streak3')
  for (const id of ['streak3', 'streak7'] as const) expect(ids({ bestStreak: 7 })).toContain(id)
  expect(ids({ bestStreak: 29 })).not.toContain('streak30')
  expect(ids({ bestStreak: 30 })).toContain('streak30')
  expect(ids({ diary: { [`${TODAY}.tools`]: 99, '2026-11-09.tools': 99 } })).not.toContain('tools100')
  expect(ids({ diary: { '2026-11-09.tools': 100 } })).toContain('tools100')
  // 2 日合わせて 100 でも取れない（なでた回数などでもない）
  expect(ids({ diary: { [`${TODAY}.pets`]: 500 } })).not.toContain('tools100')
  expect(ids({ totals: { agents: 99 } })).not.toContain('agents100')
  expect(ids({ totals: { agents: 100 } })).toContain('agents100')
  expect(ids({ totals: { workMs: 100 * HOUR - 1 } })).not.toContain('hours100')
  expect(ids({ totals: { workMs: 100 * HOUR } })).toContain('hours100')
  expect(ids({ totals: { turns: 999 } })).not.toContain('turns1000')
  expect(ids({ totals: { turns: 1_000 } })).toContain('turns1000')
  // 実績を渡しても ♡ は変わらない
  const g = game({ hearts: 10, bestStreak: 30 })
  expect(grant(g, unlocked({ game: g, pets: 0, rate: 0 }), 5).hearts).toBe(10)
})

// ---- 見せる ----

test('formatDuration：時間と分で。1 分に満たなければ「1 分たらず」', () => {
  expect(formatDuration(0)).toBe('0 分')
  expect(formatDuration(30_000)).toBe('1 分たらず')
  expect(formatDuration(59 * 60_000)).toBe('59 分')
  expect(formatDuration(2 * HOUR)).toBe('2 時間')
  expect(formatDuration(2 * HOUR + 10 * 60_000 + 59_000)).toBe('2 時間 10 分')
  expect(formatDuration(1_234 * HOUR)).toBe('1,234 時間')
  // ♡ と同じく、1 万からは「万」で
  expect(formatDuration(12_345 * HOUR)).toBe('1.23万 時間')
  expect(formatDuration(NaN)).toBe('0 分')
})

test('diaryLine：きょうのようすで Clawd のひとことが変わる', () => {
  expect(diaryLine({}, TODAY)).toBe('きょうはまだこれから。いっしょにがんばろ！')
  expect(diaryLine(workedDays(shiftDay(TODAY, -1), 3), TODAY)).toBe('きのうまで 3 日つづけていっしょだったね。きょうもよろしくね')
  expect(diaryLine({ [`${TODAY}.pets`]: 12 }, TODAY)).toBe('きょうは 12 回なでてくれたね。えへへ')
  expect(diaryLine({ [`${TODAY}.turns`]: 2, [`${TODAY}.workMs`]: 20_000 }, TODAY)).toBe('きょうは 2 回いっしょにお話ししたね')
  const worked = { [`${TODAY}.turns`]: 5, [`${TODAY}.workMs`]: 2 * HOUR + 10 * 60_000 }
  expect(diaryLine(worked, TODAY)).toBe('きょうは 2 時間 10 分いっしょに働いたね')
  expect(diaryLine({ ...worked, [`${TODAY}.agents`]: 3 }, TODAY)).toBe('きょうは 2 時間 10 分いっしょに働いたね。仲間も 3 匹来てくれた！')
  expect(diaryLine({ ...worked, [`${TODAY}.tools`]: 120 }, TODAY)).toBe('きょうは 2 時間 10 分いっしょに働いたね。ツール 120 回、おつかれさま！')
  expect(countsText(dayCounts(worked, TODAY))).toBe('はたらいた 2 時間 10 分 · ターン 5 回 · ツール 0 回 · 仲間 0 匹 · なでなで 0 回')
})

test('weekBars：7 日ぶん（古い日 → きょう）。いちばん長い日が █、働いた日は ▂ から、働いていない日は ▁', () => {
  const diary = { [`${TODAY}.workMs`]: 4 * HOUR, '2026-11-09.workMs': 2 * HOUR, '2026-11-05.workMs': 60_000, '2026-11-01.workMs': 99 * HOUR }
  const bars = weekBars(diary, TODAY)
  expect(bars.map(b => b.day)).toEqual(Array.from({ length: 7 }, (_, i) => shiftDay(TODAY, i - 6)))
  expect(bars.map(b => b.weekday).join('')).toBe('水木金土日月火')
  expect(bars.map(b => b.bar).join('')).toBe('▁▂▁▁▁▅█')
  expect(weekBars({}, TODAY).map(b => b.bar).join('')).toBe('▁▁▁▁▁▁▁')
})
