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

  // /parade debug で層のふちと大きさが見える
  expect(await ui.find({ text: /手ざわり層/, in: 'touch' })).toBeUndefined()
  await $.command.run({ command: 'parade', args: 'debug', origin: { kind: 'human' } } as never)
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
    requestId: 'parade-shop',
    props: { title: 'なでなでショップ', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  })
  expect((await shop.find({ text: /やわらか手袋 Lv0/ }))?.text).toBeDefined()
  await shop.press({ key: 'buy-glove' })
  expect(toasts).toContain('やわらか手袋 を Lv1 にしたよ！')
  expect((await shop.find({ text: /やわらか手袋 Lv1/ }))?.text).toBeDefined()
  expect(toasts).toContain('🏆 実績「はじめてのおかいもの」ゲット！')
  await shop.press({ key: 'dress-crown' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
  expect((await shop.find({ text: new RegExp(`実績 \\d+/${ACHIEVEMENTS.length}`) }))?.text).toBeDefined()
})

test('贈り物：お礼を言ってごきげんになり、夢のプレゼントはずっと飾られる', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const fresh = ['gift1', 'dream1']
  mock.store(on, { pets: 10, game: { hearts: 100_000, achievements: ACHIEVEMENTS.map(a => a.id).filter(id => !fresh.includes(id)) } })
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
  const shop = await $.ui.mount({
    plugin: 'clawd-parade',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'parade-shop',
    props: { title: 'なでなでショップ', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
  })
  const svg = async () => ((await ui.find({ type: 'Svg' }))?.props as { source: string }).source

  // ケーキをあげると、お礼を言ってケーキをかかえ、ごきげんになる
  await shop.press({ key: 'gift-cake' })
  expect(toasts).toContain('🎁 いちごのショートケーキ をあげたよ！')
  expect(toasts).toContain('🏆 実績「はじめてのプレゼント」ゲット！')
  await clock.advance(200)
  expect((await ui.find({ text: /ケーキ！？いいの！？/ }))?.text).toBeDefined()
  expect((await ui.find({ text: /ごきげん 0:40/ }))?.text).toBeDefined()
  expect(await svg()).toContain('#ff4d6d')
  expect((await shop.find({ text: /なかよし度「ともだち」/ }))?.text).toBeDefined()

  // 夢のプレゼントは 1 回きりで、庭に旗が立ちつづける
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts).toContain('🎁 全部グリーンのテスト を贈ったよ！')
  expect(toasts).toContain('🏆 実績「夢をひとつ」ゲット！')
  await clock.advance(10_000)
  expect(await svg()).toContain('#3fbf5f')
  expect((await shop.find({ text: /全部グリーンのテスト ✓/ }))?.text).toBeDefined()
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts.at(-1)).toBe('全部グリーンのテスト はもう飾ってあるよ')

  // 高すぎる夢はまだ贈れない
  await shop.press({ key: 'gift-noBugs' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
})

// ほかのセッションも書きこむ store。いま入っているものを外から見たり書き換えたりできる
const sharedStore = (on: On, entries: Record<string, unknown>) => {
  const held = new Map(Object.entries(entries))
  on('store.get', async (_$, e) => ({ value: held.get(e.key) }))
  on('store.set', async (_$, e) => {
    held.set(e.key, e.value)
    return { value: undefined }
  })
  return held
}

test('複数のセッション：ほかのセッションの稼ぎや買い物を上書きで消さない', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const all = ACHIEVEMENTS.map(a => a.id)
  const held = sharedStore(on, { pets: 100, game: { hearts: 1_000, achievements: all } })
  on('ui.toast', async () => ({ value: undefined }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:/tmp', surface: 'desktop', isInteractive: true })
  await clock.advance(400)
  const ui = await $.ui.mount({ ...band(120, 20), surface: 'desktop' })
  await ui.resize({ columns: 120, rows: 7, in: 'touch' })
  for (let i = 0; i < 3; i++) {
    await ui.pointer({ in: 'touch', type: 'down', x: 8, y: 3, button: 'left' })
    await ui.pointer({ in: 'touch', type: 'up', x: 8, y: 3, button: 'left' })
    await clock.advance(200)
  }

  // そのあいだに、別のセッションが ♡ を 5,000 稼いで王冠を買い、50 回なでて保存した
  const other = held.get('game') as Record<string, unknown>
  held.set('game', { ...other, hearts: (other.hearts as number) + 5_000, owned: ['crown'], hat: 'crown' })
  held.set('pets', 150)

  // 次の保存で、どちらのぶんも残る
  await clock.advance(5_000)
  const saved = held.get('game') as { hearts: number; owned: string[]; hat: string }
  expect(saved.hearts).toBeGreaterThan(6_000)
  expect(saved.hearts).toBeLessThan(6_100)
  expect(saved.owned).toEqual(['crown'])
  expect(saved.hat).toBe('crown')
  expect(held.get('pets')).toBe(153)
  // 別のセッションのぶんがこちらの帯にも映る
  expect((await ui.find({ text: /♡ 6,0\d\d / }))?.text).toBeDefined()
})

test('複数のセッション：放置収入はいくつ開いていても 1 つぶん', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const all = ACHIEVEMENTS.map(a => a.id)
  // 星のかけら Lv1 で、放置の ♡ は 2/秒
  const held = sharedStore(on, { idlePaidAt: 1_000, game: { hearts: 0, levels: { stardust: 1 }, achievements: all } })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.end', async (_$, e) => ({ sessionId: e.sessionId }))

  await $.session.start({ cwd: 'C:/tmp', surface: 'desktop', isInteractive: true })
  // 別のセッションも 0.7 秒ごとに、最後に払われた時刻からのぶんを払う
  let now = 1_000
  let otherPaid = 0
  for (let i = 0; i < 30; i++) {
    await clock.advance(700)
    now += 700
    const paidAt = held.get('idlePaidAt') as number
    otherPaid += ((now - paidAt) / 1000) * 2
    held.set('idlePaidAt', now)
  }
  await $.session.end({ sessionId: 's1', reason: 'exit' })

  // 21 秒で、2 つのセッションを合わせて ♡ 42（二重に払っていれば 84 近く）
  const mine = (held.get('game') as { hearts: number }).hearts
  expect(mine).toBeGreaterThan(0)
  expect(otherPaid).toBeGreaterThan(0)
  expect(mine + otherPaid).toBeGreaterThan(41.9)
  expect(mine + otherPaid).toBeLessThan(42.1)
})
