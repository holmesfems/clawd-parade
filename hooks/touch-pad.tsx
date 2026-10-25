// デスクトップで SVG のパレードに重ねる、見えない手ざわりの層。
// 絵は描かず、さわった場所を絵のドットの列に直して post するだけで、
// ハートや傾きはフックが SVG に描く。

import type { ClientModule } from 'claude-code'

import type { Character, ClientMessage, Friend } from '../types'
import { hitTest, layout, strokeMeter } from './scene'

export type TouchProps = {
  columns: number
  // 行進に使う左側のドット数（drawScene と同じ並びで当たり判定する）
  paradeColumns: number
  // 層の高さ（行）。デスクトップは中身の高さで層の高さが決まるので、この行数ぶん空行で埋める
  rows: number
  // /parade debug 中は、層のふちと大きさを描いて見えるようにする
  isDebug: boolean
  friends: Friend[]
  character: Character
  // 帯に出した贈り物の札の列（絵のドット）。出していなければ null
  gift: { x: number; w: number } | null
}

// Client は 1 つしか置かないので、手の状態はモジュールに持つ
let current: TouchProps | undefined
let isHolding = false
const meter = strokeMeter()

const TouchPad: ClientModule<TouchProps, number> = (props, surface) => {
  current = props

  if (surface.state === undefined) {
    const send = (message: ClientMessage) => surface.post(message)
    surface.setState(0)
    surface.onPointer(ev => {
      const now = current
      if (!now || surface.columns === 0) return
      // 層は SVG と同じマス数の幅なので、マスの位置を絵のドット数に比例させる
      const px = Math.floor(((ev.x + 0.5) * now.columns) / surface.columns)
      const spots = layout(now.columns, now.paradeColumns, now.friends, now.character)

      if (ev.type === 'down' && ev.button === 'left') {
        const hit = hitTest(spots, px)
        const { gift } = now
        if (gift && px >= gift.x && px < gift.x + gift.w) {
          send({ kind: 'gift' })
        } else if (hit?.kind === 'leader') {
          isHolding = true
          meter.start(px)
          send({ kind: 'pet', x: px })
        } else if (hit?.kind === 'friend') {
          send({ kind: 'hug', id: hit.spot.id })
        }
      } else if (ev.type === 'move' && isHolding && ev.button === 'left') {
        for (let n = meter.move(px); n > 0; n--) send({ kind: 'stroke', x: px })
      } else if (ev.type === 'up') {
        isHolding = false
      }
    })
  }

  const { Box, Text } = surface.elements

  // デスクトップは Client の height を見ず、中身の高さで層の高さが決まる（空だと 1 行に縮み、
  // Clawd の頭の上しか当たらなかった）。なので見えない空行で rows 行ぶん埋める
  const blank = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => <Text key={`r${i}`}> </Text>)

  if (!props.isDebug) return <Box flexDirection="column">{blank(props.rows)}</Box>

  // ふちの上下 2 行と見出し 1 行を引いて、全体で rows 行にそろえる
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="#ff6b9a">
      <Text color="#ff6b9a">
        手ざわり層 {surface.columns}×{surface.rows} マス
      </Text>
      {blank(props.rows - 3)}
    </Box>
  )
}

export default TouchPad
