// 場面の飾り。ぼうし・贈り物のアイコン・夢のプレゼント（庭の飾り・虹・Clawd 座・空飛ぶ船・ふたりの星）、
// 空のもの（太陽・流れ星・オーロラ・ハートの雨・フィーバーのふちどり）、なでなでのハート、ワンぽちの贈り物の札をまとめる。

import type { DreamId, Hat, Look, TreatId } from '../types'
import { C, mix } from './palette'
import type { Palette } from './palette'
import { dot, hash, put, stampWith } from './grid'
import type { Grid, Sprite } from './grid'
import type { Yard } from './scene'

// ぼうしのドット。o は毛の色、e は耳の内側
const stampHat = stampWith({
  p: C.heart,
  k: 0xc2416b,
  r: 0xe0464b,
  w: C.white,
  g: 0xffd166,
  j: 0x6ec6ff,
  o: C.body,
  e: C.ear,
})
// sink は頭に何行めりこませるか。ears は左右に 1 つずつ（右は左右反転）
const HATS: Record<Hat, { rows: string[]; sink: number; at: 'center' | 'right' | 'ears' }> = {
  ribbon: { rows: ['pp.pp', 'ppkpp', 'pp.pp'], sink: 2, at: 'right' },
  catEars: { rows: ['o..', 'oo.', 'oeo'], sink: 0, at: 'ears' },
  santa: { rows: ['...rr..w', '..rrrrr.', '.rrrrrr.', 'wwwwwwww'], sink: 1, at: 'center' },
  crown: { rows: ['g..g..g', 'ggggggg', 'gjgrgjg'], sink: 0, at: 'center' },
}

export function drawHat(g: Grid, hat: Hat, isClawd: boolean, leaderX: number, top: number) {
  // ねこはもとからねこみみ
  if (hat === 'catEars' && !isClawd) return
  const spec = HATS[hat]
  // 頭のてっぺんの行と、その左右の端（Clawd は平らな頭、ねこは耳のあいだ）
  const headTop = isClawd ? top : top + 3
  const [left, right] = isClawd ? [leaderX + 2, leaderX + 15] : [leaderX + 4, leaderX + 9]
  const w = spec.rows[0]?.length ?? 0
  const y = headTop - spec.rows.length + spec.sink
  if (spec.at === 'ears') {
    stampHat(g, spec.rows, left + 1, y)
    stampHat(g, spec.rows, right - w, y, true)
  } else if (spec.at === 'right') {
    stampHat(g, spec.rows, right - w + 2, y)
  } else {
    stampHat(g, spec.rows, Math.floor((left + right + 1 - w) / 2), y)
  }
}

export function drawAurora(g: Grid, tick: number) {
  const W = g[0]?.length ?? 0
  const colors = [0x1f6b55, 0x2c4f8f, 0x55408a]
  for (let x = 0; x < W; x++) {
    const y = 1 + Math.round(Math.sin(x / 7 + tick / 5) * 1.2 + Math.sin(x / 17 - tick / 9))
    const color = colors[Math.floor((x + tick) / 14) % colors.length]!
    dot(g, x, y, color)
    dot(g, x, y + 1, color)
  }
}

export function drawShootingStar(g: Grid, tick: number, palette: Palette) {
  const W = g[0]?.length ?? 0
  const period = 40
  const phase = tick % period
  if (phase >= 9) return
  const n = Math.floor(tick / period)
  const hx = W - 6 - ((n * 53) % Math.max(1, Math.floor(W * 0.6))) - phase * 3
  const trail = [C.white, palette.star, palette.star, palette.star, palette.starDim, palette.starDim, palette.starDim]
  trail.forEach((color, j) => dot(g, hx + j, phase - Math.floor(j / 3), color))
}

// 太陽。朝日は右（東）、昼は上に小さく、夕日は左（西）の空。地平線ぎりぎりだと、朝日は右寄せの夢のプレゼント（おうち）に、
// 夕日は左を歩く Clawd と仲間に隠れるので、少し上の空に出す。仲間と Clawd はあとから描くので、夕日の前を歩く
// glow は朝日と夕日のまわりの、空に溶けるあかり
const SUN = {
  rise: { core: 0xffd98a, rim: 0xffae5c, glow: 0x4b4a6e },
  noon: { core: 0xfff8d6, rim: 0xffe066, glow: null },
  set: { core: 0xffa25e, rim: 0xff6a3d, glow: 0x6a3040 },
}

export type Sun = { kind: 'rise' | 'noon' | 'set'; cx: number; cy: number; r: number; halo: number }

// 太陽の場所と大きさ。paradeColumns は行進に使う幅（広いデスクトップでは、右のセリフの空を除いた幅）
export function sunOf(kind: Sun['kind'], ground: number, paradeColumns: number): Sun {
  const r = kind === 'noon' ? 2 : kind === 'rise' ? 3 : 4
  const halo = SUN[kind].glow === null ? r : r + 2
  // 昼は空の上のほう、行進の幅の真ん中より少し右。朝日は行進の右の端、夕日は左の端。
  // 朝日と夕日はあかりまで空に収まる高さにする（端末は空が低い）
  const [cx, cy] =
    kind === 'noon' ? [Math.floor(paradeColumns * 0.6), 3] :
    kind === 'rise' ? [paradeColumns - 6, Math.max(halo, ground - 11)] :
    [3, Math.max(halo, ground - 9)]
  return { kind, cx, cy, r, halo }
}

export function drawSun(g: Grid, { kind, cx, cy, r, halo }: Sun) {
  const { core, rim, glow } = SUN[kind]
  for (let y = cy - halo; y <= cy + halo; y++)
    for (let x = cx - halo; x <= cx + halo; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2
      const color = d <= (r - 1) * (r - 1) + r - 1 ? core : d <= r * r + r ? rim : glow !== null && d <= halo * halo + halo ? glow : null
      if (color !== null) dot(g, x, y, color)
    }
  // 昼の太陽は、上下左右に短い光をのばす
  if (kind === 'noon') for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) dot(g, cx + dx * (r + 2), cy + dy * (r + 2), rim)
}

export function drawHeartRain(g: Grid, tick: number) {
  const W = g[0]?.length ?? 0
  const fall = g.length + 6
  for (let j = 0; j < Math.ceil(W / 16); j++) {
    const x = (j * 37 + 5) % W
    const y = ((tick + j * 7) % fall) - 5
    putHeart(g, x, y, j % 2 === 0)
  }
}

// フィーバー中のリーダーは金色にふちどる
export function glow(g: Grid, s: Sprite, x: number, y: number, color: number) {
  const filled = (sx: number, sy: number) => s.px[sy]?.[sx] !== null && s.px[sy]?.[sx] !== undefined
  for (let sy = -1; sy <= s.h; sy++)
    for (let sx = -1; sx <= s.w; sx++) {
      if (filled(sx, sy)) continue
      if ([-1, 0, 1].some(dy => [-1, 0, 1].some(dx => filled(sx + dx, sy + dy)))) dot(g, x + sx, y + sy, color)
    }
}

// ---- 贈り物と夢のプレゼント ------------------------------------------------

export const stampIcon = stampWith({
  c: 0xd9a066,
  k: 0x5c3a1c,
  m: 0xf2f2f2,
  a: 0x7a4b2a,
  s: 0xb8bcd8,
  w: 0xfffaf0,
  r: 0xff4d6d,
  y: 0xf5d58a,
  p: 0xff9ec7,
  e: 0xfff8e7,
  d: 0xc9b79c,
  h: C.heart,
  u: 0xb99cff,
  t: 0x8a6fd6,
  q: 0x3a3d4a,
  x: 0xd8dbe8,
  b: 0x6ec6ff,
})

// Clawd がかかえる贈り物（夢のプレゼントはリボンのかかった箱）
export const GIFT_ICONS: Record<NonNullable<Look['gift']>, string[]> = {
  cookie: ['.ccc.', 'ckccc', 'cccck', 'cckcc', '.ccc.'],
  cocoa: ['.s.s..', 'mmmmm.', 'maaamm', 'maaamm', 'mmmmm.'],
  cake: ['..r..', '.www.', 'wwwww', 'yyyyy', 'ppppp', 'yyyyy'],
  letter: ['eeeeeee', 'edeeede', 'eedhdee', 'eeeeeee'],
  cushion: ['.uuuuuu.', 'utuuuutu', 'uuuuuuuu', '.uuuuuu.'],
  keyboard: ['qqqqqqqqq', 'qxqxqxqxq', 'qqxqxqxqq', 'qqxxxxxqq', 'qqqqqqqqq'],
  box: ['.h.h.', '..h..', 'bbhbb', 'bbhbb', 'bbhbb'],
  star: ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'],
}

export const stampDeco = stampWith({
  R: 0xb5523b,
  W: 0xf4e3c1,
  L: 0xffe38a,
  D: 0x7a4b2a,
  P: 0xd0d0d0,
  G: 0x3fbf5f,
  K: C.white,
  S: 0x8a8fa8,
  E: 0x9ec9ff,
  O: 0x8a5a33,
  '1': 0xe0464b,
  '2': 0x6ec6ff,
  '3': 0xffd166,
  '4': 0x8fd694,
  '5': 0xb99cff,
  T: 0xe8e8f0,
  B: 0x6ec6ff,
  r: 0xe0464b,
  F: 0xffb347,
  f: 0xffe066,
  M: 0xfff1a8,
  // 1.7.0（#40）の夢：銅像（N・n・k）と台の石（Q・q）、丘（H・h）、空飛ぶ船（A・a の気球、V・v の船、w の帆）、
  // ふたりの星（X は Clawd の色の星、C は水色の星、Y はあいだのハート）
  N: 0xc8904f,
  n: 0x8f5c2c,
  k: 0x4a2c14,
  Q: 0xb9b3a8,
  q: 0x857f76,
  H: 0x5fae6c,
  h: 0x3f8452,
  A: 0xf3ead8,
  a: 0xc9b99a,
  V: 0xa0663a,
  v: 0x6b3f22,
  w: 0xe8f1ff,
  X: 0xffa477,
  C: 0x9fd4ff,
  Y: C.heart,
})

export const DECOS = {
  flag: ['PGGGGG', 'PGGGGK', 'PKGGKG', 'PGKKGG', 'PGGGGG', 'P.....', 'P.....'],
  telescope: ['.......E', '.....SSE', '...SSS..', '.SSS....', '...S....', '..S.S...', '.S...S..'],
  house: [
    '......RR......',
    '.....RRRR.....',
    '....RRRRRR....',
    '...RRRRRRRR...',
    '..RRRRRRRRRR..',
    '.RRRRRRRRRRRR.',
    '..WWWWWWWWWW..',
    '..WLLWWWWDDW..',
    '..WLLWWWWDDW..',
    '..WWWWWWWDDW..',
  ],
  library: ['OOOOOOOO', 'O123451O', 'O123451O', 'OOOOOOOO', 'O345123O', 'O345123O', 'OOOOOOOO', 'O......O'],
  rocket: ['..rr..', '.TTTT.', '.TBBT.', '.TBBT.', '.TTTT.', '.TTTT.', 'rTTTTr', 'rr..rr', '..FF..'],
  moon: ['..MMM.', '.MM...', 'MM....', 'MM....', '.MM...', '..MMM.'],
  // 流れ星の丘：小さな緑の丘と、そのてっぺんにおりてきた星（尾は右上へ）
  hill: [
    '......M.',
    '...f.M..',
    '..fKf...',
    '...f....',
    '..HHH...',
    '.HHHhH..',
    '.HhHHHH.',
    'HHHHHHhH',
  ],
  // Clawd の銅像：台にのった、手を広げた Clawd（目は銅の濃い色）
  statue: [
    '.NNNNNN.',
    '.NkNNkN.',
    'NNkNNkNn',
    'NNNNNNNn',
    '.NNNNNn.',
    '.n.nn.n.',
    'QQQQQQQQ',
    '.QLLLLq.',
    '.QQQQQq.',
    'QQQQQQQq',
  ],
  // 空飛ぶ船：しまもようの気球に、帆のついた木の船をつるす
  airship: [
    '...AAAAAAA...',
    '..ArAArAArA..',
    '...aaaaaaa...',
    '...P.w...P...',
    'VVVVVwwVVVVVV',
    '.vvLvvvLvvLv.',
  ],
  // ふたりの星：Clawd の色の星と水色の星が、小さなハートをはさんでならぶ（ふつうの星・贈った星・Clawd 座より大きい）
  twinStars: [
    '..X.........C..',
    '.XXX..Y.Y..CCC.',
    'XXKXX.YYY.CCKCC',
    '.XXX...Y...CCC.',
    '.X.X.......C.C.',
  ],
}

// 地面の飾りを庭の右から順に置く。入りきらないものは左から順にあきらめる。
// 一度に飾るのは庭の枠（3 つ）までなので、広いデスクトップの庭にはふつう全部入る（game.ts の SLOTS）
// 1.7.0 の丘と銅像は、どの 3 つを選んでも、仲間が 4 匹いる広いデスクトップの庭に入る幅（8 列）にしてある
const GROUND_DECOS: [DreamId, keyof typeof DECOS][] = [
  ['house', 'house'],
  ['starHill', 'hill'],
  ['library', 'library'],
  ['statue', 'statue'],
  ['moonTrip', 'rocket'],
  ['telescope', 'telescope'],
  ['greenTests', 'flag'],
]

// 地面の飾りの並び。yard.right に右寄せで並べ、庭に入りきらないぶんは飾らない。
// 前は入りきらないぶんを右のセリフの空へはみ出させていたが、セリフの文字と重なったのでやめた（#44）。
// 飾るのは 3 つまでになったので、仲間がとても多いときのほかは庭に入る
export function groundDecos(yard: Yard, dreams: DreamId[]): { dream: DreamId; x: number }[] {
  const placed: { dream: DreamId; x: number }[] = []
  let x = yard.right
  for (const [dream, deco] of GROUND_DECOS.filter(([one]) => dreams.includes(one))) {
    x -= DECOS[deco][0]?.length ?? 0
    if (x < yard.left) break
    placed.push({ dream, x })
    x -= 1
  }
  return placed
}

const groundDecoOf = (dream: DreamId) => GROUND_DECOS.find(([d]) => d === dream)![1]

export function drawYard(g: Grid, dreams: DreamId[], yard: Yard, ground: number, tick: number) {
  for (const { dream, x } of groundDecos(yard, dreams)) {
    const deco = groundDecoOf(dream)
    const rows = deco === 'rocket' && tick % 2 ? DECOS.rocket.map(row => row.replace(/F/g, 'f')) : DECOS[deco]
    stampDeco(g, rows, x, ground - rows.length)
  }
}

// ---- 空の夢（1.7.0）：空飛ぶ船・ふたりの星 ---------------------------------
// 前からある空の飾り（Clawd 座・月・虹）は決まった場所に描くので、新しい空の夢は、行進の上の空からあいている場所を探して置く。
// - 地面の飾り・月・Clawd 座・虹・ほかの空の夢・リーダーと仲間（と、そのまわりの小物やハートの場所）とは、1 ドット以上あける
// - 庭の上にかぎらず、リーダーと庭のあいだの空にも置ける（広いデスクトップ）。セリフの空と贈り物の札（yard.right より右）には出さない
// - 太陽にはなるべくかけず、上の行ほど、贈った星（小さな点。空の夢はその手前に描く）が少ないほど、右ほどよい
// - 1 ドットあけられる場所が無ければ（狭い端末に高い飾りがいっぱいなど）、地面の飾りと同じく飾らない（高い夢から先に置く）

export type Box = { x: number; y: number; w: number; h: number }

// 2 つの箱が重なるドットの数
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
// まわりに 1 ドットのすき間をとった箱
const padded = (b: Box): Box => ({ x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 })
const boxOf = (rows: readonly string[], x: number, y: number): Box => ({ x, y, w: rows[0]?.length ?? 0, h: rows.length })
const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h

// 地面の飾りの箱（右から順。groundDecos と同じ並び）
function groundBoxes(yard: Yard, dreams: DreamId[], ground: number): Box[] {
  return groundDecos(yard, dreams).map(({ dream, x }) => {
    const rows = DECOS[groundDecoOf(dream)]
    return boxOf(rows, x, ground - rows.length)
  })
}

// 空の夢と、それを描く絵（この順に置く。入りきらないときに高いほうが残るよう、高い順）
const SKY_DECOS: [DreamId, 'airship' | 'twinStars'][] = [
  ['twinStars', 'twinStars'],
  ['airship', 'airship'],
]

// 太陽の絵が入る箱（昼の太陽は光をのばすぶん大きい）
export const sunBox = ({ kind, cx, cy, r, halo }: Sun): Box => {
  const reach = kind === 'noon' ? r + 2 : halo
  return { x: cx - reach, y: cy - reach, w: reach * 2 + 1, h: reach * 2 + 1 }
}

// 空の夢を置くのに見るもの。crowd はリーダーと仲間の場所（scene.ts が並びから作る）、stars は描いている贈った星の中心
export type SkyRoom = {
  yard: Yard
  dreams: DreamId[]
  sky: number
  ground: number
  sun: Sun | null
  crowd: Box[]
  stars: { x: number; y: number }[]
}

// 星の出る空の高さ（上に足した空のぶんは別。scene.ts の skyRows と同じ）
const SKY_ROWS = 6

// 空の夢の絵の箱
export const skyDecoBox = (dream: DreamId, x: number, y: number): Box => boxOf(DECOS[SKY_DECOS.find(([d]) => d === dream)![1]], x, y)

// 空の夢を置く場所
export function skyDreamSpots({ yard, dreams, sky, ground, sun, crowd, stars }: SkyRoom): { dream: DreamId; x: number; y: number }[] {
  const wanted = SKY_DECOS.filter(([one]) => dreams.includes(one))
  if (wanted.length === 0) return []
  const top = Math.max(0, sky - 3)
  // 1 ドットあけるもの。箱で持つもの（地面の飾り・月・Clawd 座・みんな・置いた空の夢）と、ドットで持つもの（虹）。
  // 空の夢を置ける範囲（x は 0〜yard.right、y は星の出る高さまで）の格子に、まわり 1 ドットぶん広げて印をつけ、
  // 累積和で「箱の中に印があるか」を 1 回で調べる（毎コマ描くので、候補ごとに全部の飾りと比べない）
  const W = yard.right + 1
  const H = SKY_ROWS + sky
  const blocked: number[][] = Array.from({ length: H }, () => Array<number>(W).fill(0))
  const mark = (b: Box) => {
    for (let y = Math.max(0, b.y - 1); y < Math.min(H, b.y + b.h + 1); y++)
      for (let x = Math.max(0, b.x - 1); x < Math.min(W, b.x + b.w + 1); x++) blocked[y]![x] = 1
  }
  for (const b of groundBoxes(yard, dreams, ground)) mark(b)
  for (const b of crowd) mark(b)
  if (dreams.includes('constellation')) mark({ x: Math.floor((yard.left + yard.right) / 2) - 6, y: top, w: 13, h: 9 })
  if (dreams.includes('moonTrip')) mark(boxOf(DECOS.moon, yard.right - 7, top))
  if (dreams.includes('noBugs')) for (const { x, y } of rainbowDots(yard, dreams, ground)) mark({ x, y, w: 1, h: 1 })
  const sunArea = sun ? padded(sunBox(sun)) : null

  const placed: { dream: DreamId; x: number; y: number }[] = []
  for (const [dream, deco] of wanted) {
    const rows = DECOS[deco]
    const w = rows[0]?.length ?? 0
    // 累積和：sum[y][x] は (0,0)〜(x-1,y-1) の印の数
    const sum = Array.from({ length: H + 1 }, () => Array<number>(W + 1).fill(0))
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sum[y + 1]![x + 1] = blocked[y]![x]! + sum[y]![x + 1]! + sum[y + 1]![x]! - sum[y]![x]!
    const isClear = ({ x, y, w: bw, h: bh }: Box) => sum[y + bh]![x + bw]! - sum[y]![x + bw]! - sum[y + bh]![x]! + sum[y]![x]! === 0
    let best: { x: number; y: number; score: number[] } | undefined
    // 上の行から、右から左へ。行進の上の空（星の出る高さ）に収まる行だけ
    for (let y = top; y + rows.length <= H; y++)
      for (let x = yard.right - w; x >= 0; x--) {
        const box = boxOf(rows, x, y)
        if (!isClear(box)) continue
        const score = [sunArea ? overlap(sunArea, box) : 0, y, stars.filter(p => inBox(padded(box), p.x, p.y)).length]
        if (!best || isLess(score, best.score)) best = { x, y, score }
      }
    if (!best) continue
    placed.push({ dream, x: best.x, y: best.y })
    mark(boxOf(rows, best.x, best.y))
  }
  return placed
}

// 数の並びを前から比べて小さいか（同じなら先に見つけたほう：上の行・右）
const isLess = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!
  return false
}

export function drawSkyDreams(g: Grid, room: SkyRoom, tick: number) {
  for (const { dream, x, y } of skyDreamSpots(room)) {
    const deco = SKY_DECOS.find(([d]) => d === dream)![1]
    // ふたりの星は、白い芯が左右かわりばんこにまたたく
    const rows = deco === 'twinStars' ? DECOS.twinStars.map(row => (tick % 8 < 4 ? row.replace('XXKXX', 'XXXXX') : row.replace('CCKCC', 'CCCCC'))) : DECOS[deco]
    stampDeco(g, rows, x, y)
  }
}

// バグのない世界：地面の飾りのいちばん右のもの（ふつうはおうち）の上にかかる、少し落ち着いた色の小さな虹。
// 虹は地面の飾りより先に（奥に）描く。いちばん右の飾りの真ん中に立て（おうちのときは前と同じ yard.right - 7）、
// 右のふちは前より右（贈り物の札のほう）に出さない。
// ほかの地面の飾りの箱（まわり 1 ドットも）には描かない。おうちが無い（#44 でしまえる）と、いちばん右には細い丘や銅像が来て、
// 虹の足がとなりの飾りのすき間から透けて、いくつもの飾りがひとかたまりに見えたので（#40）
const RAINBOW = [0xa8454f, 0xb07a3c, 0xb8a64a, 0x4f9a5c, 0x456fa8, 0x6f55a0]

// 虹のドット（色つき）。地面の飾りが無ければ、前と同じく yard.right - 7 に立てる
export function rainbowDots(yard: Yard, dreams: DreamId[], ground: number): { x: number; y: number; color: number }[] {
  const decos = groundBoxes(yard, dreams, ground)
  const first = decos[0]
  const cx = first ? Math.min(yard.right - 7, first.x + Math.floor(first.w / 2)) : yard.right - 7
  const others = decos.slice(1).map(padded)
  const outer = Math.min(10, ground - 2)
  const out: { x: number; y: number; color: number }[] = []
  RAINBOW.forEach((color, band) => {
    const r = outer - band
    if (r < 2) return
    for (let i = 0; i <= r * 4; i++) {
      const t = (Math.PI * i) / (r * 4)
      const x = cx + Math.round(r * Math.cos(t))
      const y = ground - Math.round(r * Math.sin(t))
      if (!others.some(b => inBox(b, x, y))) out.push({ x, y, color })
    }
  })
  return out
}

export function drawRainbow(g: Grid, yard: Yard, dreams: DreamId[], ground: number) {
  for (const { x, y, color } of rainbowDots(yard, dreams, ground)) dot(g, x, y, color)
}

// Clawd 座：Clawd の形に並んだ星を、うすい線でつなぐ
const CONSTELLATION: [number, number][] = [
  [0, 3],
  [3, 1],
  [9, 1],
  [12, 3],
  [9, 6],
  [3, 6],
  [4, 8],
  [8, 8],
]
const CONSTELLATION_LINES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
  [5, 6],
  [4, 7],
]

export function drawConstellation(g: Grid, yard: Yard, sky: number, tick: number, palette: Palette) {
  const ox = Math.floor((yard.left + yard.right) / 2) - 6
  const oy = Math.max(0, sky - 3)
  for (const [a, b] of CONSTELLATION_LINES) {
    const [x0, y0] = CONSTELLATION[a]!
    const [x1, y1] = CONSTELLATION[b]!
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 1; i < n; i++) {
      dot(g, ox + Math.round(x0 + ((x1 - x0) * i) / n), oy + Math.round(y0 + ((y1 - y0) * i) / n), 0x3d4270)
    }
  }
  CONSTELLATION.forEach(([x, y], i) => dot(g, ox + x, oy + y, (tick + i) % 5 === 0 ? C.white : palette.star))
}

// ---- 贈った星 ------------------------------------------------------------
// 星をひとつ贈るごとに、空に明るい星（白い芯と、うすい桃色の十字の光）をひとつ足す。ふつうの大きな星（金色の十字）と
// 色で見分けられ、昼の空でも見える色にする。飾りが多すぎないよう、1 つずつ描くのは GIFTED_STARS 個まで。
// そこから先は星を足さず、天の川を少しずつ濃くする
export const GIFTED_STARS = 12
const GIFTED_CORE = C.white
const GIFTED_ARM = 0xffb3d9
const GIFTED_TWINKLE = 0xffe6f2
const MILKY_WAY = [0x3f4472, 0x565b8f, 0x7a7fb3]
// 天の川の濃さ：はじめの濃さ、星 10 個ごとに足す濃さ、いちばん濃いとき
const MILKY_START = 0.12
const MILKY_STEP = 0.02
const MILKY_MAX = 0.4

// x がこの列の範囲にある場所には置かない（リーダーの頭の上）
export type Span = { from: number; to: number }

// 贈った星の中心を、贈った順に GIFTED_STARS 個ぶん。width は行進に使う幅（セリフの空には出さない）、skyRows は空の高さ、
// avoid はリーダーの頭の上の列。星ごとに決まった乱数で場所を選び、空の上のほうに寄せる。
// 前の星とは十字の光のあいだに 1 ドットすき間をあけ（縦か横に 4 ドット以上はなす）、リーダーの頭の上も避ける。
// 選べなければ条件をゆるめて（十字が重ならないだけ → どこでも）選び直す。星を足しても前の星は動かない。
// 十字の光まで空に収まるよう、ふちから 1 ドット内側に置く
export function giftedStarSpots(width: number, skyRows: number, avoid: Span | null = null): { x: number; y: number }[] {
  const key = `${width}x${skyRows}:${avoid ? `${avoid.from}-${avoid.to}` : ''}`
  const known = spotCache.get(key)
  if (known) return known
  const spots: { x: number; y: number }[] = []
  const apart = (spot: { x: number; y: number }, gap: number) => spots.every(s => Math.abs(s.x - spot.x) >= gap || Math.abs(s.y - spot.y) >= gap)
  const isClear = (spot: { x: number; y: number }) => !avoid || spot.x + 1 < avoid.from || spot.x - 1 > avoid.to
  const rules = [(spot: { x: number; y: number }) => isClear(spot) && apart(spot, 4), (spot: { x: number; y: number }) => isClear(spot) && apart(spot, 3)]
  for (let k = 0; k < GIFTED_STARS; k++) {
    const candidates = Array.from({ length: SPOT_TRIES }, (_, attempt) => {
      const n = (k * SPOT_TRIES + attempt) * 2
      // 3 乗して上の行に寄せる
      const up = hash(50_001 + n) ** 3
      return { x: 1 + Math.floor(hash(50_000 + n) * Math.max(1, width - 2)), y: 1 + Math.floor(up * Math.max(1, skyRows - 2)) }
    })
    let spot = candidates.at(-1)!
    for (const rule of rules) {
      const found = candidates.find(rule)
      if (found) {
        spot = found
        break
      }
    }
    spots.push(spot)
  }
  spotCache.set(key, spots)
  return spots
}
const SPOT_TRIES = 40
// 幅ごとに 1 回だけ選ぶ（毎コマ同じ場所なので）
const spotCache = new Map<string, { x: number; y: number }[]>()

// 贈った星を描く。isHidden の場所（太陽の上など）には出さない。twinkle は何コマ目か（星ごとにずらして、ときどき光が白くまたたく）
export function drawGiftedStars(
  g: Grid,
  count: number,
  width: number,
  skyRows: number,
  twinkle: number,
  avoid: Span | null,
  isHidden: (x: number, y: number) => boolean,
) {
  giftedStarSpots(width, skyRows, avoid).slice(0, count).forEach(({ x, y }, k) => {
    if (isHidden(x, y)) return
    const arm = (twinkle + k * 3) % 9 === 0 ? GIFTED_TWINKLE : GIFTED_ARM
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) dot(g, x + dx, y + dy, arm)
    dot(g, x, y, GIFTED_CORE)
  })
}

// 天の川の濃さ（0 は描かない）。GIFTED_STARS 個を超えたぶん、10 個ごとに少しずつ濃くなり、MILKY_MAX で止まる
export const milkyWayDensity = (count: number) =>
  count <= GIFTED_STARS ? 0 : Math.min(MILKY_MAX, MILKY_START + MILKY_STEP * Math.floor((count - GIFTED_STARS) / 10))

// 天の川：行進の上の空を、左下から右上へ横切るうすい光の帯。点は決まった場所に出て、動かない
export function drawMilkyWay(g: Grid, count: number, width: number, skyRows: number) {
  const density = milkyWayDensity(count)
  if (density === 0) return
  for (let x = 0; x < width; x++) {
    const center = (skyRows - 1) * (0.85 - (0.7 * x) / Math.max(1, width - 1))
    for (let y = 0; y < skyRows; y++) {
      const off = Math.abs(y - center)
      if (off > 2) continue
      // 帯のまんなかほど濃く、ふちはうすく
      const n = x * 64 + y
      if (hash(n + 7919) >= density * (1 - off / 3)) continue
      dot(g, x, y, MILKY_WAY[Math.floor(hash(n + 104_729) * MILKY_WAY.length)]!)
    }
  }
}

// ---- なでなでのハートと、Client 用の文字への変換 --------------------------

export function putHeart(g: Grid, x: number, y: number, isBig: boolean) {
  put(g, isBig ? 'heart' : 'small', x, y, isBig ? C.heart : C.cheek)
}

// ---- ワンぽちの贈り物の札（広いデスクトップ） ------------------------------
// 帯に出した贈り物は、行進とセリフの空のあいだにこの幅（ドット）の列を空けて、札にして描く。
// 手ざわり層はこの列を押したら贈る（縦の位置は見ない）
export const QUICK_GIFT_DOTS = 13
const BADGE_W = 11
const BADGE_H = 9
const BADGE_FILL = 0x2a2540
const BADGE_OFF = 0x6b6f85

// 札の列。frame.paradeColumns から QUICK_GIFT_DOTS を引いた行進の幅の、すぐ右
export const quickGiftSpot = (paradeColumns: number) => ({ x: paradeColumns, w: QUICK_GIFT_DOTS })

// 札を空の上のほうに描き、下に小さな ♡ を添える。♡ が足りないときは、ふちを灰色に、贈り物を札の色に沈ませる
export function putQuickGift(g: Grid, x: number, gift: TreatId, canAfford: boolean) {
  const left = x + Math.floor((QUICK_GIFT_DOTS - BADGE_W) / 2)
  const top = 1
  const edge = canAfford ? C.heart : BADGE_OFF
  for (let dy = 0; dy < BADGE_H; dy++)
    for (let dx = 0; dx < BADGE_W; dx++) {
      const isRim = dx === 0 || dy === 0 || dx === BADGE_W - 1 || dy === BADGE_H - 1
      const isCorner = (dx === 0 || dx === BADGE_W - 1) && (dy === 0 || dy === BADGE_H - 1)
      if (!isCorner) dot(g, left + dx, top + dy, isRim ? edge : BADGE_FILL)
    }
  const icon = GIFT_ICONS[gift]
  const w = icon[0]?.length ?? 0
  const ix = left + Math.floor((BADGE_W - w) / 2)
  const iy = top + Math.floor((BADGE_H - icon.length) / 2)
  stampIcon(g, icon, ix, iy)
  if (canAfford) {
    put(g, 'small', left + Math.floor(BADGE_W / 2) - 1, top + BADGE_H + 1, C.heart)
    return
  }
  for (let dy = 0; dy < icon.length; dy++)
    for (let dx = 0; dx < w; dx++) {
      const c = g[iy + dy]?.[ix + dx]
      if (c !== null && c !== undefined && c !== BADGE_FILL) dot(g, ix + dx, iy + dy, mix(c, BADGE_FILL, 0.6))
    }
}
