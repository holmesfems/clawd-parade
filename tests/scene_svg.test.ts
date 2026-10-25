// 絵が変わっていないことを、いくつかの場面の SVG と端末セルの指紋で確かめる。
// 描画を整理するとき（#13）に、1 ドットも変えないための見張り。絵をわざと変えたら、指紋を取り直す
import { expect, test } from 'claude-code/testing'

import type { Friend, Look, MoodKind } from '../types'
import { drawScene, encodeCells, toSvg } from '../hooks/scene'

// FNV-1a（32 bit）
const fingerprint = (text: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

const crew = (n: number): Friend[] =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}`, type: ['Explore', 'Plan', 'general-purpose', 'mystery'][i % 4]!, label: '', tool: null, doneAt: i === 2 ? 5 : null }))

const plain: Look = { hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [] }
const dressed: Look = {
  hat: 'crown',
  shootingStars: true,
  aurora: true,
  fever: true,
  gift: 'cake',
  dreams: ['greenTests', 'telescope', 'house', 'library', 'constellation', 'moonTrip', 'noBugs'],
}

const SCENES: { name: string; mood: MoodKind; character: 'clawd' | 'neko'; friends: number; look: Look; tick: number; petted?: boolean }[] = [
  { name: 'idle', mood: 'idle', character: 'clawd', friends: 0, look: plain, tick: 0 },
  { name: 'working', mood: 'working', character: 'clawd', friends: 3, look: plain, tick: 5 },
  { name: 'dressed', mood: 'done', character: 'clawd', friends: 1, look: dressed, tick: 3 },
  { name: 'petted', mood: 'error', character: 'clawd', friends: 0, look: { ...plain, hat: 'ribbon' }, tick: 2, petted: true },
  { name: 'neko', mood: 'sleeping', character: 'neko', friends: 2, look: { ...dressed, hat: 'santa', gift: 'box' }, tick: 7 },
  { name: 'asking', mood: 'permission', character: 'clawd', friends: 4, look: { ...plain, hat: 'catEars' }, tick: 11 },
]

test('絵の指紋が変わらない（デスクトップの SVG と端末のセル）', () => {
  const got: Record<string, string> = {}
  for (const s of SCENES) {
    const input = { mood: s.mood, character: s.character, friends: crew(s.friends), look: s.look, tick: s.tick, petted: s.petted ? { sway: 1 } : null, hopping: ['f0'] }
    got[`${s.name}/desktop`] = fingerprint(toSvg(drawScene({ ...input, columns: 180, paradeColumns: 114, headroom: 4, twinkleTicks: 4 }), 16).source)
    got[`${s.name}/terminal`] = fingerprint(JSON.stringify(encodeCells(drawScene({ ...input, columns: 84 }))))
  }
  expect(got).toEqual(EXPECTED)
})

// 直す前（1.1.7）の絵から取った指紋
const EXPECTED: Record<string, string> = {
  'idle/desktop': '4d13e612',
  'idle/terminal': 'd7057417',
  'working/desktop': 'd5c4d120',
  'working/terminal': 'b258fd32',
  'dressed/desktop': '256b466a',
  'dressed/terminal': 'ccd01a04',
  'petted/desktop': '7e984f08',
  'petted/terminal': '91a0562f',
  'neko/desktop': '900c2db1',
  'neko/terminal': '86fe2f2d',
  'asking/desktop': '1343f236',
  'asking/terminal': '55b95308',
}
