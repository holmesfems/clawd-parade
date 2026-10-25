import { expect, test } from 'claude-code/testing'

import type { DreamId, Friend } from '../types'
import { NIGHT, PALETTES, STROKE_DOTS, drawScene, frameOf, groundDecos, hitTest, layout, starsOf, strokeMeter, timeOfDay, toSvg } from '../hooks/scene'

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
  const look = { hat: 'crown' as const, shootingStars: false, aurora: false, fever: false, gift: null, dreams }
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
  // 庭は行進に使う左側（right まで）。入りきらない地面の飾りは、絵の右端（far）まではみ出せる
  expect(l.yard).toEqual({ left: 56, right: 112, far: 178 })
  expect(l.hearts).toEqual([45, 22, 49])
  // 入りきらない古い仲間から外れ、狭いと庭は無い
  expect(layout(60, 60, [friend('a'), friend('b')], 'clawd').friends.map(f => f.id)).toEqual(['b'])
  expect(layout(40, 40, [], 'clawd').yard).toBeNull()
})

const ALL_GROUND: DreamId[] = ['house', 'library', 'moonTrip', 'telescope', 'greenTests']

test('夢のプレゼント：入るときは行進の右端に右寄せ、入らないぶんだけセリフの空へはみ出す', () => {
  // 仲間が 2 匹：行進の左側に全部入るので、前と同じく right に右寄せ
  const roomy = layout(180, 114, [friend('a'), friend('b')], 'clawd').yard!
  const fits = groundDecos(roomy, ALL_GROUND)
  expect(fits.right).toBe(112)
  expect(fits.placed.map(p => p.dream)).toEqual(ALL_GROUND)

  // 仲間が 6 匹：行進の左側には入らない。前は庭ごと無くなって何も飾れなかった
  const crowded = layout(180, 114, ['a', 'b', 'c', 'd', 'e', 'f'].map(friend), 'clawd').yard!
  expect(crowded.right - crowded.left).toBeLessThan(10)
  const spill = groundDecos(crowded, ALL_GROUND)
  expect(spill.placed.map(p => p.dream)).toEqual(ALL_GROUND)
  expect(spill.right).toBeGreaterThan(crowded.right)
  expect(spill.right).toBeLessThanOrEqual(crowded.far)
  // 飾りどうしは重ならず、庭の左端より右
  const xs = spill.placed.map(p => p.x)
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(crowded.left)
  expect(xs).toEqual([...xs].sort((a, b) => b - a))

  // 行進に使う幅に仲間がひとりも入らないときは、仲間を出さず Clawd を左端に置く（前は全員が残って、Clawd が右へ押し出された）
  const tight = layout(114, 48, [friend('a'), friend('b')], 'clawd')
  expect(tight.friends).toEqual([])
  expect(tight.leader.x).toBe(2)
  expect(tight.yard!.right - tight.yard!.left).toBeGreaterThanOrEqual(0)

  // 端末（行進に使う幅 = 絵の幅）は、はみ出す先が無いので、入らないぶんは前と同じく飾らない
  const terminal = layout(84, 84, [friend('a'), friend('b')], 'clawd').yard!
  expect(terminal.far).toBe(terminal.right)
  const cut = groundDecos(terminal, ALL_GROUND)
  expect(cut.right).toBe(terminal.right)
  expect(cut.placed.length).toBeLessThan(ALL_GROUND.length)
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
