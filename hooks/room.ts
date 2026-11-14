// デスクトップの背景（/parade theme）の、Clawd のおへや。
// Claude のようす（しごと）で、Clawd のいる場所と動きが変わる。時間帯・天気・季節は窓の外の景色で、
// ショップで買ったおへやのもの・夢のプレゼントはおへやと窓の外に出る。
//
// 背景は描き直すと絵がまるごと入れかわり、チカチカするうえ CSS のアニメーションも最初からやり直しになる。
// なので、絵を決めるものは全部「場面の名前」（sceneName）に入れ、背景を描くフックは名前だけから SVG を作る（roomSvg）。
// 動きは SVG の中の CSS でずっと動かし、名前が変わったときだけ描き直してもらう。

import type { Character, Hat, MoodKind, RoomActivity, RoomCrew, RoomHeld, RoomItemId, Weather } from '../types'
import { drawHat } from './decor'
import { pathsOf } from './encode'
import { blit, dot, hash, put } from './grid'
import type { Grid, Px, Sprite } from './grid'
import { C, darken, hex, mix } from './palette'
import type { Holiday, Season, TimeOfDay } from './palette'
import { clawd, kitten, leader, miniClawd } from './sprites'

// ---- しごと ------------------------------------------------------------

export type Activity = RoomActivity

export const ACTIVITY_NAMES: Record<Activity, string> = {
  rest: 'くつろぐ',
  sleep: 'ねむる',
  think: 'かんがえる',
  research: 'しらべる',
  write: 'かく',
  run: 'うごかす',
  fight: 'バグとたたかう',
  wait: 'おへんじ待ち',
  done: 'おわった！',
  sad: 'しょんぼり',
}

const RESEARCH_TOOLS = /^(Read|Grep|Glob|LS|WebFetch|WebSearch|ToolSearch|NotebookRead|Skill)$/
const WRITE_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/
const RUN_TOOLS = /^(Bash|PowerShell|Monitor|BashOutput|KillShell|KillBash)$/
// MCP のツールは、名前の動詞で分ける（mcp__server__search_issues など）
const RESEARCH_VERBS = /(search|find|read|get|list|fetch|query|view|snapshot|screenshot|lookup)/i
const WRITE_VERBS = /(write|edit|create|update|set|add|insert|replace|apply|commit)/i

// おわった・エラー・とめられたは、少しのあいだだけ見せて、くつろぐにもどる
const DONE_MS = 8_000
const FIGHT_MS = 30_000
const SAD_MS = 15_000

export function toolActivity(tool: string | null): Activity {
  if (tool === null) return 'think'
  if (RESEARCH_TOOLS.test(tool)) return 'research'
  if (WRITE_TOOLS.test(tool)) return 'write'
  if (RUN_TOOLS.test(tool)) return 'run'
  if (tool.startsWith('mcp__')) {
    const verb = tool.split('__').at(-1) ?? ''
    if (RESEARCH_VERBS.test(verb)) return 'research'
    if (WRITE_VERBS.test(verb)) return 'write'
    return 'run'
  }
  return 'think'
}

// 帯の表情（mood）と、いま使っているツールから、しごとを決める
export function activityOf(mood: { kind: MoodKind; at: number }, tool: string | null, now: number): Activity {
  const since = now - mood.at
  switch (mood.kind) {
    case 'sleeping':
      return 'sleep'
    case 'permission':
    case 'question':
    case 'plan':
    case 'waiting':
      return 'wait'
    case 'working':
      return toolActivity(tool)
    case 'done':
      return since < DONE_MS ? 'done' : 'rest'
    case 'error':
      return since < FIGHT_MS ? 'fight' : 'rest'
    case 'aborted':
    case 'refusal':
      return since < SAD_MS ? 'sad' : 'rest'
    case 'idle':
      return 'rest'
  }
}

// しごとは少なくともこれだけ続ける（ツールは数秒ごとに変わる。変えるたびに背景を描き直すことになる）
export const HOLD_MS = 10_000
// 知らせたいこと（おへんじ待ち・おわった・エラーなど）には、すぐ切りかえる
const URGENT: Activity[] = ['wait', 'done', 'fight', 'sad', 'sleep']

export type Held = RoomHeld

export function holdActivity(prev: Held | null, next: Activity, now: number): Held {
  if (prev === null) return { kind: next, since: now }
  if (prev.kind === next) return prev
  // おへんじ待ち・ねむるから出るときも、すぐ（待たせたまま 10 秒そのままにしない）
  if (URGENT.includes(next) || prev.kind === 'wait' || prev.kind === 'sleep' || now - prev.since >= HOLD_MS) {
    return { kind: next, since: now }
  }
  return prev
}

// 来た仲間は、庭の道を歩いておうちに入る。歩いているあいだ（WALK_MS）は「歩いている場面」、入ったら「中ではねる場面」に変える
export const WALK_MS = 9_000
// 来た仲間は、すぐ用事が終わっても、おうちに入ってひと息つくまではいる（歩いている途中で消えない）
export const STAY_MS = WALK_MS + 6_000

export function crewOf(prev: RoomCrew, count: number, now: number): RoomCrew {
  const n = Math.max(0, Math.min(3, count))
  // 歩きおわった仲間は、中に入る
  const walking = now - prev.since >= WALK_MS ? 0 : prev.arriving
  if (n > prev.count) return { count: n, arriving: Math.min(n, walking + n - prev.count), since: now }
  // 帰るのは、最後に仲間が来てから STAY_MS たってから
  const staying = now - prev.since < STAY_MS ? prev.count : n
  const arriving = Math.min(walking, staying)
  if (staying !== n) return arriving === prev.arriving ? prev : { count: staying, arriving, since: prev.since }
  return n === prev.count && arriving === prev.arriving ? prev : { count: n, arriving, since: prev.since }
}

// ---- 場面の名前 --------------------------------------------------------

// ショップで買える、おへやのもの（きせかえの品として売る。出す・しまうができる）
export const ROOM_ITEMS: readonly RoomItemId[] = ['lamp', 'plant', 'rug', 'poster', 'garland', 'fishbowl']

export type RoomSky = {
  // 贈った星の多さ（0 なし・1 すこし・2 たくさん）
  stars: 0 | 1 | 2
  aurora: boolean
  shootingStars: boolean
  moonTrip: boolean
  noBugs: boolean
  telescope: boolean
  library: boolean
}

export type Side = 'right' | 'left'

export type RoomScene = {
  activity: Activity
  // 来ている仲間（3 匹まで描く）
  friends: number
  // そのうち、庭の道を歩いて来ているところの数（残りは、おへやの床ではねる）
  arriving: number
  time: TimeOfDay
  weather: Weather
  season: Season
  holiday: Holiday | null
  character: Character
  hat: Hat | null
  items: RoomItemId[]
  sky: RoomSky
  side: Side
}

const ACT_CODES: Record<Activity, string> = {
  rest: 're',
  sleep: 'sl',
  think: 'th',
  research: 'rs',
  write: 'wr',
  run: 'ru',
  fight: 'fi',
  wait: 'wa',
  done: 'dn',
  sad: 'sd',
}
const TIME_CODES: Record<TimeOfDay, string> = { morning: 'm', day: 'd', evening: 'e', night: 'n', lateNight: 'l' }
const WEATHER_CODES: Record<Weather, string> = { clear: 'c', cloudy: 'o', rain: 'r', snow: 's' }
const SEASON_CODES: Record<Season, string> = { spring: 'p', summer: 'u', autumn: 'a', winter: 'w' }
const HOLIDAY_CODES: Record<Holiday | 'none', string> = { none: 'x', christmas: 'c', newYear: 'y', halloween: 'h', tanabata: 't', tsukimi: 'k' }
const HAT_CODES: Record<Hat | 'none', string> = { none: 'x', ribbon: 'r', catEars: 'k', santa: 's', crown: 'o' }

const invert = <K extends string>(table: Record<K, string>) => Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k])) as Record<string, K>
const ACT_OF = invert(ACT_CODES)
const TIME_OF = invert(TIME_CODES)
const WEATHER_OF = invert(WEATHER_CODES)
const SEASON_OF = invert(SEASON_CODES)
const HOLIDAY_OF = invert(HOLIDAY_CODES)
const HAT_OF = invert(HAT_CODES)

const SKY_FLAGS = ['aurora', 'shootingStars', 'moonTrip', 'noBugs', 'telescope', 'library'] as const

// 場面の名前。$.theme.set の backdrop.scene に入れる（1〜64 文字の英数字と - _）。同じ場面なら同じ名前
export function sceneName(s: RoomScene): string {
  const items = ROOM_ITEMS.reduce<number>((n, id, i) => (s.items.includes(id) ? n | (1 << i) : n), 0)
  const sky = SKY_FLAGS.reduce<number>((n, key, i) => (s.sky[key] ? n | (1 << (i + 2)) : n), s.sky.stars)
  return [
    'r1',
    `${ACT_CODES[s.activity]}${Math.max(0, Math.min(3, s.friends))}${s.arriving > 0 ? Math.min(3, s.arriving) : ''}`,
    `${TIME_CODES[s.time]}${WEATHER_CODES[s.weather]}${SEASON_CODES[s.season]}${HOLIDAY_CODES[s.holiday ?? 'none']}`,
    `${s.character === 'clawd' ? 'c' : 'n'}${HAT_CODES[s.hat ?? 'none']}`,
    items.toString(36),
    sky.toString(36),
    s.side === 'left' ? 'L' : 'R',
  ].join('-')
}

// 名前から場面にもどす。読めない名前は null
export function parseScene(name: string): RoomScene | null {
  const m = /^r1-([a-z]{2})([0-3])([1-3])?-([a-z])([a-z])([a-z])([a-z])-([cn])([a-z])-([0-9a-z]+)-([0-9a-z]+)-([RL])$/.exec(name)
  if (!m) return null
  const [, act, friends, arriving, time, weather, season, holiday, char, hat, items, sky, side] = m
  const activity = ACT_OF[act!]
  const t = TIME_OF[time!]
  const w = WEATHER_OF[weather!]
  const se = SEASON_OF[season!]
  const ho = HOLIDAY_OF[holiday!]
  const ha = HAT_OF[hat!]
  if (!activity || !t || !w || !se || !ho || !ha) return null
  const itemBits = parseInt(items!, 36)
  const skyBits = parseInt(sky!, 36)
  return {
    activity,
    friends: Number(friends),
    arriving: Math.min(Number(friends), Number(arriving ?? 0)),
    time: t,
    weather: w,
    season: se,
    holiday: ho === 'none' ? null : ho,
    character: char === 'c' ? 'clawd' : 'neko',
    hat: ha === 'none' ? null : ha,
    items: ROOM_ITEMS.filter((_, i) => itemBits & (1 << i)),
    sky: {
      stars: Math.min(2, skyBits & 3) as RoomSky['stars'],
      aurora: (skyBits & 4) !== 0,
      shootingStars: (skyBits & 8) !== 0,
      moonTrip: (skyBits & 16) !== 0,
      noBugs: (skyBits & 32) !== 0,
      telescope: (skyBits & 64) !== 0,
      library: (skyBits & 128) !== 0,
    },
    side: side === 'L' ? 'left' : 'right',
  }
}

// ---- 絵 ----------------------------------------------------------------

// おへやの絵の大きさ（ドット）。床は絵のいちばん下の行
const W = 72
const H = 54
const FLOOR = H

const WOOD = 0x6b4a3a
const WOOD_D = 0x4b3328
const WOOD_L = 0x8a6450
const SOFA = 0x6d5a8f
const SOFA_D = 0x54456f
const SOFA_L = 0x8572aa
const METAL = 0x2a2c3a
const SCREEN = 0x14303c
const CODE = [0x7ee0a1, 0x8ab4ff, 0xffd166, 0xff8fab]
const BOOKS = [0xc65a4f, 0x4f8fc6, 0xe0b84f, 0x6fae6a, 0x9a6fc6, 0xd98a4f, 0x4fb0a8]
const FRIEND_COATS = [0x7eb6ff, 0xb99cff, 0x8fd694]

// 窓の中の空の色。おへやは暗めなので、窓は明るく時間帯が分かる色にする
const WINDOW_SKY: Record<TimeOfDay, number> = {
  morning: 0xf3b98f,
  day: 0x86c3ec,
  evening: 0xd9806a,
  night: 0x262a5c,
  lateNight: 0x171a3c,
}
const CLOUD: Record<TimeOfDay, number> = { morning: 0xffe4d0, day: 0xffffff, evening: 0xf6bba4, night: 0x434878, lateNight: 0x2f3360 }
// かべと床の色（窓の外の外ではなく、画面いっぱいに塗る）
const WALL: Record<TimeOfDay, number> = { morning: 0x3a3142, day: 0x3d3747, evening: 0x3a2c3b, night: 0x2a2434, lateNight: 0x211c2a }
const FLOOR_COLOR = 0x3b2c27

// 窓（わく込み）と、中の空
const WIN = { x: 4, y: 4, w: 24, h: 20 }
const SKY_BOX = { x: 5, y: 5, w: 22, h: 18 }

const isNight = (t: TimeOfDay) => t === 'night' || t === 'lateNight'

const blank = (): Grid => Array.from({ length: H }, () => Array<Px>(W).fill(null))

function rect(g: Grid, x: number, y: number, w: number, h: number, color: number) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) dot(g, x + dx, y + dy, color)
}

// 絵の上のほうの行だけ（座っているとき、足を描かない）
const cropped = (s: Sprite, rows: number): Sprite => ({ w: s.w, h: rows, px: s.px.slice(0, rows) })

// 2 つの絵で違うマスだけ（まばたきなど、一部だけ入れかえる動き）
function diff(a: Sprite, b: Sprite): Sprite {
  return { w: b.w, h: b.h, px: b.px.map((row, y) => row.map((c, x) => (c !== a.px[y]?.[x] ? (c ?? null) : null))) }
}

// 重ねる絵の 1 枚。cls は動かす CSS のクラス、clip は窓（win）やおへや（art）の中だけに見せるとき。nested は一緒に動かす絵
type Layer = { cls: string; g: Grid; style?: string; clip?: string; nested?: Layer[] }

// ---- しごとごとの、Clawd のいる場所 ----

type Pose = {
  // 絵の左上
  x: number
  y: number
  isSitting: boolean
  mood: MoodKind
  eyes: 'open' | 'blink' | 'happy' | 'wide' | 'sad' | 'x'
  // Clawd ごと動かす CSS のクラス
  motion: string
}

const DESK_X = 51
const DESK_TOP = 27

function poseOf(a: Activity): Pose {
  switch (a) {
    case 'rest':
      return { x: 7, y: 37, isSitting: true, mood: 'idle', eyes: 'open', motion: 'br' }
    case 'sleep':
      return { x: 7, y: 37, isSitting: true, mood: 'sleeping', eyes: 'blink', motion: 'br slow' }
    case 'sad':
      return { x: 7, y: 37, isSitting: true, mood: 'aborted', eyes: 'sad', motion: 'sway' }
    case 'think':
      return { x: DESK_X, y: DESK_TOP, isSitting: true, mood: 'working', eyes: 'open', motion: 'bob' }
    case 'write':
      return { x: DESK_X, y: DESK_TOP, isSitting: true, mood: 'working', eyes: 'open', motion: 'ty' }
    case 'run':
      return { x: DESK_X, y: DESK_TOP, isSitting: true, mood: 'working', eyes: 'open', motion: 'bob' }
    case 'research':
      return { x: 38, y: FLOOR - 11, isSitting: false, mood: 'working', eyes: 'open', motion: 'bob' }
    case 'fight':
      return { x: 44, y: FLOOR - 11, isSitting: false, mood: 'error', eyes: 'sad', motion: 'ty' }
    case 'wait':
      return { x: 27, y: FLOOR - 11, isSitting: false, mood: 'question', eyes: 'wide', motion: 'hop' }
    case 'done':
      return { x: 27, y: FLOOR - 11, isSitting: false, mood: 'done', eyes: 'happy', motion: 'hop fast' }
  }
}

// Clawd（ねこ）のスプライト。座っているときは足を描かない
function hero(s: RoomScene, pose: Pose, eyes: Pose['eyes'], wave: 0 | 1 | null = null): Sprite {
  if (s.character === 'clawd') {
    const sp = clawd(pose.mood, eyes, 0, 0, 0, wave)
    return pose.isSitting ? cropped(sp, 8) : sp
  }
  const mouth = pose.mood === 'done' ? 'smile' : pose.mood === 'error' || pose.mood === 'aborted' ? 'frown' : pose.mood === 'question' ? 'open' : 'smile'
  const sp = leader(eyes, mouth, 0, null, wave)
  return pose.isSitting ? cropped(sp, sp.h - 2) : sp
}

// ---- 絵を描く ----

export function roomSvg(s: RoomScene): string {
  const layers: Layer[] = []
  const add = (cls: string, g: Grid, extra: Partial<Layer> = {}) => layers.push({ cls, g, ...extra })
  const back = blank()
  const pose = poseOf(s.activity)

  // 窓の外 ----
  const overcast = s.weather !== 'clear'
  const skyColor = overcast ? mix(WINDOW_SKY[s.time], 0x7a8090, 0.45) : WINDOW_SKY[s.time]
  rect(back, SKY_BOX.x, SKY_BOX.y, SKY_BOX.w, SKY_BOX.h, skyColor)
  add('', back)
  drawWindowView(back, s, add)

  // 窓わく・桟・窓台
  const frame = blank()
  rect(frame, WIN.x, WIN.y, WIN.w, 1, WOOD_L)
  rect(frame, WIN.x, WIN.y + WIN.h - 1, WIN.w, 1, WOOD)
  rect(frame, WIN.x, WIN.y, 1, WIN.h, WOOD_L)
  rect(frame, WIN.x + WIN.w - 1, WIN.y, 1, WIN.h, WOOD)
  rect(frame, 15, SKY_BOX.y, 1, SKY_BOX.h, WOOD)
  rect(frame, SKY_BOX.x, 13, SKY_BOX.w, 1, WOOD)
  rect(frame, 2, 24, 28, 1, WOOD_L)
  rect(frame, 3, 25, 26, 1, WOOD_D)
  add('', frame)

  // かべの棚と本（夢の図書館があれば、もう 1 段）
  const shelf = blank()
  drawShelf(shelf, 40, 12, 30, 1)
  if (s.sky.library) drawShelf(shelf, 56, 21, 14, 2)
  add('', shelf)

  // かべの飾り
  if (s.items.includes('poster')) add('', poster())
  if (s.items.includes('garland')) garland(add)

  // 窓台の上のもの
  if (s.items.includes('fishbowl')) fishbowl(add)
  if (s.items.includes('plant')) plant(add)
  if (s.sky.telescope) add('', telescope())
  holidayProps(s, add)

  // ランプ（ソファのとなり。あかりはやわらかく明るくなったり暗くなったり）
  if (s.items.includes('lamp')) add('', lamp())

  // ソファ（背もたれ）
  const sofaBack = blank()
  rect(sofaBack, 2, 39, 28, 6, SOFA_D)
  rect(sofaBack, 3, 40, 26, 4, SOFA)
  add('', sofaBack)

  // 机の上のモニター
  const monitor = blank()
  rect(monitor, 36, 23, 15, 12, METAL)
  rect(monitor, 37, 24, 13, 10, SCREEN)
  rect(monitor, 42, 35, 3, 1, METAL)
  add('', monitor)
  screen(s.activity, add)

  // Clawd（とぼうし）。まばたきは、違うマスだけを重ねてときどき見せる
  const hx = pose.x
  const hy = pose.y
  const heroLayer = blank()
  const body = hero(s, pose, pose.eyes)
  blit(heroLayer, body, hx, hy)
  if (s.hat) drawHat(heroLayer, s.hat, s.character === 'clawd', hx, hy)
  const heroLayers: Layer[] = [{ cls: '', g: heroLayer }]
  if (pose.eyes === 'open' || pose.eyes === 'wide') {
    const blinkLayer = blank()
    blit(blinkLayer, diff(body, hero(s, pose, 'blink')), hx, hy)
    heroLayers.push({ cls: 'blink', g: blinkLayer })
  }
  if (s.activity === 'done') {
    // ばんざい：手を上げた 2 コマをかわりばんこに
    const up0 = blank()
    const up1 = blank()
    blit(up0, diff(body, hero(s, pose, pose.eyes, 0)), hx, hy)
    blit(up1, diff(body, hero(s, pose, pose.eyes, 1)), hx, hy)
    heroLayers.push({ cls: 'fa', g: up0 }, { cls: 'fb', g: up1 })
  }
  if (s.activity === 'wait') heroLayers.push({ cls: '', g: sign(hx, hy) })
  if (s.activity === 'research') heroLayers.push(...book(hx, hy))
  // 座っているときは机・ソファのうしろ、立っているときは家具の前（床の上）に描く
  const heroGroup: Layer = { cls: `hero ${pose.motion}`, g: blank(), nested: heroLayers }
  if (pose.isSitting) layers.push(heroGroup)

  // 机（座っている Clawd の前）
  const desk = blank()
  rect(desk, 34, 36, 38, 2, WOOD_L)
  rect(desk, 34, 37, 38, 1, WOOD)
  rect(desk, 35, 38, 2, FLOOR - 38, WOOD_D)
  rect(desk, 69, 38, 2, FLOOR - 38, WOOD_D)
  rect(desk, 58, 38, 11, 8, WOOD)
  rect(desk, 62, 41, 3, 1, WOOD_L)
  // キーボード
  rect(desk, 52, 35, 15, 1, 0xcfd0db)
  for (let x = 53; x < 66; x += 2) dot(desk, x, 35, 0x9a9cad)
  add('', desk)
  if (s.activity === 'write') keys(add)

  // ソファの座面とひじかけ（座っている Clawd の前）
  const sofa = blank()
  rect(sofa, 1, 45, 30, 4, SOFA)
  rect(sofa, 1, 45, 30, 1, SOFA_L)
  rect(sofa, 0, 42, 3, 7, SOFA_L)
  rect(sofa, 29, 42, 3, 7, SOFA_L)
  rect(sofa, 3, 49, 2, FLOOR - 49, WOOD_D)
  rect(sofa, 26, 49, 2, FLOOR - 49, WOOD_D)
  add('', sofa)

  // しきもの
  if (s.items.includes('rug')) add('', rug())

  // 立っている Clawd（机・ソファ・しきものの前）
  if (!pose.isSitting) layers.push(heroGroup)

  // しごとの小物と動き
  activityProps(s, pose, add)

  // 仲間（床で小さくはねる）
  friends(s, pose, add)

  return frameSvg(s, layers)
}

// ---- 窓の外 ----

function drawWindowView(back: Grid, s: RoomScene, add: (cls: string, g: Grid, extra?: Partial<Layer>) => void) {
  const { x, y, w, h } = SKY_BOX
  const t = s.time
  const night = isNight(t)
  const clip = 'win'

  // 星（夜・深夜はたくさん、夕方と朝はすこし）。半分はまたたく
  const starCount = night ? 7 + s.sky.stars * 6 : t === 'evening' || t === 'morning' ? 3 : 0
  const still = blank()
  const twinkle = blank()
  if (s.weather !== 'rain' && s.weather !== 'cloudy') {
    for (let i = 0; i < starCount; i++) {
      const sx = x + Math.floor(hash(i * 7 + 1) * w)
      const sy = y + Math.floor(hash(i * 13 + 5) * (h - 6))
      dot(i % 2 ? twinkle : still, sx, sy, i % 3 === 0 ? 0xfff3c4 : 0xc9cdf5)
    }
  }
  // 太陽・月
  if (night) {
    const full = s.holiday === 'tsukimi'
    const mx = 21
    const my = 7
    if (full) rect(back, mx - 1, my - 1, 5, 5, 0xfff3c4)
    else {
      rect(back, mx, my, 3, 3, 0xfff3c4)
      dot(back, mx, my, skyOf(s))
      dot(back, mx + 2, my + 1, 0xe8dca8)
    }
    if (s.sky.moonTrip) {
      // 月へむかうロケット
      const rocket = blank()
      rect(rocket, 17, 11, 1, 3, C.white)
      dot(rocket, 17, 10, 0xff6b6b)
      dot(rocket, 16, 13, 0xff6b6b)
      dot(rocket, 18, 13, 0xff6b6b)
      dot(rocket, 17, 14, 0xffd166)
      add('float', rocket)
    }
  } else if (s.weather !== 'rain') {
    const sun = t === 'day' ? { sx: 21, sy: 7, c: 0xfff1a8 } : t === 'morning' ? { sx: 8, sy: 17, c: 0xffd27a } : { sx: 8, sy: 16, c: 0xff9a6b }
    rect(back, sun.sx, sun.sy, 3, 3, s.weather === 'clear' ? sun.c : mix(sun.c, skyOf(s), 0.5))
  }
  add('', still)
  add('tw', twinkle)

  // 虹（バグのない世界）。昼と朝の、晴れた空に
  if (s.sky.noBugs && !night && s.weather === 'clear') {
    const bow = blank()
    const colors = [0xff6b6b, 0xffb347, 0xffe066, 0x7ee081, 0x6ec6ff, 0xb99cff]
    colors.forEach((c, i) => {
      const r = 9 - i
      for (let a = 0; a <= 32; a++) {
        const ang = Math.PI * (a / 32)
        dot(bow, Math.round(16 - Math.cos(ang) * r), Math.round(22 - Math.sin(ang) * r), c)
      }
    })
    add('', bow)
  }

  // オーロラ（夜）
  if (s.sky.aurora && night) {
    const au = blank()
    for (let dx = 0; dx < w; dx++) {
      const wave = Math.round(Math.sin(dx / 3) * 1.5)
      dot(au, x + dx, y + 3 + wave, 0x7ef2c0)
      dot(au, x + dx, y + 4 + wave, 0x4fd1a5)
      if (dx % 3 === 0) dot(au, x + dx, y + 5 + wave, 0x6b8cff)
    }
    add('au', au, { clip })
  }

  // 流れ星（夜。ときどき）
  if (s.sky.shootingStars && night && s.weather === 'clear') {
    const st = blank()
    dot(st, 24, 6, C.white)
    dot(st, 25, 5, 0xfff3c4)
    dot(st, 26, 5, 0xc9cdf5)
    add('shoot', st, { clip })
  }

  // 雲：窓の幅ずつずらして 2 つ描き、窓の幅だけ流してくり返す
  const clouds = s.weather === 'clear' ? 1 : 3
  const cloudLayer = blank()
  const cloudColor = s.weather === 'clear' ? CLOUD[t] : mix(CLOUD[t], 0x6a6f80, 0.4)
  for (let i = 0; i < clouds; i++) {
    const cx = x + Math.floor(hash(i * 31 + 3) * w)
    const cy = y + 2 + Math.floor(hash(i * 17 + 9) * 7)
    for (const off of [0, -w]) {
      rect(cloudLayer, cx + off, cy, 6, 2, cloudColor)
      rect(cloudLayer, cx + off + 1, cy - 1, 3, 1, cloudColor)
    }
  }
  add('drift', cloudLayer, { clip })

  // 雨・雪・季節の花びらや葉：窓の高さずつずらして 2 つ描き、窓の高さだけ落としてくり返す
  const fall = s.weather === 'rain' ? { n: 14, c: 0x9fc4ff, len: 2, cls: 'rain' } :
    s.weather === 'snow' ? { n: 12, c: 0xffffff, len: 1, cls: 'snow' } :
    s.season === 'spring' ? { n: 5, c: 0xffb3d1, len: 1, cls: 'petal' } :
    s.season === 'autumn' ? { n: 5, c: 0xe8894f, len: 1, cls: 'petal' } : null
  if (fall) {
    const f = blank()
    for (let i = 0; i < fall.n; i++) {
      const fx = x + Math.floor(hash(i * 11 + 2) * w)
      const fy = y + Math.floor(hash(i * 23 + 7) * h)
      for (const off of [0, -h]) rect(f, fx, fy + off, 1, fall.len, fall.c)
    }
    add(fall.cls, f, { clip })
  }
  // 夏の夜は、ほたる
  if (s.season === 'summer' && night && s.weather === 'clear') {
    const fly = blank()
    for (let i = 0; i < 4; i++) dot(fly, x + 2 + Math.floor(hash(i * 5 + 1) * (w - 4)), y + h - 3 - Math.floor(hash(i * 9) * 6), 0xd8ff7a)
    add('tw', fly)
  }
}

const skyOf = (s: RoomScene) => (s.weather !== 'clear' ? mix(WINDOW_SKY[s.time], 0x7a8090, 0.45) : WINDOW_SKY[s.time])

// ---- おへやのもの ----

function drawShelf(g: Grid, x: number, y: number, w: number, seed: number) {
  rect(g, x, y, w, 1, WOOD_L)
  dot(g, x + 1, y + 1, WOOD_D)
  dot(g, x + w - 2, y + 1, WOOD_D)
  for (let bx = x + 1, i = 0; bx < x + w - 2; i++) {
    const bw = 2 + Math.floor(hash(seed * 97 + i) * 2)
    const bh = 4 + Math.floor(hash(seed * 53 + i * 3) * 3)
    if (hash(seed * 7 + i * 11) < 0.15) {
      bx += 2
      continue
    }
    rect(g, bx, y - bh, bw, bh, BOOKS[(i + seed) % BOOKS.length]!)
    dot(g, bx, y - bh + 1, darken(BOOKS[(i + seed) % BOOKS.length]!, 0.7))
    bx += bw
  }
}

function poster(): Grid {
  const g = blank()
  rect(g, 31, 5, 7, 9, 0xe8e0d0)
  rect(g, 32, 6, 5, 7, 0x2e3a5c)
  put(g, 'spark', 33, 7, 0xffd166)
  dot(g, 33, 11, C.body)
  dot(g, 34, 11, C.body)
  dot(g, 35, 11, C.body)
  return g
}

function garland(add: (cls: string, g: Grid) => void) {
  const wire = blank()
  // 10 ドットごとに少したるむ電線
  for (let x = 0; x < W; x++) dot(wire, x, x % 10 >= 3 && x % 10 < 7 ? 2 : 1, 0x3a3030)
  add('', wire)
  const a = blank()
  const b = blank()
  const colors = [0xff6b6b, 0xffd166, 0x7ee081, 0x6ec6ff, 0xff9ec7]
  for (let x = 5, i = 0; x < W; x += 10, i++) dot(i % 2 ? a : b, x, 3, colors[i % colors.length]!)
  for (let x = 0, i = 0; x < W; x += 10, i++) dot(i % 2 ? b : a, x, 2, colors[(i + 2) % colors.length]!)
  add('fa slow', a)
  add('fb slow', b)
}

function fishbowl(add: (cls: string, g: Grid) => void) {
  const g = blank()
  rect(g, 5, 19, 6, 5, 0x7fc8e8)
  rect(g, 6, 18, 4, 1, 0xd7f0fa)
  rect(g, 5, 19, 6, 1, 0x9ad6ee)
  add('', g)
  const fish = blank()
  rect(fish, 6, 21, 2, 1, 0xff8a3d)
  dot(fish, 8, 21, 0xffb347)
  add('swim', fish)
}

function plant(add: (cls: string, g: Grid) => void) {
  const pot = blank()
  rect(pot, 22, 21, 4, 3, 0xc0623f)
  rect(pot, 21, 21, 6, 1, 0xd8794f)
  add('', pot)
  const leaves = blank()
  for (const [lx, ly] of [[23, 20], [24, 19], [22, 18], [25, 17], [23, 16], [24, 18], [21, 19], [26, 19]] as const) dot(leaves, lx, ly, ly % 2 ? 0x5fae5f : 0x7ccf7c)
  add('sway', leaves)
}

function telescope(): Grid {
  const g = blank()
  for (let i = 0; i < 6; i++) dot(g, 12 + i, 22 - Math.floor(i / 2), 0xb0b6c8)
  dot(g, 17, 19, 0x6ec6ff)
  rect(g, 13, 23, 1, 1, METAL)
  rect(g, 16, 23, 1, 1, METAL)
  return g
}

function lamp(): Grid {
  const g = blank()
  rect(g, 30, FLOOR - 2, 6, 2, METAL)
  rect(g, 32, 30, 1, FLOOR - 32, METAL)
  rect(g, 29, 26, 7, 4, 0xf4d58d)
  rect(g, 30, 25, 5, 1, 0xf4d58d)
  rect(g, 29, 29, 7, 1, 0xe0b860)
  return g
}

function rug(): Grid {
  const g = blank()
  for (let x = 6; x < 52; x++) {
    dot(g, x, FLOOR - 2, x % 4 < 2 ? 0xb5524b : 0xe0a458)
    dot(g, x, FLOOR - 1, x % 4 < 2 ? 0xe0a458 : 0xb5524b)
  }
  return g
}

function holidayProps(s: RoomScene, add: (cls: string, g: Grid) => void) {
  const g = blank()
  switch (s.holiday) {
    case 'christmas': {
      // 机の右はしに小さなツリー
      for (let r = 0; r < 6; r++) rect(g, 69 - Math.floor(r / 2), 29 + r, 1 + Math.floor(r / 2) * 2, 1, 0x3f9b5a)
      dot(g, 69, 28, 0xffd166)
      dot(g, 68, 32, 0xff6b6b)
      dot(g, 70, 33, 0x6ec6ff)
      rect(g, 69, 35, 1, 1, WOOD_D)
      break
    }
    case 'halloween':
      rect(g, 17, 21, 4, 3, 0xff8a3d)
      dot(g, 18, 20, 0x5fae5f)
      dot(g, 18, 22, 0x3a2010)
      dot(g, 20, 22, 0x3a2010)
      break
    case 'newYear':
      rect(g, 66, 33, 5, 2, 0xf5f0e6)
      rect(g, 67, 31, 3, 2, 0xf5f0e6)
      dot(g, 68, 30, 0xff8a3d)
      break
    case 'tanabata':
      rect(g, 1, 4, 1, 21, 0x6fae6a)
      dot(g, 2, 8, 0xff9ec7)
      dot(g, 2, 13, 0x6ec6ff)
      dot(g, 2, 18, 0xffd166)
      break
    case 'tsukimi':
      dot(g, 18, 23, C.white)
      dot(g, 19, 22, C.white)
      dot(g, 20, 23, C.white)
      rect(g, 17, 23, 5, 1, 0xd8b47a)
      break
    case null:
      break
  }
  add('', g)
}

// ---- モニターの中 ----

function screen(a: Activity, add: (cls: string, g: Grid, extra?: Partial<Layer>) => void) {
  if (a === 'write') {
    // コードの行が 1 行ずつ出てくる
    for (let i = 0; i < 6; i++) {
      const line = blank()
      const indent = [0, 2, 2, 4, 2, 0][i]!
      rect(line, 38 + indent, 25 + i, 3 + Math.floor(hash(i + 4) * 7), 1, CODE[i % CODE.length]!)
      add('ln', line, { style: `animation-delay:${i * 0.45}s` })
    }
  } else if (a === 'run') {
    // 進むバーと、回る歯車
    const bar = blank()
    rect(bar, 39, 30, 9, 1, 0x7ee0a1)
    add('prog', bar)
    const frameG = blank()
    rect(frameG, 38, 29, 11, 1, 0x3c5560)
    rect(frameG, 38, 31, 11, 1, 0x3c5560)
    put(frameG, 'tiny', 39, 26, 0x8ab4ff)
    rect(frameG, 39, 26, 6, 1, 0x8ab4ff)
    add('', frameG)
  } else {
    // ふだんは、ゆっくり光るカーソルだけ
    const cur = blank()
    rect(cur, 39, 26, 1, 2, 0x7ee0a1)
    add('tw', cur)
  }
}

function keys(add: (cls: string, g: Grid) => void) {
  const a = blank()
  const b = blank()
  for (let x = 53; x < 66; x += 4) dot(a, x, 35, C.white)
  for (let x = 55; x < 66; x += 4) dot(b, x, 35, C.white)
  add('fa quick', a)
  add('fb quick', b)
}

// ---- しごとの小物 ----

function sign(hx: number, hy: number): Grid {
  const g = blank()
  const sx = hx + 2
  const sy = hy - 12
  rect(g, sx + 6, sy + 8, 1, 4, WOOD_D)
  rect(g, sx, sy, 14, 8, 0xf5f0e6)
  rect(g, sx, sy, 14, 1, 0xd8cfbf)
  put(g, '?', sx + 3, sy + 2, 0xd97757)
  put(g, '?', sx + 8, sy + 2, 0xd97757)
  return g
}

function book(hx: number, hy: number): Layer[] {
  const open = blank()
  rect(open, hx + 4, hy + 5, 10, 4, 0xf5f0e6)
  rect(open, hx + 8, hy + 5, 1, 4, 0xc9bfae)
  rect(open, hx + 3, hy + 9, 12, 1, 0x8a5a44)
  const a = blank()
  const b = blank()
  for (let r = 0; r < 3; r++) {
    rect(a, hx + 5, hy + 6 + r, 2, 1, 0x9a9cad)
    rect(b, hx + 10, hy + 6 + r, 2, 1, 0x9a9cad)
  }
  return [
    { cls: '', g: open },
    { cls: 'fa slow', g: a },
    { cls: 'fb slow', g: b },
  ]
}

function activityProps(s: RoomScene, pose: Pose, add: (cls: string, g: Grid, extra?: Partial<Layer>) => void) {
  const top = pose.y
  const cx = pose.x + 9
  switch (s.activity) {
    case 'sleep': {
      // Zzz が浮かんで消える
      ;[0, 1, 2].forEach(i => {
        const z = blank()
        put(z, i === 2 ? 'Z' : 'z', cx + 6 + i * 2, top - 4 - i * 2, C.zzz)
        add('zz', z, { style: `animation-delay:${i * 1.1}s` })
      })
      break
    }
    case 'think': {
      // 考えごとの「…」が、ひとつずつ光る
      ;[0, 1, 2].forEach(i => {
        const d = blank()
        rect(d, cx - 2 + i * 3, top - 4, 2, 2, C.white)
        add('ln', d, { style: `animation-delay:${i * 0.5}s;animation-duration:2s` })
      })
      break
    }
    case 'run': {
      // 机のよこで歯車が回る
      const gear = blank()
      for (const [dx, dy] of [[0, -2], [2, 0], [0, 2], [-2, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]] as const) dot(gear, 46 + dx, 20 + dy, 0xb0b6c8)
      dot(gear, 46, 20, METAL)
      add('spin', gear)
      break
    }
    case 'research': {
      const q = blank()
      put(q, '?', cx + 8, top - 5, C.ask)
      add('float', q)
      break
    }
    case 'fight': {
      const bang = blank()
      put(bang, '!', cx + 8, top - 6, C.bang)
      add('tw quick', bang)
      // バグ（行ったり来たり）
      const bug = blank()
      rect(bug, 24, FLOOR - 3, 5, 2, 0x3f7a3a)
      rect(bug, 25, FLOOR - 4, 3, 1, 0x2f5a2a)
      dot(bug, 28, FLOOR - 3, 0xff5c5c)
      for (const lx of [24, 26, 28]) dot(bug, lx, FLOOR - 1, 0x1f3a1a)
      add('walk', bug)
      break
    }
    case 'sad': {
      const tear = blank()
      dot(tear, pose.x + 5, top + 5, C.tear)
      add('tear', tear)
      break
    }
    case 'done': {
      // 紙ふぶき：おへやの高さずつずらして 2 つ描き、落としてくり返す
      const conf = blank()
      const colors = [0xff6b6b, 0xffd166, 0x7ee081, 0x6ec6ff, 0xff9ec7]
      for (let i = 0; i < 18; i++) {
        const fx = Math.floor(hash(i * 19 + 4) * W)
        const fy = Math.floor(hash(i * 29 + 1) * H)
        for (const off of [0, -H]) dot(conf, fx, fy + off, colors[i % colors.length]!)
      }
      add('confetti', conf, { clip: 'art' })
      const heart = blank()
      put(heart, 'heart', cx + 10, top - 6, C.heart)
      add('float', heart)
      break
    }
    case 'wait':
    case 'rest':
    case 'write':
      break
  }
}

function friends(s: RoomScene, pose: Pose, add: (cls: string, g: Grid, extra?: Partial<Layer>) => void) {
  // 歩いて来ているところの仲間は、まだ中にいない
  const n = Math.min(3, s.friends) - s.arriving
  if (n <= 0) return
  // 床で、Clawd とバグにかさならない場所
  const taken = [...(!pose.isSitting ? [{ from: pose.x - 2, to: pose.x + 20 }] : []), ...(s.activity === 'fight' ? [{ from: 22, to: 39 }] : [])]
  const slots = [37, 49, 61, 12, 24].filter(x => taken.every(t => x + 11 < t.from || x > t.to))
  slots.slice(0, n).forEach((fx, i) => {
    const g = blank()
    const coat = FRIEND_COATS[i % FRIEND_COATS.length]!
    const sp = s.character === 'clawd' ? miniClawd(coat, 0, false) : kitten(coat, 0, false)
    blit(g, sp, fx, FLOOR - sp.h)
    add('hop', g, { style: `animation-delay:${i * 0.23}s` })
  })
}

// ---- 目盛り（/parade theme ruler） ----
// 背景の枠が、見えている窓のどこからどこまでかを確かめるための絵。10% ごとの線と、窓の大きさ（CSS の px）を出す
export const RULER_SCENE = 'ruler'

export function rulerSvg(): string {
  const marks = Array.from({ length: 11 }, (_, i) => i * 10)
  const v = marks
    .map(p => `<rect x="${p}%" y="0" width="2" height="100%" fill="#ff5c8a"/><text x="${p}%" y="50%" dx="4" fill="#fff">${p}%</text>`)
    .join('')
  const h = marks
    .map(p => `<rect x="0" y="${p}%" width="100%" height="2" fill="#5cc8ff"/><text x="30%" y="${p}%" dy="-4" fill="#fff">${p}%</text>`)
    .join('')
  // 枠の幅・高さ（CSS の px）：満たしている行だけが見える。いちばん下に見えている行が、枠の大きさ
  const widths = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3200, 3840]
  const heights = [400, 600, 800, 1000, 1200, 1400, 1600, 2000]
  const rows = [
    ...widths.map(w => ({ cls: `w${w}`, q: `min-width:${w}px`, label: `幅 ≥ ${w}px` })),
    ...heights.map(hh => ({ cls: `h${hh}`, q: `min-height:${hh}px`, label: `高さ ≥ ${hh}px` })),
  ]
  const style = rows.map(r => `.${r.cls}{display:none}@media (${r.q}){.${r.cls}{display:inline}}`).join('')
  // 左はし・右はしから 100px ごとの線（サイドバーやパネルの幅を読むため）。右は、右はしを原点にした入れ子の svg で描く
  const steps = Array.from({ length: 8 }, (_, i) => (i + 1) * 100)
  const fromLeft = steps.map(px => `<rect x="${px}" y="70%" width="2" height="12%" fill="#7ee081"/><text x="${px}" y="69%" dx="-24" fill="#7ee081">${px}</text>`).join('')
  const fromRight = steps
    .map(px => `<rect x="${-px}" y="0" width="2" height="100%" fill="#ffb347" transform="translate(0 0)"/><text x="${-px}" y="0" dx="-24" fill="#ffb347">${px}</text>`)
    .join('')
  const pxMarks = `${fromLeft}<svg x="100%" y="78%" width="1" height="1" overflow="visible">${fromRight.replaceAll('height="100%"', 'height="160"').replaceAll('y="0" dx', 'y="-6" dx')}</svg>`
  const list = rows.map((r, i) => `<text class="${r.cls}" x="62%" y="${12 + i * 3}%" fill="#ffd166">${r.label}</text>`).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" font-family="sans-serif" font-size="22" font-weight="bold">` +
    `<style>${style}</style><rect width="100%" height="100%" fill="#1a1626"/>${v}${h}` +
    `<rect width="100%" height="100%" fill="none" stroke="#ffd166" stroke-width="8"/>${list}${pxMarks}</svg>`
  )
}

// ---- SVG にまとめる ----

const STYLE = [
  '.br,.sway,.spin,.prog{transform-box:fill-box}',
  '.br{transform-origin:50% 100%;animation:br 3.2s ease-in-out infinite}',
  '.br.slow{animation-duration:5s}',
  '@keyframes br{50%{transform:scaleY(1.05)}}',
  '.bob{animation:bob 1.8s steps(1,end) infinite}',
  '@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}100%{transform:translateY(0)}}',
  '.ty{animation:bob .32s steps(1,end) infinite}',
  '.hop{animation:hop .9s steps(1,end) infinite}',
  '.hop.fast{animation-duration:.5s}',
  '@keyframes hop{0%{transform:translateY(0)}50%{transform:translateY(-2px)}100%{transform:translateY(0)}}',
  '.sway{transform-origin:50% 100%;animation:sway 4s ease-in-out infinite alternate}',
  '@keyframes sway{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}',
  '.fa{animation:fa .8s steps(1,end) infinite}.fb{opacity:0;animation:fb .8s steps(1,end) infinite}',
  '.fa.slow,.fb.slow{animation-duration:1.6s}.fa.quick,.fb.quick{animation-duration:.24s}',
  '@keyframes fa{0%{opacity:1}50%{opacity:0}100%{opacity:0}}@keyframes fb{0%{opacity:0}50%{opacity:1}100%{opacity:1}}',
  '.blink{opacity:0;animation:blink 4.6s steps(1,end) infinite}',
  '@keyframes blink{0%{opacity:0}94%{opacity:1}100%{opacity:1}}',
  '.tw{animation:tw 2.6s ease-in-out infinite alternate}.tw.quick{animation:fa .5s steps(1,end) infinite}',
  '@keyframes tw{from{opacity:1}to{opacity:.25}}',
  '.ln{opacity:0;animation:ln 2.8s steps(1,end) infinite}',
  '@keyframes ln{0%{opacity:0}15%{opacity:1}85%{opacity:1}100%{opacity:0}}',
  '.drift{animation:drift 60s linear infinite}',
  `@keyframes drift{from{transform:translateX(0)}to{transform:translateX(${SKY_BOX.w}px)}}`,
  `.rain{animation:fall .7s linear infinite}.snow{animation:fall 6s linear infinite}.petal{animation:fall 9s linear infinite}`,
  `@keyframes fall{from{transform:translateY(0)}to{transform:translateY(${SKY_BOX.h}px)}}`,
  `.confetti{animation:conf 5s linear infinite}@keyframes conf{from{transform:translateY(0)}to{transform:translateY(${H}px)}}`,
  '.au{animation:au 7s ease-in-out infinite alternate}@keyframes au{from{opacity:.45;transform:translateX(-1px)}to{opacity:.95;transform:translateX(1px)}}',
  '.shoot{opacity:0;animation:shoot 9s linear infinite}',
  '@keyframes shoot{0%{opacity:0;transform:translate(0,0)}3%{opacity:1}12%{opacity:0;transform:translate(-14px,7px)}100%{opacity:0;transform:translate(-14px,7px)}}',
  '.float{animation:float 2.4s ease-in-out infinite alternate}@keyframes float{from{transform:translateY(0)}to{transform:translateY(-2px)}}',
  '.zz{opacity:0;animation:zz 3.3s linear infinite}@keyframes zz{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}100%{opacity:0;transform:translate(3px,-7px)}}',
  '.spin{transform-origin:50% 50%;animation:spin 1.6s steps(8,end) infinite}@keyframes spin{to{transform:rotate(360deg)}}',
  '.prog{transform-origin:0 50%;animation:prog 3s steps(9,end) infinite}@keyframes prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
  '.walk{animation:walk 4s steps(8,end) infinite alternate}@keyframes walk{from{transform:translateX(0)}to{transform:translateX(8px)}}',
  '.swim{animation:swim 3s steps(2,end) infinite alternate}@keyframes swim{from{transform:translateX(0)}to{transform:translateX(2px)}}',
  '.tear{animation:tear 1.8s linear infinite}@keyframes tear{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(4px)}}',
  '.glow{animation:glow 3s ease-in-out infinite alternate}@keyframes glow{from{opacity:.35}to{opacity:.6}}',
  '.dim{opacity:.38}',
  // 来た仲間：窓の幅の枠ごと、窓の幅の 6 割だけ手前から入口まで歩き、入口で消える（vw は使わない。枠の幅の割合で動かす）
  '.come{transform-box:fill-box;animation:come 7s linear both}.come.rev{animation-name:comer}',
  '@keyframes come{0%{transform:translateX(-60%)}92%{transform:translateX(0);opacity:1}100%{transform:translateX(0);opacity:0}}',
  '@keyframes comer{0%{transform:translateX(60%)}92%{transform:translateX(0);opacity:1}100%{transform:translateX(0);opacity:0}}',
  '.sway.slow{animation-duration:7s}',
  // 雲の動きに vw の単位は使わない：@keyframes に vw があると、アプリの背景では CSS のアニメーションが全部止まる（docs/backdrop-investigation.md）。
  // かわりに、窓 2 つぶんの幅の枠（.cloud）を、自分の幅の半分（＝窓の幅）だけ動かす
  '.cloud{transform-box:fill-box;animation:cloud 240s linear infinite}@keyframes cloud{to{transform:translateX(50%)}}',
  '.pour{animation:pour .6s linear infinite}.flurry{animation:pour 7s linear infinite}@keyframes pour{to{transform:translateY(96px)}}',
  '.smoke{animation:smoke 4s linear infinite}@keyframes smoke{0%{opacity:0;transform:translate(0,2px)}30%{opacity:1}100%{opacity:0;transform:translate(2px,-6px)}}',
  // 動きを減らす設定では、止まった絵にする（どのしごとも、止まった絵で分かる）
  '@media (prefers-reduced-motion: reduce){*{animation:none!important}}',
].join('')

function layerSvg(l: Layer): string {
  const inner = l.nested ? l.nested.map(layerSvg).join('') : pathsOf(l.g)
  if (inner === '') return ''
  const cls = l.cls ? ` class="${l.cls}"` : ''
  const style = l.style ? ` style="${l.style}"` : ''
  const g = cls || style ? `<g${cls}${style}>${inner}</g>` : inner
  return l.clip ? `<g clip-path="url(#${l.clip})">${g}</g>` : g
}

// ---- おうちの外（空・地面・おうちの外形・庭） ----
// 背景の全体は「外」。おへやは、かべを切って中が見えるおうちの中で、おうちは窓の端（パネルのうしろ）まで続く。
// 空は窓いっぱい、地面は床の高さから下。庭（木・ポスト）は、おへやと反対側の、会話の列の外に置く

// おうちの中の幅（ドット）。おへやの絵（72）から、窓の端まで届く長さ
const HOUSE_W = 220
const WALL_T = 3
// 入口のたたき（ドット）。おへやの家具と入口のドアのあいだをあける
const ENTRY = 14
const ROOF = 0x8a4f48
const ROOF_D = 0x6b3a36
const STONE = 0x4a4652
const DOOR = 0xb5524b

const GRASS: Record<Season, number> = { spring: 0x5f9b57, summer: 0x4f8f4a, autumn: 0x8a7a45, winter: 0x6f7f6a }
const SNOW_GROUND = 0xdfe7ee
// 夜は、地面も木もおうちの外側も暗くする
const SHADE: Record<TimeOfDay, number> = { morning: 0.1, day: 0, evening: 0.25, night: 0.5, lateNight: 0.6 }
const shade = (c: number, t: TimeOfDay) => mix(c, 0x0d0b1a, SHADE[t])

// 空の上のほうの色（下のほうは skyOf。上にいくほど少し暗い）
const skyTop = (s: RoomScene) => mix(skyOf(s), 0x0d0b1a, 0.35)

const box = (x: number, y: number, w: number, h: number, fill: number, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${hex(fill)}"${extra}/>`

// おうちの外形。おへやの絵と同じ座標（ドット）で、絵のうしろに描く。右に置くときは右へ、左に置くときは左へ続く
function houseSvg(s: RoomScene): string {
  const t = s.time
  const isRight = s.side === 'right'
  // 中の左はし・中の幅と、外かべ（切り口）の左はし。入口のたたきのぶん、おへやの絵より外かべの側へ広い
  const inX = isRight ? -ENTRY : W - HOUSE_W
  const inW = HOUSE_W + ENTRY
  const wallX = isRight ? inX - WALL_T : W + ENTRY
  // 屋根：外かべの側が低く、おうちの奥へ上がっていく
  const roof = Array.from({ length: 9 }, (_, i) =>
    box(isRight ? wallX - 4 + i : inX - 2, -10 - i, inW + 9 - i, 1, shade(i % 3 === 2 ? ROOF_D : ROOF, t)),
  ).join('')
  const chimneyX = isRight ? 96 : -30
  return (
    // えんとつと、けむり
    box(chimneyX, -27, 6, 12, shade(0x9a6a5c, t)) +
    box(chimneyX - 1, -28, 8, 2, shade(0x6b4a3a, t)) +
    `<g class="smoke">${box(chimneyX + 2, -32, 2, 2, 0xd8d4e0, ' opacity=".7"')}${box(chimneyX + 3, -36, 3, 2, 0xd8d4e0, ' opacity=".5"')}</g>` +
    roof +
    // 中のかべ・かべ紙・はり
    box(inX, -9, inW, H + 9, WALL[t]) +
    `<rect x="${inX}" y="-9" width="${inW}" height="${H + 9}" fill="url(#wp)"/>` +
    box(inX, -10, inW, 2, WOOD_D) +
    // 床の板と、土台
    box(inX, H, inW, 2, FLOOR_COLOR) +
    box(inX, H + 2, inW, 1, darken(FLOOR_COLOR, 0.7)) +
    // 土台は石を 3 段だけ。その下は、外と同じ地面と道が見える
    box(isRight ? wallX : inX, H + 3, inW + WALL_T, 3, shade(STONE, t)) +
    box(isRight ? wallX : inX, H + 3, inW + WALL_T, 1, shade(mix(STONE, 0xffffff, 0.15), t)) +
    // 入口のたたきの、くつぬぎマット
    box(isRight ? inX + 2 : W + ENTRY - 10, H - 1, 8, 1, 0x7a8f6a) +
    // 外かべ（切り口）と、入口のドア・ふみ石・げんかんのあかり
    box(wallX, -10, WALL_T, 46, shade(0xd8cfbf, t)) +
    box(wallX, 36, WALL_T, H - 36, shade(DOOR, t)) +
    box(isRight ? wallX : wallX + WALL_T - 1, 45, 1, 1, 0xffd166) +
    box(isRight ? wallX - 7 : wallX + WALL_T, H - 1, 7, 1, shade(0x9a96a6, t)) +
    `<g class="tw">${box(isRight ? wallX - 2 : wallX + WALL_T, 30, 2, 2, 0xffd98a)}</g>`
  )
}

// 庭の絵は空にもはみ出す（太陽・月）ので、上に GARDEN_UP 行ぶん広いマス目に描いて、その分だけ上へずらして置く
const GARDEN_UP = 60

// 庭：太陽や月・木・ポスト・季節の草花。おへやと同じ大きさのドットで、おへやと反対側に置く
function gardenLayers(s: RoomScene): Layer[] {
  const t = s.time
  const isSnowy = s.weather === 'snow'
  const out: Layer[] = []
  const grid = (): Grid => Array.from({ length: H + GARDEN_UP }, () => Array<Px>(W).fill(null))
  const fill = (g: Grid, x: number, y: number, w: number, h: number, c: number) => rect(g, x, y + GARDEN_UP, w, h, c)

  // 太陽・月
  const sky = grid()
  if (isNight(t)) {
    fill(sky, 40, -52, 8, 8, 0xfff3c4)
    if (s.holiday !== 'tsukimi') fill(sky, 40, -52, 3, 3, skyTop(s))
    fill(sky, 45, -47, 1, 1, 0xe8dca8)
    fill(sky, 43, -49, 1, 1, 0xe8dca8)
  } else if (s.weather !== 'rain') {
    const c = t === 'day' ? 0xfff1a8 : t === 'morning' ? 0xffd27a : 0xff9a6b
    fill(sky, 38, t === 'day' ? -52 : -16, 9, 9, s.weather === 'clear' ? c : mix(c, skyOf(s), 0.5))
  }
  out.push({ cls: '', g: sky })

  // 木（季節で葉の色が変わる。冬は枝だけ、雪の日は枝に雪がつもる）
  const trunk = grid()
  fill(trunk, 15, 30, 4, 24, shade(WOOD_D, t))
  fill(trunk, 16, 30, 1, 24, shade(WOOD, t))
  fill(trunk, 11, 26, 2, 6, shade(WOOD_D, t))
  fill(trunk, 13, 30, 3, 2, shade(WOOD_D, t))
  fill(trunk, 20, 24, 2, 8, shade(WOOD_D, t))
  out.push({ cls: '', g: trunk })
  const leafColors: Record<Season, number[]> = {
    spring: [0xffb3d1, 0xff9ec7, 0xffc9de],
    summer: [0x5fae5f, 0x4f9b57, 0x7ccf7c],
    autumn: [0xe8894f, 0xd9a441, 0xc65a4f],
    winter: [],
  }
  const leafPalette = isSnowy ? [0xf2f6fa, 0xdfe7ee] : leafColors[s.season]
  const leaves = grid()
  if (leafPalette.length > 0)
    for (let dy = -13; dy <= 9; dy++)
      for (let dx = -15; dx <= 15; dx++) {
        if ((dx * dx) / 225 + (dy * dy) / 130 > 1) continue
        const k = hash(dx * 31 + dy * 17 + 5)
        if (k < (isSnowy ? 0.55 : 0.12)) continue
        fill(leaves, 17 + dx, 18 + dy, 1, 1, shade(leafPalette[Math.floor(k * 97) % leafPalette.length]!, t))
      }
  out.push({ cls: 'sway slow', g: leaves })

  // ポスト（赤い箱と、黄色い旗）
  const post = grid()
  fill(post, 53, 42, 2, 12, shade(WOOD_L, t))
  fill(post, 49, 36, 10, 6, shade(0xc65a4f, t))
  fill(post, 49, 35, 10, 1, shade(0xe07a6f, t))
  fill(post, 51, 38, 5, 1, shade(0x3a2020, t))
  fill(post, 59, 35, 1, 5, shade(0xcfd0db, t))
  fill(post, 60, 35, 2, 2, 0xffd166)
  if (isSnowy) fill(post, 49, 34, 10, 1, 0xf2f6fa)
  out.push({ cls: '', g: post })

  // 足もとの草花（春・夏）と落ち葉（秋）
  const bits: Record<Season, number[]> = { spring: [0xff9ec7, 0xffe066, 0xffffff], summer: [0xffe066, 0x6ec6ff, 0xff8fab], autumn: [0xe8894f, 0xd9a441], winter: [] }
  const low = grid()
  const colors = isSnowy ? [] : bits[s.season]
  for (let i = 0; i < 9 && colors.length > 0; i++) {
    const fx = 2 + Math.floor(hash(i * 13 + 3) * 66)
    // 木の根もとには置かない
    if (fx >= 13 && fx <= 21) continue
    fill(low, fx, 53, 1, 1, shade(colors[i % colors.length]!, t))
    if (s.season !== 'autumn') fill(low, fx, 52, 1, 1, shade(0x4f9b57, t))
  }
  out.push({ cls: '', g: low })
  return out
}

// 空いっぱいの星・雲・雨や雪。位置は、窓の大きさの割合で決める
function skySvg(s: RoomScene): string {
  const isClear = s.weather === 'clear'
  const parts: string[] = []
  const starCount = !isClear ? 0 : isNight(s.time) ? 46 + s.sky.stars * 20 : s.time === 'evening' || s.time === 'morning' ? 8 : 0
  for (let i = 0; i < starCount; i++) {
    const x = (hash(i * 7 + 11) * 100).toFixed(1)
    const y = (hash(i * 13 + 29) * 66).toFixed(1)
    const size = hash(i * 3 + 1) < 0.25 ? 4 : 3
    const star = `<rect x="${x}%" y="${y}%" width="${size}" height="${size}" fill="${i % 3 === 0 ? '#fff3c4' : '#c9cdf5'}"/>`
    parts.push(i % 2 ? `<g class="tw" style="animation-delay:${(-hash(i) * 5).toFixed(1)}s">${star}</g>` : star)
  }
  // 雲：同じ並びを、窓の幅だけ左にずらしてもう 1 つ描き、窓の幅だけ右へ流してくり返す。2 組を、ちがう速さで流す
  const cloudColor = hex(isClear ? CLOUD[s.time] : mix(CLOUD[s.time], 0x6a6f80, 0.4))
  const cloudCount = isClear ? 3 : 7
  const cloudSets = ['', '']
  for (let i = 0; i < cloudCount; i++) {
    const x = (hash(i * 41 + 7) * 92).toFixed(1)
    const y = (5 + hash(i * 17 + 9) * 34).toFixed(1)
    const k = 6 + Math.floor(hash(i * 5 + 2) * 5)
    const shape = `<rect x="0" y="${k}" width="${k * 9}" height="${k * 2}"/><rect x="${k * 2}" y="0" width="${k * 4}" height="${k}"/><rect x="${k * 5}" y="${k * 3}" width="${k * 3}" height="${k}"/>`
    cloudSets[i % 2] += `<svg x="${x}%" y="${y}%" overflow="visible">${shape}</svg>`
  }
  cloudSets.forEach((set, i) => {
    if (set === '') return
    parts.push(
      `<g class="cloud" fill="${cloudColor}" opacity="${isClear ? 0.75 : 0.9}" style="animation-duration:${i === 0 ? 260 : 380}s">` +
        `<rect x="-100%" width="200%" height="1" fill="none"/>${set}<svg x="-100%" overflow="visible">${set}</svg></g>`,
    )
  })
  // 雨・雪：小さなもようを空にしいて、もようの高さ（96px）だけ落としてくり返す
  if (s.weather === 'rain' || s.weather === 'snow') {
    const isRain = s.weather === 'rain'
    parts.push(`<rect class="${isRain ? 'pour' : 'flurry'}" y="-96" width="100%" fill="url(#${isRain ? 'rn' : 'sn'})" style="height:calc(${FLOOR_AT}% + 96px)"/>`)
  }
  return parts.join('')
}

// 庭の道を歩いて来る仲間。道の上（px）を、窓の外から入口まで歩く。絵は 1 ドット 5px
const WALK_DOT = 5
function walkersSvg(s: RoomScene): string {
  const settled = Math.min(3, s.friends) - s.arriving
  const isRight = s.side === 'right'
  // 入口のドアの外側（おへやの枠のはしから、たたきと外かべのぶん外）
  const doorGap = (ENTRY + WALL_T) * WALK_DOT
  let out = ''
  for (let i = 0; i < s.arriving; i++) {
    const coat = FRIEND_COATS[(settled + i) % FRIEND_COATS.length]!
    const frames = [0, 1].map(step => {
      const sp = s.character === 'clawd' ? miniClawd(coat, step, false) : kitten(coat, step, false)
      const g: Grid = Array.from({ length: sp.h }, () => Array<Px>(sp.w).fill(null))
      blit(g, sp, 0, 0)
      return { w: sp.w, h: sp.h, paths: pathsOf(g) }
    })
    const { w, h } = frames[0]!
    const width = w * WALK_DOT
    // 右に置くときは右はしから、左に置くときは左はしから測る
    const x = isRight ? -(ROOM_INSET.right + ROOM_BOX + doorGap + width + 4) : ROOM_INSET.left + ROOM_BOX + doorGap + 4
    const sprite =
      `<svg x="${x}" y="${62 - h * WALK_DOT}" width="${width}" height="${h * WALK_DOT}" viewBox="0 0 ${w} ${h}" overflow="visible">` +
      `<g class="fa quick">${frames[0]!.paths}</g><g class="fb quick">${frames[1]!.paths}</g></svg>`
    const anchored = isRight ? `<svg x="100%" width="1" overflow="visible">${sprite}</svg>` : sprite
    out += `<g class="come${isRight ? '' : ' rev'}" style="animation-delay:${(i * 0.9).toFixed(1)}s"><rect width="100%" height="1" fill="none"/>${anchored}</g>`
  }
  return out === '' ? '' : `<svg y="${FLOOR_AT}%" overflow="visible">${out}</svg>`
}

// 床は窓の高さの 84%。おへやの枠は高さが窓の 40%、幅が 360px（絵はこの枠に収まる大きさ）。
// 左右は、サイドバー（およそ 215px）・右のパネル（およそ 315px）の外になるよう、端から何 px 内側に置くか
const FLOOR_AT = 84
const ROOM_HEIGHT = 40
const ROOM_BOX = 360
export const ROOM_INSET = { left: 230, right: 330 }

function frameSvg(s: RoomScene, layers: Layer[]): string {
  const t = s.time
  const art = layers.map(layerSvg).join('')
  // 背景の枠は、左のサイドバーと右のパネルの下まで入った、アプリの窓まるごと（/parade theme ruler で測った）。
  // パネルの幅は窓の大きさによらず決まった px なので、おへやは端から決まった px だけ内側の、決まった幅の枠に置く。
  // 右はしから測るときは、右はしを原点にした入れ子の svg の中に、左向きに置く。
  // 入れ子の svg に shape-rendering="crispEdges" は付けない：付けると、アプリの背景では CSS のアニメーションが全部止まる（docs/backdrop-investigation.md）
  const dotBox = (x: number, align: string) =>
    `<svg x="${x}" y="${FLOOR_AT - ROOM_HEIGHT}%" width="${ROOM_BOX}" height="${ROOM_HEIGHT}%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${align} meet" overflow="visible">`
  const atLeft = (inner: string) => `${dotBox(ROOM_INSET.left, 'xMinYMax')}${inner}</svg>`
  const atRight = (inner: string) =>
    `<svg x="100%" width="1" height="100%" overflow="visible">${dotBox(-(ROOM_INSET.right + ROOM_BOX), 'xMaxYMax')}${inner}</svg></svg>`
  const lampGlow = s.items.includes('lamp')
    ? `<circle class="glow" cx="32" cy="29" r="15" fill="url(#lg)"/>`
    : ''
  const room =
    houseSvg(s) +
    `<defs><clipPath id="win"><rect x="${SKY_BOX.x}" y="${SKY_BOX.y}" width="${SKY_BOX.w}" height="${SKY_BOX.h}"/></clipPath>` +
    `<clipPath id="art"><rect width="${W}" height="${H}"/></clipPath></defs>` +
    lampGlow +
    art
  // 庭は、おへやと反対側に置く
  const garden = `<g transform="translate(0 ${-GARDEN_UP})">${gardenLayers(s).map(layerSvg).join('')}</g>`
  const ground = shade(s.weather === 'snow' ? SNOW_GROUND : GRASS[s.season], t)
  const path = shade(s.weather === 'snow' ? 0xc4ccd6 : 0xcdb98f, t)
  const drop = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  const sleepy = s.activity === 'sleep' ? `<rect class="dim" width="100%" height="100%" fill="#05040a"/>` : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">` +
    `<style>${STYLE}</style>` +
    `<defs>` +
    `<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(skyTop(s))}"/><stop offset=".84" stop-color="${hex(skyOf(s))}"/></linearGradient>` +
    // かべ紙は、おへやのドットの大きさで数える（おうちの中だけに使う）
    `<pattern id="wp" width="6" height="6" patternUnits="userSpaceOnUse"><rect x="3" y="3" width=".4" height=".4" fill="${hex(mix(WALL[t], 0xffffff, 0.06))}"/></pattern>` +
    `<pattern id="rn" width="96" height="96" patternUnits="userSpaceOnUse">${drop(10, 6, 2, 10, '#9fc4ff')}${drop(58, 30, 2, 10, '#9fc4ff')}${drop(34, 62, 2, 10, '#9fc4ff')}${drop(82, 78, 2, 10, '#9fc4ff')}</pattern>` +
    `<pattern id="sn" width="96" height="96" patternUnits="userSpaceOnUse">${drop(12, 10, 4, 4, '#fff')}${drop(60, 40, 3, 3, '#fff')}${drop(36, 70, 4, 4, '#fff')}${drop(84, 86, 3, 3, '#fff')}</pattern>` +
    `<radialGradient id="lg"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    // 空
    `<rect width="100%" height="100%" fill="url(#sk)"/>` +
    skySvg(s) +
    // 地面（床の高さから下）
    `<rect y="${FLOOR_AT}%" width="100%" height="${100 - FLOOR_AT}%" fill="${hex(ground)}"/>` +
    `<rect y="${FLOOR_AT}%" width="100%" height="5" fill="${hex(mix(ground, 0xffffff, 0.18))}"/>` +
    // 道：おうちの土台の下を、横にのびる
    `<svg y="${FLOOR_AT}%" overflow="visible"><rect y="40" width="100%" height="30" fill="${hex(path)}"/><rect y="40" width="100%" height="3" fill="${hex(mix(path, 0xffffff, 0.2))}"/><rect y="67" width="100%" height="3" fill="${hex(darken(path, 0.8))}"/></svg>` +
    (s.side === 'left' ? atRight(garden) + atLeft(room) : atLeft(garden) + atRight(room)) +
    walkersSvg(s) +
    sleepy +
    `</svg>`
  )
}
