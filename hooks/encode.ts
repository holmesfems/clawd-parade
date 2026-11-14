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

// 色ごとに 1 本の path にまとめる（横に続く同じ色は 1 つの長方形）。colorAt が null のマスは描かない
function pathsOf(w: number, h: number, colorAt: (x: number, y: number) => number | null): string {
  const paths = new Map<number, string>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; ) {
      const c = colorAt(x, y)
      if (c === null) {
        x += 1
        continue
      }
      let end = x + 1
      while (end < w && colorAt(end, y) === c) end += 1
      paths.set(c, `${paths.get(c) ?? ''}M${x} ${y}h${end - x}v1h${x - end}z`)
      x = end
    }
  }
  return [...paths].map(([c, d]) => `<path fill="${hex(c)}" d="${d}"/>`).join('')
}

// palette は drawScene に渡したものと同じにする（背景の空の色）
export function toSvg(g: Grid, pixel: number, palette: Palette): { source: string; width: number; height: number } {
  const w = g[0]?.length ?? 0
  const h = g.length
  const body = pathsOf(w, h, (x, y) => g[y]?.[x] ?? null)
  const width = w * pixel
  const height = h * pixel
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${width}" height="${height}" shape-rendering="crispEdges">` +
    `<rect width="${w}" height="${h}" rx="1.5" fill="${hex(palette.sky)}"/>${body}</svg>`
  return { source, width, height }
}

// テーマの背景：コマを何枚か 1 つの SVG に入れ、CSS でめくって動かす（描き直さないので、チカチカしない）。
// 1 枚目を下地に描き、2 枚目からは 1 枚目と違うマスだけを重ねて、自分の番のあいだだけ見せる。
// 窓いっぱいに空と地面（groundFrom の行から下）を伸ばして塗り、絵は右下に寄せて、窓の高さに合わせて置く。
// 横長の窓では絵の左があき、左のサイドバーの下にはみんなが来ない（縦長の窓では、絵は窓の幅に合わせて下に）
export function toAnimatedSvg(frames: Grid[], frameMs: number, palette: Palette, groundFrom: number): string {
  const first = frames[0] ?? []
  const w = first[0]?.length ?? 0
  const h = first.length
  const n = frames.length
  const at = (g: Grid, x: number, y: number) => g[y]?.[x] ?? null
  const base = pathsOf(w, h, (x, y) => at(first, x, y))
  // 何も無いマスは空の色で塗り、1 枚目のものを隠す
  const layers = frames
    .slice(1)
    .map((g, i) => {
      const d = pathsOf(w, h, (x, y) => {
        const c = at(g, x, y)
        return c === at(first, x, y) ? null : (c ?? palette.sky)
      })
      return `<g class="f" style="animation-delay:${(i + 1) * frameMs}ms">${d}</g>`
    })
    .join('')
  const cycle = n * frameMs
  const slot = (100 / n).toFixed(3)
  const style =
    `<style>.f{opacity:0;animation:f ${cycle}ms steps(1,end) infinite}` +
    `@keyframes f{0%{opacity:1}${slot}%{opacity:0}100%{opacity:0}}</style>`
  // 窓いっぱいの空と地面。縦は絵と同じ行数にして伸ばすので、横長の窓では地面の高さが絵とそろう
  const ground =
    `<svg width="100%" height="100%" viewBox="0 0 1 ${h}" preserveAspectRatio="none">` +
    `<rect width="1" height="${h}" fill="${hex(palette.sky)}"/>` +
    `<rect y="${groundFrom}" width="1" height="${h - groundFrom}" fill="${hex(palette.ground)}"/></svg>`
  const picture =
    `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMaxYMax meet">` +
    `<rect width="${w}" height="${h}" fill="${hex(palette.sky)}"/>${base}${layers}</svg>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" shape-rendering="crispEdges">` +
    `${style}${ground}${picture}</svg>`
  )
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
