// 星と節目の数字の決め方（#39）。tests/simulate.ts で毎日の遊び方をまねて、♡ がどのくらいの速さで増えるかを見る。
// 遊び方：1 日 8 時間開いて、うち 4 時間 Claude が働く（ツールは 20 秒に 1 回、はじめの 1 時間はサブエージェント 2 匹）。
// なでるのは 1 日 500 回（50 回ずつ。フィーバーも起きる）。買い物は「♡ 1 あたりでいちばん稼ぎが増えるもの」を買えしだい買う
// （1.7.0 から、まだ贈っていない夢のプレゼントも買う。10 億からの 4 つの夢を足しても、下の帯に収まることを確かめる）
import { expect, test } from 'claude-code/testing'

import type { Game } from '../types'
import { DREAMS, STAR, dreamsOf, newGame, starCount, starPrice } from '../hooks/game'
import { VETERAN_DREAMS, VETERAN_LEVELS, WORKDAY, levelsCost, playDay, veteranGame } from './simulate'
import type { Plan } from './simulate'

const TRILLION = 1e12
const KEI = 1e16

// start から maxDays 日遊んで、日ごとのゲームを返す
const days = (start: Game, maxDays: number, stop: (g: Game) => boolean = () => false, plan: Plan = WORKDAY) => {
  const out: Game[] = []
  let g = start
  for (let day = 0; day < maxDays; day++) {
    g = playDay(g, day, plan)
    out.push(g)
    if (stop(g)) break
  }
  return out
}

// 稼いだ ♡ が goal に届いた日（1 日目から数える）。届かなければ Infinity
const reachedOn = (run: Game[], goal: number) => {
  const i = run.findIndex(g => g.earned >= goal)
  return i < 0 ? Infinity : i + 1
}

// 1 億を稼いだ人（一度きりのものは全部持っていて、♡ は 1 億）が 1 京を超えて少し遊ぶまで
const veteranRun = days(veteranGame(), 150, g => g.earned >= KEI * 10)

test('はじめのセーブ：強化の Lv は 1 億を稼いだ人がそろえていそうな値段', () => {
  const cost = levelsCost(VETERAN_LEVELS)
  expect(cost).toBeGreaterThan(1e6)
  expect(cost).toBeLessThan(1e8)
})

test('1 億を稼いだ人は、2〜3 週間ほどで 1 兆に届く', () => {
  const day = reachedOn(veteranRun, TRILLION)
  expect(day).toBeGreaterThanOrEqual(10)
  expect(day).toBeLessThanOrEqual(25)
})

test('1 兆のあとも伸び続け、1 京にも届く（1 日では届かず、いつまでも届かないこともない）', () => {
  const trillion = reachedOn(veteranRun, TRILLION)
  const kei = reachedOn(veteranRun, KEI)
  expect(kei - trillion).toBeGreaterThanOrEqual(7)
  expect(kei).toBeLessThanOrEqual(90)
  // 1 京のあとの 10 日でも、まだ倍より多く増える
  const after = veteranRun[Math.min(kei + 9, veteranRun.length - 1)]!
  expect(after.earned).toBeGreaterThan(veteranRun[kei - 1]!.earned * 2)
})

test('値段と稼ぎが同じくらいの割合で伸びる：次の星は、いつも 1 日の稼ぎの数日ぶん', () => {
  // はじめの数日は、手持ちの 1 億と安い強化で伸びるので見ない
  for (let i = 5; i < reachedOn(veteranRun, KEI); i++) {
    const income = veteranRun[i]!.earned - veteranRun[i - 1]!.earned
    const ratio = starPrice(veteranRun[i]!) / income
    expect(ratio).toBeGreaterThan(0.2)
    expect(ratio).toBeLessThan(6)
  }
  // 星と強化の両方を買い続けている
  const last = veteranRun.at(-1)!
  expect(starCount(last)).toBeGreaterThan(20)
  expect(last.levels.glove ?? 0).toBeGreaterThan(VETERAN_LEVELS.glove)
  expect(last.levels.stardust ?? 0).toBeGreaterThan(VETERAN_LEVELS.stardust)
  // 数はずっと有限
  for (const g of veteranRun) expect(Number.isFinite(g.hearts) && Number.isFinite(g.earned) && Number.isFinite(g.given)).toBe(true)
})

test('1.7.0 の夢（10 億〜1 兆）：1 億を稼いだ人は、1 兆・1 京へ向かう途中で、安い順に 1 つずつ買っていく', () => {
  // はじめのセーブは 1 億までの 7 つだけ
  expect(VETERAN_DREAMS.map(d => d.id)).toEqual(['greenTests', 'telescope', 'house', 'library', 'constellation', 'moonTrip', 'noBugs'])
  const fresh = DREAMS.filter(d => !VETERAN_DREAMS.includes(d))
  expect(fresh.map(d => [d.id, d.price])).toEqual([
    ['starHill', 1e9],
    ['airship', 1e10],
    ['statue', 1e11],
    ['twinStars', 1e12],
  ])
  // それぞれを買った日。どれも 1 京までに買い、1 日に 2 つ以上はまとめて買わない（ひとつずつが目標になる）
  const boughtOn = fresh.map(d => veteranRun.findIndex(g => dreamsOf(g).includes(d.id)) + 1)
  for (const day of boughtOn) expect(day).toBeGreaterThan(1)
  for (const day of boughtOn) expect(day).toBeLessThanOrEqual(reachedOn(veteranRun, KEI))
  for (let i = 1; i < boughtOn.length; i++) expect(boughtOn[i]!).toBeGreaterThan(boughtOn[i - 1]!)
  // 1 兆の夢（ふたりの星）は、1 兆を稼いだあと
  expect(boughtOn.at(-1)!).toBeGreaterThanOrEqual(reachedOn(veteranRun, TRILLION))
})

test('はじめたばかりの人：節目（Lv25）があっても、序盤の ♡ が跳ね上がらない', () => {
  // 節目だけを見るため、1.6.0 までと同じく夢のプレゼントを買わない遊び方で：1 日目は 1000 万まで、1 週間でも 10 億まで
  const run = days(newGame(0, 1_000), 7, undefined, { ...WORKDAY, dreams: false })
  expect(run[0]!.earned).toBeLessThan(1e7)
  expect(run[6]!.earned).toBeLessThan(1e9)
  // 最初の星（1 億）は、1 日目にはまだ買えない
  expect(starCount(run[0]!)).toBe(0)
  expect(STAR.base).toBe(1e8)
  for (const g of run) expect(Number.isFinite(g.earned)).toBe(true)
  // 夢のプレゼント（1 億までの 7 つで ♡ +70%）も買うと少し速いが、1 日目は 1000 万まで、1 週間で 100 億まで。
  // 10 億からの夢（1.7.0）は、1 週間ではまだ買えない
  const dreamy = days(newGame(0, 1_000), 7)
  expect(dreamy[0]!.earned).toBeLessThan(1e7)
  expect(dreamy[6]!.earned).toBeLessThan(1e10)
  expect(starCount(dreamy[0]!)).toBe(0)
  expect(dreamsOf(dreamy[6]!).filter(id => !VETERAN_DREAMS.some(d => d.id === id))).toEqual([])
})
