// 天気（#42）。晴れ・くもり・雨・雪を、日付と時間帯から決め（weatherOf）、空の雲・雨つぶ・雪と、地面の水たまり・雪を描く。
// mod はネットにつながないので、ほんとうの天気ではない。日付から決まった乱数（hash）で決めるので、同じ日・同じ時間帯なら、
// どのセッションでも、何度描き直しても同じ天気になる（Math.random も保存も使わない）。♡ の稼ぎには何もしない。
// 描くのは、季節の飾り（season.ts）と同じく、行進の幅のうち空の何も無いところだけ（みんな・飾り・セリフの空・贈り物の札には出さない）

import type { Weather } from '../types'
import { calendarOf, mix, timeOfDay } from './palette'
import type { Holiday, Palette, Season, TimeOfDay } from './palette'
import { dot, hash } from './grid'
import type { Grid } from './grid'

// ---- 天気の決め方 ------------------------------------------------------------

// 1 日を 3 つに分けて、それぞれに天気を決める。時間帯（timeOfDay）の切れ目にそろえて、
// 朝〜昼（5〜15 時）、夕方（16〜18 時）、夜（19〜4 時）
export type DayPart = 'daytime' | 'evening' | 'night'
const DAY_PARTS: Record<TimeOfDay, DayPart> = { morning: 'daytime', day: 'daytime', evening: 'evening', night: 'night', lateNight: 'night' }
export const dayPartOf = (time: TimeOfDay): DayPart => DAY_PARTS[time]

// 天気の割合を変える時期。梅雨（6/5〜7/15）は雨が多く、冬（12〜2 月）は雨のかわりにほとんど雪
type Climate = 'usual' | 'rainy' | 'winter'
// 晴れとくもりの割合（残りが雨か雪）。1 年をならすと、晴れ 2/3 くらい・くもり 2 割くらい・雨と雪 15% くらいになる
// （tests/weather.test.ts で、何年かぶんの日付を数えて確かめている）
const ODDS: Record<Climate, { clear: number; cloudy: number }> = {
  usual: { clear: 0.7, cloudy: 0.17 },
  rainy: { clear: 0.4, cloudy: 0.25 },
  winter: { clear: 0.7, cloudy: 0.16 },
}
// 冬の雨の日のうち、雪になる割合（日ごとに決めるので、同じ日の雨と雪はまざらない）
const SNOWY = 0.75
// 時間帯ごとのゆらぎの幅。日ごとの「空もよう」から、この幅だけずらして時間帯の天気にする。
// 小さいほど 1 日の天気が続く（晴れの日はたいてい 1 日晴れ、くもりの日の夕方だけ雨、くらいになる）
const PART_SWAY = 0.3
const PART_SALT: Record<DayPart, number> = { daytime: 1, evening: 2, night: 3 }
// 星の場所など、ほかの hash とかぶらない番号から
const SALT = 900_000

const climateOf = (month: number, day: number, season: Season): Climate =>
  season === 'winter' ? 'winter' : (month === 6 && day >= 5) || (month === 7 && day <= 15) ? 'rainy' : 'usual'

// その日のその時間帯の天気。year・month（1〜12）・day は使う人のタイムゾーンの日付（タイムゾーンで結果が変わらないよう、ミリ秒ではなく数で受け取る）。
// 行事の日（#41）は飾りを台なしにしないよう、いつも晴れ。クリスマスだけは、雪になる日は雪のまま（ホワイトクリスマス）
export function weatherOf(year: number, month: number, day: number, part: DayPart): Weather {
  const { season, holiday } = calendarOf(month, day)
  const key = SALT + (year * 400 + month * 32 + day) * 8
  // 日ごとの空もよう（0〜1。小さいほど晴れ）と、時間帯ごとのずれ
  const mood = hash(key) + (hash(key + PART_SALT[part]) - 0.5) * PART_SWAY
  const v = Math.min(0.999999, Math.max(0, mood))
  const odds = ODDS[climateOf(month, day, season)]
  const raw: Weather =
    v < odds.clear ? 'clear' :
    v < odds.clear + odds.cloudy ? 'cloudy' :
    season === 'winter' && hash(key + 4) < SNOWY ? 'snow' :
    'rain'
  return onHoliday(holiday, raw)
}

// 行事の日の天気：晴れ（クリスマスは晴れか雪）
const onHoliday = (holiday: Holiday | null, weather: Weather): Weather =>
  holiday === 'christmas' ? (weather === 'snow' ? 'snow' : 'clear') : holiday ? 'clear' : weather

// 今の天気。hour は「時」（0〜23）。夜は 0 時をまたぐので、0〜4 時は前の日の夜の天気にする（日付が変わったとたんに天気が変わらないよう）。
// 前の日は UTC の Date で数えるので、タイムゾーンにかかわらず同じ答え。
// その日が行事の日なら（元日の 0 時など）、行事の飾りが出ているので、前の日の夜の天気でも晴れにする（クリスマスは雪のまま）
export function weatherAt(year: number, month: number, day: number, hour: number): Weather {
  const back = hour < 5 ? 1 : 0
  const d = new Date(Date.UTC(year, month - 1, day - back))
  const weather = weatherOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), dayPartOf(timeOfDay(hour)))
  return onHoliday(calendarOf(month, day).holiday, weather)
}

export const WEATHER_NAMES: Record<Weather, string> = { clear: '晴れ', cloudy: 'くもり', rain: '雨', snow: '雪' }

// /parade debug rain のことば（小文字にしてから引く）
export const WEATHER_WORDS: Record<string, Weather> = {
  clear: 'clear',
  sunny: 'clear',
  晴れ: 'clear',
  はれ: 'clear',
  cloudy: 'cloudy',
  くもり: 'cloudy',
  曇り: 'cloudy',
  rain: 'rain',
  rainy: 'rain',
  雨: 'rain',
  あめ: 'rain',
  snow: 'snow',
  snowy: 'snow',
  雪: 'snow',
  ゆき: 'snow',
}

// ---- 空のようす ---------------------------------------------------------------

// 天気ごとに、空のものをどう見せるか。表に天気が無いと型で落ちる
// - sun：太陽をそのまま・うすく（雲の奥）・出さない
// - stars：ふつうの星（買ったものではない遠くの星）を、全部・雲のところだけかくす・出さない
// - clouds：やわらかい雲・雨雲・なし
// - shootingStars：買った流れ星を見せるか（雨の日だけ出さない。くもりと雪は雲のところだけかくれる）
// - seasonal：季節の花びら・葉・ほたる（#41）を降らせるか（雨と雪の日は、ふたつの降るものが重ならないよう止める。地面の飾りはそのまま）
export type SkyLook = {
  sun: 'full' | 'dim' | 'none'
  stars: 'all' | 'clouds' | 'none'
  clouds: 'soft' | 'dark' | null
  shootingStars: boolean
  seasonal: boolean
}
export const SKY_LOOKS: Record<Weather, SkyLook> = {
  clear: { sun: 'full', stars: 'all', clouds: null, shootingStars: true, seasonal: true },
  cloudy: { sun: 'dim', stars: 'clouds', clouds: 'soft', shootingStars: true, seasonal: true },
  rain: { sun: 'none', stars: 'none', clouds: 'dark', shootingStars: false, seasonal: false },
  snow: { sun: 'dim', stars: 'clouds', clouds: 'soft', shootingStars: true, seasonal: false },
}

// くもりと雪の日の太陽は、空の色へこれだけ寄せて、雲の奥でうすく見せる
export const SUN_DIM = 0.45

// 雲の絵。O は雲、o はふちのうすいところ
const CLOUDS = [
  ['...ooOOo.....', '.oOOOOOOOoOo.', 'oOOOOOOOOOOOo', '.ooooooooooo.'],
  ['..oOOo...', 'oOOOOOOo.', '.oooooooo'],
]
// 雲の色：やわらかい雲は空より少し明るい灰色、雨雲は暗い灰色。空の色に寄せて、星や飾りより目立たせない
const CLOUD_TINT = { soft: 0xc4cad8, dark: 0x6a7080 }
const CLOUD_MIX = { soft: [0.3, 0.18], dark: [0.42, 0.28] } as const
// 行進の幅 CLOUD_COLUMNS 列にひとつ、CLOUD_MAX まで（広いデスクトップでも 3 つまで）
const CLOUD_COLUMNS = 40
export const CLOUD_MAX = 3
// 雲は CLOUD_TICKS コマで 1 ドット、左へ流れる（ゆっくり）
const CLOUD_TICKS = 8

// 雲を描く。行進の幅（width）の上の空に、左へ流れる雲を置く。雨雲は空のいちばん上の行にかかるよう、少し上にはみ出させる。
// isFree の場所（オーロラ・天の川など、買ったものが無いところ）にだけ塗る。塗ったドットを返す（星や流れ星をかくすのに使う）
export function drawClouds(g: Grid, kind: 'soft' | 'dark', palette: Palette, width: number, tick: number, isFree: (x: number, y: number) => boolean): Set<number> {
  const painted = new Set<number>()
  const W = g[0]?.length ?? 0
  const n = Math.min(CLOUD_MAX, Math.max(1, Math.floor(width / CLOUD_COLUMNS)))
  const [body, edge] = CLOUD_MIX[kind].map(t => mix(palette.sky, CLOUD_TINT[kind], t)) as [number, number]
  const drift = Math.floor(tick / CLOUD_TICKS)
  for (let j = 0; j < n; j++) {
    const rows = CLOUDS[j % CLOUDS.length]!
    const w = rows[0]!.length
    // 雲は行進の幅の右から出て、左へ抜けたら右からまた出てくる。はじめの場所は、幅を雲の数で分けた枠の中でずらす
    const period = width + w
    const start = Math.floor((period * (j + 0.2 + 0.5 * hash(73_000 + j))) / n)
    const x = width - ((drift + start) % period)
    const y = kind === 'dark' ? -1 : j % 2
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const px = x + dx
        const py = y + dy
        if (ch === '.' || px < 0 || px >= width || py < 0 || py >= g.length || !isFree(px, py)) return
        dot(g, px, py, ch === 'O' ? body : edge)
        painted.add(py * W + px)
      }),
    )
  }
  return painted
}

// 雨つぶ（明るい芯と、うしろの尾）。フィーバーのハート（桃色・赤）と見分けられるよう、青みの灰色にし、形も斜めの線にする
const RAIN = 0x9db8dc
const RAIN_TAIL = 0x5d7397
// 雪（白と、少しかげった白）。端末でも雨（青い斜めの線）や星（黄色・むらさき・十字）と見分けられるよう、白い 1 ドット
const SNOW_FLAKE = 0xf4f8ff
const SNOW_SHADE = 0xcfdced
// 雨つぶは行進の幅 RAIN_COLUMNS 列にひとつ、雪は SNOW_COLUMNS 列にひとつ（まばらに）
export const RAIN_COLUMNS = 10
export const SNOW_COLUMNS = 14

// 空の何も無いところにだけ塗る（season.ts の花びらと同じ）
function behind(g: Grid, x: number, y: number, color: number) {
  if (g[y]?.[x] === null) dot(g, x, y, color)
}

// 粒ごとの落ちはじめの高さ（0〜1）。黄金比ずつずらして、となりの粒と高さがそろわないようにする
// （hash だけだと、となりあう番号の粒の高さが似て、ひとつの高さに並んだ）
const phaseOf = (j: number) => (j * 0.618034 + hash(74_000 + j) * 0.2) % 1

// 雨つぶ・雪。width は行進の幅（セリフの空と贈り物の札には出さない）、ground は地面の行。
// 空の何も無いところにだけ、みんなや飾りより先に（奥に）描くので、顔や飾り・フィーバーのハートにはかからない。
// 空一面に降って見えるよう、行進の幅を雨つぶ（雪）の数で等分した帯に 1 つずつ置き、どのコマでも空のどこかにいるようにする
// （場所を幅全体の乱数で選ぶと、近い番号の hash が似た値になって、ひとところに固まった）。
// 落ちはじめの高さは粒ごとにずらして、横一列にならないようにする
export function drawPrecip(g: Grid, weather: Weather, width: number, ground: number, tick: number) {
  if (weather === 'rain') {
    const n = Math.max(1, Math.floor(width / RAIN_COLUMNS))
    // 1 行目から地面の上の行まで。尾は 1 行上に出る
    const fall = ground - 1
    // 3 ドット落ちるごとに 1 ドット左へ流れる。流れるぶん、帯の右寄りから落としはじめて、帯の中に収める
    const drift = Math.floor((fall - 1) / 3)
    for (let j = 0; j < n; j++) {
      const left = Math.floor((width * j) / n)
      const span = Math.floor((width * (j + 1)) / n) - left
      // 1 コマで 2 ドット落ちる。ひと回りごとに、帯の中で落ちる列を変える
      const pos = tick * 2 + Math.floor(phaseOf(j) * fall)
      const lap = Math.floor(pos / fall)
      const y = (pos % fall) + 1
      const room = Math.max(1, span - 1 - drift)
      const x = left + drift + Math.floor(hash(74_100 + j * 97 + lap * 7919) * room) - Math.floor((y - 1) / 3)
      if (x < 0 || x + 1 >= width) continue
      behind(g, x, y, RAIN)
      behind(g, x + 1, y - 1, RAIN_TAIL)
    }
  }
  if (weather === 'snow') {
    const n = Math.max(1, Math.floor(width / SNOW_COLUMNS))
    const fall = ground
    const t = Math.floor(tick / 2)
    for (let j = 0; j < n; j++) {
      const left = Math.floor((width * j) / n)
      const span = Math.floor((width * (j + 1)) / n) - left
      // 2 コマで 1 ドット、ゆっくり落ちながら、左右に 1 ドットゆれる（帯の中で）
      const pos = t + Math.floor(phaseOf(j + 3) * fall)
      const lap = Math.floor(pos / fall)
      const y = pos % fall
      const x = left + 1 + Math.floor(hash(75_100 + j * 97 + lap * 7919) * Math.max(1, span - 2)) + Math.round(Math.sin((t + j * 5) / 3))
      if (x < 0 || x >= width) continue
      behind(g, x, y, j % 3 === 0 ? SNOW_SHADE : SNOW_FLAKE)
    }
  }
}

// ---- 地面 -----------------------------------------------------------------

// 雨の水たまり（地面の線の色より青く）と、雪の日の地面の雪（冬の季節の雪より厚く）
const PUDDLE = 0x4f6f99
const PUDDLE_SHINE = 0x7fa0c8
const GROUND_SNOW = 0xe6eef7

// 地面の行の天気の色。at は地面の流れぶんを足した列、base はそれまでの色（地面が無い列は null）。
// 雨はところどころに 3 ドットの水たまり（ときどき光る）、雪は地面の線の 2/3 に雪
export function weatherGround(weather: Weather, at: number, base: number | null, tick: number): number | null {
  if (weather === 'rain') {
    const k = at % 43
    if (k >= 20 && k <= 22) return k === 21 && (tick + Math.floor(at / 43)) % 5 === 0 ? PUDDLE_SHINE : PUDDLE
  }
  if (weather === 'snow' && base !== null && at % 6 !== 0) return GROUND_SNOW
  return base
}

// 雪の日は、草の花も雪をかぶる（冬の季節と同じ色）
export const weatherFlower = (weather: Weather, flower: number) => (weather === 'snow' ? GROUND_SNOW : flower)
