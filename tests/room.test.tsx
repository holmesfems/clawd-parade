// デスクトップの背景のおへや（/parade theme）。場面の名前・しごとの決めかた・絵と、/parade theme の流れ

import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { HOLD_MS, REST_TURN_MS, ROOM_ITEMS, STAY_MS, VARIANTS, WALK_MS, activityOf, crewOf, holdActivity, parseScene, roomSvg, sceneName, toolActivity, variantOf } from '../hooks/room'
import type { VariantTable } from '../hooks/room'
import type { Activity, RoomScene } from '../hooks/room'
import { boot, mountBand, mountShop, runParade, startSession, veteran } from './helpers'

const BASE: RoomScene = {
  activity: 'rest',
  variant: 'sofa',
  friends: 0,
  arriving: 0,
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
  arriving: 2,
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
    for (const scene of [{ ...BASE, activity, variant: VARIANTS[activity][0]! }, { ...FULL, activity, variant: VARIANTS[activity][0]! }]) {
      const name = sceneName(scene)
      expect(name).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
      expect(parseScene(name)).toEqual(scene)
    }
  }
  expect(parseScene('lagoon')).toBeNull()
  expect(parseScene('r1-zz0-ncax-cx-0-0-R')).toBeNull()
  // 1.14.0 までの名前（r1）と、無い絵の番号は読まない
  expect(parseScene('r1-re0-dcax-cx-0-0-R')).toBeNull()
  expect(parseScene('r2-rez0-dcax-cx-0-0-R')).toBeNull()
  // 絵の番号は、しごとの名前のすぐあとの 1 文字
  expect(sceneName(BASE).startsWith('r2-re00-')).toBe(true)
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
  // 絵が 1 つずつの表で、しごとの続け方だけを確かめる
  const one = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, v.slice(0, 1)])) as unknown as VariantTable
  const hold = (prev: Parameters<typeof holdActivity>[0], next: Activity, now: number) => holdActivity(prev, next, now, null, one)
  const held = (kind: Activity, since: number) => ({ kind, since, variant: VARIANTS[kind][0]!, variantSince: since })
  const start = hold(null, 'rest', 0)
  expect(start).toEqual(held('rest', 0))
  expect(hold(start, 'research', 3_000)).toBe(start)
  expect(hold(start, 'research', HOLD_MS)).toEqual(held('research', HOLD_MS))
  const research = held('research', 0)
  expect(hold(research, 'write', 2_000)).toBe(research)
  expect(hold(research, 'wait', 2_000)).toEqual(held('wait', 2_000))
  expect(hold(research, 'done', 2_000)).toEqual(held('done', 2_000))
  expect(hold(held('wait', 0), 'run', 1_000)).toEqual(held('run', 1_000))
  expect(hold(held('sleep', 0), 'rest', 1_000)).toEqual(held('rest', 1_000))
  // 1.14.0 までの値（variant が無い）は、いつもの絵として読む
  expect(holdActivity({ kind: 'write', since: 0 }, 'write', 1_000)).toEqual(held('write', 0))
})

test('しごとのバリエーション：ツールの意味で決まる絵は固定、それ以外はほかの絵から選ぶ。くつろぐは 60 秒ごとに変わる', () => {
  // 絵を足したつもりの表で確かめる（いまの VARIANTS は、どのしごとも絵が 1 つ）
  const table: VariantTable = { ...VARIANTS, rest: ['sofa', 'phone', 'game', 'mug'], research: ['book', 'web', 'folders', 'flask'] }
  expect(variantOf('research', 'WebSearch', null, 0, table)).toBe('web')
  expect(variantOf('research', 'Glob', null, 0, table)).toBe('folders')
  // ツールに結びついた絵（web・folders）は、ほかのツールのときには選ばない
  for (let t = 0; t < 40_000; t += 1_000) expect(['book', 'flask']).toContain(variantOf('research', 'Read', null, t, table))
  // 絵が無ければ、ツールに結びつけていても使わない
  expect(variantOf('research', 'WebSearch', null, 0, { ...VARIANTS, research: ['book'] })).toBe('book')
  // avoid の絵は選ばない
  for (let t = 0; t < 40_000; t += 1_000) expect(variantOf('rest', null, 'sofa', t, table)).not.toBe('sofa')

  // 同じしごとのまま、ツールの意味で決まる絵が変わったら（HOLD_MS たってから）変える
  const reading = holdActivity(null, 'research', 0, 'Read', table)
  expect(holdActivity(reading, 'research', 3_000, 'WebFetch', table)).toBe(reading)
  const web = holdActivity(reading, 'research', HOLD_MS, 'WebFetch', table)
  expect(web.variant).toBe('web')
  expect(web.since).toBe(0)
  // くつろぐは 60 秒ごとに、前と違う絵へ。寝るときはすぐ
  const rest = holdActivity(null, 'rest', 0, null, table)
  expect(holdActivity(rest, 'rest', REST_TURN_MS - 1, null, table)).toBe(rest)
  const turned = holdActivity(rest, 'rest', REST_TURN_MS, null, table)
  expect(turned.variant).not.toBe(rest.variant)
  expect(turned.variantSince).toBe(REST_TURN_MS)
  expect(holdActivity(turned, 'sleep', REST_TURN_MS + 1, null, table).kind).toBe('sleep')
})

test('来た仲間は、しばらく庭の道を歩いてから中に入る。すぐ用事が終わっても、中でひと息つくまではいる', () => {
  const none = { count: 0, arriving: 0, since: 0 }
  expect(crewOf(none, 0, 5_000)).toBe(none)
  const one = crewOf(none, 1, 1_000)
  expect(one).toEqual({ count: 1, arriving: 1, since: 1_000 })
  // 歩いているあいだは、そのまま
  expect(crewOf(one, 1, 1_000 + WALK_MS - 1)).toBe(one)
  // もう 1 匹来たら、2 匹とも歩いている（歩きなおし）
  expect(crewOf(one, 2, 3_000)).toEqual({ count: 2, arriving: 2, since: 3_000 })
  // 歩きおわったら中に入る
  const inside = crewOf(one, 1, 1_000 + WALK_MS)
  expect(inside).toEqual({ count: 1, arriving: 0, since: 1_000 })
  // 中にいる仲間がいるところへ来たら、来たぶんだけ歩く。3 匹まで
  expect(crewOf(inside, 5, 60_000)).toEqual({ count: 3, arriving: 2, since: 60_000 })
  // 歩いているうちに用事が終わっても、歩きおえて中に入り、ひと息つくまではいる
  expect(crewOf(one, 0, 2_000)).toBe(one)
  expect(crewOf(one, 0, 1_000 + WALK_MS)).toEqual({ count: 1, arriving: 0, since: 1_000 })
  expect(crewOf(inside, 0, 1_000 + STAY_MS - 1)).toBe(inside)
  expect(crewOf(inside, 0, 1_000 + STAY_MS)).toEqual({ count: 0, arriving: 0, since: 1_000 })
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
  expect(svg).toContain(`preserveAspectRatio="xMaxYMax meet"`)
  expect(roomSvg({ ...BASE, side: 'left' })).toContain('preserveAspectRatio="xMinYMax meet"')
  for (const activity of ACTIVITIES) {
    for (const time of ['morning', 'day', 'evening', 'night', 'lateNight'] as const) {
      expect(roomSvg({ ...FULL, activity, time }).length).toBeLessThan(60_000)
    }
  }
})

test('まばたきは目を閉じた体をまるごと重ね、ぼうしはその上。札はぼうしの上に上げる。動きを減らす設定でもコードの行・Zzz は見える', () => {
  // #51：まばたきの層に体の色が入っている（違うマスだけなら、閉じた目のまわりの数マスしかない）
  const blink = /<g class="blink">(.*?)<\/g>/.exec(roomSvg({ ...BASE, activity: 'write' }))?.[1] ?? ''
  expect(blink).toContain('fill="#d97757"')
  expect((blink.match(/M/g) ?? []).length).toBeGreaterThan(10)
  // #52：ぼうしがあると、札がぼうしの高さぶん上がる（札の絵が変わる）。ぼうしの層は札より後
  const plain = roomSvg({ ...BASE, activity: 'wait' })
  const crowned = roomSvg({ ...BASE, activity: 'wait', hat: 'crown' })
  expect(crowned).not.toBe(plain)
  expect(crowned.lastIndexOf('fill="#ffd166"')).toBeGreaterThan(crowned.indexOf('fill="#f5f0e6"'))
  // #53
  expect(plain).toContain('.ln,.zz,.wb{opacity:1}')
})

test('しらべるは、見開きの本をめくり、虫めがねで探す（「?」は出さない）。止まった絵では開いた本だけ', () => {
  const svg = roomSvg({ ...BASE, activity: 'research', variant: 'book' })
  for (const cls of ['pf pf1', 'pf pf2', 'pf pf3', 'seek']) expect(svg).toContain(`class="${cls}"`)
  // めくる紙は、見えない（opacity:0）ところから出す。動きを減らす設定では開いた本だけが残る
  expect(svg).toContain('.pf{opacity:0;')
  expect(svg).not.toContain('.pf{opacity:1')
  // 「?」は出さない（ふわふわ浮く「?」の層があった）
  expect(svg).not.toContain('class="float"')
  expect(roomSvg({ ...BASE, activity: 'research', variant: 'book', character: 'neko' })).toContain('class="seek"')
})

test('おうちの外：空・地面・道・おうち・庭を描く。歩いて来る仲間は道の上、残りはおへやの中。アプリで止まる書き方は使わない', () => {
  const svg = roomSvg({ ...BASE, friends: 3, arriving: 2 })
  expect(svg).toContain('url(#sk)')
  expect(svg).toContain('class="cloud"')
  expect(svg).toContain('class="smoke"')
  expect(svg.match(/class="come"/g)).toHaveLength(2)
  expect(roomSvg({ ...BASE, friends: 3, arriving: 2, side: 'left' }).match(/class="come rev"/g)).toHaveLength(2)
  expect(roomSvg({ ...BASE, friends: 3 })).not.toContain('class="come')
  // 歩いている仲間のぶん、中ではねる仲間は少ない
  const hops = (source: string) => source.match(/class="hop"/g)?.length ?? 0
  expect(hops(roomSvg({ ...BASE, friends: 3 })) - hops(svg)).toBe(2)
  // 雪の日は外にも降る。季節で庭が変わる
  // 雨は斜めの 3 層（遠いほどうすく遅い）としぶき、雪は 2 層（#50）
  const rain = roomSvg({ ...BASE, weather: 'rain' })
  for (const id of ['rain0', 'rain1', 'rain2']) expect(rain).toContain(`class="${id}"`)
  expect(rain.match(/transform="skewX\(-1\d\)"/g)).toHaveLength(3)
  const snow = roomSvg({ ...BASE, weather: 'snow' })
  for (const id of ['snow0', 'snow1']) expect(snow).toContain(`class="${id}"`)
  expect(snow).not.toContain('skewX')
  expect(roomSvg(BASE)).not.toContain('class="rain0"')
  expect(new Set((['spring', 'summer', 'autumn', 'winter'] as const).map(season => roomSvg({ ...BASE, season }))).size).toBe(4)
  // アプリの背景で、CSS のアニメーションが全部止まる書き方（docs/backdrop-investigation.md）
  for (const scene of [BASE, FULL, { ...FULL, weather: 'rain' as const }, { ...FULL, weather: 'snow' as const }]) {
    const source = roomSvg(scene)
    expect(source).not.toContain('crispEdges')
    expect(source).not.toMatch(/dvw/)
  }
})

test('くつろぐの絵（#57）：スマホ・ゲーム・マグ・音楽・体操。どれも違う絵で、場面の名前から同じ絵にもどせる。Clawd とねこの両方', () => {
  expect(VARIANTS.rest).toEqual(['sofa', 'phone', 'game', 'mug', 'music', 'stretch'])
  for (const character of ['clawd', 'neko'] as const) {
    const pictures = new Set(VARIANTS.rest.map(variant => roomSvg({ ...BASE, character, variant })))
    expect(pictures.size).toBe(VARIANTS.rest.length)
  }
  for (const variant of VARIANTS.rest) expect(parseScene(sceneName({ ...FULL, variant }))).toEqual({ ...FULL, variant })
  expect(roomSvg({ ...BASE, variant: 'music' }).match(/class="zz"/g)).toHaveLength(3)
  expect(roomSvg({ ...BASE, variant: 'stretch' })).toContain('class="hero squat"')
  expect(roomSvg({ ...BASE, variant: 'game' })).toContain('class="hero jig"')
})

test('しらべるの絵（#58）：web 検索は WebSearch・WebFetch、フォルダ探しは Grep・Glob・LS のとき。ほかは本か実験', () => {
  expect(VARIANTS.research).toEqual(['book', 'web', 'folders', 'flask'])
  expect(variantOf('research', 'WebFetch', null, 0)).toBe('web')
  expect(variantOf('research', 'Grep', null, 0)).toBe('folders')
  for (let t = 0; t < 30_000; t += 1_000) expect(['book', 'flask']).toContain(variantOf('research', 'Read', null, t))
  const research = { ...BASE, activity: 'research' as const }
  for (const character of ['clawd', 'neko'] as const) {
    expect(new Set(VARIANTS.research.map(variant => roomSvg({ ...research, character, variant }))).size).toBe(4)
  }
  // 虫めがねは本のときは Clawd の層（seek）、フォルダ探しのときは床を順に見る（scan）
  expect(roomSvg({ ...research, variant: 'book' })).toContain('class="seek"')
  expect(roomSvg({ ...research, variant: 'folders' })).toContain('class="scan"')
  expect(roomSvg({ ...research, variant: 'web' })).not.toContain('class="seek"')
  // フォルダ探しのとき、仲間はフォルダの上ではねない
  const hops = roomSvg({ ...research, variant: 'folders', friends: 3 }).match(/class="hop"/g)?.length ?? 0
  expect(hops).toBeLessThan(3)
})

test('かく・うごかす・かんがえるの絵（#58）：組み立て・料理、計器パネル・歯車 2 つ、ホワイトボード。どれも違う絵で、Clawd とねこの両方', () => {
  expect(VARIANTS.write).toEqual(['type', 'build', 'cook'])
  expect(VARIANTS.run).toEqual(['gears', 'panel'])
  expect(VARIANTS.think).toEqual(['desk', 'board'])
  for (const activity of ['write', 'run', 'think'] as const) {
    for (const character of ['clawd', 'neko'] as const) {
      const pictures = new Set(VARIANTS[activity].map(variant => roomSvg({ ...BASE, activity, variant, character })))
      expect(pictures.size).toBe(VARIANTS[activity].length)
    }
    for (const variant of VARIANTS[activity]) expect(parseScene(sceneName({ ...FULL, activity, variant }))).toEqual({ ...FULL, activity, variant })
  }
  // キーボードを打つ手（fa quick・fb quick）とコードの行は、タイピングのときだけ
  const type = roomSvg({ ...BASE, activity: 'write', variant: 'type' })
  const build = roomSvg({ ...BASE, activity: 'write', variant: 'build' })
  expect(type.match(/class="ln"/g)?.length).toBeGreaterThan(0)
  expect(build).not.toContain('class="ln"')
  // ホワイトボードは、モニターのかわりに机の上。図を 4 つ、1 つずつ書く
  const board = roomSvg({ ...BASE, activity: 'think', variant: 'board' })
  for (const i of [1, 2, 3, 4]) expect(board).toContain(`class="wb wb${i}"`)
  expect(board).toContain('class="pen"')
  expect(board).toContain('.ln,.zz,.wb{opacity:1}')
  // 歯車 2 つは逆に回る
  expect(roomSvg({ ...BASE, activity: 'run', variant: 'gears' })).toContain('class="spin rev"')
})

test('外のにぎやかさ：鳥（昼の晴れ・くもり）・遠くの丘・煙 3 つ・道を通るねこ（雨と雪はお休み）・庭の季節の生きもの', () => {
  const day = roomSvg({ ...BASE, time: 'day' })
  expect(day.match(/<g class="cloud" fill="#3a3f55"/g)).toHaveLength(2)
  expect(roomSvg({ ...BASE, time: 'night' })).not.toContain('fill="#3a3f55"')
  expect(roomSvg({ ...BASE, time: 'day', weather: 'rain' })).not.toContain('fill="#3a3f55"')
  expect(day).toContain('preserveAspectRatio="none"')
  expect(day.match(/class="smoke"/g)).toHaveLength(3)
  expect(day).toContain('class="stroll"')
  expect(roomSvg({ ...BASE, weather: 'snow' })).not.toContain('class="stroll"')
  expect(roomSvg({ ...BASE, time: 'day', season: 'spring' })).toContain('class="flit"')
  expect(roomSvg({ ...BASE, season: 'autumn' }).match(/class="leaf"/g)).toHaveLength(3)
})

test('おへやのもの・夢のプレゼント・天気が絵に出る', () => {
  const plain = roomSvg(BASE)
  for (const id of ROOM_ITEMS) expect(roomSvg({ ...BASE, items: [id] })).not.toBe(plain)
  expect(roomSvg({ ...BASE, weather: 'rain' })).toContain('class="rainw"')
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

test('/parade debug act で、しごとと絵を選んで背景に描き（保存しない）、off で Claude のようすにもどす（#56）', async ($, on) => {
  const calls = themes(on)
  boot(on, { store: veteran() })
  await startSession($, 'desktop')
  await runParade($, 'theme')
  expect(VARIANTS.rest).toContain(sceneOf(calls.at(-1))!.variant)
  expect((await runParade($, 'debug act research')).text).toBe('背景を「しらべる（book）」で描くよ（/parade debug act off でもどる）')
  expect(sceneOf(calls.at(-1))).toMatchObject({ activity: 'research', variant: 'book' })
  expect((await runParade($, 'debug act research nope')).text).toBe(`しらべるの絵は ${VARIANTS.research.join('・')} だよ`)
  expect((await runParade($, 'debug act')).text).toContain('しごとを選んでね')
  expect((await runParade($, 'debug act rest stretch')).text).toBe('背景を「くつろぐ（stretch）」で描くよ（/parade debug act off でもどる）')
  expect(sceneOf(calls.at(-1))).toMatchObject({ activity: 'rest', variant: 'stretch' })
  expect((await runParade($, 'debug act off')).text).toBe('背景のしごとを、Claude のようすにもどしたよ')
  expect(sceneOf(calls.at(-1))).toMatchObject({ activity: 'rest' })
})

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
