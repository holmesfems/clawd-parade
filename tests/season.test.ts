// 季節と行事（#41）：日付から季節と行事を決める、季節の飾りの置き場所と描き方、セリフ、クリスマスのサンタぼうし
import { expect, test } from 'claude-code/testing'

import type { DreamId, Friend, Look } from '../types'
import { linesOf } from '../hooks/band'
import { padded, skyDecoBox, skyDreamSpots, sunOf, takenBoxes } from '../hooks/decor'
import { lookOf, newGame } from '../hooks/game'
import { PALETTES, calendarOf, hex, parseMonthDay } from '../hooks/palette'
import type { Calendar, Holiday, Season } from '../hooks/palette'
import { crowdOf, drawScene, layout } from '../hooks/scene'
import { seasonBoxes, seasonPlan } from '../hooks/season'

const friend = (id: string): Friend => ({ id, type: 'Explore', label: '', tool: null, doneAt: null })
const crew = (n: number) => Array.from({ length: n }, (_, i) => friend(`f${i}`))
const plain: Look = { hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [], stars: 0 }

// 季節ごと・行事ごとの、ひとつずつの日
const SEASON_DAYS: Record<Season, Calendar> = {
  spring: calendarOf(4, 5),
  summer: calendarOf(8, 1),
  autumn: calendarOf(10, 10),
  winter: calendarOf(1, 20),
}
const HOLIDAY_DAYS: Record<Holiday, Calendar> = {
  christmas: calendarOf(12, 25),
  newYear: calendarOf(1, 1),
  halloween: calendarOf(10, 31),
  tanabata: calendarOf(7, 7),
  tsukimi: calendarOf(9, 15),
}
const ALL_DAYS = [...Object.values(SEASON_DAYS), ...Object.values(HOLIDAY_DAYS)]

test('月と日から季節と行事を決める（北半球）', () => {
  const seasons = Array.from({ length: 12 }, (_, i) => calendarOf(i + 1, 10).season)
  expect(seasons).toEqual(['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'])
  expect(calendarOf(12, 23)).toEqual({ season: 'winter', holiday: null })
  expect(calendarOf(12, 24)).toEqual({ season: 'winter', holiday: 'christmas' })
  expect(calendarOf(12, 25).holiday).toBe('christmas')
  expect(calendarOf(12, 26).holiday).toBeNull()
  for (const day of [1, 2, 3]) expect(calendarOf(1, day)).toEqual({ season: 'winter', holiday: 'newYear' })
  expect(calendarOf(1, 4).holiday).toBeNull()
  expect(calendarOf(10, 31)).toEqual({ season: 'autumn', holiday: 'halloween' })
  expect(calendarOf(10, 30).holiday).toBeNull()
  expect(calendarOf(7, 7)).toEqual({ season: 'summer', holiday: 'tanabata' })
  expect(calendarOf(9, 15)).toEqual({ season: 'autumn', holiday: 'tsukimi' })
  expect(calendarOf(3, 1).season).toBe('spring')
  expect(calendarOf(2, 29).season).toBe('winter')
})

test('/parade debug の日付：月/日 を読み、ありえない日は読まない', () => {
  expect(parseMonthDay('12/25')).toEqual({ month: 12, day: 25 })
  expect(parseMonthDay('1/1')).toEqual({ month: 1, day: 1 })
  expect(parseMonthDay('02/29')).toEqual({ month: 2, day: 29 })
  for (const bad of ['2/30', '13/1', '0/5', '4/31', '12-25', '12/25/2026', 'today', '']) expect(parseMonthDay(bad)).toBeNull()
})

// 前の絵から変わったドット
const changed = (a: (number | null)[][], b: (number | null)[][]) =>
  a.flatMap((row, y) => row.flatMap((c, x) => (c !== b[y]![x] ? [{ x, y }] : [])))

// 地面の夢 3 つ・空の夢 2 つの選び方（どちらもいくつか）
const GROUND_SETS: DreamId[][] = [[], ['house', 'library', 'moonTrip'], ['house', 'starHill', 'statue'], ['telescope', 'greenTests', 'library']]
const SKY_SETS: DreamId[][] = [[], ['constellation', 'noBugs'], ['airship', 'twinStars'], ['noBugs', 'airship']]
// 広いデスクトップ（贈り物の札あり・なし）と端末
const FRAMES = [
  { columns: 180, paradeColumns: 114, headroom: 4 },
  { columns: 180, paradeColumns: 101, headroom: 4 },
  { columns: 84, paradeColumns: 84, headroom: 0 },
] as const

test('季節の飾りは、先に描いたもの（みんな・夢の飾り・太陽・虹・星）を上書きせず、行進の幅の外には地面の色しか変えない', () => {
  const bad: string[] = []
  for (const calendar of ALL_DAYS)
    for (const time of ['night', 'day', 'evening'] as const)
      for (const frame of FRAMES)
        for (const n of [0, 3])
          for (const [k, ground] of GROUND_SETS.entries())
            // 空の夢は、地面の飾りごとに 2 とおりずつ（全部の組み合わせは重いので、ずらしながら全部の空の組が出るように）
            for (const sky of [SKY_SETS[k]!, SKY_SETS[(k + 1) % SKY_SETS.length]!])
              for (const tick of [0, 13]) {
                const palette = PALETTES[time]
                const input = { ...frame, mood: 'idle' as const, tick, friends: crew(n), character: 'clawd' as const, look: { ...plain, dreams: [...ground, ...sky] }, palette }
                const before = drawScene(input)
                const after = drawScene({ ...input, calendar })
                const floor = 13 + frame.headroom
                for (const { x, y } of changed(after, before)) {
                  const was = before[y]![x]
                  const where = `${JSON.stringify(calendar)} ${time} ${frame.columns}/${frame.paradeColumns} n${n} ${[...ground, ...sky].join(',')} t${tick} @${x},${y}`
                  // 変わってよいのは、空の何も無いところ・地面の線・草と花だけ
                  // （行事の飾りは、遠くの星の手前に立つ。夢の地面の飾りと同じ）
                  const isSoft = was === null || y === floor || [palette.grass, palette.flower, palette.star, palette.starDim].includes(was!)
                  if (!isSoft) bad.push(`${where}: ${hex(was!)} を上書き`)
                  // 行進の幅（セリフの空・贈り物の札）より右は、地面の線と花（冬の雪）だけ
                  if (x >= frame.paradeColumns && y < floor - 2) bad.push(`${where}: 行進の幅の外`)
                }
              }
  expect(bad.slice(0, 5)).toEqual([])
})

test('季節の飾りがあっても、並び（当たり判定）とみんなの絵は変わらない', () => {
  for (const calendar of ALL_DAYS)
    for (const frame of FRAMES)
      for (const n of [0, 1, 3]) {
        const friends = crew(n)
        const l = layout(frame.columns, frame.paradeColumns, friends, 'clawd')
        for (const tick of [0, 3, 9]) {
          const input = { ...frame, mood: 'working' as const, tick, friends, character: 'clawd' as const, palette: PALETTES.day }
          const before = drawScene(input)
          const after = drawScene({ ...input, calendar })
          // リーダーと仲間の列の、地面より上は 1 ドットも変わらない（花びらは空のあいたところだけ、行事の飾りは庭だけ）
          for (const { x, y } of changed(after, before)) {
            const isCrowd = (x >= l.leader.x - 2 && x < l.leader.x + l.leader.w + 2) || l.friends.some(f => x >= f.x && x < f.x + f.w)
            // 冬は花が雪をかぶるので、草花の行（地面の 2 つ上まで）は見ない
            if (isCrowd && y < 13 + frame.headroom - 2) expect(before[y]![x]).toBeNull()
          }
        }
      }
})

test('落ちてくる花びら・葉、ほたるはまばら（行進の幅 15 列にひとつより少ない）。冬は空から何も降らせない', () => {
  for (const frame of FRAMES) {
    const floor = 13 + frame.headroom
    const count = (calendar: Calendar, time: 'night' | 'day', tick: number) => {
      const input = { ...frame, mood: 'idle' as const, tick, friends: [], character: 'clawd' as const, palette: PALETTES[time] }
      return changed(drawScene({ ...input, calendar }), drawScene(input)).filter(({ y }) => y < floor - 2).length
    }
    for (let tick = 0; tick < 40; tick++) {
      // 花びら・葉は 2 ドットまでなので、ドットで数えて 15 列に 2 つまで
      for (const season of ['spring', 'autumn'] as const) expect(count(SEASON_DAYS[season], 'night', tick)).toBeLessThanOrEqual(Math.ceil(frame.paradeColumns / 15) * 2)
      expect(count(SEASON_DAYS.summer, 'night', tick)).toBeLessThanOrEqual(Math.ceil(frame.paradeColumns / 15))
      expect(count(SEASON_DAYS.winter, 'night', tick)).toBe(0)
    }
    // 春と秋は、どこかのコマで花びら・葉が見える。動く
    for (const season of ['spring', 'autumn'] as const) {
      const seen = Array.from({ length: 20 }, (_, tick) => count(SEASON_DAYS[season], 'night', tick))
      expect(Math.max(...seen)).toBeGreaterThan(0)
    }
  }
})

test('行事の地面の飾り・満月・入道雲は、夢の飾り・虹・みんな・空の夢から 1 ドットあける。場所が無ければ出さない', () => {
  const bad: string[] = []
  let placed = 0
  let skipped = 0
  for (const frame of FRAMES) {
    const sky = frame.headroom
    const ground = 13 + sky
    for (const n of [0, 1, 2, 3, 4])
      for (const kind of [null, 'rise', 'noon', 'set'] as const)
        for (const grounds of GROUND_SETS)
          for (const skies of SKY_SETS) {
            const dreams = [...grounds, ...skies]
            const l = layout(frame.columns, frame.paradeColumns, crew(n), 'clawd')
            if (!l.yard) continue
            const sun = kind ? sunOf(kind, ground, frame.paradeColumns) : null
            const room = { yard: l.yard, dreams, sky, ground, sun, crowd: crowdOf(l), stars: [] }
            const skyBoxes = skyDreamSpots(room).map(({ dream, x, y }) => skyDecoBox(dream, x, y))
            const palette = kind === null ? PALETTES.night : kind === 'noon' ? PALETTES.day : kind === 'rise' ? PALETTES.morning : PALETTES.evening
            for (const calendar of [...Object.values(HOLIDAY_DAYS), SEASON_DAYS.summer]) {
              const plan = seasonPlan(calendar, room, skyBoxes, palette)
              const boxes = seasonBoxes(plan, ground)
              if (calendar.holiday && plan.item) placed++
              if (calendar.holiday && !plan.item) skipped++
              const others = [...takenBoxes(room), ...skyBoxes]
              const where = `${frame.paradeColumns} n${n} ${kind} ${dreams.join(',')} ${JSON.stringify(calendar)}`
              // 広いデスクトップで仲間が 2 匹までなら、夢の飾りが全部あっても入る
              if (calendar.holiday && !plan.item && frame.paradeColumns === 114 && n <= 2) bad.push(`${where}: missing`)
              for (const b of boxes) {
                // 庭の中（行進の幅の内側）に収まる
                if (b.x < 0 || b.x + b.w > l.yard.right) bad.push(`${where}: out`)
                const p = padded(b)
                if (others.some(o => p.x < o.x + o.w && o.x < p.x + p.w && p.y < o.y + o.h && o.y < p.y + p.h)) bad.push(`${where}: touches`)
              }
            }
          }
  }
  expect(bad.slice(0, 5)).toEqual([])
  // 出せないのは、狭い端末や仲間が多くて庭がふさがっているときだけ
  expect(placed).toBeGreaterThan(skipped)
  // 広いデスクトップで、夢の飾りが無ければかならず出る
  const l = layout(180, 114, [], 'clawd')
  const room = { yard: l.yard!, dreams: [], sky: 4, ground: 17, sun: null, crowd: crowdOf(l), stars: [] }
  for (const calendar of Object.values(HOLIDAY_DAYS)) expect(seasonPlan(calendar, room, [], PALETTES.night).item).not.toBeNull()
  // 満月は暗い空にだけ。月への旅の月が出ているときは出さない（月がふたつにならない）
  expect(seasonPlan(HOLIDAY_DAYS.tsukimi, room, [], PALETTES.night).moon).not.toBeNull()
  expect(seasonPlan(HOLIDAY_DAYS.tsukimi, room, [], PALETTES.day).moon).toBeNull()
  expect(seasonPlan(HOLIDAY_DAYS.tsukimi, { ...room, dreams: ['moonTrip'] }, [], PALETTES.night).moon).toBeNull()
  // 入道雲は夏の明るい空にだけ（夜はほたる）
  expect(seasonPlan(SEASON_DAYS.summer, room, [], PALETTES.day).cloud).not.toBeNull()
  expect(seasonPlan(SEASON_DAYS.summer, room, [], PALETTES.night).cloud).toBeNull()
  expect(seasonPlan(SEASON_DAYS.spring, room, [], PALETTES.day).cloud).toBeNull()
})

test('季節が無ければ（null）、季節の飾りは描かない（前と同じ絵）', () => {
  const input = { columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle' as const, tick: 3, friends: crew(1), character: 'clawd' as const }
  expect(drawScene({ ...input, calendar: null })).toEqual(drawScene(input))
})

// ふだんのセリフの色（#d97757）と、どの空の色とのコントラスト比も 3.5 以上（1.3.0）。季節で空の色は変えないので、どの季節でも同じ
test('セリフはどの時間帯の空でも読める（季節で空の色は変えない）', () => {
  const lum = (rgb: number) => {
    const ch = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch((rgb >> 16) & 255) + 0.7152 * ch((rgb >> 8) & 255) + 0.0722 * ch(rgb & 255)
  }
  const ratio = (a: number, b: number) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  for (const palette of Object.values(PALETTES)) expect(ratio(0xd97757, palette.sky)).toBeGreaterThanOrEqual(3.5)
})

test('季節と行事のセリフ：ふだんのセリフの後ろに足すので、いちばん目は変わらない。行事のセリフが季節より先', () => {
  const base = linesOf('idle', 'night', 0)
  for (const calendar of ALL_DAYS) {
    const lines = linesOf('idle', 'night', 0, calendar)
    expect(lines.slice(0, base.length)).toEqual(base)
    expect(lines.length).toBeGreaterThan(base.length)
    // 帯は狭いので、どれも 22 字まで
    for (const line of lines.slice(base.length)) expect([...line].length).toBeLessThanOrEqual(22)
  }
  expect(linesOf('idle', 'night', 0, SEASON_DAYS.spring)).toContain('さくら、きれいだね')
  expect(linesOf('idle', 'night', 0, HOLIDAY_DAYS.christmas)[base.length]).toBe('メリークリスマス！')
  expect(linesOf('idle', 'night', 0, HOLIDAY_DAYS.newYear)[base.length]).toBe('あけましておめでとう！')
  expect(linesOf('idle', 'night', 0, HOLIDAY_DAYS.halloween)[base.length]).toBe('トリック・オア・トリート！')
  // ほかの表情は増えない。なかよし度のセリフは、季節のセリフのさらに後ろ
  for (const calendar of ALL_DAYS) for (const kind of ['working', 'done', 'sleeping', 'permission'] as const) expect(linesOf(kind, 'night', 0, calendar)).toEqual(linesOf(kind, 'night', 0))
  expect(linesOf('idle', 'night', 1e16, SEASON_DAYS.winter).slice(0, base.length + 2)).toEqual(linesOf('idle', 'night', 0, SEASON_DAYS.winter))
})

test('クリスマスは、サンタぼうしを持っていればかぶる（見た目だけ。持っていなければ変わらない）', () => {
  const g = { ...newGame(0, 0), owned: ['santa' as const, 'crown' as const], hat: 'crown' as const }
  expect(lookOf(g, 0, null, 'christmas').hat).toBe('santa')
  expect(lookOf({ ...g, hat: null }, 0, null, 'christmas').hat).toBe('santa')
  expect(lookOf(g, 0, null, 'newYear').hat).toBe('crown')
  expect(lookOf(g, 0, null).hat).toBe('crown')
  expect(lookOf({ ...g, owned: ['crown'] }, 0, null, 'christmas').hat).toBe('crown')
  expect(lookOf({ ...g, owned: [], hat: null }, 0, null, 'christmas').hat).toBeNull()
  // 保存の hat はそのまま
  expect(g.hat).toBe('crown')
})
