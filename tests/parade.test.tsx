import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

import { ACHIEVEMENTS } from '../hooks/game'

const band = (bodyColumns: number, maxRows: number) => ({
  plugin: 'clawd-parade',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
})

// 実績を全部取ってある遊び慣れたセーブ。なでても実績の知らせが出ないので、なでなで回数の行を見られる
const veteran = (on: On) => {
  mock.store(on, { game: { hearts: 0, achievements: ACHIEVEMENTS.map(a => a.id) } })
  on('ui.toast', async () => ({ value: undefined }))
}

test('仲間が増えて、終わると表情とセリフが変わる', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  veteran(on)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('agent.spawn', async () => ({ model: 'haiku', agentId: 'agent-1' }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))

  await $.session.start({ cwd: 'C:/tmp', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'しらべて', turnId: 't1' })
  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'コードを探す',
    description: 'コード探索',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: false,
    fork: false,
  } as never)
  await clock.advance(400)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(120, 20), surface })
    expect((await ui.find({ text: /おしごと中|がんばって|待ってね|なるほど/ }))?.text).toBeDefined()
    expect((await ui.find({ text: /Explore/ }))?.text).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ key: 'parade' })).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 'x', agentId: 'agent-1', reason: 'answer' })
  await $.turn.complete({ answer: '直しました。これで進めていい？', durationMs: 83_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(400)

  const waiting = await $.ui.mount({ ...band(120, 20), surface: 'terminal' })
  expect((await waiting.find({ text: /おへんじ待ってる/ }))?.text).toBeDefined()
  expect((await waiting.find({ text: /1:23 でおわり/ }))?.text).toBeDefined()
  await waiting.unmount()

  await $.turn.start({ text: 'つぎ', turnId: 't2' })
  await $.turn.complete({ answer: 'できました！', durationMs: 1_000, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(3_000)
  const done = await $.ui.mount({ ...band(50, 4), surface: 'terminal' })
  expect((await done.find({ text: /ほめて/ }))?.text).toBeDefined()
  expect(await done.find({ key: 'parade' })).toBeUndefined()
  await done.unmount()

  await clock.advance(4 * 60 * 1000)
  const sleepy = await $.ui.mount({ ...band(120, 20), surface: 'terminal' })
  expect((await sleepy.find({ text: /すやすや/ }))?.text).toBeDefined()
  await sleepy.unmount()
})

test('デスクトップは SVG で描き、絵が出せないほど狭いときだけボタンでなでる', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  veteran(on)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:/tmp', surface: 'desktop', isInteractive: true })
  await clock.advance(400)

  const ui = await $.ui.mount({ ...band(120, 20), surface: 'desktop' })
  const scene = await ui.find({ type: 'Svg' })
  expect(scene).toBeDefined()
  expect(await ui.find({ key: 'parade' })).toBeUndefined()
  // 絵は直接なでられるので、ボタンは出さない
  expect(await ui.find({ key: 'pet' })).toBeUndefined()

  // 狭いと絵はやめて、文字とボタンだけになる
  const narrow = await $.ui.mount({ ...band(30, 20), surface: 'desktop' })
  expect(await narrow.find({ type: 'Svg' })).toBeUndefined()
  await narrow.press({ key: 'pet' })
  await clock.advance(400)
  expect((await narrow.find({ text: /なでなで 1 回目/ }))?.text).toBeDefined()
  expect((await narrow.find({ text: /えへへ/ }))?.text).toBeDefined()
})

test('デスクトップでは絵に重ねた手ざわり層で、直接なでて・ぎゅっとできる', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  veteran(on)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('agent.spawn', async () => ({ model: 'haiku', agentId: 'agent-1' }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))

  await $.session.start({ cwd: 'C:/tmp', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'しらべて', turnId: 't1' })
  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'コードを探す',
    description: 'コード探索',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: false,
    fork: false,
  } as never)
  await clock.advance(400)

  // 幅 120 なら夜空は帯いっぱいの 120 マスに 180 ドット（1 マス 1.5 ドット）。右の 44 マスはセリフの空で、
  // 仲間はドット 2〜12（マス 1〜8）、リーダーはドット 14〜31（マス 9〜20）にいる
  const ui = await $.ui.mount({ ...band(120, 20), surface: 'desktop' })
  const touch = await ui.find({ type: 'Client', key: 'touch' })
  expect(touch?.props).toMatchObject({ width: 120, height: 7 })
  expect(await ui.find({ key: 'sky-words' })).toBeDefined()
  await ui.resize({ columns: 120, rows: 7, in: 'touch' })

  // 層の下のほう（5 行目）をさわっても届く
  await ui.pointer({ in: 'touch', type: 'down', x: 15, y: 5, button: 'left' })
  await clock.advance(200)
  expect((await ui.find({ text: /なでなで 1 回目/ }))?.text).toBeDefined()

  for (const x of [16, 17]) await ui.pointer({ in: 'touch', type: 'move', x, y: 5, button: 'left' })
  await ui.pointer({ in: 'touch', type: 'up', x: 17, y: 5, button: 'left' })
  await clock.advance(200)
  expect((await ui.find({ text: /なでなで 2 回目/ }))?.text).toBeDefined()

  await ui.pointer({ in: 'touch', type: 'down', x: 4, y: 3, button: 'left' })
  await clock.advance(200)
  expect((await ui.find({ text: /なかまもよろこんでる/ }))?.text).toBeDefined()

  // デスクトップは中身の高さで層の高さが決まるので、層は自分で 7 行ぶんの空行を描く
  expect((await ui.findAll({ type: 'Text', in: 'touch' })).length).toBe(7)

  // /neko debug で層のふちと大きさが見える
  expect(await ui.find({ text: /手ざわり層/, in: 'touch' })).toBeUndefined()
  await $.command.run({ command: 'neko', args: 'debug', origin: { kind: 'human' } } as never)
  await clock.advance(200)
  expect((await ui.find({ text: /手ざわり層 120×7 マス/, in: 'touch' }))?.text).toBeDefined()
})

test('なでなでゲーム：コンボ・フィーバー・実績・お店', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  mock.store(on, { pets: 100 })
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:/tmp', surface: 'desktop', isInteractive: true })
  await clock.advance(400)

  const ui = await $.ui.mount({ ...band(120, 20), surface: 'desktop' })
  await ui.resize({ columns: 120, rows: 7, in: 'touch' })
  // これまでの 100 なでが初期資金
  expect((await ui.find({ text: /♡ 100 /}))?.text).toBeDefined()

  // 仲間がいないので Clawd はドット 2〜19（マス 1〜12）にいる。素早くなでるとコンボが伸び、実績も取れる
  for (let i = 0; i < 12; i++) {
    await ui.pointer({ in: 'touch', type: 'down', x: 8, y: 3, button: 'left' })
    await ui.pointer({ in: 'touch', type: 'up', x: 8, y: 3, button: 'left' })
    await clock.advance(200)
  }
  expect((await ui.find({ text: /12 コンボ/ }))?.text).toBeDefined()
  expect(toasts).toContain('🏆 実績「はじめてのなでなで」ゲット！')
  expect(toasts).toContain('🏆 実績「れんぞくなでなで」ゲット！')

  // 30 コンボでフィーバー
  for (let i = 0; i < 18; i++) {
    await ui.pointer({ in: 'touch', type: 'down', x: 8, y: 3, button: 'left' })
    await clock.advance(200)
  }
  expect(toasts).toContain('★ フィーバー！ ♡ 3 倍！ ★')
  await clock.advance(5_000)
  expect((await ui.find({ text: /フィーバー ★ ♡×3 あと/ }))?.text).toBeDefined()

  // お店で手袋を買い、高すぎる王冠は断られる
  const shop = await $.ui.mount({
    plugin: 'clawd-parade',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'neko-shop',
    props: { title: 'なでなでショップ', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  expect((await shop.find({ text: /やわらか手袋 Lv0/ }))?.text).toBeDefined()
  await shop.press({ key: 'buy-glove' })
  expect(toasts).toContain('やわらか手袋 を Lv1 にしたよ！')
  expect((await shop.find({ text: /やわらか手袋 Lv1/ }))?.text).toBeDefined()
  expect(toasts).toContain('🏆 実績「はじめてのおかいもの」ゲット！')
  await shop.press({ key: 'dress-crown' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
  expect((await shop.find({ text: /実績 \d+\/22/ }))?.text).toBeDefined()
})
