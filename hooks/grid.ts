// ドット絵の土台。ピクセルの格子（Grid）と、そこに点・文字の表・小物・スプライトを押す関数をまとめる。
// 色の名前やキャラの絵は知らない（palette.ts・sprites.ts・decor.ts がこれを使う）。

export type Px = number | null
export type Grid = Px[][]

export type Sprite = { w: number; h: number; px: Grid }

// 文字の表を絵に押すときの、文字 → 色。表に無い文字は透明
export type Ink = Readonly<Record<string, number>>

// ink で文字の表を押す関数を作る。isFlipped で左右反転。絵からはみ出たところは描かない
export function stampWith(ink: Ink) {
  return (g: Grid, rows: readonly string[], x: number, y: number, isFlipped = false) =>
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const color = ink[ch]
        if (color !== undefined) dot(g, isFlipped ? x + row.length - 1 - dx : x + dx, y + dy, color)
      }),
    )
}

export function dot(g: Grid, x: number, y: number, color: number) {
  const line = g[y]
  if (line && x >= 0 && x < line.length) line[x] = color
}

const GLYPHS: Record<string, string[]> = {
  '?': ['###', '..#', '.##', '...', '.#.'],
  '!': ['#', '#', '#', '.', '#'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  z: ['##', '.#', '#.', '##'],
  heart: ['.#.#.', '#####', '.###.', '..#..'],
  spark: ['.#.', '###', '.#.'],
  tiny: ['#'],
  x: ['#.#', '.#.', '#.#'],
  drop: ['.#', '##'],
  small: ['#.#', '###', '.#.'],
}

// 小物は 1 色。色ごとの押す関数は、毎コマ作らないよう取っておく
const glyphStamps = new Map<number, ReturnType<typeof stampWith>>()

export function put(g: Grid, glyph: string, x: number, y: number, color: number) {
  let stampGlyph = glyphStamps.get(color)
  if (!stampGlyph) glyphStamps.set(color, (stampGlyph = stampWith({ '#': color })))
  stampGlyph(g, GLYPHS[glyph] ?? [], x, y)
}

export function blit(g: Grid, s: Sprite, x: number, y: number) {
  s.px.forEach((row, dy) => row.forEach((c, dx) => c !== null && dot(g, x + dx, y + dy, c)))
}
