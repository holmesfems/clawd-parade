// ドット絵の土台。ピクセルの格子（Grid）と、そこに点・文字の表・小物・スプライトを押す関数をまとめる。
// 色の名前やキャラの絵は知らない（palette.ts・sprites.ts・decor.ts がこれを使う）。

export type Px = number | null
export type Grid = Px[][]

export type Sprite = { w: number; h: number; px: Grid }

// 文字の表を絵に押すときの、文字 → 色。表に無い文字は透明
export type Ink = Readonly<Record<string, number>>

// ink で文字の表を押す関数を作る。isFlipped で左右反転。絵からはみ出たところは描かない
// 表は毎コマ同じもの（同じ配列）を押すことが多いので、色のあるドットの並びにして覚えておく（毎コマ文字を読み直さない）
export function stampWith(ink: Ink) {
  const compiled = new WeakMap<readonly string[], { dx: number; dy: number; w: number; color: number }[]>()
  const compile = (rows: readonly string[]) => {
    const dots: { dx: number; dy: number; w: number; color: number }[] = []
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        const color = ink[ch]
        if (color !== undefined) dots.push({ dx, dy, w: row.length, color })
      }),
    )
    compiled.set(rows, dots)
    return dots
  }
  return (g: Grid, rows: readonly string[], x: number, y: number, isFlipped = false) => {
    for (const { dx, dy, w, color } of compiled.get(rows) ?? compile(rows)) dot(g, isFlipped ? x + w - 1 - dx : x + dx, y + dy, color)
  }
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

// 0 以上 1 未満の、n ごとに決まった値（星の場所など、毎コマ同じにしたいばらつき）
export function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 2 ** 32
}

export function blit(g: Grid, s: Sprite, x: number, y: number) {
  s.px.forEach((row, dy) => row.forEach((c, dx) => c !== null && dot(g, x + dx, y + dy, c)))
}
