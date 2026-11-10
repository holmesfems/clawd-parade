// なでなでゲームの遊び方をまねて、♡ がどう増えていくかを日ごとに数える（tests/balance.test.ts が使う）。
// 本物のルール（touchGame・accrue・payIdle・toolTip・buyUpgrade・giveGift）をそのまま呼ぶ。mod には入れない

import type { Game, UpgradeId } from '../types'
import type { Dealt, Situation } from '../hooks/game'
import {
  COSMETICS,
  DREAMS,
  HEART_CAP,
  STAR,
  UPGRADES,
  accrue,
  buyUpgrade,
  giveGift,
  idlePerSecond,
  isMaxed,
  levelOf,
  newGame,
  payIdle,
  perPet,
  perSecond,
  priceOf,
  starPrice,
  toolTip,
  touchGame,
} from '../hooks/game'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

// 1 日の遊び方。開いている時間のうち、はじめの workMinutes は Claude が働いている
export type Plan = {
  // セッションを開いている時間と、そのうち Claude が働いている時間（分）
  openMinutes: number
  workMinutes: number
  // 働いている間の、1 分あたりのツールの回数
  toolsPerMinute: number
  // サブエージェントが働いている時間（分。開いてからの [はじめ, おわり)）と、その数
  helpers: { from: number; to: number; workers: number }
  // 1 日になでる回数。burst 回ずつ、gapMs おきに続けてなでる（コンボ → フィーバー）
  pets: number
  burst: number
  gapMs: number
}

// 1 日 8 時間開いて、うち 4 時間 Claude が働く。ツールは 20 秒に 1 回、はじめの 1 時間はサブエージェント 2 匹。
// なでるのは 1 日 500 回（50 回ずつ 10 回。30 回でフィーバーになり、残りはフィーバーの中）
export const WORKDAY: Plan = {
  openMinutes: 8 * 60,
  workMinutes: 4 * 60,
  toolsPerMinute: 3,
  helpers: { from: 0, to: 60, workers: 2 },
  pets: 500,
  burst: 50,
  gapMs: 150,
}

const situationAt = (plan: Plan, minute: number): Situation => ({
  isWorking: minute < plan.workMinutes,
  workers: minute >= plan.helpers.from && minute < plan.helpers.to ? plan.helpers.workers : 0,
})

// 1 日に入る ♡ の見積もり（買い物の損得を比べるだけなので、ざっくり）。なでるのはコンボ 15 ほどで、半分がお仕事中
function dailyIncome(g: Game, plan: Plan, now: number): number {
  const working: Situation = { isWorking: true, workers: 0 }
  const resting: Situation = { isWorking: false, workers: 0 }
  const helped: Situation = { isWorking: true, workers: plan.helpers.workers }
  const idle = idlePerSecond(g, now) * plan.openMinutes * 60
  const work = (perSecond(g, working, now) - idlePerSecond(g, now)) * plan.workMinutes * 60
  const help = (perSecond(g, helped, now) - perSecond(g, working, now)) * (plan.helpers.to - plan.helpers.from) * 60
  const tools = (toolTip(g).earned - g.earned) * plan.toolsPerMinute * plan.workMinutes
  const pets = ((perPet(g, working, now, 15) + perPet(g, resting, now, 15)) / 2) * plan.pets
  return idle + work + help + tools + pets
}

type Buy = { name: string; price: number; deal: (g: Game, now: number) => Dealt }

// 買えるもの：上限の無い強化（とフィーバー延長）と、星
function choices(g: Game): Buy[] {
  const ups: Buy[] = UPGRADES.filter(u => !isMaxed(u, levelOf(g, u.id))).map(u => ({
    name: u.id,
    price: priceOf(u, levelOf(g, u.id)),
    deal: one => buyUpgrade(one, u.id),
  }))
  return [...ups, { name: STAR.id, price: starPrice(g), deal: (one, now) => giveGift(one, 'star', now) }]
}

// いちばん「♡ 1 あたりで稼ぎが増える」ものを、買えるあいだ買う。いちばんのものが買えなければ貯める
function shop(g: Game, plan: Plan, now: number, bought: Record<string, number>): Game {
  for (;;) {
    const before = dailyIncome(g, plan, now)
    let best: { buy: Buy; next: Game; worth: number } | undefined
    for (const buy of choices(g)) {
      if (buy.price >= HEART_CAP) continue
      // 値段を気にせず買ったことにして、増える稼ぎを見る
      const dealt = buy.deal({ ...g, hearts: HEART_CAP }, now)
      if (!dealt.ok) continue
      const worth = (dailyIncome(dealt.game, plan, now) - before) / buy.price
      if (!best || worth > best.worth) best = { buy, next: dealt.game, worth }
    }
    if (!best || g.hearts < best.buy.price) return g
    const dealt = best.buy.deal(g, now)
    if (!dealt.ok) return g
    bought[best.buy.name] = (bought[best.buy.name] ?? 0) + 1
    g = dealt.game
  }
}

// 1 日遊ぶ。day は何日目か（0 から）。開いていない時間は何も入らない
export function playDay(start: Game, day: number, plan: Plan = WORKDAY, bought: Record<string, number> = {}): Game {
  const open = day * DAY + 1_000
  let g: Game = { ...start, passiveAt: open }
  const bursts = Math.ceil(plan.pets / plan.burst)
  // なでる時間は、開いている時間に等しく散らす
  const burstAt = new Set(Array.from({ length: bursts }, (_, i) => Math.floor(((i + 0.5) * plan.openMinutes) / bursts)))
  let petsLeft = plan.pets
  for (let minute = 0; minute < plan.openMinutes; minute++) {
    const now = open + minute * MINUTE
    const at = situationAt(plan, minute)
    if (burstAt.has(minute)) {
      const n = Math.min(plan.burst, petsLeft)
      petsLeft -= n
      for (let i = 0; i < n; i++) g = touchGame(g, now + i * plan.gapMs, at, { kind: 'pet', wasSleeping: false }).game
    }
    if (at.isWorking) for (let i = 0; i < plan.toolsPerMinute; i++) g = toolTip(g)
    const end = now + MINUTE
    g = accrue(g, end, at)
    g = payIdle(g, MINUTE, end)
    g = shop(g, plan, end, bought)
  }
  return g
}

export type Run = { days: number; game: Game; bought: Record<string, number> }

// done になるまで 1 日ずつ遊ぶ。maxDays までに届かなければ days は Infinity
export function playUntil(start: Game, done: (g: Game) => boolean, maxDays: number, plan: Plan = WORKDAY): Run {
  let g = start
  const bought: Record<string, number> = {}
  for (let day = 0; day < maxDays; day++) {
    g = playDay(g, day, plan, bought)
    if (done(g)) return { days: day + 1, game: g, bought }
  }
  return { days: Infinity, game: g, bought }
}

// 1 億を稼いだ人（#39 の作者）のころのセーブ：一度きりのものは全部持っていて、♡ は 1 億。
// 強化の Lv は、値段と効き目から見て 1 億を稼ぐうちに上げていそうなところ
export const VETERAN_LEVELS: Record<UpgradeId, number> = {
  glove: 45,
  brush: 20,
  coffee: 15,
  fan: 45,
  toolTip: 25,
  allowance: 20,
  feverTime: 5,
  stardust: 50,
}

export function veteranGame(): Game {
  const dreams = DREAMS.reduce((sum, d) => sum + d.price, 0)
  return {
    ...newGame(0, 1_000),
    hearts: 100_000_000,
    earned: 500_000_000,
    levels: { ...VETERAN_LEVELS },
    owned: COSMETICS.map(c => c.id),
    gifts: Object.fromEntries(DREAMS.map(d => [d.id, 1])),
    given: dreams,
  }
}

// 強化を Lv0 から levels まで順に上げる値段の合計
export const levelsCost = (levels: Partial<Record<UpgradeId, number>>) =>
  UPGRADES.reduce((sum, u) => {
    let cost = 0
    for (let level = 0; level < (levels[u.id] ?? 0); level++) cost += priceOf(u, level)
    return sum + cost
  }, 0)
