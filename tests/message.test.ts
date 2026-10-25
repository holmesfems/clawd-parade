// Client からのメッセージを読む messageOf の単体テスト
import { expect, test } from 'claude-code/testing'

import { messageOf } from '../hooks/message'

test('形の合うものだけを ClientMessage として読む', () => {
  expect(messageOf({ kind: 'pet' })).toEqual({ kind: 'pet' })
  expect(messageOf({ kind: 'pet', x: 12 })).toEqual({ kind: 'pet', x: 12 })
  expect(messageOf({ kind: 'stroke', x: 3 })).toEqual({ kind: 'stroke', x: 3 })
  expect(messageOf({ kind: 'hug', id: 'agent-1' })).toEqual({ kind: 'hug', id: 'agent-1' })
  // 型の違う項目は落とす
  expect(messageOf({ kind: 'pet', x: '12' })).toEqual({ kind: 'pet' })
  expect(messageOf({ kind: 'stroke', x: NaN })).toEqual({ kind: 'stroke' })
  expect(messageOf({ kind: 'hug', id: 5 })).toEqual({ kind: 'hug' })
  for (const data of [null, undefined, 'pet', 3, [], {}, { kind: 'poke' }]) expect(messageOf(data)).toBeNull()
})
