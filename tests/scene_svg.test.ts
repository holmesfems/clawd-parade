// 絵が変わっていないことを、いくつかの場面の SVG と端末セルの指紋で確かめる。
// 描画を整理するとき（#13）に、1 ドットも変えないための見張り。絵をわざと変えたら、指紋を取り直す
import { expect, test } from 'claude-code/testing'

import type { Friend, Look, MoodKind } from '../types'
import { encodeCells, toSvg } from '../hooks/encode'
import { NIGHT, PALETTES } from '../hooks/palette'
import { drawScene } from '../hooks/scene'

// FNV-1a（32 bit）
const fingerprint = (text: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

const crew = (n: number): Friend[] =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}`, type: ['Explore', 'Plan', 'general-purpose', 'mystery'][i % 4]!, label: '', tool: null, doneAt: i === 2 ? 5 : null }))

const plain: Look = { hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [], stars: 0 }
const dressed: Look = {
  hat: 'crown',
  shootingStars: true,
  aurora: true,
  fever: true,
  gift: 'cake',
  dreams: ['greenTests', 'telescope', 'house', 'library', 'constellation', 'moonTrip', 'noBugs'],
  stars: 0,
}

const SCENES: { name: string; mood: MoodKind; character: 'clawd' | 'neko'; friends: number; look: Look; tick: number; petted?: boolean }[] = [
  { name: 'idle', mood: 'idle', character: 'clawd', friends: 0, look: plain, tick: 0 },
  { name: 'working', mood: 'working', character: 'clawd', friends: 3, look: plain, tick: 5 },
  { name: 'dressed', mood: 'done', character: 'clawd', friends: 1, look: dressed, tick: 3 },
  { name: 'petted', mood: 'error', character: 'clawd', friends: 0, look: { ...plain, hat: 'ribbon' }, tick: 2, petted: true },
  { name: 'neko', mood: 'sleeping', character: 'neko', friends: 2, look: { ...dressed, hat: 'santa', gift: 'box' }, tick: 7 },
  { name: 'asking', mood: 'permission', character: 'clawd', friends: 4, look: { ...plain, hat: 'catEars' }, tick: 11 },
  // ねこのリーダーの涙と、おわった仲間（3 匹目）の目
  { name: 'neko-error', mood: 'error', character: 'neko', friends: 3, look: plain, tick: 4 },
]

test('絵の指紋が変わらない（デスクトップの SVG と端末のセル）', () => {
  const got: Record<string, string> = {}
  for (const s of SCENES) {
    const input = { mood: s.mood, character: s.character, friends: crew(s.friends), look: s.look, tick: s.tick, petted: s.petted ? { sway: 1 } : null, hopping: ['f0'] }
    got[`${s.name}/desktop`] = fingerprint(toSvg(drawScene({ ...input, columns: 180, paradeColumns: 114, headroom: 4, twinkleTicks: 4 }), 16, NIGHT).source)
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
  'neko-error/desktop': '5e6c0178',
  'neko-error/terminal': '167e4f09',
}

// 贈った星（#39）のある場面。数個・ちょうど 12 個（1 つずつ描く最後）・13 個（天の川のはじまり）・たくさんと、昼の空
const STARRY: { name: string; stars: number; palette: keyof typeof PALETTES; tick: number }[] = [
  { name: 'stars5', stars: 5, palette: 'night', tick: 0 },
  { name: 'stars12', stars: 12, palette: 'night', tick: 3 },
  { name: 'stars13', stars: 13, palette: 'night', tick: 0 },
  { name: 'milkyWay', stars: 200, palette: 'night', tick: 0 },
  { name: 'stars12-day', stars: 12, palette: 'day', tick: 1 },
]

test('贈った星のある絵の指紋', () => {
  const got: Record<string, string> = {}
  for (const s of STARRY) {
    const palette = PALETTES[s.palette]
    const input = { mood: 'idle' as const, character: 'clawd' as const, friends: crew(1), look: { ...plain, stars: s.stars }, tick: s.tick, palette }
    got[`${s.name}/desktop`] = fingerprint(toSvg(drawScene({ ...input, columns: 180, paradeColumns: 114, headroom: 4, twinkleTicks: 4 }), 16, palette).source)
    got[`${s.name}/terminal`] = fingerprint(JSON.stringify(encodeCells(drawScene({ ...input, columns: 84 }))))
  }
  expect(got).toEqual(STARRY_EXPECTED)
})

// 1.5.0 で星を足したときの絵から取った指紋（1 つずつは 12 個まで、桃色の光）
const STARRY_EXPECTED: Record<string, string> = {
  'stars5/desktop': '41872af7',
  'stars5/terminal': '29137e68',
  'stars12/desktop': 'dd9eae7c',
  'stars12/terminal': '1f783847',
  'stars13/desktop': 'ec79b7c6',
  'stars13/terminal': '8e542990',
  'milkyWay/desktop': '93a409d5',
  'milkyWay/terminal': 'a1cc2272',
  'stars12-day/desktop': 'd5a768fa',
  'stars12-day/terminal': '72235606',
}
