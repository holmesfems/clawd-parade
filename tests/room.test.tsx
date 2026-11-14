// デスクトップの背景のおへや（/parade theme）。場面の名前・しごとの決めかた・絵と、/parade theme の流れ

import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { HOLD_MS, ROOM_ITEMS, activityOf, holdActivity, parseScene, roomSvg, sceneName, toolActivity } from '../hooks/room'
import type { Activity, RoomScene } from '../hooks/room'
import { boot, mountBand, mountShop, runParade, startSession, veteran } from './helpers'

const BASE: RoomScene = {
  activity: 'rest',
  friends: 0,
  time: 'night',
  weather: 'clear',
  season: 'autumn',
  holiday: null,
  character: 'clawd',
  hat: null,
  items: [],
  sky: { stars: 0, aurora: false, shootingStars: false, moonTrip: false, noBugs: false, telescope: false, library: false },
  side: 'right',
}
const FULL: RoomScene = {
  ...BASE,
  friends: 3,
  weather: 'snow',
  season: 'winter',
  holiday: 'christmas',
  character: 'neko',
  hat: 'crown',
  items: [...ROOM_ITEMS],
  sky: { stars: 2, aurora: true, shootingStars: true, moonTrip: true, noBugs: true, telescope: true, library: true },
  side: 'left',
}
const ACTIVITIES: Activity[] = ['rest', 'sleep', 'think', 'research', 'write', 'run', 'fight', 'wait', 'done', 'sad']

// ---- 場面の名前 ----

test('場面の名前は 64 文字までの英数字と - で、名前から同じ場面にもどせる', () => {
  for (const activity of ACTIVITIES) {
    for (const scene of [{ ...BASE, activity }, { ...FULL, activity }]) {
      const name = sceneName(scene)
      expect(name).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
      expect(parseScene(name)).toEqual(scene)
    }
  }
  expect(parseScene('lagoon')).toBeNull()
  expect(parseScene('r1-zz0-ncax-cx-0-0-R')).toBeNull()
})

// ---- しごと ----

test('ツールからしごとを決める：調べる・書く・動かす。MCP は名前の動詞で。ツールが無ければ考える', () => {
  expect(toolActivity('Grep')).toBe('research')
  expect(toolActivity('WebFetch')).toBe('research')
  expect(toolActivity('Edit')).toBe('write')
  expect(toolActivity('Bash')).toBe('run')
  expect(toolActivity('mcp__github__search_issues')).toBe('research')
  expect(toolActivity('mcp__github__create_pull_request')).toBe('write')
  expect(toolActivity('mcp__deploy__trigger')).toBe('run')
  expect(toolActivity('Agent')).toBe('think')
  expect(toolActivity(null)).toBe('think')
})

test('表情からしごとを決める。おわった・エラー・とめられたは、少したつとくつろぐにもどる', () => {
  const at = 1_000
  expect(activityOf({ kind: 'idle', at }, null, at)).toBe('rest')
  expect(activityOf({ kind: 'sleeping', at }, null, at)).toBe('sleep')
  expect(activityOf({ kind: 'permission', at }, 'Bash', at)).toBe('wait')
  expect(activityOf({ kind: 'waiting', at }, null, at)).toBe('wait')
  expect(activityOf({ kind: 'working', at }, 'Write', at)).toBe('write')
  expect(activityOf({ kind: 'done', at }, null, at + 1_000)).toBe('done')
  expect(activityOf({ kind: 'done', at }, null, at + 9_000)).toBe('rest')
  expect(activityOf({ kind: 'error', at }, null, at + 1_000)).toBe('fight')
  expect(activityOf({ kind: 'error', at }, null, at + 31_000)).toBe('rest')
  expect(activityOf({ kind: 'aborted', at }, null, at + 1_000)).toBe('sad')
  expect(activityOf({ kind: 'refusal', at }, null, at + 16_000)).toBe('rest')
})

test('しごとは 10 秒は続ける。おへんじ待ち・おわった・エラーなど知らせたいことと、待ち・ねむるから出るときはすぐ', () => {
  const start = holdActivity(null, 'rest', 0)
  expect(start).toEqual({ kind: 'rest', since: 0 })
  expect(holdActivity(start, 'research', 3_000)).toBe(start)
  expect(holdActivity(start, 'research', HOLD_MS)).toEqual({ kind: 'research', since: HOLD_MS })
  const research = { kind: 'research' as const, since: 0 }
  expect(holdActivity(research, 'write', 2_000)).toBe(research)
  expect(holdActivity(research, 'wait', 2_000)).toEqual({ kind: 'wait', since: 2_000 })
  expect(holdActivity(research, 'done', 2_000)).toEqual({ kind: 'done', since: 2_000 })
  expect(holdActivity({ kind: 'wait', since: 0 }, 'run', 1_000)).toEqual({ kind: 'run', since: 1_000 })
  expect(holdActivity({ kind: 'sleep', since: 0 }, 'rest', 1_000)).toEqual({ kind: 'rest', since: 1_000 })
})

// ---- 絵 ----

test('おへやの絵：同じ場面なら同じ SVG。しごとごとに違う絵。CSS で動き、動きを減らす設定では止まる。にぎやかでも上限に収まる', () => {
  expect(roomSvg(BASE)).toBe(roomSvg({ ...BASE }))
  const pictures = new Set(ACTIVITIES.map(activity => roomSvg({ ...BASE, activity })))
  expect(pictures.size).toBe(ACTIVITIES.length)
  const svg = roomSvg({ ...BASE, activity: 'write' })
  expect(svg).toContain('@keyframes')
  expect(svg).toContain('prefers-reduced-motion: reduce')
  // 窓の高さの 84% の床に、右下（左下）にそろえて置く
  expect(svg).toContain('preserveAspectRatio="xMaxYMax meet"')
  expect(roomSvg({ ...BASE, side: 'left' })).toContain('preserveAspectRatio="xMinYMax meet"')
  for (const activity of ACTIVITIES) {
    for (const time of ['morning', 'day', 'evening', 'night', 'lateNight'] as const) {
      expect(roomSvg({ ...FULL, activity, time }).length).toBeLessThan(60_000)
    }
  }
})

test('おへやのもの・夢のプレゼント・天気が絵に出る', () => {
  const plain = roomSvg(BASE)
  for (const id of ROOM_ITEMS) expect(roomSvg({ ...BASE, items: [id] })).not.toBe(plain)
  expect(roomSvg({ ...BASE, weather: 'rain' })).toContain('class="rain"')
  expect(roomSvg({ ...BASE, weather: 'snow' })).toContain('class="snow"')
  expect(roomSvg({ ...BASE, sky: { ...BASE.sky, aurora: true } })).toContain('class="au"')
  expect(roomSvg({ ...BASE, sky: { ...BASE.sky, library: true } })).not.toBe(plain)
})

// ---- /parade theme ----

// テーマを決める・外すエンジンの答え。決めたもの（null は外した）を順に残す
function themes(on: On) {
  const calls: { backdrop?: { scene: string }; overrideColorScheme?: string }[] = []
  on('theme.set', async (_$, e) => {
    calls.push(e as (typeof calls)[number])
    return { value: { isDrawn: true as const, requestId: 'backdrop' } }
  })
  on('theme.clear', async () => {
    calls.push({})
    return { value: { isDrawn: false as const, reason: 'cleared' } }
  })
  return calls
}

const sceneOf = (call: { backdrop?: { scene: string } } | undefined) => (call?.backdrop ? parseScene(call.backdrop.scene) : null)

const mountBackdrop = ($: Engine, scene: string, plugin = 'clawd-parade') =>
  $.ui.mount({ plugin: 'clawd-parade', surface: 'desktop', component: 'Backdrop', requestId: 'backdrop', props: { scene, plugin, glass: { blur: 8, opacity: 0.5 } } })

test('/parade theme で背景をおへやにし、帯はセリフとなでるボタンだけ。left・right で置く側。もう一度でしまう', async ($, on) => {
  const calls = themes(on)
  const { held } = boot(on, { store: veteran() })
  await startSession($, 'desktop')
  expect(calls).toEqual([])

  const turnedOn = await runParade($, 'theme')
  expect(turnedOn.text).toContain('おへやにしたよ')
  expect(held.get('theme')).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.overrideColorScheme).toBe('dark')
  expect(sceneOf(calls[0])).toMatchObject({ activity: 'rest', side: 'right', character: 'clawd' })

  // 背景は、場面の名前から描く（スクリプトの無い枠で、CSS が動く）
  const back = await mountBackdrop($, calls[0]!.backdrop!.scene)
  const svg = (await back.find({ type: 'Svg' }))?.props as { source: string; isInteractive?: boolean }
  expect(svg.isInteractive).toBe(true)
  expect(svg.source).toContain('@keyframes')
  await back.unmount()
  // ほかのプラグインの背景・読めない名前には描かない
  const theirs = await mountBackdrop($, calls[0]!.backdrop!.scene, 'someone-else')
  expect(await theirs.find({ type: 'Svg' })).toBeUndefined()
  await theirs.unmount()

  // デスクトップの帯は絵を出さず、なでるボタン
  const band = await mountBand($, 'desktop')
  expect(await band.find({ type: 'Svg' })).toBeUndefined()
  expect(await band.find({ key: 'pet' })).toBeDefined()
  await band.unmount()

  const left = await runParade($, 'theme left')
  expect(left.text).toContain('窓の左側')
  expect(held.get('themeSide')).toBe('left')
  expect(sceneOf(calls.at(-1))).toMatchObject({ side: 'left' })

  const off = await runParade($, 'theme')
  expect(off.text).toContain('しまったよ')
  expect(calls.at(-1)).toEqual({})
  expect(held.get('theme')).toBe(false)
  const full = await mountBand($, 'desktop')
  expect(await full.find({ type: 'Svg' })).toBeDefined()
})

test('場面が変わらないあいだは描き直さない。しごとは 10 秒続けてから変え、おへんじ待ちにはすぐ変える', async ($, on) => {
  const calls = themes(on)
  on('tool.call', async () => ({ result: {} }))
  const { clock } = boot(on, { store: veteran({}, { theme: true }) })
  await startSession($, 'desktop')
  expect(calls).toHaveLength(1)
  expect(sceneOf(calls[0])?.activity).toBe('rest')

  // コマが進み、♡ が貯まっても、同じ場面なら呼ばない
  await clock.advance(5_000)
  expect(calls).toHaveLength(1)

  // 調べものを始めても、くつろぐを 10 秒続けてから
  await $.turn.start({ text: 'しらべて', turnId: 't1' })
  await $.tool.call({ tool: 'Grep', pattern: 'x' })
  await clock.advance(1_000)
  expect(calls).toHaveLength(1)
  await clock.advance(HOLD_MS)
  expect(sceneOf(calls.at(-1))?.activity).toBe('research')
  const afterResearch = calls.length

  // 書きはじめてもすぐには変えない（数秒ごとに描き直さない）
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(2_000)
  expect(calls).toHaveLength(afterResearch)

  // 許可を待つ：すぐおへんじ待ちに
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } })
  await clock.advance(1_000)
  expect(sceneOf(calls.at(-1))?.activity).toBe('wait')
})

test('おへやのものをショップで買うと、背景のおへやに出る（きせかえの実績には数えない）', async ($, on) => {
  const calls = themes(on)
  const { clock } = boot(on, { store: veteran({ hearts: 100_000 }, { theme: true }) })
  await startSession($, 'desktop')
  const shop = await mountShop($, 120)
  await shop.press({ key: 'dress-lamp' })
  await clock.advance(1_000)
  expect(sceneOf(calls.at(-1))?.items).toEqual(['lamp'])
  // しまうと消える
  await shop.press({ key: 'dress-lamp' })
  await clock.advance(1_000)
  expect(sceneOf(calls.at(-1))?.items).toEqual([])
})
