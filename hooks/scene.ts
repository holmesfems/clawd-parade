// パレードのドット絵の場面づくり。1 ピクセルを半角ブロックの上下半分で描くので、
// 縦 14 px が端末 7 行になる。ここは $ に触らない純粋な関数だけを置く。
// 色は palette.ts、キャラの絵は sprites.ts、飾りは decor.ts、端末や SVG への変換は encode.ts にある。

import type { Character, Friend, Look, MoodKind } from '../types'
import { C, NIGHT, coatOf } from './palette'
import type { Calendar, Palette } from './palette'
import { blit, hash, put } from './grid'
import type { Grid, Px } from './grid'
import { clawd, face, kitten, leader, miniClawd } from './sprites'
import type { Wave } from './sprites'
import {
  DECOS, GIFT_ICONS, drawAurora, drawConstellation, drawGiftedStars, drawHat, drawHeartRain, drawMilkyWay, drawRainbow,
  drawShootingStar, drawSkyDreams, drawSun, drawYard, giftedStarSpots, glow, skyDecoBox, skyDreamSpots, stampDeco, stampIcon, sunOf,
} from './decor'
import type { Box, SkyRoom } from './decor'
import { drawHolidayItem, drawParticles, drawSeasonSky, flowerOf, groundAccent, isDarkSky, seasonPlan } from './season'

export const SCENE_ROWS = 7
const H = SCENE_ROWS * 2


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
  // 季節と行事（#41）。無ければ（null も）季節の飾りを描かない。日付はフックの時計から band.tsx が渡す
  calendar?: Calendar | null
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

// 夢のプレゼントを飾る、行進の右にあいた庭（ドットの列）。地面の飾りは right に右寄せで並べ、入りきらないぶんは飾らない。
// 広いデスクトップでも right より右（贈り物の札とセリフの空）には出さない
export type Yard = { left: number; right: number }
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
  // room が 0 のとき slice(-0) は全員を返すので、分けて書く
  const shown = room > 0 ? friends.slice(-room) : []
  const x = 2 + shown.length * (friendW + GAP)
  const yard = { left: x + leaderW + YARD_GAP, right: W - 2 }
  return {
    leader: { x, w: leaderW },
    friends: shown.map((f, i) => ({ id: f.id, x: 2 + i * (friendW + GAP), w: friendW })),
    yard: yard.right - yard.left >= YARD_MIN ? yard : null,
    hearts: [x + leaderW + 1, x - 4, x + leaderW + 5],
  }
}

const GAP = 1
// 庭はリーダーの右、小物（！や ♡、かかえた贈り物）の場所をあけたところから。狭すぎるときは飾らない
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

const PLAIN: Look = { hat: null, shootingStars: false, aurora: false, fever: false, gift: null, dreams: [], stars: 0 }

// 手ふり（なかよし度「あいぼう」から）：WAVE_EVERY コマごとに、はじめの WAVE_TICKS コマだけ、2 つのコマを交互に。
// 乱数は使わず tick だけで決めるので、どの面でも同じときにふる。落ち着いている間はフックが 3 コマに 1 回しか
// tick を進めないので、ふるのは 30 秒くらいごとに 2 秒ほど
export const WAVE_EVERY = 50
const WAVE_TICKS = 4

// 手をふるか。ひまなとき（idle で、行進していない）だけ。なでられている・贈り物をかかえているとき（pose）はふらない。
// スプライトの大きさは変わらないので、なでなでの当たり判定（layout）にもかからない
export function waveOf(look: Look, mood: MoodKind, isPosing: boolean, marching: boolean, tick: number): Wave | null {
  if (!look.waves || isPosing || marching || mood !== 'idle') return null
  const phase = tick % WAVE_EVERY
  return phase < WAVE_TICKS ? ((phase % 2) as Wave) : null
}

// 空の夢が避ける、リーダーと仲間の場所（上から地面まで）。リーダーは、なでられて傾くぶん・ぼうし・
// 右の小物（！や ♡、かかえた贈り物）・なでなでのハートの湧く列（layout の hearts）までを含める。仲間は跳ねてハートを出すので列ごと
export function crowdOf({ leader: { x, w }, friends }: Layout): Box[] {
  return [{ x: x - 4, y: 0, w: w + 14, h: H * 4 }, ...friends.map(f => ({ x: f.x, y: 0, w: f.w, h: H * 4 }))]
}

// リーダーの頭の上の列（なでられて傾くぶん、2 ドットの余白をとる）。贈った星はここに置かない
const leaderSpan = ({ x, w }: Layout['leader']) => ({ from: x - 2, to: x + w + 1 })

export function drawScene({
  columns,
  paradeColumns = columns,
  twinkleTicks = 1,
  headroom = 0,
  look = PLAIN,
  palette = NIGHT,
  calendar = null,
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

  // 行進に使う幅（右のセリフの空を除く）と、星の出る空の高さ
  const paradeW = Math.max(20, Math.min(W, paradeColumns))
  const skyRows = 6 + sky
  if (look.aurora) drawAurora(g, tick)
  // 贈った星が多いときの天の川は、太陽よりも奥
  if (look.stars > 0) drawMilkyWay(g, look.stars, paradeW, skyRows)
  // 太陽は空のいちばん奥。夢のプレゼント（虹・Clawd 座・月）と地面、みんなはあとから描くので、その前に出る
  const sun = palette.sun ? sunOf(palette.sun, ground, paradeW) : null
  if (sun) drawSun(g, sun)
  const isBehindSun = (x: number, y: number) => sun !== null && (x - sun.cx) ** 2 + (y - sun.cy) ** 2 <= (sun.halo + 2) ** 2

  // 並びを先に決めて、行進の右にあいた「庭」に夢のプレゼントを飾る
  const spots = layout(W, paradeColumns, friends, character)
  const { yard } = spots
  const dreams = yard ? look.dreams : []
  if (yard && dreams.includes('noBugs')) drawRainbow(g, yard, dreams, ground)

  // 空の星。遠くにあるので歩いても動かさない
  starsOf(W, skyRows).forEach(({ x, y }, i) => {
    // 星が少ない時間帯は、決まった星だけを残す（毎コマ同じ星）。星の場所の hash（i * 2、i * 2 + 1）とは別の値で決める
    if (palette.stars < 1 && hash(-1 - i) >= palette.stars) return
    // 太陽の上には星を出さない
    if (isBehindSun(x, y)) return
    const twinkle = (Math.floor(tick / twinkleTicks) + i * 3) % 7 === 0
    put(g, twinkle ? 'spark' : 'tiny', x - (twinkle ? 1 : 0), y, twinkle ? palette.star : palette.starDim)
  })
  // 季節の花びら・葉・ほたる（#41）は、星の手前で、贈った星や夢の飾り・地面・みんなより奥。行進の幅（セリフの空と札の左）だけに出す
  const isDark = isDarkSky(palette)
  if (calendar) drawParticles(g, calendar.season, isDark, paradeW, ground, tick)
  // 贈った星は、昼も含めてどの時間帯でも出す（流れ星やオーロラと同じ）。セリフの空には出さない
  if (look.stars > 0) drawGiftedStars(g, look.stars, paradeW, skyRows, Math.floor(tick / twinkleTicks), leaderSpan(spots.leader), isBehindSun)
  if (yard && dreams.includes('constellation')) drawConstellation(g, yard, sky, tick, palette)
  if (yard && dreams.includes('moonTrip')) stampDeco(g, DECOS.moon, yard.right - 7, Math.max(0, sky - 3))
  // 空飛ぶ船・ふたりの星は、Clawd 座・月・虹・地面の飾り・みんなから 1 ドットあけた空に（贈った星の手前）
  const stars = yard && look.stars > 0 ? giftedStarSpots(paradeW, skyRows, leaderSpan(spots.leader)).slice(0, look.stars) : []
  const room: SkyRoom | null = yard ? { yard, dreams, sky, ground, sun, crowd: crowdOf(spots), stars } : null
  const skySpots = room ? skyDreamSpots(room) : []
  drawSkyDreams(g, skySpots, tick)
  // 季節の飾り（行事の地面の飾り・満月・入道雲）は、夢の飾りを置いたあとのあいている場所に（夢のほうは動かさない）
  const plan = calendar ? seasonPlan(calendar, room, skySpots.map(({ dream, x, y }) => skyDecoBox(dream, x, y)), palette) : null
  if (plan) drawSeasonSky(g, plan, ground)
  if (look.shootingStars) drawShootingStar(g, tick, palette)
  if (look.fever) drawHeartRain(g, tick)

  // 地面と草花（左へ流れる）。季節があれば、地面の線に落ちた花びら・葉や、うすく積もった雪をまぜる
  const season = calendar?.season ?? null
  const flower = flowerOf(season, palette.flower)
  for (let x = 0; x < W; x++) {
    const at = x + scroll
    if (at % 6 < 3) g[ground]![x] = palette.ground
    if (season) g[ground]![x] = groundAccent(season, at, g[ground]![x] ?? null)
    if (at % 29 === 0) {
      g[ground - 1]![x] = palette.grass
      g[ground]![x] = palette.grass
    }
    if (at % 47 === 13) {
      g[ground - 2]![x] = flower
      g[ground - 1]![x] = palette.grass
    }
  }

  if (yard) drawYard(g, dreams, yard, ground, tick)
  if (plan) drawHolidayItem(g, plan, ground, tick, isDark)

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
  // 手をふるあいだは、にっこりした目にする
  const wave = waveOf(look, mood, pose !== null, marching, tick)
  const { eyes, mouth } = pose || wave !== null ? { eyes: 'happy' as const, mouth: 'smile' as const } : face(mood, tick)
  const bob =
    pose ? 0 :
    mood === 'sleeping' ? (Math.floor(tick / 3) % 2) :
    mood === 'done' ? [0, 1, 2, 1, 0, 0, 0, 0][tick % 8]! :
    marching ? tick % 2 : 0
  const step = marching && !pose ? 1 + (tick % 2) : 0
  // 歩く Clawd は足を伸ばして上下する。跳ねる・寝息のときは体ごと持ち上げる
  const reach = isClawd && step && mood !== 'done' ? bob : 0
  const s = isClawd
    ? clawd(feel, eyes, step, tick, reach, wave)
    : leader(eyes, mouth, step ? tick : 0, feel === 'error' ? tick : null, wave)
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

// ---- 星 -------------------------------------------------------------------

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
