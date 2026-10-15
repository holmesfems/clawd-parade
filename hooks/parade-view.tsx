// パレードを描く Client。マウスを受け取れるのはここだけなので、
// なでなでの見た目（傾き・ハート・仲間のジャンプ）はこのモジュールの中で完結させ、
// 回数だけを post でフックに伝える。

import type { ClientModule } from 'claude-code'

import type { Character, Friend, Look, MoodKind } from '../types'
import { drawScene, layout, putHeart, toRuns } from './scene'

export type ViewProps = {
  columns: number
  mood: MoodKind
  tick: number
  friends: Friend[]
  character: Character
  // なでなでゲームで買ったぼうしや夜空の飾り
  look?: Look
}

type Heart = { x: number; y: number; age: number; isBig: boolean }

const FRAME_MS = 100
const PET_FRAMES = 12
const HOP_FRAMES = 8
const HEART_LIFE = 12
const STROKE_PER_HEART = 3

// Client は 1 つしか置かないので、手の状態はモジュールに持つ
let current: ViewProps | undefined
let frame = 0
let version = 0
let petUntil = -1
let sway = 0
let isHolding = false
let lastX = 0
let lastY = 0
let travel = 0
let strokes = 0
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
    surface.setState(0)
    surface.every(FRAME_MS, () => {
      const wasLively = isLively()
      frame += 1
      hearts = hearts.map(h => ({ ...h, age: h.age + 1 })).filter(h => h.age < HEART_LIFE)
      if (wasLively) surface.setState(++version)
    })
    surface.onPointer(ev => {
      const now = current
      if (!now) return
      const spots = layout(now.columns, now.friends, now.character)
      const { x: lx, w: lw } = spots.leader
      const isOnLeader = ev.x >= lx - 1 && ev.x <= lx + lw

      if (ev.type === 'down' && ev.button === 'left') {
        if (isOnLeader) {
          isHolding = true
          lastX = ev.x
          lastY = ev.y
          travel = 0
          petUntil = frame + PET_FRAMES
          addHeart(ev.x, ev.y)
          surface.post({ kind: 'pet' })
        } else {
          const friend = spots.friends.find(f => ev.x >= f.x && ev.x < f.x + f.w)
          if (friend) {
            hops.set(friend.id, frame + HOP_FRAMES)
            addHeart(friend.x + 4, 1)
            surface.post({ kind: 'hug' })
          }
        }
      } else if (ev.type === 'move' && isHolding && ev.button === 'left') {
        const moved = Math.abs(ev.x - lastX) + Math.abs(ev.y - lastY)
        if (moved === 0) return
        travel += moved
        lastX = ev.x
        lastY = ev.y
        sway = Math.max(-2, Math.min(2, Math.round((ev.x - (lx + lw / 2)) / 3)))
        petUntil = frame + PET_FRAMES
        if (travel >= STROKE_PER_HEART) {
          travel = 0
          strokes += 1
          addHeart(ev.x, ev.y)
          if (strokes % 3 === 0) surface.post({ kind: 'stroke' })
        }
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
