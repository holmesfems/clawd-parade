import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ACHIEVEMENTS, DIARY_KEY } from '../hooks/game'
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

  // 3 分で寝る（おわってから 3 秒たっているので、ここから 3 分でちょうど寝たあと）。
  // おわったあとは毎コマ描き直すので、1 コマずつ進む時計を長く進めると、このテストだけで数秒かかった
  await clock.advance(3 * 60 * 1000)
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

test('帯の枠は、下のプラグイン（AK Studio の帯など）と分け合う。どちらも出る', async ($, on) => {
  // テストの on は clawd-parade の下にいる。ほかのプラグインの帯の代わり（boot の空の帯より先に答えるよう、先に登録する）
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="other-band">
        <Text>◆ AK STUDIO</Text>
      </Box>
    )
  })
  boot(on, { store: veteran() })
  await startSession($, 'terminal')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface)
    expect(await ui.find({ key: 'other-band' })).toBeDefined()
    expect(await textOf(ui, /よろしくね/)).toBeDefined()
    await ui.unmount()
  }
})

// ---- テーマの背景（/parade theme） ----

// テーマを決める・外すエンジンの答え。決めたもの（null は外した）を順に残す
function themes(on: On) {
  const calls: unknown[] = []
  on('theme.set', async (_$, e) => {
    calls.push(e)
    return { value: { isDrawn: true as const, requestId: 'backdrop' } }
  })
  on('theme.clear', async () => {
    calls.push(null)
    return { value: { isDrawn: false as const, reason: 'cleared' } }
  })
  return calls
}

const mountBackdrop = ($: Engine, plugin = 'clawd-parade') =>
  $.ui.mount({
    plugin: 'clawd-parade',
    surface: 'desktop',
    component: 'Backdrop',
    requestId: 'backdrop',
    props: { scene: 'parade', plugin, glass: { blur: 6, opacity: 0.5 } },
  })

test('/parade theme で、アプリの背景にパレードを描く。帯はセリフとなでるボタンだけ。もう一度でもどす', async ($, on) => {
  const calls = themes(on)
  const { held } = boot(on, { store: veteran() })
  await startSession($, 'desktop')
  expect(calls).toEqual([])

  const on1 = await runParade($, 'theme')
  expect(on1.text).toContain('背景をパレードにしたよ')
  expect(calls).toEqual([{ backdrop: { scene: 'parade', glass: { blur: 6, opacity: 0.5 } } }])
  expect(held.get('theme')).toBe(true)

  // 背景は、窓いっぱいに広げる SVG
  const back = await mountBackdrop($)
  const source = await svgOf(back)
  expect(source).toContain('width="100%"')
  expect(source).toContain('preserveAspectRatio="xMidYMid slice"')
  // Svg の source は 131,072 文字まで
  expect(source.length).toBeLessThan(131_072)
  await back.unmount()

  // デスクトップの帯は絵を出さず、なでるボタンで（押すとなでた回数が増える）
  const band = await mountBand($, 'desktop')
  expect(await band.find({ type: 'Svg' })).toBeUndefined()
  await band.press({ key: 'pet' })
  expect(await textOf(band, /なでなで 1 回目/)).toBeDefined()
  await band.unmount()
  // 端末の帯は今までどおり
  const terminal = await mountBand($, 'terminal')
  expect(await terminal.find({ key: 'parade' })).toBeDefined()
  await terminal.unmount()

  const off = await runParade($, 'theme')
  expect(off.text).toContain('しまったよ')
  expect(calls.at(-1)).toBeNull()
  expect(held.get('theme')).toBe(false)
  const back2 = await mountBand($, 'desktop')
  expect(await back2.find({ type: 'Svg' })).toBeDefined()
})

test('テーマの背景は、入れてあれば次のセッションの始めにも描いてもらう。ほかのプラグインの背景には描かない', async ($, on) => {
  const calls = themes(on)
  boot(on, { store: veteran({}, { theme: true }) })
  await startSession($, 'desktop')
  expect(calls).toEqual([{ backdrop: { scene: 'parade', glass: { blur: 6, opacity: 0.5 } } }])

  const mine = await mountBackdrop($)
  expect(await mine.find({ type: 'Svg' })).toBeDefined()
  await mine.unmount()
  const theirs = await mountBackdrop($, 'someone-else')
  expect(await theirs.find({ type: 'Svg' })).toBeUndefined()
})

test('時間帯で空とあいさつが変わる', async ($, on) => {
  // テストの時計は UTC なので、朝 7 時から始める
  const { clock } = boot(on, { now: 7 * 3_600_000, store: veteran() })
  await startSession($, 'desktop')
  await clock.advance(400)
  const morning = await mountBand($, 'desktop')
  expect(await textOf(morning, /おはよう！今日もよろしくね/)).toBeDefined()
  expect(await svgOf(morning)).toContain('fill="#2a3560"')
  const terminal = await mountBand($, 'terminal')
  expect(await textOf(terminal, /おはよう/)).toBeDefined()
  // 端末の Client にも、朝の色（星と地面）を渡す
  const parade = (await terminal.find({ key: 'parade' }))?.props as { props: { palette?: { sky: number } } }
  expect(parade.props.palette?.sky).toBe(0x2a3560)
})

test('昼は青空で、星が出ない', async ($, on) => {
  const { clock } = boot(on, { now: 13 * 3_600_000, store: veteran() })
  await startSession($, 'desktop')
  await clock.advance(400)
  const day = await mountBand($, 'desktop')
  expect(await textOf(day, /こんにちは！なんでも言ってね/)).toBeDefined()
  const svg = await svgOf(day)
  expect(svg).toContain('fill="#1d3d63"')
  expect(svg).not.toContain('fill="#c4d8ef"')
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

  // 押したままなでると、絵の 6 ドット（端末は 6 マス）動くごとに 1 回
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

  // 押したままなでると、絵の 6 ドット（デスクトップは 4 マス）動くごとに 1 回
  for (const x of [16, 17, 18, 19]) await ui.pointer({ in: 'touch', type: 'move', x, y: 5, button: 'left' })
  await ui.pointer({ in: 'touch', type: 'up', x: 19, y: 5, button: 'left' })
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

test('端末でもデスクトップでも、Clawd と仲間の端まで当たり、同じ距離なでると 1 回', async ($, on) => {
  const { clock } = boot(on, { store: veteran() })
  await startSession($, 'terminal')
  await $.turn.start({ text: 'しらべて', turnId: 't1' })
  await spawnFriend($)
  await clock.advance(200)
  let total = 0
  const count = async (ui: Parameters<typeof textOf>[0]) => {
    await clock.advance(200)
    return Number((await textOf(ui, /なでなで \d+ 回目/))?.match(/\d+/)?.[0] ?? 0)
  }

  // どちらも絵のドットでは、仲間が 2〜12、Clawd が 14〜31（両脇 1 ドットまで当たる）
  const surfaces = [
    // 端末は 1 マス 1 ドット
    { surface: 'terminal' as const, layer: 'parade', size: { columns: 84, rows: 7 }, friendEnd: 12, leader: [13, 32], miss: 33, stroke: 6 },
    // デスクトップは 1 マス 1.5 ドット：マス 8 は 12 ドット、9 は 14、21 は 32、22 は 33
    { surface: 'desktop' as const, layer: 'touch', size: { columns: 120, rows: 7 }, friendEnd: 8, leader: [9, 21], miss: 22, stroke: 4 },
  ]
  for (const { surface, layer, size, friendEnd, leader, miss, stroke } of surfaces) {
    const ui = await mountBand($, surface)
    await ui.resize({ ...size, in: layer })
    const tap = (x: number) => ui.pointer({ in: layer, type: 'down', x, y: 3, button: 'left' }).then(() => ui.pointer({ in: layer, type: 'up', x, y: 3, button: 'left' }))

    for (const x of leader) {
      await tap(x)
      expect(await count(ui)).toBe(++total)
    }
    await tap(friendEnd)
    expect(await count(ui)).toBe(++total)
    expect(await textOf(ui, /なかまもよろこんでる/)).toBeDefined()
    await tap(miss)
    expect(await count(ui)).toBe(total)

    // 押したまま絵の 6 ドット動かすと、1 回なでたことになる
    await ui.pointer({ in: layer, type: 'down', x: 15, y: 3, button: 'left' })
    for (let x = 16; x < 15 + stroke; x++) await ui.pointer({ in: layer, type: 'move', x, y: 3, button: 'left' })
    expect(await count(ui)).toBe(++total)
    await ui.pointer({ in: layer, type: 'move', x: 15 + stroke, y: 3, button: 'left' })
    expect(await count(ui)).toBe(++total)
    await ui.pointer({ in: layer, type: 'up', x: 15 + stroke, y: 3, button: 'left' })
    await ui.unmount()
  }
})

test('季節と行事：/parade debug 12/25 でその日として描き（保存しない）、/parade debug today で今日にもどる（#41）', async ($, on) => {
  // テストの時計は 1970/1/1（UTC）なので、今日はお正月。サンタぼうしは持っているが、かぶっているのは王冠
  const { clock, held } = boot(on, { store: veteran({ owned: ['santa', 'crown'], hat: 'crown' }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountBand($, 'desktop')
  const terminal = await mountBand($, 'terminal')
  const hat = async () => ((await terminal.find({ key: 'parade' }))?.props as { props: { look: { hat: unknown }; calendar: unknown } }).props
  // お正月：門松（竹の緑）があり、ツリーは無い。ぼうしは選んだまま
  expect(await svgOf(ui)).toContain('#6dbb6a')
  expect(await svgOf(ui)).not.toContain('#2e8b57')
  expect((await hat()).look.hat).toBe('crown')
  expect((await hat()).calendar).toEqual({ season: 'winter', holiday: 'newYear' })

  expect((await runParade($, 'debug 12/25')).text).toBe('12/25（クリスマス・冬）として描くよ（/parade debug today で今日にもどる）')
  await clock.advance(200)
  // クリスマス：ツリーが立ち、サンタぼうしを持っているのでかぶる（保存の hat は王冠のまま）
  expect(await svgOf(ui)).toContain('#2e8b57')
  expect((await hat()).look.hat).toBe('santa')
  expect((held.get('game') as { hat: unknown } | undefined)?.hat ?? 'crown').toBe('crown')
  // 日付を変えても、当たり判定の枠の切り替え（/parade debug）はそのまま
  expect((await runParade($, 'debug')).text).toMatch(/ピンクの枠/)
  expect((await runParade($, 'debug 4/5')).text).toBe('4/5（春）として描くよ（/parade debug today で今日にもどる）')
  expect((await runParade($, 'debug 2/30')).text).toMatch(/^日付は 月\/日 で打ってね/)
  // なでなでもそのまま
  const touch = await mountTouchBand($)
  await petLeader(touch, clock, 1)
  expect(await textOf(touch, /なでなで 1 回目/)).toBeDefined()
  await touch.unmount()

  expect((await runParade($, 'debug today')).text).toBe('日付を今日にもどしたよ')
  await clock.advance(200)
  expect(await svgOf(ui)).not.toContain('#2e8b57')
  expect(await svgOf(ui)).toContain('#6dbb6a')
  expect((await hat()).look.hat).toBe('crown')
})

test('天気：/parade debug rain・雪 などでその天気で描き（保存しない）、/parade debug today で日付と天気を今日にもどす（#42）', async ($, on) => {
  // テストの時計は 1970/1/1 の 0 時（UTC）。お正月なので、天気は晴れ
  const { clock, held } = boot(on, { store: veteran() })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountBand($, 'desktop')
  const terminal = await mountBand($, 'terminal')
  const weather = async () => ((await terminal.find({ key: 'parade' }))?.props as { props: { weather: unknown } }).props.weather
  expect(await weather()).toBe('clear')
  // 雨の水たまり（地面の線）はまだ無い
  expect(await svgOf(ui)).not.toContain('#4f6f99')

  expect((await runParade($, 'debug rain')).text).toBe('雨の日として描くよ（ほんとうの天気ではないよ。/parade debug today でもどる）')
  await clock.advance(200)
  expect(await weather()).toBe('rain')
  expect(await svgOf(ui)).toContain('#4f6f99')
  // 日本語でも打てる。日付を選んでも、選んだ天気のまま
  expect((await runParade($, 'debug 雪')).text).toBe('雪の日として描くよ（ほんとうの天気ではないよ。/parade debug today でもどる）')
  expect((await runParade($, 'debug くもり')).text).toMatch(/^くもりの日として描くよ/)
  expect((await runParade($, 'debug 晴れ')).text).toMatch(/^晴れの日として描くよ/)
  expect((await runParade($, 'debug SNOW')).text).toMatch(/^雪の日として描くよ/)
  expect((await runParade($, 'debug 7/1')).text).toMatch(/^7\/1（夏）として描くよ/)
  await clock.advance(200)
  expect(await weather()).toBe('snow')
  expect((await runParade($, 'debug fog')).text).toMatch(/^日付は 月\/日 で打ってね.*rain/)
  // 天気はセーブに入らない
  await endSession($)
  expect(JSON.stringify([...held])).not.toMatch(/snow|weather/)

  expect((await runParade($, 'debug today')).text).toBe('日付と天気を今日にもどしたよ')
  await clock.advance(200)
  expect(await weather()).toBe('clear')
  expect(await svgOf(ui)).not.toContain('#4f6f99')
  // 天気を選んでいなければ、今までどおり
  expect((await runParade($, 'debug today')).text).toBe('日付を今日にもどしたよ')
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

test('贈り物：お礼を言ってごきげんになり、夢のプレゼントは飾られる（しまうこともできる）', async ($, on) => {
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
  expect(await textOf(shop, /全部グリーンのテスト ✓飾ってる/)).toBeDefined()
  expect(await textOf(shop, /飾っている数 庭 1\/3・空 0\/2/)).toBeDefined()
  // もう一度押すとしまい、また押すと飾る（贈り直しにはならない）
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts.at(-1)).toBe('全部グリーンのテスト をしまったよ')
  await clock.advance(200)
  expect(await svgOf(ui)).not.toContain('#3fbf5f')
  expect(await textOf(shop, /全部グリーンのテスト を飾る/)).toBeDefined()
  expect(await textOf(shop, /✓贈った（しまってある）/)).toBeDefined()
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts.at(-1)).toBe('全部グリーンのテスト を飾ったよ！')
  await clock.advance(200)
  expect(await svgOf(ui)).toContain('#3fbf5f')

  // 高すぎる夢はまだ贈れない
  await shop.press({ key: 'gift-noBugs' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
})

test('飾る・しまう：夢のプレゼントは庭 3 つ・空 2 つまで。流れ星・オーロラも出し入れでき、別のセッションの帯にも届く（#44）', async ($, on) => {
  const gifts = { greenTests: 1, telescope: 1, house: 1, library: 1, constellation: 1, moonTrip: 1, noBugs: 1 }
  const { clock, held, toasts } = boot(on, { store: veteran({ gifts, owned: ['shootingStars', 'aurora'] }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountBand($, 'desktop')
  const shop = await mountShop($, 120)
  const saved = () => held.get('game') as { shown: unknown; off: unknown; gifts: unknown }

  // まだ選んでいないセーブ：庭は高い 3 つ（月への旅・図書館・おうち）、空は 2 つ。旗と望遠鏡はしまってある
  expect(await textOf(shop, /飾っている数 庭 3\/3・空 2\/2/)).toBeDefined()
  expect(await textOf(shop, /小さなおうち ✓飾ってる/)).toBeDefined()
  expect(await textOf(shop, /全部グリーンのテスト を飾る/)).toBeDefined()
  let svg = await svgOf(ui)
  expect(svg).toContain('#b5523b')
  expect(svg).not.toContain('#3fbf5f')
  expect(svg).not.toContain('#8a8fa8')
  expect(svg).toContain('#1f6b55')

  // 庭がいっぱいなら断る
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts.at(-1)).toBe('庭はもういっぱい（3/3）だよ。先にどれかをしまってね')
  // 断ったら何も変わらない（保存にもまだ選んだものは無い）
  expect(saved().shown ?? null).toBeNull()

  // おうちをしまって、旗を飾る。贈ったことと ♡ の稼ぎはそのまま
  await shop.press({ key: 'gift-house' })
  expect(toasts.at(-1)).toBe('小さなおうち をしまったよ')
  await shop.press({ key: 'gift-greenTests' })
  expect(toasts.at(-1)).toBe('全部グリーンのテスト を飾ったよ！')
  expect(saved().shown).toEqual(['library', 'constellation', 'moonTrip', 'noBugs', 'greenTests'])
  expect(saved().gifts).toEqual(gifts)
  expect(await textOf(shop, /飾っている数 庭 3\/3・空 2\/2/)).toBeDefined()

  // オーロラをしまう（夢の枠とは別）
  await shop.press({ key: 'dress-aurora' })
  expect(toasts.at(-1)).toBe('オーロラ をしまったよ')
  expect(saved().off).toEqual(['aurora'])
  expect(await textOf(shop, /オーロラ を出す/)).toBeDefined()
  expect(await textOf(shop, /流れ星 ✓出てる/)).toBeDefined()
  await clock.advance(200)
  svg = await svgOf(ui)
  expect(svg).toContain('#3fbf5f')
  expect(svg).not.toContain('#b5523b')
  expect(svg).not.toContain('#1f6b55')

  // 別のセッションが、望遠鏡だけを飾ってオーロラを出し直して保存した。次の保存で、こちらの帯にも届く
  held.set('game', { ...(held.get('game') as object), shown: ['telescope'], off: [] })
  await clock.advance(6_000)
  svg = await svgOf(ui)
  expect(svg).toContain('#8a8fa8')
  expect(svg).not.toContain('#3fbf5f')
  expect(svg).toContain('#1f6b55')
  expect(await textOf(shop, /飾っている数 庭 1\/3・空 0\/2/)).toBeDefined()
  expect(saved().shown).toEqual(['telescope'])
})

test('星を贈る：何度でも贈れて値段が上がり、お礼を言って夜空に星が増える。強化には次の節目が出る', async ($, on) => {
  const { clock, held, toasts } = boot(on, { store: veteran({ hearts: 300_000_000, levels: { glove: 22 } }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountBand($, 'desktop')
  const shop = await mountShop($)
  const before = await svgOf(ui)

  // 強化の行に、次の節目（Lv25 で ×2）までの Lv が出る
  expect(await textOf(shop, /おかいもの（Lv25 ごとに効き目 2 倍）/)).toBeDefined()
  expect(await textOf(shop, /1 なでの ♡ \+1 · あと 3 Lv で ×2/)).toBeDefined()
  expect(await textOf(shop, /星を贈る 1億♡/)).toBeDefined()
  expect(await textOf(shop, /贈るたびに値段が上がる/)).toBeDefined()

  await shop.press({ key: 'gift-star' })
  expect(toasts).toContain('🌟 星を贈ったよ！夜空がまたひとつ明るくなる')
  await clock.advance(200)
  // お礼を言って星をかかえ、info には何個目か
  expect(await textOf(ui, /お星さま…！/)).toBeDefined()
  expect(await textOf(ui, /🎁 星 · 1 個目/)).toBeDefined()
  expect(await textOf(shop, /1 個贈った · ♡ の稼ぎ ×1.2/)).toBeDefined()
  expect(await textOf(shop, /星を贈る 1.6億♡/)).toBeDefined()
  expect((held.get('game') as { gifts: Record<string, number>; given: number }).gifts.star).toBe(1)
  expect((held.get('game') as { given: number }).given).toBe(100_000_000)

  await shop.press({ key: 'gift-star' })
  expect((held.get('game') as { gifts: Record<string, number> }).gifts.star).toBe(2)
  // 3 個目（2.56 億）は足りない
  await shop.press({ key: 'gift-star' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
  expect((held.get('game') as { gifts: Record<string, number> }).gifts.star).toBe(2)

  // かかえ終わっても、夜空に贈った星（白い芯と桃色の光）が残る
  await clock.advance(10_000)
  const after = await svgOf(ui)
  expect(after).not.toBe(before)
  expect(after).toContain('#ffb3d9')
})

test('複数のセッション：同時に星を贈ったら、数は合わせたぶん、♡ は順に贈った値段にそろえる', async ($, on) => {
  const { clock, held, toasts } = boot(on, { store: veteran({ hearts: 1_000_000_000 }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const shop = await mountShop($)

  // 別のセッションが同じ 10 億 ♡ から星を 1 個贈って保存した。こちらはまだそれを読んでいない
  const other = held.get('game') as Record<string, unknown>
  held.set('game', { ...other, hearts: 900_000_000, given: 100_000_000, gifts: { star: 1 }, lastGift: { id: 'star', at: 500 } })

  await shop.press({ key: 'gift-star' })
  expect(toasts).toContain('🌟 星を贈ったよ！夜空がまたひとつ明るくなる')
  const saved = held.get('game') as { hearts: number; given: number; gifts: Record<string, number> }
  expect(saved.gifts.star).toBe(2)
  // 1 個目（1 億）と 2 個目（1.6 億）を払ったことになる（放置収入などの端数は無い）
  expect(Math.round(saved.hearts)).toBe(740_000_000)
  expect(saved.given).toBe(260_000_000)
})

test('帯に出した贈り物を、ワンぽちで贈れる', async ($, on) => {
  const { clock, held, toasts } = boot(on, { store: veteran({ hearts: 1_000 }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const shop = await mountShop($)
  const wide = await mountTouchBand($)
  const narrow = await mountBand($, 'desktop', 60)
  const terminal = await mountBand($, 'terminal')
  const bands = [wide, narrow, terminal]
  // 広いデスクトップの札。手ざわり層のマス 67〜75（絵のドット 101〜113）にある
  const tapGift = async (x = 70) => {
    await wide.pointer({ in: 'touch', type: 'down', x, y: 1, button: 'left' })
    await wide.pointer({ in: 'touch', type: 'up', x, y: 1, button: 'left' })
  }
  const plain = await svgOf(wide)

  // 選ぶまでは、帯にボタンも札も無い。札の場所を押しても何も起きない
  for (const ui of bands) expect(await ui.find({ key: 'quick-gift' })).toBeUndefined()
  await tapGift()
  expect(toasts.some(t => t.includes('あげたよ'))).toBe(false)

  // ショップの ☆ でケーキを帯に出す。選んだものはすぐ保存する
  await shop.press({ key: 'fav-cake' })
  expect(toasts.at(-1)).toBe('🍰 いちごのショートケーキ を帯に出したよ！ワンぽちで贈れるよ')
  expect((held.get('game') as { favorite: unknown }).favorite).toBe('cake')
  await clock.advance(200)
  for (const ui of [narrow, terminal]) expect(await textOf(ui, /🍰 あげる 400♡/)).toBeDefined()
  // 広いデスクトップはボタンにせず（♡ の行が見切れないように）、夜空に札で描く
  expect(await wide.find({ key: 'quick-gift' })).toBeUndefined()
  expect(await svgOf(wide)).not.toBe(plain)
  expect(((await wide.find({ type: 'Svg' }))?.props as { alt: string }).alt).toMatch(/🍰 あげる 400♡/)
  // 札の列の外（Clawd より右の空）は贈らない
  await tapGift(66)
  await tapGift(76)
  expect(toasts.some(t => t.includes('あげたよ'))).toBe(false)

  // 札を押すと、お礼を言ってかかえる。ほかの帯ではボタンで（端末からも）
  await tapGift()
  expect(toasts).toContain('🎁 いちごのショートケーキ をあげたよ！')
  await clock.advance(200)
  expect(await textOf(wide, /ケーキ！？いいの！？/)).toBeDefined()
  await terminal.press({ key: 'quick-gift' })
  expect((held.get('game') as { gifts: Record<string, number> }).gifts.cake).toBe(2)

  // ♡ が足りなければ断る
  await narrow.press({ key: 'quick-gift' })
  expect(toasts.at(-1)).toMatch(/足りないよ/)
  expect((held.get('game') as { gifts: Record<string, number> }).gifts.cake).toBe(2)

  await tapGift(75)
  expect(toasts.at(-1)).toMatch(/足りないよ/)
  expect((held.get('game') as { gifts: Record<string, number> }).gifts.cake).toBe(2)

  // もう一度 ★ を押すと、帯から下ろす。札も消え、その場所を押しても贈らない
  await shop.press({ key: 'fav-cake' })
  expect(toasts.at(-1)).toBe('いちごのショートケーキ を帯から下ろしたよ')
  await clock.advance(200)
  for (const ui of bands) expect(await ui.find({ key: 'quick-gift' })).toBeUndefined()
  await tapGift()
  expect(toasts.at(-1)).toBe('いちごのショートケーキ を帯から下ろしたよ')
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

// ---- 同時の保存・買い物（#10） ----

test('複数のセッション：同じ王冠を同時に買ったら、払いすぎた ♡ を返す', async ($, on) => {
  const { clock, held, toasts } = boot(on, { store: veteran({ hearts: 10_000 }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const shop = await mountShop($)

  // 別のセッションが同じ 10,000 ♡ から王冠を買って保存した。こちらはまだそれを読んでいない
  const other = held.get('game') as Record<string, unknown>
  held.set('game', { ...other, hearts: 5_000, owned: ['crown'], hat: 'crown' })

  await shop.press({ key: 'dress-crown' })
  expect(toasts).toContain('王冠 を買ったよ！')
  const saved = held.get('game') as { hearts: number; owned: string[] }
  expect(saved.owned).toEqual(['crown'])
  // 2 回払った 5,000 ♡ のうち 1 回ぶんが返る（放置収入などの端数は無い）
  expect(Math.round(saved.hearts)).toBe(5_000)
})

test('複数のセッション：同時に買って ♡ が足りなくなったら、借金になって買えない', async ($, on) => {
  const { clock, held, toasts } = boot(on, { store: veteran({ hearts: 1_000 }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const shop = await mountShop($)
  const ui = await mountBand($, 'desktop')

  // 別のセッションが 1,000 ♡ のうち 800 ♡ を使った。こちらは同時に 300 ♡ のリボンを買う
  const other = held.get('game') as Record<string, unknown>
  held.set('game', { ...other, hearts: 200, levels: { stardust: 1 } })
  await shop.press({ key: 'dress-ribbon' })

  expect(Math.round((held.get('game') as { hearts: number }).hearts)).toBe(-100)
  await clock.advance(200)
  expect(await textOf(ui, /♡ -100 /)).toBeDefined()
  await shop.press({ key: 'buy-glove' })
  expect(toasts.at(-1)).toBe('♡ が 115 足りないよ')
})

test('複数のセッション：書いた直後に別のセッションが書いたら、そちらを取り込み、二重に足さない', async ($, on) => {
  const { clock, held, afterSet } = boot(on, { store: veteran({ hearts: 1_000 }) })
  await startSession($, 'desktop')
  await clock.advance(400)
  const ui = await mountTouchBand($)
  await petLeader(ui, clock, 3)

  // こちらが書いた直後に、それを読んだ別のセッションが ♡ を 5,000 足して書いた
  let raced = false
  afterSet.run = (key, value) => {
    if (key !== 'game' || raced) return
    raced = true
    held.set('game', { ...(value as object), hearts: (value as { hearts: number }).hearts + 5_000 })
  }
  await clock.advance(5_000)
  expect(raced).toBe(true)
  const first = (held.get('game') as { hearts: number }).hearts
  expect(first).toBeGreaterThan(6_000)
  // 次の保存を待たずに帯に映る
  expect(await textOf(ui, /♡ 6,0\d\d /)).toBeDefined()

  // 次の保存で、こちらのなでたぶんを二重に足したりしない
  await clock.advance(5_000)
  const second = (held.get('game') as { hearts: number }).hearts
  expect(second - first).toBeLessThan(1)
})

test('複数のセッション：放置収入を書いた直後に別のセッションが書いたら、こちらは払わない', async ($, on) => {
  const { clock, held, afterSet } = boot(on, { store: veteran({ levels: { stardust: 1 } }, { idlePaidAt: 1_000 }) })
  await startSession($, 'desktop')
  // 同じ時刻を読んだ別のセッションが、すぐあとに書いて（こちらのぶんもまとめて）払う
  afterSet.run = (key, value) => {
    if (key === 'idlePaidAt') held.set('idlePaidAt', (value as number) + 1)
  }
  await clock.advance(3_000)
  await endSession($)
  expect((held.get('game') as { hearts: number }).hearts).toBe(0)
})

// ---- きょうの日記（#43） ----

const HOUR = 3_600_000

test('きょうの日記：ターン・ツール・仲間・なでなでがショップに出て、別のセッションのぶんも届く。保存には数しか入らない（#43）', async ($, on) => {
  const { clock, held } = boot(on, { store: veteran() })
  on('tool.call', async () => ({ result: {} }))
  await startSession($, 'desktop')
  // 絵のために選んだ日（12/25）は、日記の日付には使わない。テストの時計は 1970/1/1（木）
  await runParade($, 'debug 12/25')
  await clock.advance(400)

  await $.turn.start({ text: 'ひみつのプロンプト', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'cat ひみつのファイル.txt' })
  await spawnFriend($, 'Explore', 'ひみつの仕事')
  await $.tool.call({ tool: 'Read', file_path: '/ひみつ/ファイル.ts', agentId: 'agent-1' })
  await completeTurn($, { turnId: 'x', agentId: 'agent-1' })
  await completeTurn($, { turnId: 't1', answer: 'できました', durationMs: 2 * HOUR + 10 * 60_000 })
  const band = await mountTouchBand($)
  await petLeader(band, clock, 2)
  await band.unmount()

  const shop = await mountShop($, 200)
  expect(await textOf(shop, /Clawd「きょうは 2 時間 10 分いっしょに働いたね。仲間も 1 匹来てくれた！」/)).toBeDefined()
  expect(await textOf(shop, /はたらいた 2 時間 10 分 · ターン 1 回 · ツール 2 回 · 仲間 1 匹 · なでなで 2 回/)).toBeDefined()
  expect(await textOf(shop, /1 日つづけていっしょ · いちばん長くて 1 日/)).toBeDefined()
  expect(await textOf(shop, /これまで いっしょに働いた 2 時間 10 分 · ターン 1 回 · ツール 2 回 · 仲間 1 匹/)).toBeDefined()
  // 7 日の棒：きょう（木）がいちばん高い
  const week = await shop.find({ key: 'diary-week' })
  expect(week).toBeDefined()
  expect(await textOf(shop, /^██$/)).toBeDefined()
  expect(await textOf(shop, /^木$/)).toBeDefined()

  // 別のセッションが同じ日に 1 ターン（30 分）働き、ツールを 5 回使って保存した
  const other = held.get('game') as { diary?: Record<string, number>; totals?: Record<string, number> }
  const add = (rec: Record<string, number> | undefined, more: Record<string, number>) =>
    Object.fromEntries([...new Set([...Object.keys(rec ?? {}), ...Object.keys(more)])].map(k => [k, (rec?.[k] ?? 0) + (more[k] ?? 0)]))
  held.set('game', {
    ...other,
    diary: add(other.diary, { '1970-01-01.turns': 1, '1970-01-01.tools': 5, '1970-01-01.workMs': 30 * 60_000 }),
    totals: add(other.totals, { turns: 1, tools: 5, workMs: 30 * 60_000 }),
  })
  await clock.advance(6_000)
  expect(await textOf(shop, /はたらいた 2 時間 40 分 · ターン 2 回 · ツール 7 回 · 仲間 1 匹 · なでなで 2 回/)).toBeDefined()
  expect(await textOf(shop, /これまで いっしょに働いた 2 時間 40 分 · ターン 2 回 · ツール 7 回/)).toBeDefined()

  // 保存した日記には、日付.数えるもの の鍵と数しか無い。プロンプト・ファイル・ツール・仲間の名前はどこにも書かない
  const saved = held.get('game') as { diary: Record<string, unknown>; totals: Record<string, unknown> }
  expect(saved.diary).toEqual({
    '1970-01-01.turns': 2,
    '1970-01-01.tools': 7,
    '1970-01-01.workMs': 2 * HOUR + 40 * 60_000,
    '1970-01-01.agents': 1,
    '1970-01-01.pets': 2,
  })
  for (const [k, v] of Object.entries(saved.diary)) {
    expect(DIARY_KEY.test(k)).toBe(true)
    expect(typeof v).toBe('number')
  }
  for (const v of Object.values(saved.totals)) expect(typeof v).toBe('number')
  expect(JSON.stringify([...held])).not.toMatch(/ひみつ|Bash|Read|Explore|できました/)
})

test('きょうの日記：日をまたいだターンは、終わった日に数える（#43）', async ($, on) => {
  // 1970/1/1 の 23:59:59（テストの時計は UTC）
  const { clock, held } = boot(on, { now: 24 * HOUR - 1_000, store: veteran() })
  await startSession($, 'desktop')
  await $.turn.start({ text: 'よる', turnId: 't1' })
  await clock.advance(2_000)
  await completeTurn($, { turnId: 't1', durationMs: 2_000 })
  const shop = await mountShop($, 200)
  expect(await textOf(shop, /きょうは 1 回いっしょにお話ししたね/)).toBeDefined()
  await endSession($)
  expect((held.get('game') as { diary: Record<string, number> }).diary).toEqual({ '1970-01-02.turns': 1, '1970-01-02.workMs': 2_000 })
})
