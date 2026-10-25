import { expect, test } from 'claude-code/testing'

import type { Friend } from '../types'
import { STROKE_DOTS, drawScene, frameOf, hitTest, layout, starsOf, strokeMeter } from '../hooks/scene'

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
  // 庭は行進に使う左側の中だけ
  expect(l.yard).toEqual({ left: 56, right: 112 })
  expect(l.hearts).toEqual([45, 22, 49])
  // 入りきらない古い仲間から外れ、狭いと庭は無い
  expect(layout(60, 60, [friend('a'), friend('b')], 'clawd').friends.map(f => f.id)).toEqual(['b'])
  expect(layout(40, 40, [], 'clawd').yard).toBeNull()
})

test('当たり判定：リーダーは両脇 1 ドットまで、仲間はその幅だけ', () => {
  const l = layout(84, 84, [friend('a')], 'clawd')
  expect(hitTest(l, 1)).toBeNull()
  expect(hitTest(l, 2)).toEqual({ kind: 'friend', id: 'a' })
  expect(hitTest(l, 12)).toEqual({ kind: 'friend', id: 'a' })
  expect(hitTest(l, 13)).toEqual({ kind: 'leader' })
  expect(hitTest(l, 32)).toEqual({ kind: 'leader' })
  expect(hitTest(l, 33)).toBeNull()
})

test('なでた手が STROKE_DOTS 動くごとに 1 回', () => {
  const meter = strokeMeter()
  meter.start(10, 0)
  const strokes = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].filter(x => meter.move(x, 0).isStroke)
  expect(strokes).toEqual([10 + STROKE_DOTS, 10 + STROKE_DOTS * 2])
  // 縦の動きも数える
  meter.start(0, 0)
  expect(meter.move(0, STROKE_DOTS).isStroke).toBe(true)
  expect(meter.move(0, STROKE_DOTS).moved).toBe(0)
})
