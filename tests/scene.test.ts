import { expect, test } from 'claude-code/testing'

import type { DreamId, Friend, Look } from '../types'
import { DECOS, GIFTED_STARS, giftedStarSpots, groundDecos, milkyWayDensity, rainbowDots, skyDecoBox, skyDreamSpots, sunBox, sunOf } from '../hooks/decor'
import type { Box } from '../hooks/decor'
import { encodeCells, toSvg } from '../hooks/encode'
import { NIGHT, PALETTES, timeOfDay } from '../hooks/palette'
import { STROKE_DOTS, WAVE_EVERY, crowdOf, drawScene, frameOf, hitTest, layout, starsOf, strokeMeter, waveOf } from '../hooks/scene'
import { clawd, leader } from '../hooks/sprites'

const STAR = 0xffe38a
const STAR_DIM = 0x8a86c9

// 空に描かれた星のドット（色と場所）
const starDots = (g: (number | null)[][], skyRows: number) =>
  g
    .slice(0, skyRows)
    .flatMap((row, y) => row.map((c, x) => (c === STAR || c === STAR_DIM ? `${x},${y},${c}` : null)))
    .filter(d => d !== null)

test('星はどの幅でも空の中にあり、縦に固まらない', () => {
  for (const skyRows of [6, 10]) {
    for (let columns = 20; columns <= 600; columns++) {
      const stars = starsOf(columns, skyRows)
      expect(stars.length).toBe(Math.ceil((columns / 14) * (skyRows / 6)))
      for (const { x, y } of stars) {
        expect(x >= 0 && x < columns && y >= 0 && y < skyRows).toBe(true)
        // 前は幅が 37 の倍数のとき、1 列に 5 個並んだ
        expect(stars.filter(s => Math.abs(s.x - x) <= 1).length).toBe(1)
      }
    }
  }
})

test('星は歩いても動かず、長く歩いても消えない', () => {
  // 歩いているあいだは、地面と草花だけが流れる
  const friends: Friend[] = [{ id: 'a', type: 'Explore', label: '', tool: null, doneAt: null }]
  for (const [columns, headroom] of [[84, 0], [180, 4], [600, 4]] as const) {
    const at = (tick: number) =>
      starDots(drawScene({ columns, headroom, mood: 'working', tick, friends, character: 'clawd' }), 6 + headroom)
    const first = at(0)
    expect(first.length).toBeGreaterThan(0)
    // またたきは 7 コマ、歩く Clawd の上下は 2 コマで一巡りするので、14 の倍数のコマどうしは同じ絵になる。
    // 前は数分歩くと星の x が負になって、ひとつずつ消えていった
    for (const tick of [14, 1_400, 14_000, 140_000, 1_400_000]) expect(at(tick)).toEqual(first)
  }
})

test('時間帯：「時」から朝・昼・夕方・夜・深夜を決める', () => {
  const byHour = Array.from({ length: 24 }, (_, hour) => timeOfDay(hour))
  expect(byHour).toEqual([
    'night',
    ...Array(4).fill('lateNight'),
    ...Array(5).fill('morning'),
    ...Array(6).fill('day'),
    ...Array(3).fill('evening'),
    ...Array(5).fill('night'),
  ])
  expect(PALETTES.night).toBe(NIGHT)
})

test('時間帯で空の色と星の数が変わる。昼は星が出ない', () => {
  const draw = (time: keyof typeof PALETTES, tick = 0) =>
    drawScene({ columns: 180, headroom: 4, mood: 'idle', tick, friends: [], character: 'clawd', palette: PALETTES[time] })
  const countStars = (time: keyof typeof PALETTES) => {
    const { star, starDim } = PALETTES[time]
    return draw(time).slice(0, 10).flat().filter(c => c === star || c === starDim).length
  }
  const night = countStars('night')
  expect(night).toBeGreaterThan(0)
  expect(countStars('lateNight')).toBe(night)
  expect(countStars('day')).toBe(0)
  for (const time of ['morning', 'evening'] as const) {
    expect(countStars(time)).toBeGreaterThan(0)
    expect(countStars(time)).toBeLessThan(night)
  }
  // 残す星の割合は、広い空ではおおよそ palette.stars（朝 3 割）
  const wide = (time: keyof typeof PALETTES) => {
    const { star, starDim } = PALETTES[time]
    const g = drawScene({ columns: 600, headroom: 4, mood: 'idle', tick: 0, friends: [], character: 'clawd', palette: PALETTES[time] })
    return g.slice(0, 10).flat().filter(c => c === star || c === starDim).length
  }
  const share = wide('morning') / wide('night')
  expect(share).toBeGreaterThan(0.15)
  expect(share).toBeLessThan(0.45)
  // SVG の背景は時間帯の空の色
  for (const time of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
    const sky = '#' + PALETTES[time].sky.toString(16).padStart(6, '0')
    expect(toSvg(draw(time), 16, PALETTES[time]).source).toContain(`fill="${sky}"`)
  }
})

test('太陽：朝は右から昇り、昼は上に小さく、夕方は左に沈む。夜と深夜は出ない', () => {
  // 太陽のドット（芯の色）の x と y
  const sunDots = (time: keyof typeof PALETTES, columns: number, paradeColumns: number, headroom: number) => {
    const g = drawScene({ columns, paradeColumns, headroom, mood: 'idle', tick: 0, friends: [], character: 'clawd', palette: PALETTES[time] })
    const core = { morning: 0xffd98a, day: 0xfff8d6, evening: 0xffa25e }[time as 'morning' | 'day' | 'evening']
    return g.flatMap((row, y) => row.flatMap((c, x) => (c === core ? [{ x, y }] : [])))
  }
  for (const [columns, paradeColumns, headroom] of [[84, 84, 0], [180, 114, 4]] as const) {
    const rise = sunDots('morning', columns, paradeColumns, headroom)
    const noon = sunDots('day', columns, paradeColumns, headroom)
    const set = sunDots('evening', columns, paradeColumns, headroom)
    for (const dots of [rise, noon, set]) expect(dots.length).toBeGreaterThan(0)
    // 朝日は行進の右の端（広いデスクトップでも、セリフの空にはかからない）
    for (const { x } of rise) expect(x > paradeColumns * 0.8 && x < paradeColumns).toBe(true)
    // 昼は空の上のほう
    for (const { y } of noon) expect(y).toBeLessThan(6)
    // 夕日は左の端
    for (const { x } of set) expect(x).toBeLessThan(10)
  }
  for (const time of ['night', 'lateNight'] as const) expect(PALETTES[time].sun).toBeNull()
})

test('太陽は空のいちばん奥：夢のプレゼント・地面・みんなを上書きしない', () => {
  const dreams: DreamId[] = ['house', 'library', 'moonTrip', 'telescope', 'greenTests', 'constellation', 'noBugs']
  const look = { hat: 'crown' as const, shootingStars: false, aurora: false, fever: false, gift: null, dreams, stars: 0 }
  const crew = [friend('a'), friend('b')]
  for (const [columns, paradeColumns, headroom] of [[84, 84, 0], [90, 90, 4], [180, 114, 4]] as const) {
    for (const time of ['morning', 'day', 'evening'] as const) {
      const draw = (palette: (typeof PALETTES)[typeof time]) =>
        drawScene({ columns, paradeColumns, headroom, mood: 'idle', tick: 1, friends: crew, character: 'clawd', look, palette })
      const withSun = draw(PALETTES[time])
      const without = draw({ ...PALETTES[time], sun: null })
      const { star, starDim } = PALETTES[time]
      // 太陽が無いときに描かれるもの（星を除く）は、太陽があっても同じ色のまま
      without.forEach((row, y) =>
        row.forEach((c, x) => {
          if (c !== null && c !== star && c !== starDim) expect(withSun[y]![x]).toBe(c)
        }),
      )
    }
  }
})

const friend = (id: string): Friend => ({ id, type: 'Explore', label: '', tool: null, doneAt: null })

test('帯の幅から絵の大きさを決める', () => {
  expect(frameOf('terminal', 120)).toEqual({ isWide: true, columns: 84, paradeColumns: 84, headroom: 0, wordsCells: 0 })
  expect(frameOf('terminal', 60)).toEqual({ isWide: false, columns: 59, paradeColumns: 59, headroom: 0, wordsCells: 0 })
  // デスクトップは 1 マス 1.5 ドット。広いと右の 44 マス（66 ドット）をセリフの空にする
  expect(frameOf('desktop', 120)).toEqual({ isWide: true, columns: 180, paradeColumns: 114, headroom: 4, wordsCells: 44 })
  expect(frameOf('desktop', 60)).toEqual({ isWide: false, columns: 90, paradeColumns: 90, headroom: 4, wordsCells: 0 })
  expect(frameOf('desktop', 1_000).columns).toBe(600)
})

test('並び：仲間・Clawd・庭・ハートの湧く列', () => {
  const l = layout(180, 114, [friend('a'), friend('b')], 'clawd')
  expect(l.friends).toEqual([
    { id: 'a', x: 2, w: 11 },
    { id: 'b', x: 14, w: 11 },
  ])
  expect(l.leader).toEqual({ x: 26, w: 18 })
  // 庭は行進に使う左側（right まで）。右のセリフの空にははみ出さない
  expect(l.yard).toEqual({ left: 56, right: 112 })
  expect(l.hearts).toEqual([45, 22, 49])
  // 入りきらない古い仲間から外れ、狭いと庭は無い
  expect(layout(60, 60, [friend('a'), friend('b')], 'clawd').friends.map(f => f.id)).toEqual(['b'])
  expect(layout(40, 40, [], 'clawd').yard).toBeNull()
})

// 1.7.0 で、流れ星の丘と Clawd の銅像を足した
const ALL_GROUND: DreamId[] = ['house', 'starHill', 'library', 'statue', 'moonTrip', 'telescope', 'greenTests']

// 地面の夢から 3 つを選ぶ、すべての組み合わせ（庭の枠は 3 つ）
const THREES = ALL_GROUND.flatMap((a, i) => ALL_GROUND.slice(i + 1).flatMap((b, j) => ALL_GROUND.slice(i + j + 2).map(c => [a, b, c])))

test('夢のプレゼント：庭に右寄せで並べ、入らないぶんは飾らない。セリフの空や贈り物の札へははみ出さない（#44）', () => {
  expect(THREES.length).toBe(35)
  // 広いデスクトップ（180 ドット、札があれば行進はさらに 13 ドット狭い）：仲間が 4 匹（札があれば 2 匹）までなら、
  // どの 3 つを選んでも庭に全部入る
  for (const [paradeColumns, crowd] of [[114, 4], [101, 2]] as const) {
    for (let n = 0; n <= crowd; n++) {
      const yard = layout(180, paradeColumns, Array.from({ length: n }, (_, i) => friend(`f${i}`)), 'clawd').yard!
      expect(yard.right).toBe(paradeColumns - 2)
      for (const three of THREES) {
        const placed = groundDecos(yard, three)
        expect(placed.map(p => p.dream).sort()).toEqual([...three].sort())
        expect(Math.min(...placed.map(p => p.x))).toBeGreaterThanOrEqual(yard.left)
      }
    }
  }

  // 仲間がとても多いと庭が狭く、右寄せの並び（おうち・図書館・ロケット・望遠鏡・旗の順）で入るぶんだけ。
  // 前はセリフの空へはみ出して、セリフの文字と重なった
  const crowded = layout(180, 114, ['a', 'b', 'c', 'd', 'e'].map(friend), 'clawd').yard!
  const some = groundDecos(crowded, ['house', 'library', 'moonTrip'])
  expect(some.map(p => p.dream)).toEqual(['house'])
  expect(some[0]!.x + 14).toBe(crowded.right)
  // 庭が狭すぎれば何も飾らない
  expect(layout(180, 114, ['a', 'b', 'c', 'd', 'e', 'f'].map(friend), 'clawd').yard).toBeNull()

  // 端末（行進に使う幅 = 絵の幅）も同じく、入らないぶんは飾らない
  const terminal = layout(84, 84, [friend('a'), friend('b')], 'clawd').yard!
  const cut = groundDecos(terminal, ALL_GROUND)
  expect(cut.length).toBeLessThan(ALL_GROUND.length)
  const xs = cut.map(p => p.x)
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(terminal.left)
  expect(xs).toEqual([...xs].sort((a, b) => b - a))

  // 行進に使う幅に仲間がひとりも入らないときは、仲間を出さず Clawd を左端に置く（前は全員が残って、Clawd が右へ押し出された）
  const tight = layout(114, 48, [friend('a'), friend('b')], 'clawd')
  expect(tight.friends).toEqual([])
  expect(tight.leader.x).toBe(2)
})

test('夢のプレゼント：広いデスクトップでは、仲間が多くても飾りの絵は行進の幅（庭の右端）までに収まる', () => {
  const look = (dreams: DreamId[]): Look => ({ hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams, stars: 0 })
  for (const n of [0, 2, 4, 5, 6]) {
    const crew = Array.from({ length: n }, (_, i) => friend(`f${i}`))
    const draw = (dreams: DreamId[]) =>
      drawScene({ columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle', tick: 0, friends: crew, character: 'clawd', look: look(dreams) })
    // 月への旅は、ロケット（庭）と月（空）がいっしょに出る
    for (const dreams of [['house', 'library', 'moonTrip'], ['telescope', 'greenTests', 'moonTrip', 'constellation']] as DreamId[][]) {
      for (const { x } of changed(draw(dreams), draw([]))) expect(x).toBeLessThanOrEqual(112)
    }
  }
})

test('当たり判定：リーダーは両脇 1 ドットまで、仲間はその幅だけ', () => {
  const l = layout(84, 84, [friend('a')], 'clawd')
  expect(hitTest(l, 1)).toBeNull()
  expect(hitTest(l, 2)).toEqual({ kind: 'friend', spot: { id: 'a', x: 2, w: 11 } })
  expect(hitTest(l, 12)).toMatchObject({ kind: 'friend', spot: { id: 'a' } })
  expect(hitTest(l, 13)).toEqual({ kind: 'leader' })
  expect(hitTest(l, 32)).toEqual({ kind: 'leader' })
  expect(hitTest(l, 33)).toBeNull()
})

test('なでた手が横に STROKE_DOTS 動くごとに 1 回。端数は持ち越す', () => {
  const meter = strokeMeter()
  meter.start(10)
  const strokes = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map(x => meter.move(x))
  expect(strokes).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1])
  // 行き来しても数える。一度に大きく動いたら、そのぶんだけ
  meter.start(0)
  expect(meter.move(4)).toBe(0)
  expect(meter.move(0)).toBe(1)
  expect(meter.move(STROKE_DOTS * 3)).toBe(3)
  expect(meter.move(STROKE_DOTS * 3 + 1)).toBe(0)
})

// ---- 贈った星（#39） ----

const starLook = (stars: number): Look => ({ hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [], stars })

// 前の絵から変わったドット
const changed = (a: (number | null)[][], b: (number | null)[][]) =>
  a.flatMap((row, y) => row.flatMap((c, x) => (c !== b[y]![x] ? [{ x, y }] : [])))

test('贈った星：行進の上の空に 1 つずつ足し、足しても前の星は動かない', () => {
  for (const [columns, paradeColumns, headroom] of [[84, 84, 0], [180, 114, 4], [600, 534, 4]] as const) {
    const skyRows = 6 + headroom
    const draw = (stars: number) =>
      drawScene({ columns, paradeColumns, headroom, mood: 'idle', tick: 0, friends: [], character: 'clawd', look: starLook(stars) })
    const { leader } = layout(columns, paradeColumns, [], 'clawd')
    const spots = giftedStarSpots(paradeColumns, skyRows, { from: leader.x - 2, to: leader.x + leader.w + 1 })
    expect(spots.length).toBe(GIFTED_STARS)
    // リーダーの頭の上（傾くぶんの余白も）には、十字の光もかからない
    for (const { x } of spots) expect(x + 1 < leader.x - 2 || x - 1 > leader.x + leader.w + 1).toBe(true)
    // 空の上のほうに寄せる
    const meanY = spots.reduce((sum, p) => sum + p.y, 0) / spots.length
    expect(meanY).toBeLessThan((skyRows - 1) / 2)
    // 十字の光まで、セリフの空（paradeColumns より右）と地面の側に出ない
    for (const { x, y } of spots) expect(x >= 1 && x <= paradeColumns - 2 && y >= 1 && y <= skyRows - 2).toBe(true)
    for (let n = 0; n < GIFTED_STARS; n++) {
      // n + 1 個目を足して変わるのは、その星の十字のドットだけ（前の星は動かない）
      const { x, y } = spots[n]!
      for (const d of changed(draw(n + 1), draw(n))) expect(Math.abs(d.x - x) + Math.abs(d.y - y)).toBeLessThanOrEqual(1)
    }
  }
})

test('贈った星：1 つずつ描くのは 12 個まで。十字どうしは 1 ドットあけ、13 個目からは天の川を少しずつ濃くする（空がうるさくならない）', () => {
  expect(GIFTED_STARS).toBe(12)
  // 端末の狭い空でも広いデスクトップの空でも、十字の光のあいだに 1 ドットのすき間がある
  for (const [width, skyRows] of [[84, 6], [114, 10]] as const) {
    const { leader } = layout(width, width, [], 'clawd')
    const spots = giftedStarSpots(width, skyRows, { from: leader.x - 2, to: leader.x + leader.w + 1 })
    for (const [i, a] of spots.entries())
      for (const b of spots.slice(i + 1)) expect(Math.abs(a.x - b.x) >= 4 || Math.abs(a.y - b.y) >= 4).toBe(true)
  }
  // 天の川は 12 個を超えてから。濃さは上がり続けず、上で止まる
  expect(milkyWayDensity(0)).toBe(0)
  expect(milkyWayDensity(GIFTED_STARS)).toBe(0)
  expect(milkyWayDensity(GIFTED_STARS + 1)).toBeGreaterThan(0)
  expect(milkyWayDensity(100)).toBeGreaterThan(milkyWayDensity(40))
  expect(milkyWayDensity(10_000)).toBe(milkyWayDensity(1_000_000))
  expect(milkyWayDensity(1_000_000)).toBeLessThanOrEqual(0.4)
  const draw = (stars: number) =>
    drawScene({ columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle', tick: 0, friends: [], character: 'clawd', look: starLook(stars) })
  const lit = (stars: number) => changed(draw(stars), draw(0))
  // 12 個を超えると、星は増やさずに天の川のぶんだけ変わる。どれだけ増えても、セリフの空には出ない
  expect(lit(13).length).toBeGreaterThan(lit(12).length)
  expect(lit(200).length).toBeGreaterThan(lit(13).length)
  expect(lit(1e9)).toEqual(lit(10_000))
  for (const { x, y } of lit(1e9)) expect(x < 114 && y < 10).toBe(true)
  // 空（行進の上、10 行 × 114 列）の半分より多くは埋まらない
  expect(lit(1e9).length).toBeLessThan((114 * 10) / 2)
})

test('贈った星は昼も出て、端末でもドットで見える。星が無ければ絵は変わらない', () => {
  for (const time of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
    const draw = (stars: number) =>
      drawScene({ columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle', tick: 0, friends: [], character: 'clawd', look: starLook(stars), palette: PALETTES[time] })
    // 白い芯の星が、時間帯によらず出る（太陽の上の星だけは出さない）
    const cores = changed(draw(12), draw(0)).filter(({ x, y }) => draw(12)[y]![x] === 0xffffff)
    expect(cores.length).toBeGreaterThanOrEqual(10)
    // 贈った星の光は、ふつうの大きな星（金色）とは違う色
    expect(draw(12).flat()).toContain(0xffb3d9)
    expect(draw(12).flat()).not.toContain(0xffd166)
  }
  // 端末は空を塗らないが、星のドットはセルに出る
  const terminal = (stars: number) =>
    encodeCells(drawScene({ columns: 84, mood: 'idle', tick: 0, friends: [], character: 'clawd', look: starLook(stars), palette: PALETTES.day }))
  expect(terminal(5).cells).not.toBe(terminal(0).cells)
  // 星が 0 個なら、look の無い絵と 1 ドットも変わらない
  const plain = drawScene({ columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle', tick: 0, friends: [], character: 'clawd' })
  expect(drawScene({ columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle', tick: 0, friends: [], character: 'clawd', look: starLook(0) })).toEqual(plain)
})

// ---- 1 億より先の夢と、手ふり（#40） ----

const overlapsBox = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const boxOf = (rows: string[], x: number, y: number): Box => ({ x, y, w: rows[0]!.length, h: rows.length })

test('1.7.0 の夢の絵の大きさ：地面の丘と銅像は 10 行まで・8 列まで、空の船と星は 6 行まで', () => {
  for (const rows of [DECOS.hill, DECOS.statue]) {
    expect(rows.length).toBeLessThanOrEqual(10)
    expect(rows[0]!.length).toBeLessThanOrEqual(8)
  }
  for (const rows of [DECOS.airship, DECOS.twinStars]) expect(rows.length).toBeLessThanOrEqual(6)
  // 表の行はどれも同じ幅
  for (const rows of [DECOS.hill, DECOS.statue, DECOS.airship, DECOS.twinStars]) for (const row of rows) expect(row.length).toBe(rows[0]!.length)
})

// 空の夢を 2 つ選ぶ組み合わせ（空の枠は 2 つ）と、地面の夢 3 つ（月への旅なら空に月も出る）
const SKY_PAIRS: DreamId[][] = [
  ['constellation', 'airship'],
  ['constellation', 'twinStars'],
  ['noBugs', 'airship'],
  ['noBugs', 'twinStars'],
  ['airship', 'twinStars'],
]

// 1 ドットあいているか（箱どうしが、まわり 1 ドットも重ならない）
const isApart = (a: Box, b: Box) => !overlapsBox({ x: a.x - 1, y: a.y - 1, w: a.w + 2, h: a.h + 2 }, b)
const GROUND_ART: Record<string, string[]> = {
  house: DECOS.house, starHill: DECOS.hill, library: DECOS.library, statue: DECOS.statue, moonTrip: DECOS.rocket, telescope: DECOS.telescope, greenTests: DECOS.flag,
}

// 空の夢を置くときに見るもの（drawScene と同じものを渡す）
const roomOf = (columns: number, paradeColumns: number, headroom: number, n: number, dreams: DreamId[], sun: ReturnType<typeof sunOf> | null) => {
  const l = layout(columns, paradeColumns, Array.from({ length: n }, (_, i) => friend(`f${i}`)), 'clawd')
  return { l, room: { yard: l.yard!, dreams, sky: headroom, ground: 13 + headroom, sun, crowd: crowdOf(l), stars: [] } }
}

test('空飛ぶ船とふたりの星：地面の飾り・月・Clawd 座・虹・おたがい・リーダーと仲間から、いつも 1 ドット以上あける（広いデスクトップ、仲間 0〜4 匹）', () => {
  const headroom = 4
  const ground = 13 + headroom
  let missing = 0
  // expect を何万回も呼ぶと遅いので、はみ出し・くっつきは文字にして集め、最後に空かどうかを見る
  const bad: string[] = []
  for (let n = 0; n <= 4; n++) {
    for (const kind of [null, 'rise', 'noon', 'set'] as const) {
      const sun = kind ? sunOf(kind, ground, 114) : null
      for (const pair of SKY_PAIRS)
        for (const three of THREES) {
          const dreams = [...pair, ...three]
          const { l, room } = roomOf(180, 114, headroom, n, dreams, sun)
          const yard = l.yard!
          const spots = skyDreamSpots(room)
          const wanted = pair.filter(d => d === 'airship' || d === 'twinStars')
          if (n <= 2 && spots.length !== wanted.length) bad.push(`n${n} ${kind} ${dreams.join(',')}: missing`)
          missing += wanted.length - spots.length
          const taken: Box[] = groundDecos(yard, dreams).map(({ dream, x }) => boxOf(GROUND_ART[dream]!, x, ground - GROUND_ART[dream]!.length))
          if (dreams.includes('constellation')) taken.push({ x: Math.floor((yard.left + yard.right) / 2) - 6, y: headroom - 3, w: 13, h: 9 })
          if (dreams.includes('moonTrip')) taken.push(boxOf(DECOS.moon, yard.right - 7, headroom - 3))
          // リーダー（傾き・小物・ハートの列も）と仲間
          taken.push({ x: l.leader.x - 4, y: 0, w: l.leader.w + 14, h: 99 }, ...l.friends.map(f => ({ x: f.x, y: 0, w: f.w, h: 99 })))
          const arc = dreams.includes('noBugs') ? rainbowDots(yard, dreams, ground) : []
          for (const { dream, x, y } of spots) {
            const box = skyDecoBox(dream, x, y)
            // 行進の上の空（贈り物の札とセリフの空より左、星の出る高さ）に収まる
            const where = `n${n} ${kind} ${dreams.join(',')} ${dream}@${x},${y}`
            if (!(box.x >= 0 && box.x + box.w <= yard.right && box.y >= 0 && box.y + box.h <= 6 + headroom)) bad.push(`${where}: out`)
            if (!taken.every(other => isApart(box, other))) bad.push(`${where}: touches`)
            if (!arc.every(p => isApart(box, { x: p.x, y: p.y, w: 1, h: 1 }))) bad.push(`${where}: rainbow`)
            taken.push(box)
          }
        }
    }
  }
  expect(bad).toEqual([])
  // 仲間が 3〜4 匹で空がふさがっているときだけ、入らないものがある（そのときは飾らない）
  expect(missing).toBeGreaterThan(0)
  // 仲間がいなければ、太陽にもかからない
  for (const kind of ['rise', 'noon', 'set'] as const) {
    const sun = sunOf(kind, ground, 114)
    for (const three of THREES)
      for (const { dream, x, y } of skyDreamSpots(roomOf(180, 114, headroom, 0, ['airship', 'twinStars', ...three], sun).room))
        expect(overlapsBox(skyDecoBox(dream, x, y), sunBox(sun))).toBe(false)
  }
})

test('空飛ぶ船とふたりの星：上の行を選び、贈った星の少ない場所を選ぶ。贈り物の札があっても札の列には出ない', () => {
  const { room } = roomOf(180, 114, 4, 0, ['airship', 'twinStars', 'house', 'starHill', 'statue'], null)
  const spots = skyDreamSpots(room)
  for (const { y } of spots) expect(y).toBe(1)
  // 贈った星が箱にかかる場所は、あいていれば避ける
  const ship = spots.find(p => p.dream === 'airship')!
  const starred = skyDreamSpots({ ...room, stars: [{ x: ship.x + 3, y: 2 }] }).find(p => p.dream === 'airship')!
  expect(starred.x).not.toBe(ship.x)
  const badge = roomOf(180, 101, 4, 1, ['airship', 'twinStars', 'house', 'starHill', 'statue'], null)
  for (const { dream, x, y } of skyDreamSpots(badge.room)) expect(skyDecoBox(dream, x, y).x + skyDecoBox(dream, x, y).w).toBeLessThanOrEqual(99)
})

test('空飛ぶ船とふたりの星：空の低い端末では、1 ドットあけられないなら飾らない（入るぶんだけ。高いほうから）', () => {
  // 地面の飾りが低ければ、両方入る
  expect(skyDreamSpots(roomOf(84, 84, 0, 0, ['airship', 'twinStars', 'greenTests'], null).room).map(p => p.dream)).toEqual(['twinStars', 'airship'])
  // 庭 3 つと月まで飾った全部のセーブ：入るのはふたりの星だけ
  expect(skyDreamSpots(roomOf(84, 84, 0, 0, ['moonTrip', 'starHill', 'airship', 'statue', 'twinStars'], null).room).map(p => p.dream)).toEqual(['twinStars'])
  // 空がふさがっていれば飾らない（壊れない）
  const { room } = roomOf(84, 84, 0, 3, ['airship', 'twinStars', 'house', 'library', 'statue'], null)
  expect(skyDreamSpots(room)).toEqual([])
})

test('虹：いちばん右の地面の飾りの上に立ち、ほかの地面の飾り（とまわり 1 ドット）には描かない。おうちのときは前と同じ場所', () => {
  const ground = 17
  for (let n = 0; n <= 4; n++) {
    const yard = layout(180, 114, Array.from({ length: n }, (_, i) => friend(`f${i}`)), 'clawd').yard!
    for (const three of THREES) {
      const dreams = ['noBugs', ...three] as DreamId[]
      const boxes = groundDecos(yard, dreams).map(({ dream, x }) => boxOf(GROUND_ART[dream]!, x, ground - GROUND_ART[dream]!.length))
      const arc = rainbowDots(yard, dreams, ground)
      expect(arc.length).toBeGreaterThan(0)
      expect(boxes.slice(1).every(b => arc.every(p => isApart(b, { x: p.x, y: p.y, w: 1, h: 1 })))).toBe(true)
      // 右のふちは前（yard.right + 3）より右に出ない
      expect(Math.max(...arc.map(p => p.x))).toBeLessThanOrEqual(yard.right + 3)
    }
  }
  // 地面の飾りが無い・おうちだけなら、前と同じ yard.right - 7 を中心にした半径 10 の虹
  const yard = layout(180, 114, [], 'clawd').yard!
  for (const dreams of [['noBugs'], ['noBugs', 'house']] as DreamId[][]) {
    const xs = rainbowDots(yard, dreams, ground).map(p => p.x)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([yard.right - 17, yard.right + 3])
  }
})

test('空飛ぶ船とふたりの星：絵に足して変わるのは、行進の上の空のうち、みんなの列より右で庭の右はしまで（地面・Clawd・セリフの空は変わらない）', () => {
  const look = (dreams: DreamId[]): Look => ({ hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams, stars: 0 })
  // 端末は空が低いので、低い地面の飾り（旗）といっしょに
  for (const [columns, paradeColumns, headroom, crew, base] of [
    [180, 114, 4, [friend('a')], ['house', 'starHill', 'statue']],
    [84, 84, 0, [], ['greenTests']],
  ] as const) {
    const draw = (dreams: DreamId[]) =>
      drawScene({ columns, paradeColumns, headroom, mood: 'idle', tick: 0, friends: [...crew], character: 'clawd', look: look(dreams) })
    const lit = changed(draw([...base, 'airship', 'twinStars']), draw([...base]))
    expect(lit.length).toBeGreaterThan(DECOS.airship.length * 4)
    const { yard } = layout(columns, paradeColumns, [...crew], 'clawd')
    const { leader: spot } = layout(columns, paradeColumns, [...crew], 'clawd')
    for (const { x, y } of lit) expect(x > spot.x + spot.w + 10 && x < yard!.right && y < headroom + 6).toBe(true)
  }
})

test('手ふり：「あいぼう」から、ひまなときに WAVE_EVERY コマごとに 4 コマだけ（tick で決まり、乱数は使わない）', () => {
  const fond: Look = { hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [], stars: 0, waves: true }
  const frames = Array.from({ length: WAVE_EVERY * 2 }, (_, tick) => waveOf(fond, 'idle', false, false, tick))
  expect(frames.slice(0, 5)).toEqual([0, 1, 0, 1, null])
  expect(frames.filter(f => f !== null).length).toBe(8)
  expect(frames.slice(WAVE_EVERY, WAVE_EVERY + 4)).toEqual([0, 1, 0, 1])
  // なでられている・贈り物をかかえている（pose）、行進中、ひまでないとき、あいぼうでないときはふらない
  expect(waveOf(fond, 'idle', true, false, 0)).toBeNull()
  expect(waveOf(fond, 'idle', false, true, 0)).toBeNull()
  for (const mood of ['working', 'done', 'sleeping', 'waiting', 'error'] as const) expect(waveOf(fond, mood, false, false, 0)).toBeNull()
  expect(waveOf({ ...fond, waves: false }, 'idle', false, false, 0)).toBeNull()
  expect(waveOf(starLook(0), 'idle', false, false, 0)).toBeNull()
  // スプライトの大きさは変わらない（当たり判定・小物の場所はそのまま）
  for (const wave of [0, 1] as const) {
    const s = clawd('idle', 'happy', 0, 0, 0, wave)
    const plain = clawd('idle', 'happy', 0, 0, 0)
    expect([s.w, s.h]).toEqual([plain.w, plain.h])
    expect(s.px).not.toEqual(plain.px)
    const cat = leader('happy', 'smile', 0, null, wave)
    expect([cat.w, cat.h]).toEqual([leader('happy', 'smile', 0, null).w, leader('happy', 'smile', 0, null).h])
  }
  // 絵：ふるコマだけ、リーダーの絵の中が変わる。なでられているときは、あいぼうでも変わらない
  for (const character of ['clawd', 'neko'] as const) {
    const draw = (tick: number, waves: boolean, petted: { sway: number } | null = null) =>
      drawScene({ columns: 180, paradeColumns: 114, headroom: 4, mood: 'idle', tick, friends: [], character, look: { ...fond, waves }, petted })
    const { leader: spot } = layout(180, 114, [], character)
    for (const tick of [0, 1, WAVE_EVERY + 2]) {
      const lit = changed(draw(tick, true), draw(tick, false))
      expect(lit.length).toBeGreaterThan(0)
      for (const { x } of lit) expect(x >= spot.x && x < spot.x + spot.w).toBe(true)
    }
    for (const tick of [4, 5, WAVE_EVERY - 1]) expect(draw(tick, true)).toEqual(draw(tick, false))
    expect(draw(0, true, { sway: 1 })).toEqual(draw(0, false, { sway: 1 }))
  }
})
