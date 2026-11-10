// 季節と行事の飾り（#41）。日付から決まる Calendar を受け取り、季節の小さなようす（春の花びら・夏のほたると入道雲・
// 秋の落ち葉・冬の地面の雪）と、行事の日だけの地面の飾り（クリスマスツリー・門松・ジャック・オ・ランタン・七夕の笹・
// お月見のおだんごと満月）を描く。
// 買った飾りではないので、飾りの枠（#44）には数えない。そのかわり、数も大きさも控えめにして、買った飾り（夢のプレゼント・
// 贈った星・オーロラ・流れ星・太陽）をよけ、場所が無ければ出さない。日付はここでは読まない（register.tsx が時計から決めて渡す）

import type { Calendar, Holiday, Palette, Season } from './palette'
import { boxOf, groundSpot, placeInSky, sunBox } from './decor'
import type { Box, SkyRoom } from './decor'
import { dot, hash, stampWith } from './grid'
import type { Grid } from './grid'

// 季節の飾りの色。夢のプレゼントの色（decor.ts）とは分けて、ここだけで使う
const stampSeason = stampWith({
  // クリスマスツリー：葉（濃い・うすい）、幹、てっぺんの星、飾り玉（赤・青）
  T: 0x2e8b57,
  t: 0x237048,
  k: 0x7a4b2a,
  y: 0xffe066,
  r: 0xe0464b,
  b: 0x6ec6ff,
  // 門松：竹（切り口・うすい緑・緑）、わらの台、なわ、松
  c: 0xe9e2b0,
  B: 0x6dbb6a,
  l: 0xa6dc8f,
  s: 0xc9a35a,
  n: 0x7a5a2a,
  p: 0x2f7a46,
  // ジャック・オ・ランタン：かぼちゃ（明るい・濃い）、へた、光る目と口
  O: 0xf08a24,
  o: 0xb85d12,
  g: 0x5d7a2a,
  L: 0xffd36a,
  F: 0xe0a040,
  // 七夕の笹：葉と、短冊（桃・水色・黄・むらさき）
  h: 0x3f8a4a,
  '1': 0xff8fb1,
  '2': 0x8fc8ff,
  '3': 0xffe066,
  '4': 0xb99cff,
  // お月見：おだんご（白・かげ）、三方の台（明るい・濃い）、すすき
  D: 0xf4efe2,
  d: 0xd9d2c0,
  S: 0xc9a35a,
  z: 0x9c7a3c,
  u: 0xd8c48a,
  // 満月（明るい・もよう）
  M: 0xfff1a8,
  m: 0xf2dd86,
  // 入道雲（明るい・かげ）
  W: 0xaebfd6,
  w: 0x8aa0bd,
})

// 行事の日に地面に立てる飾り。どれも 8 列・9 行まで（端末の狭い庭でも、夢の飾りのとなりに入るよう小さく）
const HOLIDAY_ART: Record<Holiday, string[]> = {
  christmas: [
    '...y...',
    '...T...',
    '..TrT..',
    '..TTT..',
    '.TtTbT.',
    '.TTTTT.',
    'TrTtTyT',
    'TTTTTTT',
    '...k...',
  ],
  // 斜めに切った竹が 3 本と、わらの台・なわ・松
  newYear: [
    '...lc...',
    '...lB.lc',
    'lc.lB.lB',
    'lB.lB.lB',
    'lBplBplB',
    'plBlBlBp',
    'snnnnnns',
    'ssssssss',
    'ssssssss',
  ],
  halloween: [
    '...g...',
    '.OOgOO.',
    'OOoOoOO',
    'OLLOLLO',
    'OOOOOOO',
    'OLoLoLO',
    '.OOOOO.',
  ],
  // 笹の葉に、色とりどりの短冊をつるす
  tanabata: [
    '...h...',
    '..hBh..',
    '.h.B1h.',
    'h2.B.4.',
    '.2hB.4h',
    '..hB3..',
    '...B3..',
    '...B...',
    '...B...',
  ],
  // 三方の台にのせたおだんごと、すすき
  tsukimi: [
    'u....D.',
    'u...DdD',
    '.u.DdDd',
    '.uDdDdD',
    '.uSSSSS',
    'u.zSSSz',
    'u..zSz.',
  ],
}

// 七夕の短冊とツリーの飾り玉は、ときどき色が入れかわってまたたく。ジャック・オ・ランタンは暗いときにゆらめく
function holidayRows(holiday: Holiday, tick: number, isDark: boolean): string[] {
  const rows = HOLIDAY_ART[holiday]
  if (holiday === 'christmas' && tick % 8 >= 4) return rows.map(row => row.replace(/[rb]/g, ch => (ch === 'r' ? 'b' : 'r')))
  if (holiday === 'halloween' && isDark && tick % 6 === 5) return rows.map(row => row.replace(/L/g, 'F'))
  return rows
}

// お月見の満月（夢の「月への旅」の細い月とは別の、まるい月）
const FULL_MOON = ['.MMM.', 'MMmMM', 'MMMMm', 'MmMMM', '.MMM.']

// 夏の昼の入道雲。地平線の上に低く、空の色になじむ落ち着いた色で
const CLOUD = [
  '....WW....',
  '..WWWWW...',
  '..WWWWWWW.',
  '.WWWWWWWw.',
  'WWWWWWWwww',
]

// 落ちてくる花びら・葉の色（1 つ目が芯、2 つ目が添えるドット）
const FALLING: Partial<Record<Season, [number, number][]>> = {
  spring: [[0xffb7d0, 0xffe1ec], [0xf7a1c2, 0xffd0e2]],
  autumn: [[0xe0603a, 0xf09a3e], [0xf09a3e, 0xe8b04a], [0xc94a3a, 0xe0603a]],
}
// 地面に落ちている花びら・葉の色
const RESTING: Partial<Record<Season, number[]>> = {
  spring: [0xffb7d0],
  autumn: [0xe0603a, 0xf09a3e],
}
// 地面にうすく積もった雪
const SNOW = 0xe6eef7
const FIREFLY = 0xd8f26a

// 落ちてくる花びら・葉は、行進の幅 PARTICLE_COLUMNS 列にひとつ（広くても、まばらに）
const PARTICLE_COLUMNS = 20
// ほたるは PARTICLE_COLUMNS より少なめ
const FIREFLY_COLUMNS = 28

// 暗い時間（夕方・夜・深夜）か。drawScene は時間帯を知らないので、太陽の出かたから決める
export const isDarkSky = (palette: Palette) => palette.sun === null || palette.sun === 'set'

const shrink = (b: Box): Box => ({ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 })

// 季節の飾りの置き場所。空の夢などをよけて先に決め、描くのは drawScene の順番で
export type SeasonPlan = {
  calendar: Calendar
  // 行事の地面の飾り（場所が無ければ null）
  item: { holiday: Holiday; x: number } | null
  // お月見の満月・夏の昼の入道雲（場所が無ければ null）
  moon: { x: number; y: number } | null
  cloud: { x: number } | null
}

// room は空の夢を置くのに使ったもの、skyBoxes は置いた空の夢の箱。行事の飾り → 満月 → 入道雲の順に、
// それまでに置いたもの（夢のプレゼント・みんな・虹・ほかの季節の飾り）から 1 ドットあけて置く。夢のほうは動かさない
export function seasonPlan(calendar: Calendar, room: SkyRoom | null, skyBoxes: Box[], palette: Palette): SeasonPlan {
  const plan: SeasonPlan = { calendar, item: null, moon: null, cloud: null }
  if (!room) return plan
  const taken = [...skyBoxes]
  // 地面に立てるもの（行事の飾り・入道雲）は、太陽にもかけない（太陽は空のいちばん奥で、夢の飾りは前に立つが、季節の飾りは控えめにする）。
  // 太陽とは、すき間なしでとなりあってもよい（groundSpot は 1 ドットあけるので、太陽の箱を 1 ドット小さくして渡す）
  const sun = room.sun ? [shrink(sunBox(room.sun))] : []
  const { holiday } = calendar
  if (holiday) {
    const rows = HOLIDAY_ART[holiday]
    const x = groundSpot(room, rows, [...taken, ...sun])
    if (x !== null) {
      plan.item = { holiday, x }
      taken.push(boxOf(rows, x, room.ground - rows.length))
    }
  }
  // 満月は暗い空にだけ。月への旅の月が出ているときは、月がふたつにならないよう出さない
  if (holiday === 'tsukimi' && isDarkSky(palette) && !room.dreams.includes('moonTrip')) {
    const [spot] = placeInSky(room, [{ id: 'moon', rows: FULL_MOON }], taken)
    if (spot) {
      plan.moon = { x: spot.x, y: spot.y }
      taken.push(boxOf(FULL_MOON, spot.x, spot.y))
    }
  }
  // 入道雲は夏の明るい空に。行事の日は行事の飾りだけにして、庭をにぎやかにしすぎない
  if (calendar.season === 'summer' && !isDarkSky(palette) && !holiday) {
    const x = groundSpot(room, CLOUD, [...taken, ...sun])
    if (x !== null) plan.cloud = { x }
  }
  return plan
}

// 置いた季節の飾りの箱（テストで、ほかの飾りとあいているかを見る）
export function seasonBoxes(plan: SeasonPlan, ground: number): Box[] {
  const boxes: Box[] = []
  if (plan.item) {
    const rows = HOLIDAY_ART[plan.item.holiday]
    boxes.push(boxOf(rows, plan.item.x, ground - rows.length))
  }
  if (plan.moon) boxes.push(boxOf(FULL_MOON, plan.moon.x, plan.moon.y))
  if (plan.cloud) boxes.push(boxOf(CLOUD, plan.cloud.x, ground - CLOUD.length))
  return boxes
}

// 空の季節の飾り（満月・入道雲）。星や空の夢と同じく、地面とみんなより奥に描く
export function drawSeasonSky(g: Grid, plan: SeasonPlan, ground: number) {
  if (plan.moon) stampSeason(g, FULL_MOON, plan.moon.x, plan.moon.y)
  if (plan.cloud) stampSeason(g, CLOUD, plan.cloud.x, ground - CLOUD.length)
}

// 行事の地面の飾り。夢の地面の飾りといっしょに、地面のあとで描く
export function drawHolidayItem(g: Grid, plan: SeasonPlan, ground: number, tick: number, isDark: boolean) {
  if (!plan.item) return
  const rows = holidayRows(plan.item.holiday, tick, isDark)
  stampSeason(g, rows, plan.item.x, ground - rows.length)
}

// 空の何も無いところにだけ塗る。花びらやほたるが、先に描いた太陽・虹・オーロラ・星の手前に出ないように
function behind(g: Grid, x: number, y: number, color: number) {
  if (g[y]?.[x] === null) dot(g, x, y, color)
}

// 落ちてくる花びら・葉と、ほたる。width は行進の幅（セリフの空と贈り物の札には出さない）、ground は地面の行。
// 空の何も無いところにだけ、みんなや飾りより先に（奥に）描くので、顔や飾りにはかからない
export function drawParticles(g: Grid, season: Season, isDark: boolean, width: number, ground: number, tick: number) {
  const falling = FALLING[season]
  if (falling) {
    const n = Math.max(1, Math.floor(width / PARTICLE_COLUMNS))
    // 上の空から地面の手前まで、2 コマで 1 ドット落ちる。ひと回りごとに落ちはじめる列を変える
    const fall = ground + 2
    const t = Math.floor(tick / 2)
    for (let j = 0; j < n; j++) {
      const from = Math.floor(hash(70_000 + j) * fall)
      const lap = Math.floor((t + from) / fall)
      const y = ((t + from) % fall) - 2
      if (y < 0 || y >= ground - 1) continue
      // 落ちながら左へ流され、左右にゆれる（秋の葉は大きく）
      const sway = Math.round(Math.sin((t + j * 7) / (season === 'autumn' ? 2 : 2.5)) * (season === 'autumn' ? 2 : 1))
      const x = Math.floor(hash(71_000 + j * 97 + lap) * width) - Math.floor(y / 3) + sway
      if (x < 0 || x + 1 >= width) continue
      const [core, edge] = falling[(j + lap) % falling.length]!
      behind(g, x, y, core)
      if ((t + j) % 3 !== 0) behind(g, x + 1, y, edge)
    }
  }
  if (season === 'summer' && isDark) {
    const n = Math.max(1, Math.floor(width / FIREFLY_COLUMNS))
    for (let j = 0; j < n; j++) {
      // 光るのは 7 コマのうち 4 コマ。地面のすぐ上を、ゆっくり行き来する
      if ((tick + j * 4) % 7 >= 4) continue
      const x = Math.floor(hash(72_000 + j) * (width - 6)) + 3 + Math.round(Math.sin((tick + j * 11) / 6) * 3)
      const y = ground - 2 - Math.floor(hash(72_100 + j) * 4) + Math.round(Math.sin((tick + j * 5) / 4))
      if (x >= 0 && x < width) behind(g, x, y, FIREFLY)
    }
  }
}

// 地面の行の季節の色。at は地面の流れぶんを足した列、base はふだんの色（地面が無い列は null）。
// 春と秋はところどころに落ちた花びら・葉、冬は地面の線のまんなかにうすく雪
export function groundAccent(season: Season, at: number, base: number | null): number | null {
  const resting = RESTING[season]
  if (resting && at % 53 === 31) return resting[Math.floor(at / 53) % resting.length]!
  if (season === 'winter' && base !== null && at % 6 === 1) return SNOW
  return base
}

// 冬は草の花のかわりに、雪をかぶった草にする
export const flowerOf = (season: Season | null, flower: number) => (season === 'winter' ? SNOW : flower)
