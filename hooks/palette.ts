// 色。Clawd・仲間・小物の色（C）、時間帯ごとの空と地面のパレット、仲間の毛色、色の計算（darken・mix・hex）をまとめる。

// Clawd・仲間・小物の色。時間帯では変えない
export const C = {
  body: 0xd97757,
  line: 0x5c2a1c,
  ear: 0xf2a7a0,
  cheek: 0xff8f8f,
  eye: 0x2b1b17,
  white: 0xffffff,
  heart: 0xff6b9a,
  spark: 0xffe066,
  bang: 0xff7a59,
  ask: 0xffd166,
  zzz: 0x9ec9ff,
  tear: 0x6ec6ff,
  nope: 0xff5c5c,
  feverGlow: 0xffb347,
}

// 場面の色（空・地面・星）。時間帯で切り替えられるよう、drawScene と toSvg が受け取る
export type Palette = {
  // SVG の背景（端末は塗らない）
  sky: number
  ground: number
  grass: number
  flower: number
  star: number
  starDim: number
  // 見える星の割合（0〜1）。昼は 0 で、星を描かない
  stars: number
  // 太陽：朝は右（東）の地平線から昇り、昼は空の上に小さく、夕方は左（西）に沈む。夜は出ない
  sun: 'rise' | 'noon' | 'set' | null
}

export const NIGHT: Palette = {
  sky: 0x1f2033,
  ground: 0x5a5a5a,
  grass: 0x6fbf6f,
  flower: 0xffb3d1,
  star: 0xffe38a,
  starDim: 0x8a86c9,
  stars: 1,
  sun: null,
}

// 時間帯。「時」（0〜23）から決める（timeOfDay）
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night' | 'lateNight'

// 朝 5〜9 時、昼 10〜15 時、夕方 16〜18 時、夜 19〜0 時、深夜 1〜4 時。
// 時刻のミリ秒からここで出すと、テストの結果が動かす環境のタイムゾーンで変わるので、「時」を受け取る
export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 16) return 'day'
  if (hour >= 16 && hour < 19) return 'evening'
  if (hour >= 1 && hour < 5) return 'lateNight'
  return 'night'
}

// 時間帯ごとの空の色。デスクトップでは空の上にセリフを重ねるので、どの空も、ふだんのセリフの色（#d97757）との
// コントラスト比が 3.5 以上になる暗さにする（夜は 5.1）
export const PALETTES: Record<TimeOfDay, Palette> = {
  // 明けがたの藍色。星が少し残る
  morning: { sky: 0x2a3560, ground: 0x5f5a66, grass: 0x7ccf7c, flower: 0xffc4dd, star: 0xfff0c2, starDim: 0x9da3d6, stars: 0.3, sun: 'rise' },
  // 昼の青空。星は見えない
  day: { sky: 0x1d3d63, ground: 0x6b6b6b, grass: 0x80d880, flower: 0xffb3d1, star: 0xffffff, starDim: 0xc4d8ef, stars: 0, sun: 'noon' },
  // 夕やけのむらさき。一番星が出はじめる
  evening: { sky: 0x43243d, ground: 0x5e4c50, grass: 0x6aa86a, flower: 0xffa8a8, star: 0xffd27a, starDim: 0xc792b0, stars: 0.25, sun: 'set' },
  night: NIGHT,
  // 深夜は空がいちばん暗い
  lateNight: { sky: 0x14152a, ground: 0x4a4a4a, grass: 0x5a9f5a, flower: 0xd99ab4, star: 0xffe38a, starDim: 0x6f6ba8, stars: 1, sun: null },
}
// 仲間の毛色。サブエージェントの種類ごとに決まる
const COATS: Record<string, number> = {
  Explore: 0x7eb6ff,
  Plan: 0xb99cff,
  'general-purpose': 0x8fd694,
  fork: C.body,
}
const SPARE_COATS = [0xffd166, 0xff9ec7, 0x6fd6cf, 0xc8a2ff, 0xffa96b]

export function coatOf(type: string): number {
  const known = COATS[type]
  if (known !== undefined) return known
  let hash = 0
  for (const ch of type) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return SPARE_COATS[hash % SPARE_COATS.length] ?? 0xffd166
}

export const darken = (rgb: number, k: number) =>
  (Math.round(((rgb >> 16) & 255) * k) << 16) |
  (Math.round(((rgb >> 8) & 255) * k) << 8) |
  Math.round((rgb & 255) * k)

export const hex = (rgb: number) => '#' + rgb.toString(16).padStart(6, '0')

// 色 a を b へ t だけ寄せる
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
