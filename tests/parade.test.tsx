import { expect, test } from 'claude-code/testing'

import { ACHIEVEMENTS } from '../hooks/game'
import {
  ALL_ACHIEVEMENTS,
  boot,
  completeTurn,
  endSession,
  mountBand,
  mountShop,
  mountTouchBand,
  petLeader,
  runParade,
  spawnFriend,
  startSession,
  svgOf,
  textOf,
  veteran,
} from './helpers'

// ---- パレードと表情 ----

test('仲間が増えて、終わると表情とセリフが変わる', async ($, on) => {
  const { clock } = boot(on, { store: veteran() })
  await startSession($, 'terminal')
  await $.turn.start({ text: 'しらべて', turnId: 't1' })
  await spawnFriend($)
  await clock.advance(400)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface)
    expect(await textOf(ui, /おしごと中|がんばって|待ってね|なるほど/)).toBeDefined()
    expect(await textOf(ui, /Explore/)).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ key: 'parade' })).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }

  await completeTurn($, { turnId: 'x', agentId: 'agent-1', durationMs: 5 })
  await completeTurn($, { turnId: 't1', answer: '直しました。これで進めていい？', durationMs: 83_000 })
  await clock.advance(400)

  const waiting = await mountBand($, 'terminal')
  expect(await textOf(waiting, /おへんじ待ってる/)).toBeDefined()
  expect(await textOf(waiting, /1:23 でおわり/)).toBeDefined()
  await waiting.unmount()

  await $.turn.start({ text: 'つぎ', turnId: 't2' })
  await completeTurn($, { turnId: 't2', answer: 'できました！' })
  await clock.advance(3_000)
  const done = await mountBand($, 'terminal', 50, 4)
  expect(await textOf(done, /ほめて/)).toBeDefined()
  expect(await done.find({ key: 'parade' })).toBeUndefined()
  await done.unmount()

  await clock.advance(4 * 60 * 1000)
  const sleepy = await mountBand($, 'terminal')
  expect(await textOf(sleepy, /すやすや/)).toBeDefined()
  await sleepy.unmount()
})

test('許可待ち・エラー・拒否・中断で、セリフが変わる。中断すると仲間も帰る', async ($, on) => {
  const { clock } = boot(on, { store: veteran() })
  await startSession($, 'terminal')
  const line = async (text: RegExp) => {
    await clock.advance(400)
    const ui = await mountBand($, 'terminal', 50, 4)
    const found = await textOf(ui, text)
    await ui.unmount()
    return found
  }

  await $.turn.start({ text: 'けして', turnId: 't1' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })
  expect(await line(/やってもいい/)).toBeDefined()

  await completeTurn($, { turnId: 't1', reason: 'error' })
  expect(await line(/エラーになっちゃった/)).toBeDefined()

  await $.turn.start({ text: 'つぎ', turnId: 't2' })
  await completeTurn($, { turnId: 't2', reason: 'refusal' })
  expect(await line(/それはできない/)).toBeDefined()

  await $.turn.start({ text: 'しらべて', turnId: 't3' })
  await spawnFriend($)
  await completeTurn($, { turnId: 't3', reason: 'aborted' })
  expect(await line(/とめられちゃった/)).toBeDefined()
  // 中断したターンの仲間は「おつかれさま」になって、しばらくすると帰る
  const wide = await mountBand($, 'terminal')
  expect(await textOf(wide, /おつかれさま/)).toBeDefined()
  await wide.unmount()
  await clock.advance(3_000)
  const later = await mountBand($, 'terminal')
  expect(await textOf(later, /Explore/)).toBeUndefined()
})

test('画像を貼った下書きの間は、帯をほかのプラグインにゆずる', async ($, on) => {
  boot(on, { store: veteran() })
  let draft = '[Image #1] これ見て'
  on('prompt.read', async () => ({ value: { text: draft, cursor: draft.length } }))
  await startSession($, 'terminal')

  const pasted = await mountBand($, 'terminal')
  expect(await pasted.find({ type: 'Text' })).toBeUndefined()
  await pasted.unmount()

  draft = 'ふつうの文'
  const plain = await mountBand($, 'terminal')
  expect(await textOf(plain, /よろしくね/)).toBeDefined()
})

// ---- コマンド ----

test('/parade でキャラを切り替え、隠し、また呼べる。キャラは保存に残る', async ($, on) => {
  const { clock, held } = boot(on, { store: veteran() })
  await startSession($, 'terminal')
  const face = async () => {
    await clock.advance(200)
    const ui = await mountBand($, 'terminal', 50, 4)
    const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' ')
    await ui.unmount()
    return shown
  }
  expect(await face()).toContain('▐▛███▜▌')

  expect((await runParade($, 'cat')).text).toBe('ねこたちがやってきた！')
  expect(held.get('character')).toBe('neko')
  expect(await face()).toMatch(/ω/)

  expect((await runParade($, '')).text).toMatch(/お昼寝/)
  expect(await face()).toBe('')
  expect((await runParade($, '')).text).toMatch(/戻ってきました/)
  expect(await face()).toMatch(/ω/)

  expect((await runParade($, 'clawd')).text).toBe('Clawd がやってきた！')
  expect(await face()).toContain('▐▛███▜▌')

  expect((await runParade($, 'xyz')).text).toMatch(/^使い方/)
})

test('保存してあるキャラで始まる', async ($, on) => {
  const { clock } = boot(on, { store: veteran({}, { character: 'neko' }) })
  await startSession($, 'terminal')
  await clock.advance(200)
  const ui = await mountBand($, 'terminal', 50, 4)
  expect(await textOf(ui, /ω/)).toBeDefined()
})

// ---- なでなで ----

test('端末ではパレードの Client で、直接なでて・ぎゅっとできる', async ($, on) => {
  const { clock } = boot(on, { store: veteran() })
  await startSession($, 'terminal')
  await clock.advance(400)

  // 幅 120 の端末では、絵は 84 マス。仲間がいないので Clawd はマス 2〜19 にいる
  const ui = await mountBand($, 'terminal')
  await ui.resize({ columns: 84, rows: 7, in: 'parade' })
  await ui.pointer({ in: 'parade', type: 'down', x: 8, y: 3, button: 'left' })
  await clock.advance(200)
  expect(await textOf(ui, /なでなで 1 回目/)).toBeDefined()
  expect(await textOf(ui, /えへへ/)).toBeDefined()

  // 押したままなでると、9 マス動くごとに 1 回
  for (const x of [11, 14, 17]) await ui.pointer({ in: 'parade', type: 'move', x, y: 3, button: 'left' })
  await ui.pointer({ in: 'parade', type: 'up', x: 17, y: 3, button: 'left' })
  await clock.advance(200)
  expect(await textOf(ui, /なでなで 2 回目/)).toBeDefined()
  await ui.unmount()

  // 仲間（マス 2〜12）をクリックすると、ぎゅっ。Clawd はマス 14〜31 に下がる
  await $.turn.start({ text: 'しらべて', turnId: 't1' })
  await spawnFriend($)
  await clock.advance(200)
  const crew = await mountBand($, 'terminal')
  await crew.resize({ columns: 84, rows: 7, in: 'parade' })
  await crew.pointer({ in: 'parade', type: 'down', x: 5, y: 4, button: 'left' })
  await clock.advance(200)
  expect(await textOf(crew, /なかまもよろこんでる/)).toBeDefined()
  expect(await textOf(crew, /なでなで 3 回目/)).toBeDefined()
})

test('デスクトップは SVG で描き、絵が出せないほど狭いときだけボタンでなでる', async ($, on) => {
  const { clock } = boot(on, { store: veteran() })
  await startSession($, 'desktop')
  await clock.advance(400)

  const ui = await mountBand($, 'desktop')
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ key: 'parade' })).toBeUndefined()
  // 絵は直接なでられるので、ボタンは出さない
  expect(await ui.find({ key: 'pet' })).toBeUndefined()

  // 狭いと絵はやめて、文字とボタンだけになる
  const narrow = await mountBand($, 'desktop', 30)
  expect(await narrow.find({ type: 'Svg' })).toBeUndefined()
  await narrow.press({ key: 'pet' })
  await clock.advance(400)
  expect(await textOf(narrow, /なでなで 1 回目/)).toBeDefined()
  expect(await textOf(narrow, /えへへ/)).toBeDefined()
})

test('デスクトップでは絵に重ねた手ざわり層で、直接なでて・ぎゅっとできる', async ($, on) => {
  const { clock } = boot(on, { store: veteran() })
  await startSession($, 'desktop')
  await $.turn.start({ text: 'しらべて', turnId: 't1' })
  await spawnFriend($)
  await clock.advance(400)

  // 幅 120 なら夜空は帯いっぱいの 120 マスに 180 ドット（1 マス 1.5 ドット）。右の 44 マスはセリフの空で、
  // 仲間はドット 2〜12（マス 1〜8）、リーダーはドット 14〜31（マス 9〜20）にいる
  const ui = await mountBand($, 'desktop')
  const touch = await ui.find({ type: 'Client', key: 'touch' })
  expect(touch?.props).toMatchObject({ width: 120, height: 7 })
  expect(await ui.find({ key: 'sky-words' })).toBeDefined()
  await ui.resize({ columns: 120, rows: 7, in: 'touch' })

  // 層の下のほう（5 行目）をさわっても届く
  await ui.pointer({ in: 'touch', type: 'down', x: 15, y: 5, button: 'left' })
  await clock.advance(200)
  expect(await textOf(ui, /なでなで 1 回目/)).toBeDefined()

  for (const x of [16, 17]) await ui.pointer({ in: 'touch', type: 'move', x, y: 5, button: 'left' })
  await ui.pointer({ in: 'touch', type: 'up', x: 17, y: 5, button: 'left' })
  await clock.advance(200)
  expect(await textOf(ui, /なでなで 2 回目/)).toBeDefined()

  await ui.pointer({ in: 'touch', type: 'down', x: 4, y: 3, button: 'left' })
  await clock.advance(200)
  expect(await textOf(ui, /なかまもよろこんでる/)).toBeDefined()

  // デスクトップは中身の高さで層の高さが決まるので、層は自分で 7 行ぶんの空行を描く
  expect((await ui.findAll({ type: 'Text', in: 'touch' })).length).toBe(7)

  // /parade debug で層のふちと大きさが見える
  expect(await ui.find({ text: /手ざわり層/, in: 'touch' })).toBeUndefined()
  await runParade($, 'debug')
  await clock.advance(200)
  expect(await textOf(ui, /手ざわり層 120×7 マス/, { in: 'touch' })).toBeDefined()
})

// ---- なでなでゲーム ----

test('なでなでゲーム：コンボ・フィーバー・実績・お店', async ($, on) => {
  const { clock, toasts } = boot(on, { store: { pets: 100 } })
  await startSession($, 'desktop')
  await clock.advance(400)

  const ui = await mountTouchBand($)
  // これまでの 100 なでが初期資金
  expect(await textOf(ui, /♡ 100 /)).toBeDefined()

  // 素早くなでるとコンボが伸び、実績も取れる
  await petLeader(ui, clock, 12)
  expect(await textOf(ui, /12 コンボ/)).toBeDefined()
  expect(toasts).toContain('🏆 実績「はじめてのなでなで」ゲット！')
  expect(toasts).toContain('🏆 実績「れんぞくなでなで」ゲット！')

  // 30 コンボでフィーバー
  for (let i = 0; i < 18; i++) {
    await ui.pointer({ in: 'touch', type: 'down', x: 8, y: 3, button: 'left' })
    await clock.advance(200)
  }
  expect(toasts).toContain('★ フィーバー！ ♡ 3 倍！ ★')
  await clock.advance(5_000)
  expect(await textOf(ui, /フィーバー ★ ♡×3 あと/)).toBeDefined()

  // お店で手袋を買い、高すぎる王冠は断られる
  const shop = await mountShop($, 60)
  expect(await textOf(shop, /やわらか手袋 Lv0/)).toBeDefined()
  await shop.press({ key: 'buy-glove' })
  expect(toasts).toContain('やわらか手袋 を Lv1 にしたよ！')
  expect(await textOf(shop, /やわらか手袋 Lv1/)).toBeDefined()
  expect(toasts).toContain('🏆 実績「はじめてのおかいもの」ゲット！')
  await shop.press({ key: 'dress-crown' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
  expect(await textOf(shop, new RegExp(`実績 \\d+/${ACHIEVEMENTS.length}`))).toBeDefined()
})

test('ぼうしをかぶって・はずせる。強化は最大になると買えない', async ($, on) => {
  const { clock, held, toasts } = boot(on, { store: veteran({ hearts: 1_000_000, owned: ['ribbon'], levels: { feverTime: 5 } }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const shop = await mountShop($)

  await shop.press({ key: 'dress-ribbon' })
  expect(toasts.at(-1)).toBe('リボン をかぶったよ！')
  expect(await textOf(shop, /リボン ✓かぶってる/)).toBeDefined()
  expect((held.get('game') as { hat: unknown }).hat).toBe('ribbon')

  await shop.press({ key: 'dress-ribbon' })
  expect(toasts.at(-1)).toBe('リボン をはずしたよ')
  expect(await textOf(shop, /リボン をかぶる/)).toBeDefined()
  expect((held.get('game') as { hat: unknown }).hat).toBeNull()

  expect(await textOf(shop, /フィーバー延長 Lv5 MAX/)).toBeDefined()
  await shop.press({ key: 'buy-feverTime' })
  expect(toasts.at(-1)).toBe('フィーバー延長 はもう最大だよ')
  expect(await textOf(shop, /フィーバー延長 Lv5 MAX/)).toBeDefined()
})

test('贈り物：お礼を言ってごきげんになり、夢のプレゼントはずっと飾られる', async ($, on) => {
  const fresh = ['gift1', 'dream1']
  const { clock, toasts } = boot(on, {
    store: { pets: 10, game: { hearts: 100_000, achievements: ALL_ACHIEVEMENTS.filter(id => !fresh.includes(id)) } },
  })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountBand($, 'desktop')
  const shop = await mountShop($)

  // ケーキをあげると、お礼を言ってケーキをかかえ、ごきげんになる
  await shop.press({ key: 'gift-cake' })
  expect(toasts).toContain('🎁 いちごのショートケーキ をあげたよ！')
  expect(toasts).toContain('🏆 実績「はじめてのプレゼント」ゲット！')
  await clock.advance(200)
  expect(await textOf(ui, /ケーキ！？いいの！？/)).toBeDefined()
  expect(await textOf(ui, /ごきげん 0:40/)).toBeDefined()
  expect(await svgOf(ui)).toContain('#ff4d6d')
  expect(await textOf(shop, /なかよし度「ともだち」/)).toBeDefined()

  // 夢のプレゼントは 1 回きりで、庭に旗が立ちつづける
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts).toContain('🎁 全部グリーンのテスト を贈ったよ！')
  expect(toasts).toContain('🏆 実績「夢をひとつ」ゲット！')
  await clock.advance(10_000)
  expect(await svgOf(ui)).toContain('#3fbf5f')
  expect(await textOf(shop, /全部グリーンのテスト ✓/)).toBeDefined()
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts.at(-1)).toBe('全部グリーンのテスト はもう飾ってあるよ')

  // 高すぎる夢はまだ贈れない
  await shop.press({ key: 'gift-noBugs' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
})

// ---- 保存 ----

test('読み込み直し（ホットリロード）では、保存から読み直さずセッションのぶんを使う', async ($, on) => {
  const { clock, held } = boot(on, { store: veteran({ hearts: 100 }) })
  await startSession($, 'desktop')
  await clock.advance(400)

  // 保存が外で変わっても、もう一度 session.start が来たときは、セッションに残っている ♡ のまま
  held.set('game', { ...(held.get('game') as object), hearts: 5_000 })
  await startSession($, 'desktop')
  await clock.advance(200)
  const ui = await mountBand($, 'desktop')
  expect(await textOf(ui, /♡ 100 /)).toBeDefined()

  // 外の変化は、次の保存（5 秒たったあとの、1 秒ごとの見回り）で差分として取り込まれる
  await clock.advance(6_000)
  expect(await textOf(ui, /♡ 5,000 /)).toBeDefined()
})

test('壊れた保存を読んでも動き続け、壊れていない項目は残る。保存には v: 1 が付く', async ($, on) => {
  const { clock, held } = boot(on, {
    store: veteran({ hearts: 2_000, levels: null, owned: 'crown', gifts: [], hat: 'witch', lastGift: { id: 'pizza', at: 1 } }),
  })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountTouchBand($)
  expect(await textOf(ui, /♡ 2,000 /)).toBeDefined()
  await petLeader(ui, clock, 1)
  expect(await textOf(ui, /なでなで 1 回目/)).toBeDefined()

  // 1 秒ごとの見回り（放置収入・実績）と保存も止まらない
  await clock.advance(6_000)
  const saved = held.get('game') as Record<string, unknown>
  expect(saved).toMatchObject({ v: 1, levels: {}, owned: [], gifts: {}, hat: null, lastGift: null })
  expect(saved.hearts).toBeGreaterThan(2_000)
  const shop = await mountShop($)
  expect(await textOf(shop, /やわらか手袋 Lv0/)).toBeDefined()
})

test('複数のセッション：ほかのセッションの稼ぎや買い物を上書きで消さない', async ($, on) => {
  const { clock, held } = boot(on, { store: veteran({ hearts: 1_000 }, { pets: 100 }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountTouchBand($)
  await petLeader(ui, clock, 3)

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
  expect(await textOf(ui, /♡ 6,0\d\d /)).toBeDefined()
})

test('複数のセッション：放置収入はいくつ開いていても 1 つぶん', async ($, on) => {
  // 星のかけら Lv1 で、放置の ♡ は 2/秒
  const { clock, held } = boot(on, { store: veteran({ levels: { stardust: 1 } }, { idlePaidAt: 1_000 }) })
  await startSession($, 'desktop')
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
  await endSession($)

  // 21 秒で、2 つのセッションを合わせて ♡ 42（二重に払っていれば 84 近く）
  const mine = (held.get('game') as { hearts: number }).hearts
  expect(mine).toBeGreaterThan(0)
  expect(otherPaid).toBeGreaterThan(0)
  expect(mine + otherPaid).toBeGreaterThan(41.9)
  expect(mine + otherPaid).toBeLessThan(42.1)
})

test('複数のセッション：別のセッションで贈った贈り物も、届いてから 6 秒かかえてお礼を言う', async ($, on) => {
  const { clock, held } = boot(on, { store: veteran({ hearts: 1_000 }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountBand($, 'desktop')
  const thanks = () => textOf(ui, /ケーキ！？いいの！？/)

  // 1.4 秒のときに、別のセッションでケーキを贈った
  const other = held.get('game') as Record<string, unknown>
  const cake = { id: 'cake', at: 1_400 }
  held.set('game', { ...other, hearts: 600, given: 400, gifts: { cake: 1 }, happyUntil: 41_400, lastGift: cake })

  // 6 秒の保存で届き、そこから 6 秒（12 秒まで）ケーキをかかえてお礼を言う
  await clock.advance(5_000)
  expect(await thanks()).toBeDefined()
  await clock.advance(4_000)
  expect(await thanks()).toBeDefined()
  expect(await svgOf(ui)).toContain('#ff4d6d')
  await clock.advance(2_000)
  expect(await thanks()).toBeUndefined()
  expect(await svgOf(ui)).not.toContain('#ff4d6d')
  // ごきげんも届いている。贈った時刻は書き換えないので、別のセッションでまたかかえだしたりしない
  expect(await textOf(ui, /ごきげん/)).toBeDefined()
  expect((held.get('game') as { lastGift: unknown }).lastGift).toEqual(cake)
})
