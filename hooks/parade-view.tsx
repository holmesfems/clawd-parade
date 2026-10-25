// パレードを描く Client。マウスを受け取れるのはここだけなので、
// なでなでの見た目（傾き・ハート・仲間のジャンプ）はこのモジュールの中で完結させ、
// 回数だけを post でフックに伝える。

import type { ClientModule } from 'claude-code'

import type { Character, ClientMessage, Friend, Look, MoodKind } from '../types'
import { drawScene, hitTest, layout, putHeart, strokeMeter, toRuns } from './scene'
import type { Palette } from './scene'

export type ViewProps = {
  columns: number
  mood: MoodKind
  tick: number
  friends: Friend[]
  character: Character
  // なでなでゲームで買ったぼうしや夜空の飾り
  look?: Look
  // 時間帯の空・地面・星の色（端末は空を塗らないので、星と地面だけが変わる）
  palette?: Palette
}

type Heart = { x: number; y: number; age: number; isBig: boolean }

// この Client は、フック（HOOK_FRAME_MS）より細かい自分のコマで動く
const VIEW_FRAME_MS = 100
const PET_FRAMES = 12
// ぎゅっとされた仲間が跳ねている、この Client のコマ数
const VIEW_HOP_FRAMES = 8
const HEART_LIFE = 12
// なでている手が、これだけマス動くごとにハートを 1 つ出す
const CELLS_PER_HEART = 3

// Client は 1 つしか置かないので、手の状態はモジュールに持つ
let current: ViewProps | undefined
let frame = 0
let version = 0
let petUntil = -1
let sway = 0
let isHolding = false
let lastX = 0
let lastY = 0
let toHeart = 0
const meter = strokeMeter()
let hearts: Heart[] = []
const hops = new Map<string, number>()

function addHeart(x: number, row: number) {
  hearts.push({ x: x - 2, y: row * 2, age: 0, isBig: hearts.length % 2 === 0 })
  if (hearts.length > 12) hearts.shift()
}

const isLively = () => hearts.length > 0 || petUntil >= frame || [...hops.values()].some(until => until >= frame)

const ParadeView: ClientModule<ViewProps, number> = (props, surface) => {
  current = props

  if (surface.state === undefined) {
    const send = (message: ClientMessage) => surface.post(message)
    surface.setState(0)
    surface.every(VIEW_FRAME_MS, () => {
      const wasLively = isLively()
      frame += 1
      hearts = hearts.map(h => ({ ...h, age: h.age + 1 })).filter(h => h.age < HEART_LIFE)
      if (wasLively) surface.setState(++version)
    })
    surface.onPointer(ev => {
      const now = current
      if (!now) return
      const spots = layout(now.columns, now.columns, now.friends, now.character)
      const { x: lx, w: lw } = spots.leader
      if (ev.type === 'down' && ev.button === 'left') {
        const hit = hitTest(spots, ev.x)
        if (hit?.kind === 'leader') {
          isHolding = true
          lastX = ev.x
          lastY = ev.y
          meter.start(ev.x)
          toHeart = 0
          petUntil = frame + PET_FRAMES
          addHeart(ev.x, ev.y)
          send({ kind: 'pet' })
        } else if (hit?.kind === 'friend') {
          const friend = hit.spot
          hops.set(friend.id, frame + VIEW_HOP_FRAMES)
          addHeart(friend.x + 4, 1)
          send({ kind: 'hug' })
        } else {
          return
        }
      } else if (ev.type === 'move' && isHolding && ev.button === 'left') {
        // ハートは縦横どちらの動きでも出す（端末は 1 マスが絵の 1 ドット）
        const moved = Math.abs(ev.x - lastX) + Math.abs(ev.y - lastY)
        if (moved === 0) return
        lastX = ev.x
        lastY = ev.y
        sway = Math.max(-2, Math.min(2, Math.round((ev.x - (lx + lw / 2)) / 3)))
        petUntil = frame + PET_FRAMES
        toHeart += moved
        if (toHeart >= CELLS_PER_HEART) {
          toHeart = 0
          addHeart(ev.x, ev.y)
        }
        for (let n = meter.move(ev.x); n > 0; n--) send({ kind: 'stroke' })
      } else if (ev.type === 'up') {
        isHolding = false
      } else {
        return
      }
      surface.setState(++version)
    })
  }

  const isPetted = petUntil >= frame
  const g = drawScene({
    ...props,
    petted: isPetted ? { sway: isHolding ? sway : 0 } : null,
    hopping: [...hops].filter(([, until]) => until >= frame).map(([id]) => id),
  })
  for (const h of hearts) putHeart(g, h.x, h.y - h.age, h.isBig)

  const { Box, Text } = surface.elements

  return (
    <Box flexDirection="column">
      {toRuns(g).map((runs, r) => (
        <Box key={`r${r}`}>
          {runs.map((run, i) => (
            <Text
              key={`c${i}`}
              wrap="truncate-end"
              {...(run.fg ? { color: run.fg } : {})}
              {...(run.bg ? { backgroundColor: run.bg } : {})}
            >
              {run.text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default ParadeView
