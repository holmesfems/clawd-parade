// Client からフックへ post されたものを、ClientMessage として読む

import type { ClientMessage } from '../types'

// 形の合わないものは null（ほかのプラグインのメッセージや、別の版の Client かもしれない）
export function messageOf(data: unknown): ClientMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const { kind, x, id } = data as { kind?: unknown; x?: unknown; id?: unknown }
  if (kind === 'pet' || kind === 'stroke') return typeof x === 'number' && Number.isFinite(x) ? { kind, x } : { kind }
  if (kind === 'hug') return typeof id === 'string' ? { kind, id } : { kind }
  if (kind === 'gift') return { kind }
  return null
}
