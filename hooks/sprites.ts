// キャラクターのドット絵。リーダー（ねこ）・子ねこ・Clawd・ミニ Clawd のスプライト、顔のパーツ、気分ごとの顔、
// 文字だけの面で出す顔文字（kaomoji・clawdText）をまとめる。

import type { MoodKind } from '../types'
import { C, darken } from './palette'
import { stampWith } from './grid'
import type { Grid, Px, Sprite } from './grid'

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

export function leader(eyes: Eyes, mouth: Mouth, step: number, tears: number | null): Sprite {
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

export function kitten(coat: number, step: number, isDone: boolean): Sprite {
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

export function clawd(mood: MoodKind, eyes: Eyes, step: number, tick: number, reach = 0): Sprite {
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

export function miniClawd(coat: number, step: number, isDone: boolean, reach = 0): Sprite {
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

export function face(mood: MoodKind, tick: number): { eyes: Eyes; mouth: Mouth } {
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
