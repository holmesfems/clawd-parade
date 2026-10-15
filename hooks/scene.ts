// パレードのドット絵。1 ピクセルを半角ブロックの上下半分で描くので、
// 縦 14 px が端末 7 行になる。ここは $ に触らない純粋な関数だけを置く。

import type { Character, Friend, Hat, Look, MoodKind } from '../types'

export const SCENE_ROWS = 7
const H = SCENE_ROWS * 2

type Px = number | null
type Grid = Px[][]

const C = {
  body: 0xd97757,
  line: 0x5c2a1c,
  ear: 0xf2a7a0,
  cheek: 0xff8f8f,
  eye: 0x2b1b17,
  white: 0xffffff,
  ground: 0x5a5a5a,
  grass: 0x6fbf6f,
  flower: 0xffb3d1,
  star: 0xffe38a,
  starDim: 0x8a86c9,
  heart: 0xff6b9a,
  spark: 0xffe066,
  bang: 0xff7a59,
  ask: 0xffd166,
  zzz: 0x9ec9ff,
  tear: 0x6ec6ff,
  nope: 0xff5c5c,
  feverGlow: 0xffb347,
}

// 仲間の毛色。サブエージェントの種類ごとに決まる
const COATS: Record<string, number> = {
  Explore: 0x7eb6ff,
  Plan: 0xb99cff,
  'general-purpose': 0x8fd694,
  fork: C.body,
}
const SPARE_COATS = [0xffd166, 0xff9ec7, 0x6fd6cf, 0xc8a2ff, 0xffa96b]

export function coatOf(type: string): number {
  const known = COATS[type]
  if (known !== undefined) return known
  let hash = 0
  for (const ch of type) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return SPARE_COATS[hash % SPARE_COATS.length] ?? 0xffd166
}

const darken = (rgb: number, k: number) =>
  (Math.round(((rgb >> 16) & 255) * k) << 16) |
  (Math.round(((rgb >> 8) & 255) * k) << 8) |
  Math.round((rgb & 255) * k)

export const hex = (rgb: number) => '#' + rgb.toString(16).padStart(6, '0')

// ---- スプライト -------------------------------------------------------
// シルエットだけ描いて、輪郭線は outline() が自動で 1px 足す。
// o: 毛 / p: 耳の内側

const LEADER = [
  'o..........o',
  'oo........oo',
  'opo......opo',
  'oppooooooppo',
  'oooooooooooo',
  'oooooooooooo',
  'oooooooooooo',
  'oooooooooooo',
]
const LEADER_FEET = ['.oo......oo.', '..oo....oo..']

const KITTEN = [
  'o......o',
  'op....po',
  'oooooooo',
  'oooooooo',
  'oooooooo',
]
const KITTEN_FEET = ['.o....o.', '..o..o..']

type Sprite = { w: number; h: number; px: Grid }

function sprite(rows: string[], coat: number): Sprite {
  const w = (rows[0]?.length ?? 0) + 2
  const h = rows.length + 2
  const px: Grid = Array.from({ length: h }, () => Array<Px>(w).fill(null))
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'o') px[y + 1]![x + 1] = coat
      if (ch === 'p') px[y + 1]![x + 1] = C.ear
    }),
  )
  const line = coat === C.body ? C.line : darken(coat, 0.38)
  const filled = (x: number, y: number) =>
    px[y]?.[x] !== null && px[y]?.[x] !== undefined && px[y]![x] !== line
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[y]![x] === null && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)))
        px[y]![x] = line
  return { w, h, px }
}

// 顔のパーツ。座標はシルエット基準（輪郭ぶん +1 して置く）
type Stamp = string[]
const PAL: Record<string, number> = { k: C.eye, w: C.white, c: C.cheek, b: C.tear }

function stamp(s: Sprite, at: [number, number], rows: Stamp, pad = 1) {
  rows.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      const color = PAL[ch]
      const line = s.px[at[1] + dy + pad]
      if (color !== undefined && line && at[0] + dx + pad < s.w) line[at[0] + dx + pad] = color
    }),
  )
}

type Eyes = 'open' | 'blink' | 'happy' | 'wide' | 'sad' | 'x'
type Mouth = 'smile' | 'open' | 'flat' | 'frown' | 'tiny'

const EYES: Record<Eyes, [Stamp, Stamp]> = {
  open: [['wk.', 'kk.'], ['.wk', '.kk']],
  blink: [['...', 'kkk'], ['...', 'kkk']],
  happy: [['.k.', 'k.k'], ['.k.', 'k.k']],
  wide: [['ww.', 'wk.'], ['.ww', '.wk']],
  sad: [['k..', '.kk'], ['..k', 'kk.']],
  x: [['k.k', '.k.'], ['k.k', '.k.']],
}
const MOUTHS: Record<Mouth, Stamp> = {
  smile: ['k..k', '.kk.'],
  open: ['.kk.', '.kk.'],
  flat: ['....', '.kk.'],
  frown: ['.kk.', 'k..k'],
  tiny: ['....', '.k..'],
}

function leader(eyes: Eyes, mouth: Mouth, step: number, tears: number | null): Sprite {
  const s = sprite([...LEADER, LEADER_FEET[step % 2]!], C.body)
  stamp(s, [2, 4], EYES[eyes][0])
  stamp(s, [7, 4], EYES[eyes][1])
  stamp(s, [4, 6], MOUTHS[mouth])
  stamp(s, [1, 6], ['c'])
  stamp(s, [10, 6], ['c'])
  if (tears !== null) {
    stamp(s, [2, 6 + (tears % 2)], ['b'])
    stamp(s, [9, 6 + ((tears + 1) % 2)], ['b'])
  }
  return s
}

function kitten(coat: number, step: number, isDone: boolean): Sprite {
  const s = sprite([...KITTEN, KITTEN_FEET[step % 2]!], coat)
  if (isDone) {
    stamp(s, [1, 3], ['kk...kk'])
  } else {
    stamp(s, [2, 2], ['k..k', 'k..k'])
  }
  stamp(s, [1, 4], ['c....c'])
  return s
}

// ---- Clawd ------------------------------------------------------------
// Claude Code のマスコット。輪郭線なしのベタ塗りで、口はふだん描かない。

const CLAWD = [
  '..oooooooooooooo..',
  '..oooooooooooooo..',
  '..oooooooooooooo..',
  'oooooooooooooooooo',
  'oooooooooooooooooo',
  '..oooooooooooooo..',
  '..oooooooooooooo..',
  '..oooooooooooooo..',
]
// 足の付け根の並びと、歩きのコマ（step 1・2）で上げる足
const CLAWD_LEG = '...o.o......o.o...'
const CLAWD_LIFT: Side[] = [null, 'left', 'right']

const MINI = ['.ooooooooo.', '.ooooooooo.', 'ooooooooooo', '.ooooooooo.', '.ooooooooo.']
const MINI_LEG = '..o.o.o.o..'
const MINI_LIFT: Side[] = [null, 'right', 'left']

type Side = 'left' | 'right' | null

// 体ごと持ち上げると、上げた足の先と、浮いた体についた着地中の足の先が
// 同じ高さに来て止まって見える。なので着地中の足は体が浮いたぶん（reach）だけ
// 伸ばして地面に着けたままにし、上げた足だけ 1px 短くする
function walkLegs(row: string, length: number, lifted: Side): string[] {
  const mid = row.length / 2
  const isLifted = (x: number) => (lifted === 'left' ? x < mid : lifted === 'right' && x >= mid)
  return Array.from({ length }, (_, r) =>
    [...row].map((ch, x) => (ch === 'o' && !(r === length - 1 && isLifted(x)) ? 'o' : '.')).join(''),
  )
}

function flat(rows: string[], coat: number): Sprite {
  const px: Grid = rows.map(row => [...row].map(ch => (ch === 'o' ? coat : null)))
  return { w: rows[0]?.length ?? 0, h: rows.length, px }
}

const CLAWD_EYES: Record<Eyes, [Stamp, Stamp]> = {
  open: [['.kk.', '.kk.', '.kk.'], ['.kk.', '.kk.', '.kk.']],
  blink: [['....', '....', 'kkkk'], ['....', '....', 'kkkk']],
  happy: [['....', '.kk.', 'k..k'], ['....', '.kk.', 'k..k']],
  wide: [['kkkk', 'kwkk', 'kkkk'], ['kkkk', 'kwkk', 'kkkk']],
  sad: [['....', '..kk', 'kk..'], ['....', 'kk..', '..kk']],
  x: [['k..k', '.kk.', 'k..k'], ['k..k', '.kk.', 'k..k']],
}
const CLAWD_MOUTHS: Partial<Record<MoodKind, Stamp>> = {
  done: ['k..k', '.kk.'],
  plan: ['k..k', '.kk.'],
  permission: ['.kk.', '.kk.'],
  error: ['.kk.', 'k..k'],
}
const BLUSHING: MoodKind[] = ['done', 'plan', 'permission', 'waiting']

function clawd(mood: MoodKind, eyes: Eyes, step: number, tick: number, reach = 0): Sprite {
  const s = flat([...CLAWD, ...walkLegs(CLAWD_LEG, 3 + reach, CLAWD_LIFT[step] ?? null)], C.body)
  stamp(s, [4, 1], CLAWD_EYES[eyes][0], 0)
  stamp(s, [10, 1], CLAWD_EYES[eyes][1], 0)
  const mouth = CLAWD_MOUTHS[mood]
  if (mouth) stamp(s, [7, 5], mouth, 0)
  if (BLUSHING.includes(mood)) {
    stamp(s, [3, 4], ['cc'], 0)
    stamp(s, [13, 4], ['cc'], 0)
  }
  if (mood === 'error') {
    stamp(s, [5, 4 + (tick % 2)], ['b'], 0)
    stamp(s, [12, 4 + ((tick + 1) % 2)], ['b'], 0)
  }
  return s
}

function miniClawd(coat: number, step: number, isDone: boolean, reach = 0): Sprite {
  const s = flat([...MINI, ...walkLegs(MINI_LEG, 2 + reach, MINI_LIFT[step] ?? null)], coat)
  if (isDone) {
    stamp(s, [2, 1], ['.k.', 'k.k'], 0)
    stamp(s, [6, 1], ['.k.', 'k.k'], 0)
  } else {
    stamp(s, [3, 1], ['k', 'k'], 0)
    stamp(s, [7, 1], ['k', 'k'], 0)
  }
  return s
}

// ---- 小物 -------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  '?': ['###', '..#', '.##', '...', '.#.'],
  '!': ['#', '#', '#', '.', '#'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  z: ['##', '.#', '#.', '##'],
  heart: ['.#.#.', '#####', '.###.', '..#..'],
  spark: ['.#.', '###', '.#.'],
  tiny: ['#'],
  x: ['#.#', '.#.', '#.#'],
  drop: ['.#', '##'],
  small: ['#.#', '###', '.#.'],
}

function put(g: Grid, glyph: string, x: number, y: number, color: number) {
  GLYPHS[glyph]?.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      const line = g[y + dy]
      if (ch === '#' && line && x + dx >= 0 && x + dx < line.length) line[x + dx] = color
    }),
  )
}

function blit(g: Grid, s: Sprite, x: number, y: number) {
  s.px.forEach((row, dy) =>
    row.forEach((c, dx) => {
      const line = g[y + dy]
      if (c !== null && line && x + dx >= 0 && x + dx < line.length) line[x + dx] = c
    }),
  )
}

// ---- 場面 -------------------------------------------------------------

export type SceneInput = {
  columns: number
  // 行進に使う左側のドット数（右側はセリフを重ねる空）。無ければ columns 全部
  paradeColumns?: number
  // 星のまたたきを何コマで 1 歩進めるか。大きく描くデスクトップでは遅くする
  twinkleTicks?: number
  // 地面の並びはそのままで上に足す空のドット数（ぼうしや流れ星の場所）
  headroom?: number
  // ぼうし・流れ星・オーロラ・フィーバー
  look?: Look
  mood: MoodKind
  tick: number
  friends: Friend[]
  character: Character
  // なでなで中：リーダーが手のほうへ傾く量（-2〜2）
  petted?: { sway: number } | null
  // クリックされて跳ねている仲間の id
  hopping?: string[]
}

export type Layout = {
  leader: { x: number; w: number }
  friends: { id: string; x: number; w: number }[]
}

// 誰がどの列にいるか。描画と当たり判定で同じものを使う
export function layout(columns: number, friends: Friend[], character: Character): Layout {
  const isClawd = character === 'clawd'
  const friendW = isClawd ? 11 : 10
  const leaderW = isClawd ? 18 : 14
  const W = Math.max(20, columns)
  const room = Math.max(0, Math.floor((W - leaderW - 2 - 22) / (friendW + GAP)))
  const shown = friends.slice(-room)
  return {
    leader: { x: 2 + shown.length * (friendW + GAP), w: leaderW },
    friends: shown.map((f, i) => ({ id: f.id, x: 2 + i * (friendW + GAP), w: friendW })),
  }
}

const GAP = 1

const WORKING: MoodKind[] = ['working', 'permission', 'question', 'plan']

export function isMarching(mood: MoodKind, friends: Friend[]) {
  return WORKING.includes(mood) || friends.some(f => f.doneAt === null)
}

function face(mood: MoodKind, tick: number): { eyes: Eyes; mouth: Mouth } {
  const blink = tick % 17 === 0
  switch (mood) {
    case 'working':
      return { eyes: blink ? 'blink' : 'open', mouth: 'smile' }
    case 'permission':
      return { eyes: 'wide', mouth: 'open' }
    case 'question':
      return { eyes: blink ? 'blink' : 'open', mouth: 'flat' }
    case 'plan':
      return { eyes: 'happy', mouth: 'open' }
    case 'done':
      return { eyes: 'happy', mouth: 'smile' }
    case 'waiting':
      return { eyes: blink ? 'blink' : 'open', mouth: 'smile' }
    case 'aborted':
      return { eyes: 'blink', mouth: 'flat' }
    case 'error':
      return { eyes: 'sad', mouth: 'frown' }
    case 'refusal':
      return { eyes: 'x', mouth: 'flat' }
    case 'sleeping':
      return { eyes: 'blink', mouth: 'tiny' }
    case 'idle':
      return { eyes: blink ? 'blink' : 'open', mouth: 'smile' }
  }
}

const PLAIN: Look = { hat: null, shootingStars: false, aurora: false, fever: false }

export function drawScene({
  columns,
  paradeColumns = columns,
  twinkleTicks = 1,
  headroom = 0,
  look = PLAIN,
  mood,
  tick,
  friends,
  character,
  petted = null,
  hopping = [],
}: SceneInput): Grid {
  const isClawd = character === 'clawd'
  const W = Math.max(20, columns)
  // headroom はぼうしや流れ星のための上の空。地面からの並びは変えず、上に足すだけ
  const sky = headroom
  const ground = H + sky - 1
  const g: Grid = Array.from({ length: H + sky }, () => Array<Px>(W).fill(null))
  const marching = isMarching(mood, friends)
  const scroll = marching ? tick : 0

  if (look.aurora) drawAurora(g, tick)

  // 空の星（地面の半分の速さで流れる）。空が高いぶんだけ数も増やす。
  // 行の歩幅は空の行数と素にしないと、星が数行に固まって横一列に並ぶ
  const skyRows = 6 + sky
  const rowStep = [5, 3, 7, 11].find(n => gcd(n, skyRows) === 1) ?? 1
  for (let i = 0; i < Math.ceil((W / 14) * (skyRows / 6)); i++) {
    const x = (((i * 37 + 11) % W) - Math.floor(scroll / 2) + W * 8) % W
    const y = (i * rowStep + 1) % skyRows
    const twinkle = (Math.floor(tick / twinkleTicks) + i * 3) % 7 === 0
    put(g, twinkle ? 'spark' : 'tiny', x - (twinkle ? 1 : 0), y, twinkle ? C.star : C.starDim)
  }
  if (look.shootingStars) drawShootingStar(g, tick)
  if (look.fever) drawHeartRain(g, tick)

  // 地面と草花（左へ流れる）
  for (let x = 0; x < W; x++) {
    const at = x + scroll
    if (at % 6 < 3) g[ground]![x] = C.ground
    if (at % 29 === 0) {
      g[ground - 1]![x] = C.grass
      g[ground]![x] = C.grass
    }
    if (at % 47 === 13) {
      g[ground - 2]![x] = C.flower
      g[ground - 1]![x] = C.grass
    }
  }

  // 並び：いちばん新しい仲間がリーダーのすぐ後ろ
  const spots = layout(Math.min(W, paradeColumns), friends, character)
  const byId = new Map(friends.map(f => [f.id, f]))

  spots.friends.forEach(({ id, x }, i) => {
    const f = byId.get(id)!
    const isDone = f.doneAt !== null
    const isHopping = hopping.includes(id)
    const phase = tick + i
    const hop = isDone || isHopping ? [0, 2, 3, 2][tick % 4]! : phase % 2
    // 歩くミニ Clawd は足を伸ばして上下するので、体ごとは持ち上げない（跳ねるときは持ち上げる）
    const reach = isClawd && marching && !isDone && !isHopping ? hop : 0
    const s = isClawd
      ? miniClawd(coatOf(f.type), marching && !isDone ? 1 + (phase % 2) : 0, isDone || isHopping, reach)
      : kitten(coatOf(f.type), marching && !isDone ? phase : 0, isDone || isHopping)
    const y = ground - s.h - (hop - reach)
    blit(g, s, x, y)
    if (isDone || isHopping) put(g, 'heart', x + 2, Math.max(0, y - 4), C.heart)
  })

  // なでなで中は何をしていても、とろけた顔で手のほうへ傾く
  const feel: MoodKind = petted ? 'done' : mood
  const { eyes, mouth } = petted ? { eyes: 'happy' as const, mouth: 'smile' as const } : face(mood, tick)
  const bob =
    petted ? 0 :
    mood === 'sleeping' ? (Math.floor(tick / 3) % 2) :
    mood === 'done' ? [0, 1, 2, 1, 0, 0, 0, 0][tick % 8]! :
    marching ? tick % 2 : 0
  const step = marching && !petted ? 1 + (tick % 2) : 0
  // 歩く Clawd は足を伸ばして上下する。跳ねる・寝息のときは体ごと持ち上げる
  const reach = isClawd && step && mood !== 'done' ? bob : 0
  const s = isClawd
    ? clawd(feel, eyes, step, tick, reach)
    : leader(eyes, mouth, step ? tick : 0, feel === 'error' ? tick : null)
  const leaderX = spots.leader.x + (petted ? Math.max(-2, Math.min(2, petted.sway)) : 0)
  const top = ground - s.h - (bob - reach)
  if (look.fever) glow(g, s, leaderX, top, tick % 2 ? C.spark : C.feverGlow)
  blit(g, s, leaderX, top)
  if (look.hat) drawHat(g, look.hat, isClawd, leaderX, top)
  if (petted) return g

  // 気持ちを表す小物はリーダーの右上（上に足した空のぶんだけ下げる）
  const fx = leaderX + s.w + 1
  switch (mood) {
    case 'working':
      for (let d = 0; d < tick % 4; d++) put(g, 'tiny', fx + d * 2, top + 4, C.white)
      break
    case 'permission':
      if (tick % 4 < 3) put(g, '!', fx + 1, sky + 1 + (tick % 2), C.bang)
      if (tick % 4 < 3) put(g, '!', fx + 3, sky + 1 + ((tick + 1) % 2), C.bang)
      break
    case 'question':
    case 'waiting':
      put(g, '?', fx, sky + 1 + (Math.floor(tick / 2) % 2), C.ask)
      break
    case 'plan':
      put(g, 'spark', fx, sky + 1 + (tick % 3), C.spark)
      put(g, 'spark', fx + 4, sky + 4 - (tick % 3), C.spark)
      break
    case 'done':
      put(g, 'heart', fx, sky + Math.max(0, 6 - (tick % 7)), C.heart)
      if (tick % 3 === 0) put(g, 'spark', fx + 6, sky + 2, C.spark)
      if (tick % 3 === 1) put(g, 'spark', leaderX - 4, sky + 3, C.spark)
      break
    case 'aborted':
      put(g, 'drop', leaderX + s.w - 2, top + 1 + (tick % 2), C.tear)
      break
    case 'refusal':
      put(g, 'x', fx, sky + 2, C.nope)
      break
    case 'sleeping': {
      const k = tick % 6
      put(g, 'z', fx, sky + 8 - k, C.zzz)
      if (k >= 3) put(g, 'Z', fx + 4, sky + 6 - k, C.zzz)
      break
    }
    case 'idle':
      if (tick % 9 < 2) put(g, 'spark', fx, sky + 2, C.spark)
      break
    case 'error':
      if (isClawd) put(g, 'drop', fx, sky + 2 + (tick % 3), C.tear)
      break
  }

  return g
}

// ---- きせかえ・夜空の飾り・フィーバー ----------------------------------------

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

function dot(g: Grid, x: number, y: number, color: number) {
  const line = g[y]
  if (line && x >= 0 && x < line.length) line[x] = color
}

// ぼうしのドット。o は毛の色、e は耳の内側
const HAT_PAL: Record<string, number> = {
  p: C.heart,
  k: 0xc2416b,
  r: 0xe0464b,
  w: C.white,
  g: 0xffd166,
  j: 0x6ec6ff,
  o: C.body,
  e: C.ear,
}
// sink は頭に何行めりこませるか。ears は左右に 1 つずつ（右は左右反転）
const HATS: Record<Hat, { rows: string[]; sink: number; at: 'center' | 'right' | 'ears' }> = {
  ribbon: { rows: ['pp.pp', 'ppkpp', 'pp.pp'], sink: 2, at: 'right' },
  catEars: { rows: ['o..', 'oo.', 'oeo'], sink: 0, at: 'ears' },
  santa: { rows: ['...rr..w', '..rrrrr.', '.rrrrrr.', 'wwwwwwww'], sink: 1, at: 'center' },
  crown: { rows: ['g..g..g', 'ggggggg', 'gjgrgjg'], sink: 0, at: 'center' },
}

function stampRows(g: Grid, rows: string[], x: number, y: number, isFlipped = false) {
  rows.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      const color = HAT_PAL[ch]
      if (color !== undefined) dot(g, isFlipped ? x + row.length - 1 - dx : x + dx, y + dy, color)
    }),
  )
}

function drawHat(g: Grid, hat: Hat, isClawd: boolean, leaderX: number, top: number) {
  // ねこはもとからねこみみ
  if (hat === 'catEars' && !isClawd) return
  const spec = HATS[hat]
  // 頭のてっぺんの行と、その左右の端（Clawd は平らな頭、ねこは耳のあいだ）
  const headTop = isClawd ? top : top + 3
  const [left, right] = isClawd ? [leaderX + 2, leaderX + 15] : [leaderX + 4, leaderX + 9]
  const w = spec.rows[0]?.length ?? 0
  const y = headTop - spec.rows.length + spec.sink
  if (spec.at === 'ears') {
    stampRows(g, spec.rows, left + 1, y)
    stampRows(g, spec.rows, right - w, y, true)
  } else if (spec.at === 'right') {
    stampRows(g, spec.rows, right - w + 2, y)
  } else {
    stampRows(g, spec.rows, Math.floor((left + right + 1 - w) / 2), y)
  }
}

function drawAurora(g: Grid, tick: number) {
  const W = g[0]?.length ?? 0
  const colors = [0x1f6b55, 0x2c4f8f, 0x55408a]
  for (let x = 0; x < W; x++) {
    const y = 1 + Math.round(Math.sin(x / 7 + tick / 5) * 1.2 + Math.sin(x / 17 - tick / 9))
    const color = colors[Math.floor((x + tick) / 14) % colors.length]!
    dot(g, x, y, color)
    dot(g, x, y + 1, color)
  }
}

function drawShootingStar(g: Grid, tick: number) {
  const W = g[0]?.length ?? 0
  const period = 40
  const phase = tick % period
  if (phase >= 9) return
  const n = Math.floor(tick / period)
  const hx = W - 6 - ((n * 53) % Math.max(1, Math.floor(W * 0.6))) - phase * 3
  const trail = [C.white, C.star, C.star, C.star, C.starDim, C.starDim, C.starDim]
  trail.forEach((color, j) => dot(g, hx + j, phase - Math.floor(j / 3), color))
}

function drawHeartRain(g: Grid, tick: number) {
  const W = g[0]?.length ?? 0
  const fall = g.length + 6
  for (let j = 0; j < Math.ceil(W / 16); j++) {
    const x = (j * 37 + 5) % W
    const y = ((tick + j * 7) % fall) - 5
    putHeart(g, x, y, j % 2 === 0)
  }
}

// フィーバー中のリーダーは金色にふちどる
function glow(g: Grid, s: Sprite, x: number, y: number, color: number) {
  const filled = (sx: number, sy: number) => s.px[sy]?.[sx] !== null && s.px[sy]?.[sx] !== undefined
  for (let sy = -1; sy <= s.h; sy++)
    for (let sx = -1; sx <= s.w; sx++) {
      if (filled(sx, sy)) continue
      if ([-1, 0, 1].some(dy => [-1, 0, 1].some(dx => filled(sx + dx, sy + dy)))) dot(g, x + sx, y + sy, color)
    }
}

// ---- 端末セルへの変換 ----------------------------------------------------

const UPPER = 0x2580
const LOWER = 0x2584
const DEFAULT = 0x01000000

export function encodeCells(g: Grid): { columns: number; rows: number; cells: string } {
  const columns = g[0]?.length ?? 0
  const rows = Math.floor(g.length / 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < columns; x++) {
      const top = g[r * 2]![x] ?? null
      const bottom = g[r * 2 + 1]![x] ?? null
      const i = (r * columns + x) * 3
      if (top === null && bottom === null) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (bottom === null) words.set([UPPER, top!, DEFAULT], i)
      else if (top === null) words.set([LOWER, bottom, DEFAULT], i)
      else words.set([UPPER, top, bottom], i)
    }
  return { columns, rows, cells: base64(new Uint8Array(words.buffer)) }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!
    out += c === undefined ? '=' : B64[n & 63]!
  }
  return out
}

// ---- 文字だけの面（狭い端末やデスクトップ） -----------------------------

export function kaomoji(mood: MoodKind, tick: number): string {
  const blink = tick % 17 === 0
  switch (mood) {
    case 'working':
      return tick % 2 ? 'ヾ(=^･ω･^=)ﾉ' : 'ヽ(=^･ω･^=)ﾉ'
    case 'permission':
      return tick % 2 ? '(=ºωº=)!!' : '(=ºωº=) !'
    case 'question':
      return '(=･ω･=)??'
    case 'plan':
      return '(=^▽^=)✧'
    case 'done':
      return tick % 4 < 2 ? '(=^ᴗ^=)♡' : '(=^ᴗ^=) ♡'
    case 'waiting':
      return blink ? '(=-ω-=)?' : '(=･ω･=)?'
    case 'aborted':
      return '(=-ω-=;)'
    case 'error':
      return '(=;ω;=)'
    case 'refusal':
      return '(=×ω×=)'
    case 'sleeping':
      return ['(=-ω-=) z', '(=-ω-=) zZ', '(=-ω-=) zZz'][tick % 3]!
    case 'idle':
      return blink ? '(=-ω-=)' : '(=^･ω･^=)'
  }
}

const CLAWD_EMOTE: Record<MoodKind, string[]> = {
  working: ['♪', ' ♪'],
  permission: ['!!', ' !'],
  question: ['??'],
  plan: ['✧'],
  done: ['♡', ' ♡'],
  waiting: ['?', ' ?'],
  aborted: ['💧'],
  error: ['(;_;)'],
  refusal: ['×'],
  sleeping: ['z', 'zZ', 'zZz'],
  idle: ['', '✧'],
}

export function clawdText(mood: MoodKind, tick: number): string {
  const emote = CLAWD_EMOTE[mood]
  return '▐▛███▜▌' + (emote[tick % emote.length] ?? '')
}

// ---- デスクトップ用の SVG ------------------------------------------------
// デスクトップはコードフォントの行の高さが半角ブロックと揃わず縞になるので、
// ドット絵は 1 ピクセル = 1 マスの SVG にして、夜空の窓に入れて描く

const SKY = 0x1f2033

export function toSvg(g: Grid, pixel: number): { source: string; width: number; height: number } {
  const w = g[0]?.length ?? 0
  const h = g.length
  // 色ごとに 1 本の path にまとめる（横に続く同じ色は 1 つの長方形）
  const paths = new Map<number, string>()
  g.forEach((row, y) => {
    for (let x = 0; x < w; ) {
      const c = row[x] ?? null
      if (c === null) {
        x += 1
        continue
      }
      let end = x + 1
      while (end < w && row[end] === c) end += 1
      paths.set(c, `${paths.get(c) ?? ''}M${x} ${y}h${end - x}v1h${x - end}z`)
      x = end
    }
  })
  const body = [...paths].map(([c, d]) => `<path fill="${hex(c)}" d="${d}"/>`).join('')
  const width = w * pixel
  const height = h * pixel
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${width}" height="${height}" shape-rendering="crispEdges">` +
    `<rect width="${w}" height="${h}" rx="1.5" fill="${hex(SKY)}"/>${body}</svg>`
  return { source, width, height }
}

// ---- なでなでのハートと、Client 用の文字への変換 --------------------------

export function putHeart(g: Grid, x: number, y: number, isBig: boolean) {
  put(g, isBig ? 'heart' : 'small', x, y, isBig ? C.heart : C.cheek)
}

export type Run = { text: string; fg?: string; bg?: string }

// 同じ色が続くセルをひとまとまりの Text にする
export function toRuns(g: Grid): Run[][] {
  const rows: Run[][] = []
  for (let r = 0; r * 2 + 1 < g.length; r++) {
    const runs: Run[] = []
    const top = g[r * 2]!
    const bottom = g[r * 2 + 1]!
    for (let x = 0; x < top.length; x++) {
      const t = top[x] ?? null
      const b = bottom[x] ?? null
      const cell: Run =
        t === null && b === null ? { text: ' ' } :
        b === null ? { text: '▀', fg: hex(t!) } :
        t === null ? { text: '▄', fg: hex(b) } :
        { text: '▀', fg: hex(t), bg: hex(b) }
      const last = runs.at(-1)
      if (last && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}
