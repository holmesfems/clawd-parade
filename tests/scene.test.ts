import { expect, test } from 'claude-code/testing'

import type { Friend } from '../types'
import { drawScene, starsOf } from '../hooks/scene'

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
