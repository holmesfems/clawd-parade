// 天気の地域：地名を探して候補から選ぶと、その地域のほんとうの天気（Open-Meteo）を使う。選んでいなければ、日付から決まる天気
import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { LIVE_EVERY_MS, LIVE_STALE_MS, labelOf, liveOf, liveWeatherOf, parseCurrent, parseSearch, regionOf, roundCoord, searchUrl, weatherOfCode } from '../hooks/region'
import { parseScene } from '../hooks/room'
import { boot, mountShop, runParade, startSession, textOf, veteran } from './helpers'

const YOKOHAMA = { name: '横浜市', label: '横浜市（神奈川県・日本）', lat: 35.43, lon: 139.65 }

// 地名検索の答え（Open-Meteo の形）
const found = (...results: Record<string, unknown>[]) => JSON.stringify({ results, generationtime_ms: 0.5 })
const yokohama = { name: '横浜市', latitude: 35.43333, longitude: 139.65, admin1: '神奈川県', country: '日本' }
const aomori = { name: '横浜', latitude: 41.08333, longitude: 141.25, admin1: '青森県', country: '日本' }

test('天気の番号を、晴れ・くもり・雨・雪にする（雲が少しあるまでは晴れ）', () => {
  expect([0, 1, 2].map(weatherOfCode)).toEqual(['clear', 'clear', 'clear'])
  expect([3, 45, 48].map(weatherOfCode)).toEqual(['cloudy', 'cloudy', 'cloudy'])
  expect([51, 61, 65, 66, 80, 95, 99].map(weatherOfCode)).toEqual(Array(7).fill('rain'))
  expect([71, 75, 77, 85, 86].map(weatherOfCode)).toEqual(Array(5).fill('snow'))
  expect(weatherOfCode(4)).toBeNull()
  expect(parseCurrent(JSON.stringify({ current: { time: '2026-11-21T12:00', weather_code: 63 } }))).toBe('rain')
  expect(parseCurrent('{"current":{}}')).toBeNull()
  expect(parseCurrent('<html>')).toBeNull()
})

test('地名検索の答えを、県と国を添えた候補にする。0 件は []、壊れていれば null', () => {
  expect(parseSearch(found(yokohama, aomori))).toEqual([YOKOHAMA, { name: '横浜', label: '横浜（青森県・日本）', lat: 41.08, lon: 141.25 }])
  // 見つからないと results が無い
  expect(parseSearch(JSON.stringify({ generationtime_ms: 0.3 }))).toEqual([])
  expect(parseSearch('oops')).toBeNull()
  // 丸めると同じ場所になる候補は 1 つに。緯度経度の無いものは捨てる
  expect(parseSearch(found(yokohama, { ...yokohama, name: '横浜市児童遊園地', latitude: 35.434 }, { name: 'x' }))).toHaveLength(1)
  // 県が無い・名前と同じなら、添えない
  expect(labelOf('東京都', '東京都', '日本')).toBe('東京都（日本）')
  expect(labelOf('Monaco')).toBe('Monaco')
  expect(roundCoord(139.6472)).toBe(139.65)
  expect(searchUrl(' 横浜市 ')).toContain(`name=${encodeURIComponent('横浜市')}&`)
})

test('保存した地域と天気を確かめて読み、取れた天気は 2 時間まで使う', () => {
  expect(regionOf(YOKOHAMA)).toEqual(YOKOHAMA)
  expect(regionOf({ name: '横浜市' })).toBeNull()
  expect(regionOf(null)).toBeNull()
  const live = { lat: 35.43, lon: 139.65, weather: 'rain' as const, at: 1_000 }
  expect(liveOf(live)).toEqual(live)
  expect(liveOf({ ...live, weather: 'hail' })).toBeNull()
  expect(liveWeatherOf(YOKOHAMA, live, 1_000 + LIVE_STALE_MS)).toBe('rain')
  expect(liveWeatherOf(YOKOHAMA, live, 1_001 + LIVE_STALE_MS)).toBeNull()
  // 別の地域の天気や、地域を選んでいないときは使わない
  expect(liveWeatherOf({ ...YOKOHAMA, lat: 41.08 }, live, 1_000)).toBeNull()
  expect(liveWeatherOf(null, live, 1_000)).toBeNull()
})

// ネットの答え。地名検索は answers.search、天気は answers.weather（null なら落ちる）。聞かれた URL を残す
function net(on: On) {
  const asked: string[] = []
  const answers: { search: string | null; weather: string | null } = { search: found(yokohama, aomori), weather: JSON.stringify({ current: { weather_code: 63 } }) }
  on('http.fetch', async (_$, e) => {
    asked.push(e.url)
    const body = e.url.includes('geocoding-api') ? answers.search : answers.weather
    if (body === null) throw new Error('offline')
    return { value: { status: 200, ok: true, headers: {}, text: body } }
  })
  return { asked, answers }
}

test('はじめは地域を選んでいない（日付から決まる天気）。ネットにもつながない', async ($, on) => {
  const { asked } = net(on)
  const { clock } = boot(on, { store: veteran() })
  await startSession($, 'desktop')
  await clock.advance(2_000)
  const shop = await mountShop($)
  expect(await textOf(shop, /天気の地域 · いまは日付から決まる/)).toBeDefined()
  expect(await shop.find({ key: 'weather-clear' })).toBeUndefined()
  expect(asked).toEqual([])
})

test('地名で探して候補から選ぶと、その地域のほんとうの天気になり、保存する。クリアでもどる', async ($, on) => {
  const { asked } = net(on)
  const calls: string[] = []
  on('theme.set', async (_$, e) => {
    if (e.backdrop?.scene) calls.push(e.backdrop.scene)
    return { value: { isDrawn: true as const, requestId: 'backdrop' } }
  })
  const { clock, held, toasts } = boot(on, { store: veteran() })
  await startSession($, 'desktop')
  await runParade($, 'theme')
  await clock.advance(400)
  const shop = await mountShop($)

  await shop.input({ key: 'weather-search', text: '横浜' })
  expect(await textOf(shop, /^横浜市（神奈川県・日本）$/)).toBeDefined()
  expect(await textOf(shop, /^横浜（青森県・日本）$/)).toBeDefined()

  await shop.press({ key: 'weather-pick-0' })
  expect(toasts).toContain('天気を 横浜市（神奈川県・日本） のほんとうの天気にしたよ！')
  expect(held.get('weatherRegion')).toEqual(YOKOHAMA)
  // 送るのは丸めた緯度経度だけ
  expect(asked.at(-1)).toContain('latitude=35.43&longitude=139.65&')
  expect(await textOf(shop, /いまは雨（/)).toBeDefined()
  expect(await shop.find({ key: 'weather-pick-0' })).toBeUndefined()
  // 背景のおへやも雨
  await clock.advance(1_000)
  expect(parseScene(calls.at(-1)!)!.weather).toBe('rain')

  await shop.press({ key: 'weather-clear' })
  expect(held.has('weatherRegion')).toBe(false)
  expect(await textOf(shop, /天気の地域 · いまは日付から決まる/)).toBeDefined()
})

test('見つからない・探せないときは、そう言う', async ($, on) => {
  const { answers } = net(on)
  boot(on, { store: veteran() })
  await startSession($, 'desktop')
  const shop = await mountShop($)
  answers.search = JSON.stringify({ generationtime_ms: 0.3 })
  await shop.input({ key: 'weather-search', text: '那覇' })
  expect(await textOf(shop, /「那覇」は見つからなかった。「市」「区」「町」まで/)).toBeDefined()
  answers.search = null
  await shop.input({ key: 'weather-search', text: '那覇市' })
  expect(await textOf(shop, /探せなかった/)).toBeDefined()
})

// 時計を何時間も進めるとテストが遅いので、ほかのセッションが前に取った天気を store に置いて確かめる
const NOW = 100_000_000
const saved = (at: number) => veteran({}, { weatherRegion: YOKOHAMA, liveWeather: { lat: 35.43, lon: 139.65, weather: 'snow', at } })
const forecasts = (asked: string[]) => asked.filter(u => u.includes('api.open-meteo.com')).length

test('15 分より古い天気は取り直す', async ($, on) => {
  const { asked } = net(on)
  const { clock } = boot(on, { now: NOW, store: saved(NOW - LIVE_EVERY_MS - 1) })
  await startSession($, 'desktop')
  const shop = await mountShop($)
  expect(await textOf(shop, /いまは雪（/)).toBeDefined()
  await clock.advance(1_000)
  expect(forecasts(asked)).toBe(1)
  expect(await textOf(shop, /いまは雨（/)).toBeDefined()
})

test('取れなくても 2 時間は前の天気。それより古いと、日付から決まる天気にもどる', async ($, on) => {
  const { asked, answers } = net(on)
  answers.weather = null
  const { clock } = boot(on, { now: NOW, store: saved(NOW - LIVE_STALE_MS + 60_000) })
  await startSession($, 'desktop')
  await clock.advance(1_000)
  expect(forecasts(asked)).toBe(1)
  const shop = await mountShop($)
  expect(await textOf(shop, /いまは雪（/)).toBeDefined()
  await clock.advance(60_000)
  expect(await textOf(shop, /まだ天気が取れていない/)).toBeDefined()
})

test('ほかのセッションが取ったばかりの天気は、取りに行かずに使う', async ($, on) => {
  const { asked } = net(on)
  const { clock } = boot(on, { now: 10_000, store: veteran({}, { weatherRegion: YOKOHAMA, liveWeather: { lat: 35.43, lon: 139.65, weather: 'snow', at: 9_000 } }) })
  await startSession($, 'desktop')
  await clock.advance(1_000)
  expect(asked).toEqual([])
  const shop = await mountShop($)
  expect(await textOf(shop, /いまは雪（/)).toBeDefined()
})
