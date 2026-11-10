// 場面の飾り。ぼうし・贈り物のアイコン・夢のプレゼント（庭の飾り・虹・Clawd 座）、
// 空のもの（太陽・流れ星・オーロラ・ハートの雨・フィーバーのふちどり）、なでなでのハート、ワンぽちの贈り物の札をまとめる。

import type { DreamId, Hat, Look, TreatId } from '../types'
import { C, mix } from './palette'
import type { Palette } from './palette'
import { dot, put, stampWith } from './grid'
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

type Sun = { kind: 'rise' | 'noon' | 'set'; cx: number; cy: number; r: number; halo: number }

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
}

// 地面の飾りを庭の右から順に置く。入りきらないものは左から順にあきらめる
const GROUND_DECOS: [DreamId, keyof typeof DECOS][] = [
  ['house', 'house'],
  ['library', 'library'],
  ['moonTrip', 'rocket'],
  ['telescope', 'telescope'],
  ['greenTests', 'flag'],
]

// 地面の飾りの並び。yard.right に右寄せで並べ、入りきらなければ入るまで yard.far のほうへずらす。
// right は並びの右端（虹をかける場所）。far まで使っても入らないぶんは飾らない
export function groundDecos(yard: Yard, dreams: DreamId[]): { right: number; placed: { dream: DreamId; x: number }[] } {
  const owned = GROUND_DECOS.filter(([dream]) => dreams.includes(dream))
  const widthOf = (deco: keyof typeof DECOS) => DECOS[deco][0]?.length ?? 0
  const need = owned.reduce((sum, [, deco]) => sum + widthOf(deco) + 1, -1)
  const right = Math.min(yard.far, Math.max(yard.right, yard.left + need))
  const placed: { dream: DreamId; x: number }[] = []
  let x = right
  for (const [dream, deco] of owned) {
    x -= widthOf(deco)
    if (x < yard.left) break
    placed.push({ dream, x })
    x -= 1
  }
  return { right, placed }
}

export function drawYard(g: Grid, dreams: DreamId[], yard: Yard, ground: number, tick: number) {
  for (const { dream, x } of groundDecos(yard, dreams).placed) {
    const deco = GROUND_DECOS.find(([d]) => d === dream)![1]
    const rows = deco === 'rocket' && tick % 2 ? DECOS.rocket.map(row => row.replace(/F/g, 'f')) : DECOS[deco]
    stampDeco(g, rows, x, ground - rows.length)
  }
}

// バグのない世界：地面の飾りの右（おうちの上）にかかる、少し落ち着いた色の小さな虹
export function drawRainbow(g: Grid, right: number, ground: number) {
  const colors = [0xa8454f, 0xb07a3c, 0xb8a64a, 0x4f9a5c, 0x456fa8, 0x6f55a0]
  const cx = right - 7
  const outer = Math.min(10, ground - 2)
  colors.forEach((color, band) => {
    const r = outer - band
    if (r < 2) return
    for (let i = 0; i <= r * 4; i++) {
      const t = (Math.PI * i) / (r * 4)
      dot(g, cx + Math.round(r * Math.cos(t)), ground - Math.round(r * Math.sin(t)), color)
    }
  })
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
