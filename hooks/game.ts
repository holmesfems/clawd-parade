// なでなでゲームのルール。♡ の稼ぎ方・コンボ・フィーバー・お店・実績を、
// $ に触らない純粋な関数だけで書く。保存や表示は register.tsx の仕事。

import type { CosmeticId, Game, Hat, Look, UpgradeId } from '../types'

// ---- 数字 ---------------------------------------------------------------

export const COMBO_WINDOW_MS = 1200
export const FEVER_COMBO = 30
export const FEVER_MS = 8000
const FEVER_RATE = 3
// 放置収入は 1 分ぶんまで（別のセッションのあいだに貯まったりはしない）
const PASSIVE_CAP_MS = 60_000

// いま何が起きているか（Claude が働いているか、働いている仲間の数）
export type Scene = { isWorking: boolean; workers: number }

export function newGame(hearts: number, now: number): Game {
  return {
    hearts,
    earned: hearts,
    combo: 0,
    comboAt: 0,
    maxCombo: 0,
    feverUntil: 0,
    fevers: 0,
    workPets: 0,
    hugs: 0,
    wakes: 0,
    levels: {},
    owned: [],
    hat: null,
    achievements: [],
    lastUnlock: null,
    passiveAt: now,
  }
}

// 保存してあったものを今の形にそろえる（足りない項目は新しいゲームの値で埋める）
export function restore(saved: unknown, hearts: number, now: number): Game {
  const fresh = newGame(hearts, now)
  if (typeof saved !== 'object' || saved === null || typeof (saved as Game).hearts !== 'number') return fresh
  return { ...fresh, ...(saved as Partial<Game>), passiveAt: now }
}

// ---- お店 ---------------------------------------------------------------

export type Upgrade = { id: UpgradeId; name: string; about: string; base: number; growth: number; max?: number }

export const UPGRADES: Upgrade[] = [
  { id: 'glove', name: 'やわらか手袋', about: '1 なでの ♡ +1', base: 15, growth: 1.15 },
  { id: 'brush', name: 'ふわふわブラシ', about: 'コンボの伸び +50%', base: 120, growth: 1.25 },
  { id: 'coffee', name: 'コーヒー差し入れ', about: 'お仕事中の倍率 +0.5', base: 250, growth: 1.3 },
  { id: 'fan', name: '応援うちわ', about: '放置で ♡ +0.2/秒', base: 50, growth: 1.15 },
  { id: 'toolTip', name: 'ツールのおだちん', about: 'ツールを 1 回使うごとに ♡ +3', base: 150, growth: 1.2 },
  { id: 'allowance', name: 'サブエージェント手当', about: '働く仲間 1 匹ごとに ♡ +1/秒', base: 400, growth: 1.2 },
  { id: 'feverTime', name: 'フィーバー延長', about: 'フィーバーが 2 秒長くなる', base: 600, growth: 1.6, max: 5 },
  { id: 'stardust', name: '星のかけら', about: '放置で ♡ +2/秒', base: 1000, growth: 1.15 },
]

export type Cosmetic = { id: CosmeticId; name: string; about: string; price: number; hat?: Hat }

export const COSMETICS: Cosmetic[] = [
  { id: 'ribbon', name: 'リボン', about: '頭の角にちょこんと', price: 300, hat: 'ribbon' },
  { id: 'catEars', name: 'ねこみみ', about: 'Clawd がねこになる', price: 800, hat: 'catEars' },
  { id: 'santa', name: 'サンタぼうし', about: 'いつでもクリスマス', price: 1500, hat: 'santa' },
  { id: 'shootingStars', name: '流れ星', about: '夜空にときどき流れ星', price: 2000 },
  { id: 'crown', name: '王冠', about: 'なでなでの王さま', price: 5000, hat: 'crown' },
  { id: 'aurora', name: 'オーロラ', about: '夜空にオーロラがゆれる', price: 8000 },
]

export const levelOf = (g: Game, id: UpgradeId) => g.levels[id] ?? 0

export const priceOf = (u: Upgrade, level: number) => Math.ceil(u.base * u.growth ** level)

export const isMaxed = (u: Upgrade, level: number) => u.max !== undefined && level >= u.max

export function buyUpgrade(g: Game, id: UpgradeId): Game | string {
  const u = UPGRADES.find(one => one.id === id)
  if (!u) return 'そんな商品はないよ'
  const level = levelOf(g, id)
  if (isMaxed(u, level)) return `${u.name} はもう最大だよ`
  const price = priceOf(u, level)
  if (g.hearts < price) return `♡ が ${formatHearts(price - g.hearts)} 足りないよ`
  return { ...g, hearts: g.hearts - price, levels: { ...g.levels, [id]: level + 1 } }
}

export function buyCosmetic(g: Game, id: CosmeticId): Game | string {
  const c = COSMETICS.find(one => one.id === id)
  if (!c) return 'そんな商品はないよ'
  if (g.owned.includes(id)) return `${c.name} はもう持ってるよ`
  if (g.hearts < c.price) return `♡ が ${formatHearts(c.price - g.hearts)} 足りないよ`
  // 買ったぼうしはすぐかぶる
  return { ...g, hearts: g.hearts - c.price, owned: [...g.owned, id], hat: c.hat ?? g.hat }
}

export function wear(g: Game, hat: Hat | null): Game {
  return hat === null || g.owned.includes(hat) ? { ...g, hat } : g
}

// ---- 稼ぎ ---------------------------------------------------------------

export const isFever = (g: Game, now: number) => now < g.feverUntil

const comboRate = (g: Game, combo: number) => 1 + Math.min(combo, 100) * 0.01 * (1 + 0.5 * levelOf(g, 'brush'))

const workRate = (g: Game, at: Scene) => (at.isWorking ? 2 + 0.5 * levelOf(g, 'coffee') : 1)

export function perPet(g: Game, at: Scene, now: number, combo = g.combo): number {
  const fever = isFever(g, now) ? FEVER_RATE : 1
  return (1 + levelOf(g, 'glove')) * comboRate(g, combo) * workRate(g, at) * fever
}

// お仕事中は Clawd にもお給料（♡ +1/秒）が出る
export function perSecond(g: Game, at: Scene): number {
  return (
    (at.isWorking ? 1 : 0) +
    0.2 * levelOf(g, 'fan') +
    2 * levelOf(g, 'stardust') +
    at.workers * levelOf(g, 'allowance')
  )
}

export type Touch = { kind: 'pet' | 'hug'; wasSleeping: boolean }

// 1 回なでた（ぎゅっとした）ぶん。フィーバー中はコンボを数えず、明けたら 1 から
export function touchGame(g: Game, now: number, at: Scene, touch: Touch): { game: Game; gained: number; isFeverStart: boolean } {
  const inFever = isFever(g, now)
  const combo = inFever ? 0 : now - g.comboAt <= COMBO_WINDOW_MS ? g.combo + 1 : 1
  const isFeverStart = !inFever && combo >= FEVER_COMBO
  const feverUntil = isFeverStart ? now + FEVER_MS + 2000 * levelOf(g, 'feverTime') : g.feverUntil
  const next: Game = {
    ...g,
    combo: isFeverStart ? 0 : combo,
    comboAt: now,
    maxCombo: Math.max(g.maxCombo, combo),
    feverUntil,
    fevers: g.fevers + (isFeverStart ? 1 : 0),
    workPets: g.workPets + (at.isWorking ? 1 : 0),
    hugs: g.hugs + (touch.kind === 'hug' ? 1 : 0),
    wakes: g.wakes + (touch.wasSleeping ? 1 : 0),
  }
  const gained = perPet(next, at, now, combo)
  return { game: { ...next, hearts: next.hearts + gained, earned: next.earned + gained }, gained, isFeverStart }
}

// 前回から今までの放置収入を足す
export function accrue(g: Game, now: number, at: Scene): Game {
  const seconds = Math.min(PASSIVE_CAP_MS, Math.max(0, now - g.passiveAt)) / 1000
  const gained = perSecond(g, at) * seconds
  return { ...g, hearts: g.hearts + gained, earned: g.earned + gained, passiveAt: now }
}

export function toolTip(g: Game): Game {
  const gained = 3 * levelOf(g, 'toolTip')
  return gained === 0 ? g : { ...g, hearts: g.hearts + gained, earned: g.earned + gained }
}

// コンボが途切れていたら 0 に戻す（表示用）
export const liveCombo = (g: Game, now: number) => (now - g.comboAt <= COMBO_WINDOW_MS ? g.combo : 0)

// ---- 実績 ---------------------------------------------------------------

export type Facts = { game: Game; pets: number; rate: number }

export type Achievement = { id: string; name: string; about: string; test: (f: Facts) => boolean }

const spent = (g: Game) => Object.values(g.levels).reduce((n, l) => n + (l ?? 0), 0) + g.owned.length

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'pets1', name: 'はじめてのなでなで', about: '1 回なでる', test: f => f.pets >= 1 },
  { id: 'pets100', name: 'なでなで見習い', about: '100 回なでる', test: f => f.pets >= 100 },
  { id: 'pets1k', name: 'なでなで職人', about: '1,000 回なでる', test: f => f.pets >= 1_000 },
  { id: 'pets10k', name: 'なでなでマスター', about: '1 万回なでる', test: f => f.pets >= 10_000 },
  { id: 'pets100k', name: 'なでなで仙人', about: '10 万回なでる', test: f => f.pets >= 100_000 },
  { id: 'pets1m', name: '伝説のなで手', about: '100 万回なでる', test: f => f.pets >= 1_000_000 },
  { id: 'combo10', name: 'れんぞくなでなで', about: '10 コンボ', test: f => f.game.maxCombo >= 10 },
  { id: 'fever1', name: 'はじめてのフィーバー', about: 'フィーバーを起こす', test: f => f.game.fevers >= 1 },
  { id: 'fever10', name: 'フィーバー常連', about: 'フィーバー 10 回', test: f => f.game.fevers >= 10 },
  { id: 'fever100', name: 'フィーバーの申し子', about: 'フィーバー 100 回', test: f => f.game.fevers >= 100 },
  { id: 'work100', name: 'おしごと応援団', about: 'お仕事中に 100 回なでる', test: f => f.game.workPets >= 100 },
  { id: 'work1k', name: 'となりの名マネージャー', about: 'お仕事中に 1,000 回なでる', test: f => f.game.workPets >= 1_000 },
  { id: 'hug10', name: 'なかまもだいじ', about: '仲間を 10 回ぎゅっとする', test: f => f.game.hugs >= 10 },
  { id: 'wake', name: 'おこしちゃった', about: '寝ている子をなでる', test: f => f.game.wakes >= 1 },
  { id: 'earned10k', name: '♡ちょきん', about: '♡ を 1 万稼ぐ', test: f => f.game.earned >= 10_000 },
  { id: 'earned1m', name: '♡長者', about: '♡ を 100 万稼ぐ', test: f => f.game.earned >= 1_000_000 },
  { id: 'earned100m', name: '♡億万長者', about: '♡ を 1 億稼ぐ', test: f => f.game.earned >= 100_000_000 },
  { id: 'shop1', name: 'はじめてのおかいもの', about: 'お店で何か買う', test: f => spent(f.game) >= 1 },
  { id: 'glove25', name: '手袋マニア', about: 'やわらか手袋 Lv25', test: f => levelOf(f.game, 'glove') >= 25 },
  { id: 'idle10', name: 'ほうちプレイ', about: '放置で ♡ 10/秒', test: f => f.rate >= 10 },
  { id: 'hat', name: 'おしゃれさん', about: 'ぼうしを買う', test: f => COSMETICS.some(c => c.hat && f.game.owned.includes(c.id)) },
  { id: 'collector', name: 'コレクター', about: 'きせかえを全部そろえる', test: f => COSMETICS.every(c => f.game.owned.includes(c.id)) },
]

// まだ持っていない実績のうち、条件を満たしたもの
export function unlocked(f: Facts): Achievement[] {
  return ACHIEVEMENTS.filter(a => !f.game.achievements.includes(a.id) && a.test(f))
}

export function grant(g: Game, list: Achievement[], now: number): Game {
  if (list.length === 0) return g
  return {
    ...g,
    achievements: [...g.achievements, ...list.map(a => a.id)],
    lastUnlock: { id: list.at(-1)!.id, at: now },
  }
}

// ---- 見た目 -------------------------------------------------------------

export function lookOf(g: Game, now: number): Look {
  return {
    hat: g.hat,
    shootingStars: g.owned.includes('shootingStars'),
    aurora: g.owned.includes('aurora'),
    fever: isFever(g, now),
  }
}

// 1 万未満は 3 桁区切り、それ以上は「万」「億」で
export function formatHearts(n: number): string {
  const v = Math.max(0, n)
  if (v >= 1e8) return `${trim(v / 1e8)}億`
  if (v >= 1e4) return `${trim(v / 1e4)}万`
  return String(Math.floor(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const trim = (v: number) => (v >= 100 ? String(Math.floor(v)) : v.toFixed(v >= 10 ? 1 : 2).replace(/\.?0+$/, ''))

export const formatRate = (n: number) => (n >= 100 ? formatHearts(n) : n.toFixed(1).replace(/\.0$/, ''))
