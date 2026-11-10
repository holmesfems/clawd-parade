// 天気（#42）：日付から決まる天気、空の雲・雨つぶ・雪の描き方、セリフ
import { expect, test } from 'claude-code/testing'

import type { DreamId, Friend, Look, Weather } from '../types'
import { bandText, linesOf } from '../hooks/band'
import type { BandState } from '../hooks/band'
import { newGame } from '../hooks/game'
import { C, PALETTES, calendarOf, hex } from '../hooks/palette'
import { padded, sunBox, sunOf } from '../hooks/decor'
import { SNOW_GLAD_EVERY, SNOW_GLAD_TICKS, drawScene, layout } from '../hooks/scene'
import { CLOUD_MAX, RAIN_COLUMNS, SNOW_COLUMNS, SKY_LOOKS, dayPartOf, weatherAt, weatherOf } from '../hooks/weather'
import type { DayPart } from '../hooks/weather'

const friend = (id: string): Friend => ({ id, type: 'Explore', label: '', tool: null, doneAt: null })
const crew = (n: number) => Array.from({ length: n }, (_, i) => friend(`f${i}`))
const plain: Look = { hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [], stars: 0 }
const PARTS: DayPart[] = ['daytime', 'evening', 'night']
const WEATHERS: Weather[] = ['cloudy', 'rain', 'snow']

// 何年かぶんの、すべての日と時間帯
function* everyPart(years: number[]) {
  for (const year of years)
    for (let month = 1; month <= 12; month++) {
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
      for (let day = 1; day <= days; day++) for (const part of PARTS) yield { year, month, day, part }
    }
}

test('同じ日・同じ時間帯なら、いつも同じ天気（何度決めても）', () => {
  for (const { year, month, day, part } of everyPart([2026])) {
    const first = weatherOf(year, month, day, part)
    for (let i = 0; i < 3; i++) expect(weatherOf(year, month, day, part)).toBe(first)
  }
  // 時間帯は timeOfDay の切れ目にそろう：朝〜昼（5〜15 時）・夕方（16〜18 時）・夜（19〜4 時）
  expect([5, 9, 10, 15].map(h => weatherAt(2026, 3, 3, h))).toEqual(Array(4).fill(weatherOf(2026, 3, 3, 'daytime')))
  expect([16, 18].map(h => weatherAt(2026, 3, 3, h))).toEqual(Array(2).fill(weatherOf(2026, 3, 3, 'evening')))
  expect([19, 23].map(h => weatherAt(2026, 3, 3, h))).toEqual(Array(2).fill(weatherOf(2026, 3, 3, 'night')))
  expect(dayPartOf('lateNight')).toBe('night')
  // 0〜4 時は前の日の夜（日付が変わっても天気が変わらない）。月をまたいでも
  for (const h of [0, 1, 4]) {
    expect(weatherAt(2026, 3, 4, h)).toBe(weatherOf(2026, 3, 3, 'night'))
    expect(weatherAt(2026, 3, 1, h)).toBe(weatherOf(2026, 2, 28, 'night'))
  }
  // 元日の 0 時は、門松が出ているので、大みそかの夜が雨でも晴れ
  for (let year = 2000; year < 2100; year++) for (const h of [0, 3]) expect(weatherAt(year, 1, 1, h)).toBe('clear')
  expect([...Array(100)].some((_, i) => weatherOf(2000 + i, 12, 31, 'night') !== 'clear')).toBe(true)
})

test('1 年をならすと、晴れ 65〜70%・くもり 15〜20%・雨と雪 12〜18%。年ごと・日ごとに変わる', () => {
  const count: Record<Weather, number> = { clear: 0, cloudy: 0, rain: 0, snow: 0 }
  let total = 0
  let changes = 0
  let last: Weather | null = null
  for (const { year, month, day, part } of everyPart([2025, 2026, 2027, 2028])) {
    const w = weatherOf(year, month, day, part)
    count[w]++
    total++
    if (last !== null && w !== last) changes++
    last = w
  }
  const share = (n: number) => n / total
  expect(share(count.clear)).toBeGreaterThanOrEqual(0.65)
  expect(share(count.clear)).toBeLessThanOrEqual(0.7)
  expect(share(count.cloudy)).toBeGreaterThanOrEqual(0.15)
  expect(share(count.cloudy)).toBeLessThanOrEqual(0.2)
  expect(share(count.rain + count.snow)).toBeGreaterThanOrEqual(0.12)
  expect(share(count.rain + count.snow)).toBeLessThanOrEqual(0.18)
  // くもりと雨で 3 割くらい
  expect(share(count.rain + count.cloudy)).toBeGreaterThanOrEqual(0.27)
  expect(share(count.rain + count.cloudy)).toBeLessThanOrEqual(0.35)
  // 天気は続きやすい（時間帯が変わっても、たいていは同じ天気）。でも、ずっと同じではない
  expect(changes / total).toBeLessThan(0.3)
  expect(changes / total).toBeGreaterThan(0.05)
  // 年がちがえば、同じ月日でも天気がちがう日がある
  const differs = [...everyPart([2026])].filter(({ month, day, part }) => weatherOf(2026, month, day, part) !== weatherOf(2027, month, day, part))
  expect(differs.length).toBeGreaterThan(100)
})

test('雪は冬だけで、冬の雨のほとんどは雪。梅雨は雨が多い。行事の日は晴れ（クリスマスだけは晴れか雪）', () => {
  const wet = { rainy: 0, rainyAll: 0, usual: 0, usualAll: 0, winterSnow: 0, winterRain: 0 }
  for (const { year, month, day, part } of everyPart([2024, 2025, 2026, 2027, 2028, 2029])) {
    const w = weatherOf(year, month, day, part)
    const { season, holiday } = calendarOf(month, day)
    if (w === 'snow') expect(season).toBe('winter')
    if (season === 'winter' && w === 'snow') wet.winterSnow++
    if (season === 'winter' && w === 'rain') wet.winterRain++
    const isRainy = (month === 6 && day >= 5) || (month === 7 && day <= 15)
    if (isRainy) {
      wet.rainyAll++
      if (w === 'rain') wet.rainy++
    } else if (season !== 'winter') {
      wet.usualAll++
      if (w === 'rain') wet.usual++
    }
    if (holiday === 'christmas') expect(['clear', 'snow']).toContain(w)
    else if (holiday) expect(w).toBe('clear')
  }
  expect(wet.winterSnow).toBeGreaterThan(wet.winterRain * 2)
  expect(wet.rainy / wet.rainyAll).toBeGreaterThan((wet.usual / wet.usualAll) * 2)
})

// 前の絵から変わったドット
const changed = (a: (number | null)[][], b: (number | null)[][]) =>
  a.flatMap((row, y) => row.flatMap((c, x) => (c !== b[y]![x] ? [{ x, y }] : [])))

const AURORA = [0x1f6b55, 0x2c4f8f, 0x55408a]
const GROUND_SETS: DreamId[][] = [[], ['house', 'library', 'moonTrip'], ['house', 'starHill', 'statue']]
const SKY_SETS: DreamId[][] = [[], ['constellation', 'noBugs'], ['airship', 'twinStars']]
const FRAMES = [
  { columns: 180, paradeColumns: 114, headroom: 4 },
  { columns: 180, paradeColumns: 101, headroom: 4 },
  { columns: 84, paradeColumns: 84, headroom: 0 },
] as const
// 雪の日のうれしそうな目が出ないコマ（顔が変わらないコマで、みんなの絵が変わらないことを見る）
const CALM_TICKS = [SNOW_GLAD_TICKS, SNOW_GLAD_EVERY + 5, 40]

test('天気の絵は、空の何も無いところ・ふつうの星・太陽・地面にだけ。みんな・夢の飾り・贈った星・オーロラは上書きせず、行進の幅の外の空には塗らない', () => {
  const bad: string[] = []
  for (const weather of WEATHERS)
    for (const time of ['night', 'day', 'morning', 'evening'] as const)
      for (const frame of FRAMES)
        for (const n of [0, 3])
          for (const [k, ground] of GROUND_SETS.entries())
            for (const sky of SKY_SETS)
              // 贈った星とオーロラ、コマは、組み合わせを減らして（重いので）ずらしながら見る
              for (const extra of [k % 2 ? {} : { stars: 8, aurora: true }])
                for (const tick of CALM_TICKS.slice(0, 2)) {
                  const palette = PALETTES[time]
                  const calendar = calendarOf(12, 25)
                  const input = { ...frame, mood: 'idle' as const, tick, friends: crew(n), character: 'clawd' as const, look: { ...plain, ...extra, dreams: [...ground, ...sky] }, palette, calendar }
                  const before = drawScene(input)
                  const after = drawScene({ ...input, weather })
                  const floor = 13 + frame.headroom
                  const l = layout(frame.columns, frame.paradeColumns, input.friends, 'clawd')
                  for (const { x, y } of changed(after, before)) {
                    const was = before[y]![x]
                    const now = after[y]![x] ?? null
                    const where = `${weather} ${time} ${frame.paradeColumns} n${n} ${[...ground, ...sky].join(',')} ${JSON.stringify(extra)} t${tick} @${x},${y}`
                    // 地面の線と草花の行は、水たまりや雪で変わってよい
                    if (y >= floor - 2) continue
                    // 変わってよいのは、何も無かったところ・ふつうの星・太陽（うすくなる・雲にかくれる・雨で出ない）だけ
                    const sunArea = palette.sun ? padded(sunBox(sunOf(palette.sun, floor, frame.paradeColumns))) : null
                    const isSun = sunArea !== null && x >= sunArea.x && x < sunArea.x + sunArea.w && y >= sunArea.y && y < sunArea.y + sunArea.h
                    const isSoft = was === null || was === palette.star || was === palette.starDim || isSun
                    if (!isSoft) bad.push(`${where}: ${hex(was!)} を上書き`)
                    // 行進の幅（セリフの空・贈り物の札）より右は、星が消えるだけ（新しく塗らない。星の下にあったオーロラが見えるのはよい）
                    if (x >= frame.paradeColumns && now !== null && !AURORA.includes(now)) bad.push(`${where}: 行進の幅の外に ${hex(now)}`)
                    // みんなの列の、地面より上は、何も無かったところだけ（顔や体は変わらない）
                    const isCrowd = (x >= l.leader.x - 2 && x < l.leader.x + l.leader.w + 2) || l.friends.some(f => x >= f.x && x < f.x + f.w)
                    if (isCrowd && was !== null && was !== palette.star && was !== palette.starDim && !isSun) bad.push(`${where}: みんなの上`)
                  }
                }
  expect(bad.slice(0, 5)).toEqual([])
})

test('天気があっても、並び（当たり判定）は変わらない。雪の日は、ひまなときにときどきうれしそうな目', () => {
  for (const frame of FRAMES)
    for (const n of [0, 1, 3]) {
      const friends = crew(n)
      const l = layout(frame.columns, frame.paradeColumns, friends, 'clawd')
      // 並びは天気を知らない（layout に天気は渡らない）ので、当たり判定は同じ。描いた絵のリーダーの列の体も同じ
      for (const weather of WEATHERS)
        for (const tick of CALM_TICKS) {
          const input = { ...frame, mood: 'working' as const, tick, friends, character: 'clawd' as const, palette: PALETTES.day }
          const before = drawScene(input)
          const after = drawScene({ ...input, weather })
          for (const { x, y } of changed(after, before)) {
            const isLeader = x >= l.leader.x - 2 && x < l.leader.x + l.leader.w + 2
            // 昼の太陽がリーダーの後ろにあるときは、太陽がうすくなるだけ
            const sun = padded(sunBox(sunOf('noon', 13 + frame.headroom, frame.paradeColumns)))
            const isSun = x >= sun.x && x < sun.x + sun.w && y >= sun.y && y < sun.y + sun.h
            if (isLeader && !isSun && y < 13 + frame.headroom - 2) expect(before[y]![x]).toBeNull()
          }
        }
    }
  // うれしそうな目は、ひまなとき・雪の日・SNOW_GLAD_EVERY コマごとのはじめだけ
  const input = { columns: 84, mood: 'idle' as const, friends: [], character: 'clawd' as const }
  const faceOf = (tick: number, weather: Weather | null) => JSON.stringify(drawScene({ ...input, tick, weather }).map(row => row.slice(2, 22)).slice(4, 10))
  expect(faceOf(SNOW_GLAD_EVERY, 'snow')).not.toBe(faceOf(SNOW_GLAD_EVERY, 'clear'))
  expect(faceOf(SNOW_GLAD_EVERY + SNOW_GLAD_TICKS, 'snow')).toBe(faceOf(SNOW_GLAD_EVERY + SNOW_GLAD_TICKS, 'clear'))
  expect(faceOf(SNOW_GLAD_EVERY, 'rain')).toBe(faceOf(SNOW_GLAD_EVERY, 'clear'))
})

const RAIN = 0x9db8dc
const RAIN_TAIL = 0x5d7397
const SNOW_DOTS = [0xf4f8ff, 0xcfdced]

test('雨つぶ・雪・雲はまばら（雨は 8 列にひとつ、雪は 12 列にひとつより少ない、雲は 3 つまで）。降りながら動く', () => {
  for (const frame of [...FRAMES, { columns: 600, paradeColumns: 520, headroom: 4 }]) {
    const count = (weather: Weather, tick: number, colors: number[]) =>
      drawScene({ ...frame, mood: 'idle', tick, friends: [], character: 'clawd', palette: PALETTES.night, weather })
        .flatMap(row => row.filter(c => c !== null && colors.includes(c))).length
    const seen: Record<'rain' | 'snow', number[]> = { rain: [], snow: [] }
    for (let tick = 0; tick < 60; tick++) {
      // 雨つぶは 2 ドット（芯と尾）なので、芯で数える
      const drops = count('rain', tick, [RAIN])
      const flakes = count('snow', tick, SNOW_DOTS)
      expect(drops).toBeLessThanOrEqual(Math.ceil(frame.paradeColumns / 8))
      expect(flakes).toBeLessThanOrEqual(Math.ceil(frame.paradeColumns / 12))
      seen.rain.push(drops)
      seen.snow.push(flakes)
    }
    expect(Math.max(...seen.rain)).toBeGreaterThan(0)
    expect(Math.max(...seen.snow)).toBeGreaterThan(0)
    expect(RAIN_COLUMNS).toBeGreaterThanOrEqual(8)
    expect(SNOW_COLUMNS).toBeGreaterThanOrEqual(12)
    // 動く：コマで絵が変わる
    const at = (tick: number, weather: Weather) => JSON.stringify(drawScene({ ...frame, mood: 'idle', tick, friends: [], character: 'clawd', weather }))
    expect(at(0, 'rain')).not.toBe(at(1, 'rain'))
    expect(at(0, 'snow')).not.toBe(at(2, 'snow'))
    expect(at(0, 'cloudy')).not.toBe(at(80, 'cloudy'))
  }
  expect(CLOUD_MAX).toBeLessThanOrEqual(3)
})

test('雨の日は、ふつうの星・太陽・流れ星を出さない。くもりと雪の日は、太陽をうすく描き、星は雲のところだけかくれる', () => {
  const input = { columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle' as const, friends: [], character: 'clawd' as const, look: { ...plain, shootingStars: true } }
  const colors = (g: (number | null)[][]) => new Set(g.flat())
  for (let tick = 0; tick < 9; tick++) {
    const rain = colors(drawScene({ ...input, tick, weather: 'rain', palette: PALETTES.night }))
    expect(rain.has(PALETTES.night.star)).toBe(false)
    expect(rain.has(PALETTES.night.starDim)).toBe(false)
    // 流れ星の白い頭も出ない
    expect(rain.has(C.white)).toBe(false)
  }
  const noon = (weather: Weather | null) => colors(drawScene({ ...input, tick: 0, weather, palette: PALETTES.day }))
  expect(noon(null).has(0xfff8d6)).toBe(true)
  expect(noon('rain').has(0xfff8d6)).toBe(false)
  for (const weather of ['cloudy', 'snow'] as const) {
    // うすい太陽（もとの色ではない）は出る
    expect(noon(weather).has(0xfff8d6)).toBe(false)
    expect(drawScene({ ...input, tick: 0, weather, palette: PALETTES.day }).flat().filter(c => c !== null).length).toBeGreaterThan(0)
    // 星は、いくつか残る
    const night = drawScene({ ...input, tick: 0, weather, palette: PALETTES.night }).flat()
    expect(night.filter(c => c === PALETTES.night.starDim).length).toBeGreaterThan(5)
  }
  expect(SKY_LOOKS.rain.shootingStars).toBe(false)
})

test('フィーバーのハートの雨は、雨の日もそのまま（雨つぶはハートの色にならず、ハートの上に塗らない）', () => {
  const input = { columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle' as const, friends: crew(1), character: 'clawd' as const, look: { ...plain, fever: true }, palette: PALETTES.night }
  for (let tick = 0; tick < 30; tick++) {
    const clear = drawScene({ ...input, tick })
    const rain = drawScene({ ...input, tick, weather: 'rain' })
    // 地面の線（17 行目）はハートより手前に描くので、空の行だけ
    clear.slice(0, 17).forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === C.heart || c === C.cheek) expect(rain[y]![x]).toBe(c)
      }),
    )
    for (const c of [RAIN, RAIN_TAIL]) expect([C.heart, C.cheek]).not.toContain(c)
  }
})

test('天気で空の色は変えない（セリフはどの天気でも読める）。季節の花びら・ほたるは雨と雪の日は降らない', () => {
  for (const palette of Object.values(PALETTES))
    for (const weather of WEATHERS) {
      const input = { columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle' as const, tick: 7, friends: [], character: 'clawd' as const, palette }
      // 空の色は palette のまま（toSvg の背景）。行進の幅より右の空（セリフの下）は、天気で何も足さない
      const g = drawScene({ ...input, weather })
      for (let y = 0; y < 15; y++) for (let x = 114; x < 180; x++) if (g[y]![x] !== null) expect([palette.star, palette.starDim, C.white]).toContain(g[y]![x])
    }
  // 春の花びら（#ffb7d0 など）は雨と雪の日に降らず、くもりの日は降る
  const petals = (weather: Weather | null) =>
    Array.from({ length: 40 }, (_, tick) => drawScene({ columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle', tick, friends: [], character: 'clawd', calendar: calendarOf(4, 5), weather }))
      .flatMap(g => g.slice(0, 15).flat())
      .filter(c => c === 0xffb7d0 || c === 0xf7a1c2).length
  expect(petals('cloudy')).toBeGreaterThan(0)
  expect(petals('rain')).toBe(0)
  expect(petals('snow')).toBe(0)
})

test('天気が無ければ（null）、前と同じ絵。晴れも同じ', () => {
  const input = { columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle' as const, tick: 3, friends: crew(1), character: 'clawd' as const, calendar: calendarOf(1, 20) }
  expect(drawScene({ ...input, weather: null })).toEqual(drawScene(input))
  expect(drawScene({ ...input, weather: 'clear' })).toEqual(drawScene(input))
})

const NOW = 100_000
const state = (over: Partial<BandState> = {}): BandState => ({
  mood: { kind: 'idle', at: 0 },
  work: { startedAt: 0, tool: null, durationMs: null, helpers: 0, isRunning: false },
  friends: [],
  pets: { total: 0, at: 0, from: 0, kind: 'pet', hand: null, friend: null },
  game: { ...newGame(1_234, NOW), achievements: [] },
  holding: null,
  tick: { n: 0, at: NOW },
  hour: 21,
  ...over,
})

test('天気のセリフ：ひまなときのセリフにまざる。晴れの日にしか合わないセリフは外す。♡ の稼ぎは変わらない', () => {
  const base = linesOf('idle', 'night', 0)
  expect(linesOf('idle', 'night', 0, null, 'clear')).toEqual(base)
  expect(linesOf('idle', 'night', 0, null, 'rain')).toContain('雨だね…')
  expect(linesOf('idle', 'night', 0, null, 'rain')).toContain('かさ、持ってる？')
  expect(linesOf('idle', 'night', 0, null, 'snow')).toContain('ゆきだ！')
  expect(linesOf('idle', 'night', 0, null, 'cloudy')).toContain('くもってるね')
  for (const weather of WEATHERS) {
    const lines = linesOf('idle', 'night', 0, null, weather)
    // いちばん目は今までと同じ。「星がきれいな夜だね」は晴れの日だけ
    expect(lines[0]).toBe(base[0])
    expect(lines).not.toContain('星がきれいな夜だね')
    expect(linesOf('idle', 'day', 0, null, weather)).not.toContain('いい天気だね〜（たぶん）')
    for (const line of lines.slice(1)) expect([...line].length).toBeLessThanOrEqual(22)
    // ほかの表情は変わらない
    for (const kind of ['working', 'done', 'sleeping'] as const) expect(linesOf(kind, 'night', 0, null, weather)).toEqual(linesOf(kind, 'night', 0))
  }
  // 雪のクリスマスは、行事のセリフが先
  const xmas = linesOf('idle', 'night', 0, calendarOf(12, 25), 'snow')
  expect(xmas.indexOf('メリークリスマス！')).toBeGreaterThan(0)
  expect(xmas.indexOf('メリークリスマス！')).toBeLessThan(xmas.indexOf('ゆきだ！'))
  // 25 コマごとの入れかわりで出る
  const says = Array.from({ length: 8 }, (_, i) => bandText(state({ weather: 'rain', tick: { n: i * 25, at: NOW } })).say)
  expect(says).toContain('雨だね…')
  // ♡ の行はどの天気でも同じ
  for (const weather of WEATHERS) expect(bandText(state({ weather })).score).toBe(bandText(state()).score)
})

test('雨つぶ・雪は、行進の空一面に散らばる（どのコマでも、どの帯にもひとつずつ。横一列にも並ばない）', () => {
  for (const frame of FRAMES)
    for (const [weather, columns, colors] of [['rain', RAIN_COLUMNS, [RAIN]], ['snow', SNOW_COLUMNS, SNOW_DOTS]] as const)
      for (const tick of [0, 1, 5, 17]) {
        // みんなも飾りもいない空で見るため、リーダーの右から（リーダーの後ろの粒は見えない）
        const g = drawScene({ ...frame, mood: 'idle', tick, friends: [], character: 'clawd', palette: PALETTES.night, weather })
        const dots = g.flatMap((row, y) => row.flatMap((c, x) => (c !== null && (colors as readonly number[]).includes(c) ? [{ x, y }] : [])))
        const from = 24
        // 帯の幅の 2 倍の範囲には、かならずひとつはある
        for (let left = from; left + columns * 2 <= frame.paradeColumns; left += columns)
          expect(dots.some(({ x }) => x >= left && x < left + columns * 2)).toBe(true)
        // 高さはばらける（同じ行に半分より多く集まらない）
        const rows = new Map<number, number>()
        for (const { y } of dots) rows.set(y, (rows.get(y) ?? 0) + 1)
        expect(Math.max(...rows.values())).toBeLessThanOrEqual(Math.ceil(dots.length / 2))
        expect(new Set(dots.map(({ y }) => y)).size).toBeGreaterThanOrEqual(Math.min(4, dots.length))
      }
})

test('夏の入道雲（#41）は、晴れた昼の空に浮かび（地面から 2 行以上はなれる）、くもり・雨・雪の時間帯は出ない', () => {
  const summer = calendarOf(8, 1)
  for (const frame of FRAMES) {
    const input = { ...frame, mood: 'idle' as const, tick: 3, friends: crew(1), character: 'clawd' as const, palette: PALETTES.day, calendar: summer }
    const white = (weather: Weather | null) => drawScene({ ...input, weather }).flatMap((row, y) => row.flatMap((c, x) => (c === 0xfbfcff ? [{ x, y }] : [])))
    const cloud = white(null)
    expect(cloud.length).toBeGreaterThan(0)
    const ground = 13 + frame.headroom
    expect(Math.max(...cloud.map(({ y }) => y))).toBeLessThanOrEqual(ground - 4)
    expect(Math.max(...cloud.map(({ x }) => x))).toBeLessThan(frame.paradeColumns)
    expect(white('clear')).toEqual(cloud)
    for (const weather of WEATHERS) expect(white(weather)).toEqual([])
  }
})
