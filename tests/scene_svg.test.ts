// 絵が変わっていないことを、いくつかの場面の SVG と端末セルの指紋で確かめる。
// 描画を整理するとき（#13）に、1 ドットも変えないための見張り。絵をわざと変えたら、指紋を取り直す
import { expect, test } from 'claude-code/testing'

import type { Friend, Look, MoodKind, Weather } from '../types'
import { encodeCells, toSvg } from '../hooks/encode'
import { NIGHT, PALETTES, calendarOf } from '../hooks/palette'
import { drawScene } from '../hooks/scene'
import { backdropSvg } from '../hooks/band'

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

// 1.8.0（#41）の季節と行事の場面。季節は夜と昼（夏は夜がほたる・昼が入道雲）、行事は夜（お月見は満月の出ない昼も）。
// 夢の飾りと贈った星もいっしょに出して、季節の飾りがそれをよけているところを残す。
// 上の指紋は季節なし（calendar を渡さない）で取っているので、季節を足しても変わらない
const SEASONAL: { name: string; date: [number, number]; palette: keyof typeof PALETTES }[] = [
  ...(['night', 'day'] as const).flatMap(palette => [
    { name: `spring-${palette}`, date: [4, 5] as [number, number], palette },
    { name: `summer-${palette}`, date: [8, 1] as [number, number], palette },
    { name: `autumn-${palette}`, date: [10, 10] as [number, number], palette },
    { name: `winter-${palette}`, date: [1, 20] as [number, number], palette },
  ]),
  { name: 'christmas', date: [12, 25], palette: 'night' },
  { name: 'newYear', date: [1, 1], palette: 'night' },
  { name: 'halloween', date: [10, 31], palette: 'night' },
  { name: 'tanabata', date: [7, 7], palette: 'night' },
  { name: 'tsukimi', date: [9, 15], palette: 'night' },
  { name: 'tsukimi-day', date: [9, 15], palette: 'day' },
]

test('1.8.0 の季節と行事のある絵の指紋', () => {
  const got: Record<string, string> = {}
  for (const s of SEASONAL) {
    const palette = PALETTES[s.palette]
    const calendar = calendarOf(...s.date)
    const look: Look = { ...plain, dreams: ['house', 'starHill', 'airship'], stars: 5 }
    const input = { mood: 'idle' as const, character: 'clawd' as const, friends: crew(1), look, tick: 5, palette, calendar }
    got[`${s.name}/desktop`] = fingerprint(toSvg(drawScene({ ...input, columns: 180, paradeColumns: 114, headroom: 4, twinkleTicks: 4 }), 16, palette).source)
    // 端末は空が低く庭が狭いので、低い旗と空飛ぶ船に（行事の飾りが入るように）
    got[`${s.name}/terminal`] = fingerprint(JSON.stringify(encodeCells(drawScene({ ...input, look: { ...look, dreams: ['greenTests', 'airship'] }, columns: 84 }))))
  }
  expect(got).toEqual(SEASONAL_EXPECTED)
})

// 1.8.0 で季節と行事を足したときの絵から取った指紋（summer-day の 2 つだけは 1.9.0 で取り直した：入道雲を、地面に立つ灰色の雲から、
// 空に浮かぶ白い雲に描き直したので）。tsukimi-day/terminal が autumn-day/terminal と同じなのは、狭い端末の昼は
// 太陽と空飛ぶ船で庭の上がふさがり、おだんごを置く場所が無い（出さない）から
const SEASONAL_EXPECTED: Record<string, string> = {
  'spring-night/desktop': 'c6ad7c49',
  'spring-night/terminal': 'c4044cfe',
  'summer-night/desktop': 'aab85d41',
  'summer-night/terminal': '8f76e6f0',
  'autumn-night/desktop': 'eca55e7a',
  'autumn-night/terminal': 'e1696e16',
  'winter-night/desktop': '25aa8b2d',
  'winter-night/terminal': 'f651f02e',
  'spring-day/desktop': 'e490a31f',
  'spring-day/terminal': 'fafb995b',
  'summer-day/desktop': '9cf2573d',
  'summer-day/terminal': '50debe9c',
  'autumn-day/desktop': '04c0e636',
  'autumn-day/terminal': '6cb4973f',
  'winter-day/desktop': '8ee8933d',
  'winter-day/terminal': 'ddd07cba',
  'christmas/desktop': 'dbf3d728',
  'christmas/terminal': '56accbc6',
  'newYear/desktop': '08230b4c',
  'newYear/terminal': 'cb3f9540',
  'halloween/desktop': '587ce8a8',
  'halloween/terminal': '3c357ca3',
  'tanabata/desktop': 'ced95fde',
  'tanabata/terminal': 'd6b4cd70',
  'tsukimi/desktop': '94d64c17',
  'tsukimi/terminal': '0c469570',
  'tsukimi-day/desktop': '2ef66905',
  'tsukimi-day/terminal': '6cb4973f',
}

// 1.9.0（#42）の天気の場面。くもり・雨・雪を、夜と昼で。夢の飾りと贈った星と行事の飾り（雪はクリスマス）もいっしょに出して、
// 天気の絵がそれをよけているところを残す。もうひとつは、フィーバーのハートの雨と雨つぶがいっしょのところ。
// 上の指紋は天気なし（weather を渡さない）で取っているので、天気を足しても変わらない
const WEATHERY: { name: string; weather: Weather; date: [number, number]; palette: keyof typeof PALETTES; look?: Partial<Look> }[] = [
  ...(['night', 'day'] as const).flatMap(palette => [
    { name: `cloudy-${palette}`, weather: 'cloudy' as const, date: [11, 10] as [number, number], palette },
    { name: `rain-${palette}`, weather: 'rain' as const, date: [6, 20] as [number, number], palette },
    { name: `snow-${palette}`, weather: 'snow' as const, date: [12, 25] as [number, number], palette },
  ]),
  { name: 'rain-fever', weather: 'rain', date: [6, 20], palette: 'night', look: { fever: true, shootingStars: true, aurora: true } },
]

test('1.9.0 の天気のある絵の指紋', () => {
  const got: Record<string, string> = {}
  for (const s of WEATHERY) {
    const palette = PALETTES[s.palette]
    const calendar = calendarOf(...s.date)
    const look: Look = { ...plain, dreams: ['house', 'starHill', 'airship'], stars: 5, shootingStars: true, ...s.look }
    const input = { mood: 'idle' as const, character: 'clawd' as const, friends: crew(1), look, tick: 6, palette, calendar, weather: s.weather }
    got[`${s.name}/desktop`] = fingerprint(toSvg(drawScene({ ...input, columns: 180, paradeColumns: 114, headroom: 4, twinkleTicks: 4 }), 16, palette).source)
    got[`${s.name}/terminal`] = fingerprint(JSON.stringify(encodeCells(drawScene({ ...input, look: { ...look, dreams: ['greenTests', 'airship'] }, columns: 84 }))))
  }
  expect(got).toEqual(WEATHERY_EXPECTED)
})

// 1.9.0 で天気を足したときの絵から取った指紋
const WEATHERY_EXPECTED: Record<string, string> = {
  'cloudy-night/desktop': '3cd19d99',
  'cloudy-night/terminal': 'cb4c268f',
  'rain-night/desktop': '1c3543b6',
  'rain-night/terminal': '7c4c587a',
  'snow-night/desktop': '04319d23',
  'snow-night/terminal': 'bfb59701',
  'cloudy-day/desktop': '4d424d08',
  'cloudy-day/terminal': '57058ebf',
  'rain-day/desktop': 'e5cececa',
  'rain-day/terminal': '75df4b3a',
  'snow-day/desktop': '6425bca0',
  'snow-day/terminal': 'a69a6cea',
  'rain-fever/desktop': '5edd0425',
  'rain-fever/terminal': '765d1119',
}

// テーマの背景（/parade theme）は 12 コマを 1 つの SVG に入れる。Svg の source は 131,072 文字までなので、
// いちばん動くところが多い場面（行進・仲間 8 匹・雨・オーロラ・流れ星・星 99 個・夢のプレゼント全部）でも収まる
test('テーマの背景の SVG は、いちばんにぎやかな場面でも 131,072 文字に収まる', () => {
  const crowd: Friend[] = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, type: ['Explore', 'Plan', 'general-purpose'][i % 3]!, label: '', tool: null, doneAt: null }))
  for (const weather of ['clear', 'rain', 'snow'] as const) {
    for (const hour of [7, 13, 22]) {
      const source = backdropSvg({
        hour,
        date: { month: 12, day: 25 },
        weather,
        mood: 'working',
        friends: crowd,
        character: 'clawd',
        look: {
          hat: 'santa',
          shootingStars: true,
          aurora: true,
          fever: false,
          gift: null,
          dreams: ['house', 'library', 'moonTrip', 'telescope', 'greenTests', 'constellation', 'noBugs'],
          stars: 99,
          waves: true,
        },
      })
      expect(source.length).toBeLessThan(131_072)
    }
  }
})
