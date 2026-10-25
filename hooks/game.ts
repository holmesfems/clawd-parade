// なでなでゲームのルール。♡ の稼ぎ方・コンボ・フィーバー・お店・実績を、
// $ に触らない純粋な関数だけで書く。保存や表示は register.tsx の仕事。

import type { CosmeticId, DreamId, Game, GiftId, Hat, Holding, Look, TreatId, UpgradeId } from '../types'

// ---- 数字 ---------------------------------------------------------------

export const COMBO_WINDOW_MS = 1200
export const FEVER_COMBO = 30
export const FEVER_MS = 8000
const FEVER_RATE = 3
// 放置収入は 1 分ぶんまで（別のセッションのあいだに貯まったりはしない）
const PASSIVE_CAP_MS = 60_000

// 保存形式の版。形を変えたら上げて、restore で古い形を読めるようにする
export const SAVE_VERSION = 1

// いま何が起きているか（Claude が働いているか、働いている仲間の数）
export type Scene = { isWorking: boolean; workers: number }

export function newGame(hearts: number, now: number): Game {
  return {
    v: SAVE_VERSION,
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
    gifts: {},
    given: 0,
    happyUntil: 0,
    lastGift: null,
    passiveAt: now,
  }
}

// 保存してあったものを今の形にそろえる。型が合わない項目と足りない項目は fallback の値にし、
// 知らない項目（新しい版が書いたもの）は捨てずに残す。保存が object でなければ fallback のまま。
// 読み込むとき：fallback はなでた回数から作った新しいゲーム（♡ が壊れていたら、なでた回数から作り直す）
export function restore(saved: unknown, fallback: Game): Game {
  if (!isRecord(saved)) return fallback
  const num = (k: CountKey) => (isFiniteNumber(saved[k]) ? saved[k] : fallback[k])
  const nums = Object.fromEntries(COUNT_KEYS.map(k => [k, num(k)])) as Pick<Game, CountKey>
  return {
    ...fallback,
    ...saved,
    ...nums,
    // 新しい版が書いた保存なら、その版のまま持ち回る
    v: isFiniteNumber(saved.v) && saved.v > SAVE_VERSION ? saved.v : SAVE_VERSION,
    levels: countsOf(saved.levels) ?? fallback.levels,
    gifts: countsOf(saved.gifts) ?? fallback.gifts,
    owned: (stringsOf(saved.owned) as CosmeticId[] | undefined) ?? fallback.owned,
    achievements: stringsOf(saved.achievements) ?? fallback.achievements,
    hat: saved.hat === null || isHat(saved.hat) ? saved.hat : fallback.hat,
    lastUnlock: saved.lastUnlock === null || isStamp(saved.lastUnlock, isString) ? saved.lastUnlock : fallback.lastUnlock,
    lastGift: saved.lastGift === null || isStamp(saved.lastGift, isGiftId) ? saved.lastGift : fallback.lastGift,
    passiveAt: fallback.passiveAt,
  }
}

type CountKey = { [K in keyof Game]: Game[K] extends number ? K : never }[keyof Game]

// v と passiveAt は restore が別に決める
const COUNT_KEYS = [
  'hearts',
  'earned',
  'combo',
  'comboAt',
  'maxCombo',
  'feverUntil',
  'fevers',
  'workPets',
  'hugs',
  'wakes',
  'given',
  'happyUntil',
] as const satisfies readonly Exclude<CountKey, 'v' | 'passiveAt'>[]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isString = (v: unknown): v is string => typeof v === 'string'

// 配列なら string の要素だけを残す
const stringsOf = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter(isString) : undefined)

// record なら 0 以上の数の項目だけを残す
const countsOf = (v: unknown): Record<string, number> | undefined =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => isFiniteNumber(e[1]) && e[1] >= 0)) : undefined

// { id, at } の形で、id が合っているか
const isStamp = <T>(v: unknown, isId: (id: unknown) => id is T): v is { id: T; at: number } =>
  isRecord(v) && isId(v.id) && isFiniteNumber(v.at)

const isHat = (v: unknown): v is Hat => COSMETICS.some(c => c.hat !== undefined && c.hat === v)

const isGiftId = (v: unknown): v is GiftId => TREATS.some(t => t.id === v) || DREAMS.some(d => d.id === v)

// ---- 保存（セッションをまたいで） --------------------------------------

// 別のセッションも同じ保存を書くので、丸ごと上書きせずに差分を足し込む。
// theirs：いま保存されているもの、base：このセッションが前回読んだ（書いた）もの、mine：このセッションの今
export function mergeGame(theirs: Game, base: Game, mine: Game): Game {
  const add = (k: 'hearts' | 'earned' | 'given' | 'fevers' | 'workPets' | 'hugs' | 'wakes') => theirs[k] + mine[k] - base[k]
  const addCounts = <K extends string>(t: Partial<Record<K, number>>, b: Partial<Record<K, number>>, m: Partial<Record<K, number>>) => {
    const out: Partial<Record<K, number>> = { ...t }
    for (const k of Object.keys(m) as K[]) {
      const n = (t[k] ?? 0) + (m[k] ?? 0) - (b[k] ?? 0)
      if (n > 0) out[k] = n
      else delete out[k]
    }
    return out
  }
  const union = <T>(t: T[], m: T[]) => [...t, ...m.filter(x => !t.includes(x))]
  // このセッションで変えたものはこちら、変えていなければ向こうの
  const latest = <T>(t: T, b: T, m: T) => (JSON.stringify(m) !== JSON.stringify(b) ? m : t)
  return {
    ...mine,
    v: Math.max(theirs.v, mine.v),
    hearts: Math.max(0, add('hearts')),
    earned: add('earned'),
    given: add('given'),
    fevers: add('fevers'),
    workPets: add('workPets'),
    hugs: add('hugs'),
    wakes: add('wakes'),
    maxCombo: Math.max(theirs.maxCombo, mine.maxCombo),
    levels: addCounts(theirs.levels, base.levels, mine.levels),
    owned: union(theirs.owned, mine.owned),
    achievements: union(theirs.achievements, mine.achievements),
    gifts: addCounts(theirs.gifts, base.gifts, mine.gifts),
    happyUntil: Math.max(theirs.happyUntil, mine.happyUntil),
    hat: latest(theirs.hat, base.hat, mine.hat),
    lastUnlock: latest(theirs.lastUnlock, base.lastUnlock, mine.lastUnlock),
    lastGift: latest(theirs.lastGift, base.lastGift, mine.lastGift),
  }
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

// ---- 贈り物 -------------------------------------------------------------

export type Treat = { id: TreatId; name: string; price: number; happyMs: number; thanks: string }
export type Dream = { id: DreamId; name: string; price: number; shows: string; thanks: string }

// 小さな贈り物：何度でもあげられて、もらったらしばらくごきげん（♡×1.5）
export const TREATS: Treat[] = [
  { id: 'cookie', name: 'クッキー', price: 50, happyMs: 10_000, thanks: 'クッキー！サクサク…しあわせ〜' },
  { id: 'cocoa', name: 'あったかいココア', price: 150, happyMs: 20_000, thanks: 'ふぅ…あったかい。ほっとするね' },
  { id: 'cake', name: 'いちごのショートケーキ', price: 400, happyMs: 40_000, thanks: 'ケーキ！？いいの！？いただきまーす♡' },
  { id: 'letter', name: 'ありがとうの手紙', price: 1000, happyMs: 60_000, thanks: '…大事にとっておくね。いつもありがとう' },
  { id: 'cushion', name: 'ふかふかクッション', price: 3000, happyMs: 120_000, thanks: 'ふかふか〜…ちょっとだけおひるね…' },
  { id: 'keyboard', name: '新しいキーボード', price: 10_000, happyMs: 300_000, thanks: 'カタカタ…打ち心地さいこう！もっとがんばれちゃう' },
]

// 夢のプレゼント：1 回きり。ずっと飾られて、ひとつごとに ♡ の稼ぎが +10%
export const DREAMS: Dream[] = [
  { id: 'greenTests', name: '全部グリーンのテスト', price: 30_000, shows: '地面に緑の旗', thanks: 'ぜんぶ…通ってる…！こんなにうれしいことないよ！' },
  { id: 'telescope', name: '望遠鏡', price: 80_000, shows: '星を見る望遠鏡', thanks: 'これで星がもっとよく見える！いっしょに見よ？' },
  { id: 'house', name: '小さなおうち', price: 250_000, shows: 'あかりのつくおうち', thanks: 'おうち…！？ただいま、って言ってもいい？' },
  { id: 'library', name: '世界中の本がある図書館', price: 800_000, shows: '本でいっぱいの本棚', thanks: '世界中の本…ぜんぶ読んでいいの？しあわせ…' },
  { id: 'constellation', name: 'Clawd 座', price: 3_000_000, shows: '夜空に Clawd の星座', thanks: '空に Clawd 座が…！ずっと見ててね' },
  { id: 'moonTrip', name: '月への旅', price: 12_000_000, shows: '月とロケット', thanks: '月まで行けちゃう！おみやげ持って帰るね' },
  { id: 'noBugs', name: 'バグのない世界', price: 100_000_000, shows: '空に虹', thanks: '…夢みたい。でも、きみといっしょに直す時間も好きだったよ' },
]

export const GIFT_SHOW_MS = 6000
const HAPPY_RATE = 1.5
const DREAM_BONUS = 0.1

export const giftOf = (id: GiftId): Treat | Dream | undefined =>
  TREATS.find(t => t.id === id) ?? DREAMS.find(d => d.id === id)

export const isDream = (id: GiftId): id is DreamId => DREAMS.some(d => d.id === id)

export const isHappy = (g: Game, now: number) => now < g.happyUntil

export const dreamsOf = (g: Game): DreamId[] => DREAMS.filter(d => (g.gifts[d.id] ?? 0) > 0).map(d => d.id)

// ごきげん中は ×1.5、夢のプレゼントひとつごとに +10%
export const giftRate = (g: Game, now: number) =>
  (isHappy(g, now) ? HAPPY_RATE : 1) * (1 + DREAM_BONUS * dreamsOf(g).length)

export function giveGift(g: Game, id: GiftId, now: number): Game | string {
  const gift = giftOf(id)
  if (!gift) return 'そんな贈り物はないよ'
  if (isDream(id) && (g.gifts[id] ?? 0) > 0) return `${gift.name} はもう飾ってあるよ`
  if (g.hearts < gift.price) return `♡ が ${formatHearts(gift.price - g.hearts)} 足りないよ`
  const happyMs = 'happyMs' in gift ? gift.happyMs : 0
  return {
    ...g,
    hearts: g.hearts - gift.price,
    given: g.given + gift.price,
    gifts: { ...g.gifts, [id]: (g.gifts[id] ?? 0) + 1 },
    happyUntil: happyMs > 0 ? Math.max(now, g.happyUntil) + happyMs : g.happyUntil,
    lastGift: { id, at: now },
  }
}

// なかよし度：贈った ♡ の合計で上がる
const AFFECTION = [
  { name: 'しりあい', at: 0 },
  { name: 'ともだち', at: 300 },
  { name: 'なかよし', at: 3_000 },
  { name: 'だいすき', at: 30_000 },
  { name: 'しんゆう', at: 300_000 },
  { name: 'あいぼう', at: 3_000_000 },
  { name: 'ずっといっしょ', at: 100_000_000 },
]

export function affectionOf(given: number): { name: string; next?: { name: string; at: number } } {
  const reached = AFFECTION.filter(a => given >= a.at)
  const next = AFFECTION.find(a => given < a.at)
  return { name: reached.at(-1)?.name ?? 'しりあい', ...(next ? { next } : {}) }
}

// ---- 稼ぎ ---------------------------------------------------------------

export const isFever = (g: Game, now: number) => now < g.feverUntil

const comboRate = (g: Game, combo: number) => 1 + Math.min(combo, 100) * 0.01 * (1 + 0.5 * levelOf(g, 'brush'))

const workRate = (g: Game, at: Scene) => (at.isWorking ? 2 + 0.5 * levelOf(g, 'coffee') : 1)

export function perPet(g: Game, at: Scene, now: number, combo = g.combo): number {
  const fever = isFever(g, now) ? FEVER_RATE : 1
  return (1 + levelOf(g, 'glove')) * comboRate(g, combo) * workRate(g, at) * fever * giftRate(g, now)
}

// 放置で入る ♡/秒（応援うちわ・星のかけら）。セッションをいくつ開いていても 1 つぶん
export const idlePerSecond = (g: Game, now = g.passiveAt) =>
  (0.2 * levelOf(g, 'fan') + 2 * levelOf(g, 'stardust')) * giftRate(g, now)

// お仕事中は Clawd にもお給料（♡ +1/秒）が出る。こちらは働いているセッションごとに入る
const workPerSecond = (g: Game, at: Scene, now: number) =>
  ((at.isWorking ? 1 : 0) + at.workers * levelOf(g, 'allowance')) * giftRate(g, now)

export const perSecond = (g: Game, at: Scene, now = g.passiveAt) => idlePerSecond(g, now) + workPerSecond(g, at, now)

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

// 前回から今までのお給料を足す（放置のぶんは payIdle で、セッションをまたいで 1 回だけ払う）
export function accrue(g: Game, now: number, at: Scene): Game {
  const seconds = Math.min(PASSIVE_CAP_MS, Math.max(0, now - g.passiveAt)) / 1000
  const gained = workPerSecond(g, at, now) * seconds
  return { ...g, hearts: g.hearts + gained, earned: g.earned + gained, passiveAt: now }
}

// どのセッションかが最後に放置収入を払った時刻から、いま払うぶん（ms）。
// 1 分以上だれも払っていなければ（どのセッションも開いていなかった）、払わずに時計だけ進める
export function idleDue(paidAt: number, now: number): number {
  const ms = now - paidAt
  return paidAt > 0 && ms > 0 && ms <= PASSIVE_CAP_MS ? ms : 0
}

export function payIdle(g: Game, ms: number, now: number): Game {
  const gained = (idlePerSecond(g, now) * ms) / 1000
  return gained === 0 ? g : { ...g, hearts: g.hearts + gained, earned: g.earned + gained }
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
  { id: 'gift1', name: 'はじめてのプレゼント', about: 'Clawd に贈り物をする', test: f => f.game.given > 0 },
  {
    id: 'sweets10',
    name: 'おかしやさん',
    about: 'クッキー・ココア・ケーキを合わせて 10 回あげる',
    test: f => (['cookie', 'cocoa', 'cake'] as const).reduce((n, id) => n + (f.game.gifts[id] ?? 0), 0) >= 10,
  },
  { id: 'letter', name: 'きもちをこめて', about: 'ありがとうの手紙をあげる', test: f => (f.game.gifts.letter ?? 0) >= 1 },
  { id: 'dream1', name: '夢をひとつ', about: '夢のプレゼントを贈る', test: f => dreamsOf(f.game).length >= 1 },
  { id: 'dreamAll', name: '夢をぜんぶ', about: '夢のプレゼントを全部贈る', test: f => dreamsOf(f.game).length === DREAMS.length },
  { id: 'bff', name: 'しんゆう', about: 'なかよし度を「しんゆう」にする', test: f => f.game.given >= 300_000 },
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

// いまかかえている贈り物（かかえはじめてから GIFT_SHOW_MS のあいだ）
export const heldGift = (h: Holding, now: number): GiftId | null => (h && now - h.from < GIFT_SHOW_MS ? h.id : null)

export function lookOf(g: Game, now: number, holding: Holding): Look {
  const gift = heldGift(holding, now)
  return {
    hat: g.hat,
    shootingStars: g.owned.includes('shootingStars'),
    aurora: g.owned.includes('aurora'),
    fever: isFever(g, now),
    // 夢のプレゼントは箱で抱えて、そのあと庭や夜空にずっと飾る
    gift: gift === null ? null : isDream(gift) ? 'box' : gift,
    dreams: dreamsOf(g),
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
