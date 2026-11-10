// きょうの日記（#43）のルール。日ごとの数・これまでの合計・つづけて使った日数を、$ に触らない純粋な関数だけで書く。
// いつ数えるか（イベント）と、いつ古い日を消すか（保存するとき）は register.tsx、見せかたは shop.tsx の仕事。
//
// 保存に入るのは数だけ。何を頼んだか・どのファイルか・どのツールかは数えるときに捨てて、どこにも書かない

import type { DiaryKind, Game, TotalKind } from '../types'
import { HEART_CAP, formatHearts } from './game'

// 日記を残す日数（きょうを入れて 30 日）。これより前の日は、保存するときに消す
export const KEEP_DAYS = 30

// 数えるものの表。数えるものを types に足したら、ここに足すまで型エラーになる
export const DIARY_KINDS: Record<DiaryKind, { name: string; unit: string }> = {
  workMs: { name: 'はたらいた', unit: '' },
  turns: { name: 'ターン', unit: '回' },
  tools: { name: 'ツール', unit: '回' },
  agents: { name: '仲間', unit: '匹' },
  pets: { name: 'なでなで', unit: '回' },
}
export const KINDS = Object.keys(DIARY_KINDS) as DiaryKind[]

// これまでの合計を持つもの（なでた回数の合計は、前からある store の pets）。足したら、ここに足すまで型エラーになる
const TOTALS: Record<TotalKind, true> = { workMs: true, turns: true, tools: true, agents: true }
const isTotal = (kind: DiaryKind): kind is TotalKind => Object.hasOwn(TOTALS, kind)

// 消した日までつづいていた日数を入れる鍵の、数えるものの名前（pruneDiary）
const STREAK = 'streak'

// ---- 日付 ---------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

// その時刻の、PC のタイムゾーンでの日付（'2026-11-10'）。フックの中の Date は使う人のタイムゾーンで動く
// （帯の時間帯や季節と同じ時計）。/parade debug 12/25 で選んだ日は絵のためだけなので、ここには渡さない
export const dayOf = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const partsOf = (day: string) => day.split('-').map(Number) as [number, number, number]

// n 日あと（負なら前）の日付。暦だけの計算なので UTC で数え、夏時間で 1 日が 23・25 時間の日もずれない
export const shiftDay = (day: string, n: number) => {
  const [y, m, d] = partsOf(day)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

const WEEKDAYS = '日月火水木金土'

// 曜日の 1 文字（月火水木金土日）
export const weekdayOf = (day: string) => {
  const [y, m, d] = partsOf(day)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ''
}

export const keyOf = (day: string, kind: DiaryKind | typeof STREAK) => `${day}.${kind}`

// 鍵の日付の部分（DIARY_KEY の形なので、はじめの 10 文字）
const dayOfKey = (key: string) => key.slice(0, 10)

// ---- 数える -------------------------------------------------------------

type Diary = Game['diary']

const cap = (n: number) => Math.min(HEART_CAP, n)

// 数えた値をきれいにする（NaN・負・Infinity は 0 にして、保存を壊さない）
const cleanOf = (n: number | undefined) => (n !== undefined && Number.isFinite(n) && n > 0 ? n : 0)

// その日（day）に数を足す。これまでの合計にも足し、つづけて使った日数のいちばん長いものも見直す。
// 足すのはいつもその日の鍵だけ（セッションの差分として保存に足し込まれる。mergeGame の counts）
export function record(g: Game, day: string, add: Partial<Record<DiaryKind, number>>): Game {
  const diary = { ...g.diary }
  const totals = { ...g.totals }
  let isChanged = false
  for (const kind of KINDS) {
    const n = cleanOf(add[kind])
    if (n === 0) continue
    isChanged = true
    const key = keyOf(day, kind)
    diary[key] = cap((diary[key] ?? 0) + n)
    if (isTotal(kind)) totals[kind] = cap((totals[kind] ?? 0) + n)
  }
  if (!isChanged) return g
  return { ...g, diary, totals, bestStreak: Math.max(g.bestStreak, streakOf(diary, day)) }
}

// その日の数（無ければ 0）
export const dayCounts = (diary: Diary, day: string): Record<DiaryKind, number> =>
  Object.fromEntries(KINDS.map(kind => [kind, diary[keyOf(day, kind)] ?? 0])) as Record<DiaryKind, number>

// ターンが 1 回でも終わった日が「いっしょに働いた日」
export const isActive = (diary: Diary, day: string) => (diary[keyOf(day, 'turns')] ?? 0) > 0

// day で終わる、つづけて働いた日数。消した日のぶん（STREAK の鍵）に届いたら、そこに残した日数を足す。
// 働いた日は鍵の数までしかないので、かならず止まる
export function runEndingAt(diary: Diary, day: string): number {
  let run = 0
  for (let d = day; ; d = shiftDay(d, -1)) {
    const carried = diary[keyOf(d, STREAK)]
    if (carried !== undefined) return cap(run + carried)
    if (!isActive(diary, d)) return run
    run += 1
  }
}

// いまつづいている日数。きょうがまだなら、きのうまでのぶん（きょう働けば、つづく）
export const streakOf = (diary: Diary, today: string) => runEndingAt(diary, isActive(diary, today) ? today : shiftDay(today, -1))

// ---- 古い日を消す --------------------------------------------------------

// きょうを入れて KEEP_DAYS 日より前の日を消す。消す日までつづいていた日数は、消す日の前の日（cutoff の前の日）の
// STREAK の鍵ひとつに残し、30 日より長くつづいても数えられるようにする。
// 何度呼んでも同じ結果になる（2 度目は、残した STREAK の鍵から同じ日数を数え直すだけ）。
// これを差分ではなく、合わせたあとの保存に対して使うので、2 つのセッションが同時に消しても数は負にならず、
// 長く休んでいたセッションが戻ってきても、消した日はよみがえらない（mergeGame の counts は、変えていない鍵に向こうの値を使う）
export function pruneDiary(diary: Diary, today: string): Diary {
  const cutoff = shiftDay(today, -(KEEP_DAYS - 1))
  const keys = Object.keys(diary)
  if (!keys.some(k => dayOfKey(k) < cutoff)) return diary
  const edge = shiftDay(cutoff, -1)
  const carried = runEndingAt(diary, edge)
  const kept: Diary = Object.fromEntries(keys.filter(k => dayOfKey(k) >= cutoff).map(k => [k, diary[k]]))
  if (carried > 0) kept[keyOf(edge, STREAK)] = carried
  return kept
}

// 保存する直前に、合わせた保存へ：古い日を消し、いちばん長くつづいた日数を見直す（どちらも、何度やっても同じ）
export function tidyDiary(g: Game, today: string): Game {
  const diary = pruneDiary(g.diary, today)
  const bestStreak = Math.max(g.bestStreak, streakOf(diary, today))
  return diary === g.diary && bestStreak === g.bestStreak ? g : { ...g, diary, bestStreak }
}

// ---- 見せる ---------------------------------------------------------------

// 働いた時間を「2 時間 10 分」のように。1 分に満たなければ「1 分たらず」
export function formatDuration(ms: number): string {
  const v = cleanOf(ms)
  const minutes = Math.floor(v / 60_000)
  if (v > 0 && minutes === 0) return '1 分たらず'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} 分`
  return rest === 0 ? `${formatHearts(hours)} 時間` : `${formatHearts(hours)} 時間 ${rest} 分`
}

// きょうの数を短く（「はたらいた 2 時間 10 分 · ターン 12 回 · …」）
export const countsText = (c: Record<DiaryKind, number>) =>
  KINDS.map(kind => {
    const { name, unit } = DIARY_KINDS[kind]
    return kind === 'workMs' ? `${name} ${formatDuration(c[kind])}` : `${name} ${formatHearts(c[kind])} ${unit}`
  }).join(' · ')

// Clawd のひとこと。きょうの数で変わる
export function diaryLine(diary: Diary, today: string): string {
  const c = dayCounts(diary, today)
  const streak = streakOf(diary, today)
  if (c.turns === 0 && c.pets === 0) {
    return streak > 0 ? `きのうまで ${streak} 日つづけていっしょだったね。きょうもよろしくね` : 'きょうはまだこれから。いっしょにがんばろ！'
  }
  if (c.turns === 0) return `きょうは ${formatHearts(c.pets)} 回なでてくれたね。えへへ`
  if (c.workMs < 60_000) return `きょうは ${formatHearts(c.turns)} 回いっしょにお話ししたね`
  const worked = `きょうは ${formatDuration(c.workMs)}いっしょに働いたね`
  if (c.agents > 0) return `${worked}。仲間も ${formatHearts(c.agents)} 匹来てくれた！`
  if (c.tools >= 100) return `${worked}。ツール ${formatHearts(c.tools)} 回、おつかれさま！`
  return worked
}

const BARS = '▁▂▃▄▅▆▇█'

export type DayBar = { day: string; bar: string; weekday: string; workMs: number }

// 7 日ぶんの働いた時間の棒（古い日 → きょう）。いちばん長い日を █ にし、働いた日は少しでも ▂ から。働いていない日は ▁
export function weekBars(diary: Diary, today: string): DayBar[] {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6))
  const ms = days.map(day => dayCounts(diary, day).workMs)
  const most = Math.max(...ms)
  return days.map((day, i) => {
    const v = ms[i] ?? 0
    const level = v <= 0 || most <= 0 ? 0 : Math.max(1, Math.ceil((v / most) * (BARS.length - 1)))
    return { day, bar: BARS[level] ?? '▁', weekday: weekdayOf(day), workMs: v }
  })
}
