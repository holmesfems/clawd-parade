// パレードのドット絵。1 ピクセルを半角ブロックの上下半分で描くので、
// 縦 14 px が端末 7 行になる。ここは $ に触らない純粋な関数だけを置く。

import type { Character, DreamId, Friend, Hat, Look, MoodKind } from '../types'

export const SCENE_ROWS = 7
const H = SCENE_ROWS * 2

type Px = number | null
type Grid = Px[][]

// Clawd・仲間・小物の色。時間帯では変えない
const C = {
  body: 0xd97757,
  line: 0x5c2a1c,
  ear: 0xf2a7a0,
  cheek: 0xff8f8f,
  eye: 0x2b1b17,
  white: 0xffffff,
  heart: 0xff6b9a,
  spark: 0xffe066,
  bang: 0xff7a59,
  ask: 0xffd166,
  zzz: 0x9ec9ff,
  tear: 0x6ec6ff,
  nope: 0xff5c5c,
  feverGlow: 0xffb347,
}

// 場面の色（空・地面・星）。時間帯で切り替えられるよう、drawScene と toSvg が受け取る
export type Palette = {
  // SVG の背景（端末は塗らない）
  sky: number
  ground: number
  grass: number
  flower: number
  star: number
  starDim: number
}

export const NIGHT: Palette = {
  sky: 0x1f2033,
  ground: 0x5a5a5a,
  grass: 0x6fbf6f,
  flower: 0xffb3d1,
  star: 0xffe38a,
  starDim: 0x8a86c9,
}

// 文字の表を絵に押すときの、文字 → 色。表に無い文字は透明
type Ink = Readonly<Record<string, number>>

// ink で文字の表を押す関数を作る。isFlipped で左右反転。絵からはみ出たところは描かない
function stampWith(ink: Ink) {
  return (g: Grid, rows: readonly string[], x: number, y: number, isFlipped = false) =>
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const color = ink[ch]
        if (color !== undefined) dot(g, isFlipped ? x + row.length - 1 - dx : x + dx, y + dy, color)
      }),
    )
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

// 顔のパーツ
type Stamp = string[]
const stampFace = stampWith({ k: C.eye, w: C.white, c: C.cheek, b: C.tear })

// 輪郭のあるスプライト（sprite() で作ったもの）に、シルエット基準の座標で顔を押す（輪郭ぶん +1 して置く）
const stampOutlined = (s: Sprite, rows: Stamp, x: number, y: number) => stampFace(s.px, rows, x + 1, y + 1)

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
  stampOutlined(s, EYES[eyes][0], 2, 4)
  stampOutlined(s, EYES[eyes][1], 7, 4)
  stampOutlined(s, MOUTHS[mouth], 4, 6)
  stampOutlined(s, ['c'], 1, 6)
  stampOutlined(s, ['c'], 10, 6)
  if (tears !== null) {
    stampOutlined(s, ['b'], 2, 6 + (tears % 2))
    stampOutlined(s, ['b'], 9, 6 + ((tears + 1) % 2))
  }
  return s
}

function kitten(coat: number, step: number, isDone: boolean): Sprite {
  const s = sprite([...KITTEN, KITTEN_FEET[step % 2]!], coat)
  if (isDone) {
    stampOutlined(s, ['kk...kk'], 1, 3)
  } else {
    stampOutlined(s, ['k..k', 'k..k'], 2, 2)
  }
  stampOutlined(s, ['c....c'], 1, 4)
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
  stampFace(s.px, CLAWD_EYES[eyes][0], 4, 1)
  stampFace(s.px, CLAWD_EYES[eyes][1], 10, 1)
  const mouth = CLAWD_MOUTHS[mood]
  if (mouth) stampFace(s.px, mouth, 7, 5)
  if (BLUSHING.includes(mood)) {
    stampFace(s.px, ['cc'], 3, 4)
    stampFace(s.px, ['cc'], 13, 4)
  }
  if (mood === 'error') {
    stampFace(s.px, ['b'], 5, 4 + (tick % 2))
    stampFace(s.px, ['b'], 12, 4 + ((tick + 1) % 2))
  }
  return s
}

function miniClawd(coat: number, step: number, isDone: boolean, reach = 0): Sprite {
  const s = flat([...MINI, ...walkLegs(MINI_LEG, 2 + reach, MINI_LIFT[step] ?? null)], coat)
  if (isDone) {
    stampFace(s.px, ['.k.', 'k.k'], 2, 1)
    stampFace(s.px, ['.k.', 'k.k'], 6, 1)
  } else {
    stampFace(s.px, ['k', 'k'], 3, 1)
    stampFace(s.px, ['k', 'k'], 7, 1)
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

// 小物は 1 色。色ごとの押す関数は、毎コマ作らないよう取っておく
const glyphStamps = new Map<number, ReturnType<typeof stampWith>>()

function put(g: Grid, glyph: string, x: number, y: number, color: number) {
  let stampGlyph = glyphStamps.get(color)
  if (!stampGlyph) glyphStamps.set(color, (stampGlyph = stampWith({ '#': color })))
  stampGlyph(g, GLYPHS[glyph] ?? [], x, y)
}

function blit(g: Grid, s: Sprite, x: number, y: number) {
  s.px.forEach((row, dy) => row.forEach((c, dx) => c !== null && dot(g, x + dx, y + dy, c)))
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
  // 空・地面・星の色
  palette?: Palette
  mood: MoodKind
  // フックの何コマ目か（時刻ではない）。歩く・またたく・跳ねるのに使う
  tick: number
  friends: Friend[]
  character: Character
  // なでなで中：リーダーが手のほうへ傾く量（-2〜2）
  petted?: { sway: number } | null
  // クリックされて跳ねている仲間の id
  hopping?: string[]
}

// ---- 並び（描画と当たり判定で同じものを使う） ------------------------

// 帯の幅（マス）が、これ以上なら「広い」。端末はセリフを絵の右に、デスクトップは夜空の右側に置く
export const WIDE_CELLS = 76
// 端末は 1 マスが 1 ドット（縦は 1 行が 2 ドット）。広いときは右の 36 マスをセリフに空ける
const TERMINAL_MAX_COLUMNS = 512
const TERMINAL_SIDE_CELLS = 36
// デスクトップの絵は「マス」で場所を取り、SVG をその幅いっぱいに縮めて描く。
// 手ざわり層も同じマス数にするので、絵と層の幅が px を知らなくても揃う
const DESKTOP_DOTS_PER_CELL = 1.5
const DESKTOP_MAX_COLUMNS = 600
// デスクトップは Clawd の上に空を足して、ぼうしや流れ星の場所にする
const DESKTOP_HEADROOM = 4
// 広いデスクトップで、夜空の右側にセリフを重ねる幅（マス）
const SKY_WORDS_CELLS = 44

// 帯の幅から決まる、絵の大きさ
export type Frame = {
  isWide: boolean
  // 絵の幅（ドット）と、そのうち行進に使う左側の幅（右の残りはセリフを重ねる空）
  columns: number
  paradeColumns: number
  // 地面の並びはそのままで上に足す空のドット数
  headroom: number
  // 夜空に重ねるセリフの幅（マス）。0 は重ねない
  wordsCells: number
}

export function frameOf(surface: 'terminal' | 'desktop', cells: number): Frame {
  const isWide = cells >= WIDE_CELLS
  if (surface === 'terminal') {
    const columns = Math.min(TERMINAL_MAX_COLUMNS, isWide ? cells - TERMINAL_SIDE_CELLS : cells - 1)
    return { isWide, columns, paradeColumns: columns, headroom: 0, wordsCells: 0 }
  }
  const columns = Math.min(DESKTOP_MAX_COLUMNS, Math.floor(cells * DESKTOP_DOTS_PER_CELL))
  const wordsCells = isWide ? SKY_WORDS_CELLS : 0
  return {
    isWide,
    columns,
    paradeColumns: columns - Math.ceil(wordsCells * DESKTOP_DOTS_PER_CELL),
    headroom: DESKTOP_HEADROOM,
    wordsCells,
  }
}

// 夢のプレゼントを飾る、行進の右にあいた庭（ドットの列）。
// 地面の飾りは right に右寄せで並べ、入りきらないぶんだけ絵の右端（far）まではみ出す。
// 広いデスクトップでは、はみ出たぶんが夜空のセリフと少し重なる（セリフは右寄せなので、左側はたいてい空いている）
export type Yard = { left: number; right: number; far: number }
export type Layout = {
  leader: { x: number; w: number }
  friends: { id: string; x: number; w: number }[]
  // 庭が狭すぎて飾れないときは null
  yard: Yard | null
  // なでている間にハートが湧く列。顔にかからないよう両脇から
  hearts: number[]
}

// 誰がどの列にいるか。columns は絵の幅、paradeColumns はそのうち行進に使う左側（どちらもドット）
export function layout(columns: number, paradeColumns: number, friends: Friend[], character: Character): Layout {
  const isClawd = character === 'clawd'
  const friendW = isClawd ? 11 : 10
  const leaderW = isClawd ? 18 : 14
  const full = Math.max(20, columns)
  const W = Math.max(20, Math.min(full, paradeColumns))
  const room = Math.max(0, Math.floor((W - leaderW - 2 - 22) / (friendW + GAP)))
  const shown = friends.slice(-room)
  const x = 2 + shown.length * (friendW + GAP)
  const yard = { left: x + leaderW + YARD_GAP, right: W - 2, far: full - 2 }
  return {
    leader: { x, w: leaderW },
    friends: shown.map((f, i) => ({ id: f.id, x: 2 + i * (friendW + GAP), w: friendW })),
    yard: yard.far - yard.left >= YARD_MIN ? yard : null,
    hearts: [x + leaderW + 1, x - 4, x + leaderW + 5],
  }
}

const GAP = 1
// 庭はリーダーの右、小物（！や ♡、かかえた贈り物）の場所をあけたところから。絵の右端まで狭すぎるときは飾らない
const YARD_GAP = 12
const YARD_MIN = 10

export type Hit = { kind: 'leader' } | { kind: 'friend'; spot: Layout['friends'][number] } | null

// 絵のドットの列 x をさわったら、だれに当たるか。リーダーは両脇 1 ドットまでおまけする
export function hitTest(l: Layout, x: number): Hit {
  if (x >= l.leader.x - 1 && x <= l.leader.x + l.leader.w) return { kind: 'leader' }
  const friend = l.friends.find(f => x >= f.x && x < f.x + f.w)
  return friend ? { kind: 'friend', spot: friend } : null
}

// 押したままなでた手の横の動き（絵のドット数）を数え、STROKE_DOTS 動くごとに 1 回なでたことにする。
// 端末もデスクトップも同じ距離で 1 回なので、♡ の貯まる速さがそろう。
// 縦は、デスクトップの 1 行が絵の何ドットかが分からないので数えない
export const STROKE_DOTS = 6

export function strokeMeter() {
  let lastX = 0
  let travel = 0
  return {
    start(x: number) {
      lastX = x
      travel = 0
    },
    // 手が x まで来た。なでた回数を返す（端数は次に持ち越す）
    move(x: number): number {
      travel += Math.abs(x - lastX)
      lastX = x
      const strokes = Math.floor(travel / STROKE_DOTS)
      travel -= strokes * STROKE_DOTS
      return strokes
    },
  }
}

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

const PLAIN: Look = { hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [] }

export function drawScene({
  columns,
  paradeColumns = columns,
  twinkleTicks = 1,
  headroom = 0,
  look = PLAIN,
  palette = NIGHT,
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

  // 並びを先に決めて、行進の右にあいた「庭」に夢のプレゼントを飾る
  const spots = layout(W, paradeColumns, friends, character)
  const { yard } = spots
  const dreams = yard ? look.dreams : []
  if (yard && dreams.includes('noBugs')) drawRainbow(g, groundDecos(yard, dreams).right, ground)

  // 空の星。遠くにあるので歩いても動かさない
  starsOf(W, 6 + sky).forEach(({ x, y }, i) => {
    const twinkle = (Math.floor(tick / twinkleTicks) + i * 3) % 7 === 0
    put(g, twinkle ? 'spark' : 'tiny', x - (twinkle ? 1 : 0), y, twinkle ? palette.star : palette.starDim)
  })
  if (yard && dreams.includes('constellation')) drawConstellation(g, yard, sky, tick, palette)
  if (yard && dreams.includes('moonTrip')) stampDeco(g, DECOS.moon, yard.right - 7, Math.max(0, sky - 3))
  if (look.shootingStars) drawShootingStar(g, tick, palette)
  if (look.fever) drawHeartRain(g, tick)

  // 地面と草花（左へ流れる）
  for (let x = 0; x < W; x++) {
    const at = x + scroll
    if (at % 6 < 3) g[ground]![x] = palette.ground
    if (at % 29 === 0) {
      g[ground - 1]![x] = palette.grass
      g[ground]![x] = palette.grass
    }
    if (at % 47 === 13) {
      g[ground - 2]![x] = palette.flower
      g[ground - 1]![x] = palette.grass
    }
  }

  if (yard) drawYard(g, dreams, yard, ground, tick)

  // 並び：いちばん新しい仲間がリーダーのすぐ後ろ
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

  // なでなで中や、贈り物をもらった直後は、何をしていてもとろけた顔になる（なでなでは手のほうへ傾く）
  const { gift } = look
  const pose = petted ?? (gift !== null ? { sway: 0 } : null)
  const feel: MoodKind = pose ? 'done' : mood
  const { eyes, mouth } = pose ? { eyes: 'happy' as const, mouth: 'smile' as const } : face(mood, tick)
  const bob =
    pose ? 0 :
    mood === 'sleeping' ? (Math.floor(tick / 3) % 2) :
    mood === 'done' ? [0, 1, 2, 1, 0, 0, 0, 0][tick % 8]! :
    marching ? tick % 2 : 0
  const step = marching && !pose ? 1 + (tick % 2) : 0
  // 歩く Clawd は足を伸ばして上下する。跳ねる・寝息のときは体ごと持ち上げる
  const reach = isClawd && step && mood !== 'done' ? bob : 0
  const s = isClawd
    ? clawd(feel, eyes, step, tick, reach)
    : leader(eyes, mouth, step ? tick : 0, feel === 'error' ? tick : null)
  const leaderX = spots.leader.x + (pose ? Math.max(-2, Math.min(2, pose.sway)) : 0)
  const top = ground - s.h - (bob - reach)
  if (look.fever) glow(g, s, leaderX, top, tick % 2 ? C.spark : C.feverGlow)
  blit(g, s, leaderX, top)
  if (look.hat) drawHat(g, look.hat, isClawd, leaderX, top)
  // もらった贈り物を顔の横にかかえて、ハートを飛ばす
  if (gift !== null) {
    const icon = GIFT_ICONS[gift]
    const gy = top + 2 - (tick % 2)
    stampIcon(g, icon, leaderX + s.w + 1, gy)
    put(g, tick % 4 < 2 ? 'heart' : 'small', leaderX + s.w + 2 + (tick % 3), gy - 5, C.heart)
  }
  if (pose) return g

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

// 0 以上 1 未満の、n ごとに決まった値
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 2 ** 32
}

// 星の場所。幅を星の数で等分した枠に 1 つずつ置き、枠の中でずらす。
// 歩幅を決め打ちにすると、幅によっては星が数本の列に固まって縦に並んだ
export function starsOf(columns: number, skyRows: number): { x: number; y: number }[] {
  const n = Math.ceil((columns / 14) * (skyRows / 6))
  const slot = columns / n
  return Array.from({ length: n }, (_, i) => ({
    x: Math.floor(slot * (i + 0.15 + 0.7 * hash(i * 2))),
    y: Math.floor(skyRows * hash(i * 2 + 1)),
  }))
}

function dot(g: Grid, x: number, y: number, color: number) {
  const line = g[y]
  if (line && x >= 0 && x < line.length) line[x] = color
}

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
    stampHat(g, spec.rows, left + 1, y)
    stampHat(g, spec.rows, right - w, y, true)
  } else if (spec.at === 'right') {
    stampHat(g, spec.rows, right - w + 2, y)
  } else {
    stampHat(g, spec.rows, Math.floor((left + right + 1 - w) / 2), y)
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

function drawShootingStar(g: Grid, tick: number, palette: Palette) {
  const W = g[0]?.length ?? 0
  const period = 40
  const phase = tick % period
  if (phase >= 9) return
  const n = Math.floor(tick / period)
  const hx = W - 6 - ((n * 53) % Math.max(1, Math.floor(W * 0.6))) - phase * 3
  const trail = [C.white, palette.star, palette.star, palette.star, palette.starDim, palette.starDim, palette.starDim]
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

// ---- 贈り物と夢のプレゼント ------------------------------------------------

const stampIcon = stampWith({
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
const GIFT_ICONS: Record<NonNullable<Look['gift']>, string[]> = {
  cookie: ['.ccc.', 'ckccc', 'cccck', 'cckcc', '.ccc.'],
  cocoa: ['.s.s..', 'mmmmm.', 'maaamm', 'maaamm', 'mmmmm.'],
  cake: ['..r..', '.www.', 'wwwww', 'yyyyy', 'ppppp', 'yyyyy'],
  letter: ['eeeeeee', 'edeeede', 'eedhdee', 'eeeeeee'],
  cushion: ['.uuuuuu.', 'utuuuutu', 'uuuuuuuu', '.uuuuuu.'],
  keyboard: ['qqqqqqqqq', 'qxqxqxqxq', 'qqxqxqxqq', 'qqxxxxxqq', 'qqqqqqqqq'],
  box: ['.h.h.', '..h..', 'bbhbb', 'bbhbb', 'bbhbb'],
}

const stampDeco = stampWith({
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

const DECOS = {
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

function drawYard(g: Grid, dreams: DreamId[], yard: Yard, ground: number, tick: number) {
  for (const { dream, x } of groundDecos(yard, dreams).placed) {
    const deco = GROUND_DECOS.find(([d]) => d === dream)![1]
    const rows = deco === 'rocket' && tick % 2 ? DECOS.rocket.map(row => row.replace(/F/g, 'f')) : DECOS[deco]
    stampDeco(g, rows, x, ground - rows.length)
  }
}

// バグのない世界：地面の飾りの右（おうちの上）にかかる、少し落ち着いた色の小さな虹
function drawRainbow(g: Grid, right: number, ground: number) {
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

function drawConstellation(g: Grid, yard: Yard, sky: number, tick: number, palette: Palette) {
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

// palette は drawScene に渡したものと同じにする（背景の空の色）
export function toSvg(g: Grid, pixel: number, palette: Palette): { source: string; width: number; height: number } {
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
    `<rect width="${w}" height="${h}" rx="1.5" fill="${hex(palette.sky)}"/>${body}</svg>`
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
