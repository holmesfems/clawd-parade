// 絵を端末やデスクトップに渡す形へ変える。端末セル（encodeCells）・Text の並び（toRuns）・SVG（toSvg）への変換をまとめる。

import { hex } from './palette'
import type { Palette } from './palette'
import type { Grid } from './grid'

// ---- 端末セルへの変換 ----------------------------------------------------

const UPPER = 0x2580
const LOWER = 0x2584
const DEFAULT = 0x01000000

export function encodeCells(g: Grid): { columns: number; rows: number; cells: string } {
  const columns = g[0]?.length ?? 0
  const rows = Math.floor(g.length / 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < columns; x++) {
      const top = g[r * 2]![x] ?? null
      const bottom = g[r * 2 + 1]![x] ?? null
      const i = (r * columns + x) * 3
      if (top === null && bottom === null) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (bottom === null) words.set([UPPER, top!, DEFAULT], i)
      else if (top === null) words.set([LOWER, bottom, DEFAULT], i)
      else words.set([UPPER, top, bottom], i)
    }
  return { columns, rows, cells: base64(new Uint8Array(words.buffer)) }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!
    out += c === undefined ? '=' : B64[n & 63]!
  }
  return out
}

// ---- デスクトップ用の SVG ------------------------------------------------
// デスクトップはコードフォントの行の高さが半角ブロックと揃わず縞になるので、
// ドット絵は 1 ピクセル = 1 マスの SVG にして、夜空の窓に入れて描く

// palette は drawScene に渡したものと同じにする（背景の空の色）。
// fit が 'cover' なら、窓いっぱいに広げる（下の端にそろえ、はみ出たぶんは上と左右を切る。テーマの背景）
export function toSvg(g: Grid, pixel: number, palette: Palette, fit: 'cover' | null = null): { source: string; width: number; height: number } {
  const w = g[0]?.length ?? 0
  const h = g.length
  // 色ごとに 1 本の path にまとめる（横に続く同じ色は 1 つの長方形）
  const paths = new Map<number, string>()
  g.forEach((row, y) => {
    for (let x = 0; x < w; ) {
      const c = row[x] ?? null
      if (c === null) {
        x += 1
        continue
      }
      let end = x + 1
      while (end < w && row[end] === c) end += 1
      paths.set(c, `${paths.get(c) ?? ''}M${x} ${y}h${end - x}v1h${x - end}z`)
      x = end
    }
  })
  const body = [...paths].map(([c, d]) => `<path fill="${hex(c)}" d="${d}"/>`).join('')
  const width = w * pixel
  const height = h * pixel
  const size =
    fit === 'cover' ? 'width="100%" height="100%" preserveAspectRatio="xMidYMax slice"' : `width="${width}" height="${height}"`
  const corner = fit === 'cover' ? '' : ' rx="1.5"'
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${size} shape-rendering="crispEdges">` +
    `<rect width="${w}" height="${h}"${corner} fill="${hex(palette.sky)}"/>${body}</svg>`
  return { source, width, height }
}

export type Run = { text: string; fg?: string; bg?: string }

// 同じ色が続くセルをひとまとまりの Text にする
export function toRuns(g: Grid): Run[][] {
  const rows: Run[][] = []
  for (let r = 0; r * 2 + 1 < g.length; r++) {
    const runs: Run[] = []
    const top = g[r * 2]!
    const bottom = g[r * 2 + 1]!
    for (let x = 0; x < top.length; x++) {
      const t = top[x] ?? null
      const b = bottom[x] ?? null
      const cell: Run =
        t === null && b === null ? { text: ' ' } :
        b === null ? { text: '▀', fg: hex(t!) } :
        t === null ? { text: '▄', fg: hex(b) } :
        { text: '▀', fg: hex(t), bg: hex(b) }
      const last = runs.at(-1)
      if (last && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}
