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
// 夢のプレゼントは、全部贈ったセーブで飾られるもの（庭は高い 3 つ、空は 2 つ。lookOf）。
// 1.5.0 までは 7 つ全部を渡していたが、飾るのは庭 3 つ・空 2 つまでになり（#44）、ゲームはもうそういう Look を作らないので、
// 1.6.0 で渡すものを変えて dressed と neko のデスクトップの指紋だけを取り直した（望遠鏡と旗が消える）。
// 端末は前から庭に入りきらず、ちょうどこの 3 つ（おうち・図書館・ロケット）しか描いていなかったので、指紋は変わらない
const dressed: Look = {
  hat: 'crown',
  shootingStars: true,
  aurora: true,
  fever: true,
  gift: 'cake',
  dreams: ['house', 'library', 'constellation', 'moonTrip', 'noBugs'],
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

// 直す前（1.1.7）の絵から取った指紋（dressed/desktop と neko/desktop だけは 1.6.0 で取り直した。上の dressed を見る）。
// 1.7.0（#40）で dressed と neko の 4 つを取り直した：虹がほかの地面の飾り（ここでは図書館）とそのまわり 1 ドットに描かなくなり、
// 図書館とおうちのあいだのすき間と、図書館の脚のあいだから見えていた虹の左足のドット（dressed は 9、neko は 7）が消えた（ほかは同じ）

const EXPECTED: Record<string, string> = {
  'idle/desktop': '4d13e612',
  'idle/terminal': 'd7057417',
  'working/desktop': 'd5c4d120',
  'working/terminal': 'b258fd32',
  'dressed/desktop': 'c1c0f019',
  'dressed/terminal': '0705b1cd',
  'petted/desktop': '7e984f08',
  'petted/terminal': '91a0562f',
  'neko/desktop': '70d0a057',
  'neko/terminal': '1d48dea1',
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

// 1.7.0（#40）の夢（ひとつずつと、全部贈ったセーブで飾られるもの）と、手ふり（Clawd は手、ねこは耳）の場面
const DREAMY: { name: string; mood: MoodKind; character: 'clawd' | 'neko'; friends: number; look: Look; tick: number }[] = [
  { name: 'starHill', mood: 'idle', character: 'clawd', friends: 1, look: { ...plain, dreams: ['starHill'] }, tick: 0 },
  { name: 'airship', mood: 'idle', character: 'clawd', friends: 1, look: { ...plain, dreams: ['airship'] }, tick: 0 },
  { name: 'statue', mood: 'idle', character: 'clawd', friends: 1, look: { ...plain, dreams: ['statue'] }, tick: 0 },
  { name: 'twinStars', mood: 'idle', character: 'clawd', friends: 1, look: { ...plain, dreams: ['twinStars'] }, tick: 5 },
  { name: 'allDreams', mood: 'done', character: 'clawd', friends: 0, look: { ...plain, dreams: ['moonTrip', 'starHill', 'airship', 'statue', 'twinStars'] }, tick: 3 },
  { name: 'wave', mood: 'idle', character: 'clawd', friends: 0, look: { ...plain, waves: true }, tick: 0 },
  { name: 'wave-neko', mood: 'idle', character: 'neko', friends: 0, look: { ...plain, waves: true }, tick: 0 },
]

test('1.7.0 の夢と手ふりのある絵の指紋', () => {
  const got: Record<string, string> = {}
  for (const s of DREAMY) {
    const input = { mood: s.mood, character: s.character, friends: crew(s.friends), look: s.look, tick: s.tick }
    got[`${s.name}/desktop`] = fingerprint(toSvg(drawScene({ ...input, columns: 180, paradeColumns: 114, headroom: 4, twinkleTicks: 4 }), 16, NIGHT).source)
    got[`${s.name}/terminal`] = fingerprint(JSON.stringify(encodeCells(drawScene({ ...input, columns: 84 }))))
  }
  expect(got).toEqual(DREAMY_EXPECTED)
})

// 1.7.0 で夢と手ふりを足したときの絵から取った指紋
const DREAMY_EXPECTED: Record<string, string> = {
  'starHill/desktop': 'e6b5c16b',
  'starHill/terminal': 'e95d5d5c',
  'airship/desktop': '0e205a5f',
  'airship/terminal': '6e35ca99',
  'statue/desktop': '31d18fb8',
  'statue/terminal': 'b919720f',
  'twinStars/desktop': '2f7aad8e',
  'twinStars/terminal': '7f08ccd1',
  'allDreams/desktop': 'd560bc50',
  'allDreams/terminal': '1235178b',
  'wave/desktop': '8167ee17',
  'wave/terminal': '13bec198',
  'wave-neko/desktop': '0a44fab6',
  'wave-neko/terminal': 'b2bc8af6',
}
