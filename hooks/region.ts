// 天気の地域（ショップで地名から選ぶ）。選んでいれば、その地域のほんとうの天気を Open-Meteo（https://open-meteo.com）から取る。
// 選んでいなければ、いままでどおり日付から決まるつくりものの天気（weather.ts の weatherAt）。
// ここは URL を作ることと、返ってきた JSON を読むことだけ（ネットに出るのは register.tsx の $.http.fetch）。
// 外に送るのは、探すときに打った地名と、選んだ地域の緯度経度（小数第 2 位に丸めた、だいたい 1km の粗さ）だけ

import type { LiveWeather, Region, Weather } from '../types'

// 地名の候補は 5 つまで
export const SEARCH_COUNT = 5
// 天気は 15 分ごとに取りに行く（ほかのセッションが取ったばかりなら、それを使う）
export const LIVE_EVERY_MS = 15 * 60 * 1000
// 取れなくなっても、最後に取れた天気を 2 時間までは使う。それより古ければ、つくりものの天気にもどる
export const LIVE_STALE_MS = 2 * 60 * 60 * 1000

// 緯度経度は小数第 2 位に丸める（天気にはこれで足り、家の場所までは分からない）
export const roundCoord = (v: number) => Math.round(v * 100) / 100

export const searchUrl = (name: string) =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=${SEARCH_COUNT}&language=ja&format=json`

export const forecastUrl = (region: Pick<Region, 'lat' | 'lon'>) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${region.lat}&longitude=${region.lon}&current=weather_code&timezone=auto`

// 候補の名前。「横浜市（神奈川県・日本）」「Paris（Île-de-France・フランス）」のように、都道府県（州）と国を添えて、同じ名前の街を見分ける
export function labelOf(name: string, admin1?: string, country?: string): string {
  const more = [admin1, country].filter((s): s is string => typeof s === 'string' && s !== '' && s !== name)
  return more.length > 0 ? `${name}（${[...new Set(more)].join('・')}）` : name
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

// 地名検索の答え（JSON の文字列）を、候補の地域にする。0 件なら []、読めなければ null。
// 丸めると同じ場所になる候補（公園と区など）は、先に出たほうだけ残す
export function parseSearch(text: string): Region[] | null {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const results = (body as { results?: unknown }).results
  if (results === undefined) return []
  if (!Array.isArray(results)) return null
  const seen = new Set<string>()
  const regions: Region[] = []
  for (const r of results as Record<string, unknown>[]) {
    if (typeof r !== 'object' || r === null || !isText(r.name) || !isNumber(r.latitude) || !isNumber(r.longitude)) continue
    const lat = roundCoord(r.latitude)
    const lon = roundCoord(r.longitude)
    if (seen.has(`${lat},${lon}`)) continue
    seen.add(`${lat},${lon}`)
    const admin1 = isText(r.admin1) ? r.admin1 : undefined
    const country = isText(r.country) ? r.country : undefined
    regions.push({ name: r.name, label: labelOf(r.name, admin1, country), lat, lon })
  }
  return regions.slice(0, SEARCH_COUNT)
}

// WMO の天気の番号（Open-Meteo の weather_code）を、晴れ・くもり・雨・雪にする。知らない番号は null。
// 日本の「晴れ」は雲が 8 割まで（気象庁）なので、「少し雲がある（2）」までは晴れにする
export function weatherOfCode(code: number): Weather | null {
  if (code === 0 || code === 1 || code === 2) return 'clear'
  if (code === 3 || code === 45 || code === 48) return 'cloudy'
  // 雪・雪あられ・にわか雪
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  // 霧雨・雨・凍る雨・にわか雨・雷雨
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rain'
  return null
}

// 天気の答え（JSON の文字列）の、いまの天気。読めなければ null
export function parseCurrent(text: string): Weather | null {
  try {
    const code = (JSON.parse(text) as { current?: { weather_code?: unknown } })?.current?.weather_code
    return isNumber(code) ? weatherOfCode(code) : null
  } catch {
    return null
  }
}

export const isSamePlace = (a: Pick<Region, 'lat' | 'lon'>, b: Pick<Region, 'lat' | 'lon'>) => a.lat === b.lat && a.lon === b.lon

// 保存から読んだ地域を確かめる（壊れていたり古い形なら、選んでいないことにする）
export function regionOf(saved: unknown): Region | null {
  if (typeof saved !== 'object' || saved === null) return null
  const r = saved as Record<string, unknown>
  if (!isText(r.name) || !isText(r.label) || !isNumber(r.lat) || !isNumber(r.lon)) return null
  return { name: r.name, label: r.label, lat: roundCoord(r.lat), lon: roundCoord(r.lon) }
}

// 保存から読んだ、いちばん新しく取れた天気（ほかのセッションが取ったものかもしれない）
export function liveOf(saved: unknown): LiveWeather | null {
  if (typeof saved !== 'object' || saved === null) return null
  const l = saved as Record<string, unknown>
  const weathers: Weather[] = ['clear', 'cloudy', 'rain', 'snow']
  if (!isNumber(l.lat) || !isNumber(l.lon) || !isNumber(l.at) || !weathers.includes(l.weather as Weather)) return null
  return { lat: l.lat, lon: l.lon, at: l.at, weather: l.weather as Weather }
}

// いま使える、ほんとうの天気。地域を選んでいて、その地域の天気が 2 時間以内に取れていれば、それ。無ければ null（つくりものの天気を使う）
export function liveWeatherOf(region: Region | null, live: LiveWeather | null, now: number): Weather | null {
  if (region === null || live === null || !isSamePlace(region, live)) return null
  return now - live.at <= LIVE_STALE_MS ? live.weather : null
}
