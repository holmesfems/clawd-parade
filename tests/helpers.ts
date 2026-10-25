// テストの準備。どのテストも、時計と store の用意、セッションの開始、帯やショップの mount から始まる

import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine, MockClock, Mounted } from 'claude-code/testing'

import { ACHIEVEMENTS } from '../hooks/game'

// 実績を全部取ってあるセーブに使う。なでても実績の知らせが出ないので、なでなで回数の行を見られる
export const ALL_ACHIEVEMENTS = ACHIEVEMENTS.map(a => a.id)

type Surface = 'terminal' | 'desktop'

export type Booted = {
  clock: MockClock
  // ほかのセッションも書きこむ store。いま入っているものを外から見たり書き換えたりできる
  held: Map<string, unknown>
  toasts: string[]
  // mod が store に書いた直後に呼ぶ。別のセッションがすぐあとに書いたことにできる
  afterSet: { run?: (key: string, value: unknown) => void }
}

// 時計と store を用意し、mod の下にいるエンジンの答えを登録する
export function boot(on: On, { now = 1_000, store = {} }: { now?: number; store?: Record<string, unknown> } = {}): Booted {
  const clock = mock.clock(on, { now })
  const held = new Map(Object.entries(store))
  on('store.get', async (_$, e) => ({ value: held.get(e.key) }))
  const afterSet: Booted['afterSet'] = {}
  on('store.set', async (_$, e) => {
    held.set(e.key, JSON.parse(JSON.stringify(e.value)))
    afterSet.run?.(e.key, held.get(e.key))
    return { value: undefined }
  })
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  let agents = 0
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('agent.spawn', async () => ({ model: 'haiku', agentId: `agent-${++agents}` }))
  on('classic.PermissionRequest', async () => ({}))
  // mod が帯を描かずに下へゆずったとき（隠している、画像の下書き）は、エンジンが空の箱を描く
  on('ui.render', async () => ({ type: 'Box' as const }))
  return { clock, held, toasts, afterSet }
}

export const startSession = ($: Engine, surface: Surface) => $.session.start({ cwd: 'C:/tmp', surface, isInteractive: true })

// サブエージェントを 1 匹呼ぶ。boot の agent.spawn が agent-1, agent-2, … を返す
export const spawnFriend = ($: Engine, subagentType = 'Explore', description = 'コード探索') =>
  $.agent.spawn({
    tool_use_id: `tu-${description}`,
    prompt: description,
    description,
    subagentType,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: false,
    fork: false,
  })

// ターンを終える。agentId があればその仲間の、無ければ主のターン
export const completeTurn = (
  $: Engine,
  { turnId, answer = 'ok', reason = 'answer', durationMs = 1_000, agentId }: {
    turnId: string
    answer?: string
    reason?: 'answer' | 'aborted' | 'error' | 'refusal'
    durationMs?: number
    agentId?: string
  },
) => {
  const fields = { answer, durationMs, isAborted: reason === 'aborted', turnId, ...(agentId ? { agentId } : {}) }
  return $.turn.complete(
    reason === 'refusal' ? { ...fields, reason, refusal: { category: null, explanation: null } } : { ...fields, reason },
  )
}

// /parade を打つ
export const runParade = ($: Engine, args = '') =>
  $.command.run({ command: 'parade', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

export const endSession = ($: Engine) => $.session.end({ sessionId: 's1', reason: 'other', resume: { id: 's1' } })

// 実績を全部取ってあるセーブ（足りないものは新しいゲームの値で埋まる）
export const veteran = (game: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) => ({
  game: { hearts: 0, achievements: ALL_ACHIEVEMENTS, ...game },
  ...rest,
})

const band = (bodyColumns: number, maxRows: number) => ({
  plugin: 'clawd-parade',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
})

// 入力欄の上の帯
export const mountBand = <S extends Surface>($: Engine, surface: S, bodyColumns = 120, maxRows = 20) =>
  $.ui.mount({ ...band(bodyColumns, maxRows), surface })

// デスクトップの帯。手ざわり層を絵と同じ 120×7 マスに置く
export async function mountTouchBand($: Engine) {
  const ui = await mountBand($, 'desktop')
  await ui.resize({ columns: 120, rows: 7, in: 'touch' })
  return ui
}

// /parade shop のパネル
export const mountShop = ($: Engine, bodyRows = 80) =>
  $.ui.mount({
    plugin: 'clawd-parade',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'parade-shop',
    props: { title: 'なでなでショップ', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  })

// 読むだけ・さわるだけのヘルパーは、どの面・どの部品の mount でも受け取れるよう、使うメソッドだけを型にする
type Readable = Pick<Mounted, 'find'>

// デスクトップの絵（SVG）
export const svgOf = async (ui: Readable) => ((await ui.find({ type: 'Svg' }))?.props as { source: string }).source

// n 回なでる（押して離して 0.2 秒）。仲間がいなければ、Clawd は手ざわり層のマス 1〜12 にいる
export async function petLeader(ui: Pick<Mounted<'desktop'>, 'pointer'>, clock: MockClock, n: number, at = { x: 8, y: 3 }) {
  for (let i = 0; i < n; i++) {
    await ui.pointer({ in: 'touch', type: 'down', ...at, button: 'left' })
    await ui.pointer({ in: 'touch', type: 'up', ...at, button: 'left' })
    await clock.advance(200)
  }
}

// 見えている文字のうち、最初に合うもの
export const textOf = async (ui: Readable, text: RegExp, scope: { in?: string } = {}) => (await ui.find({ text, ...scope }))?.text
