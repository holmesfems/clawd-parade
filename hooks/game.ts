// なでなでゲームのルール。♡ の稼ぎ方・コンボ・フィーバー・お店・実績を、
// $ に触らない純粋な関数だけで書く。保存や表示は register.tsx の仕事。

import type { AchievementId, CosmeticId, DreamId, Friend, Game, GiftId, Hat, Holding, Look, Pets, TouchKind, TreatId, UpgradeId, Work } from '../types'

// ---- 数字 ---------------------------------------------------------------

export const COMBO_WINDOW_MS = 1200
export const FEVER_COMBO = 30
export const FEVER_MS = 8000
const FEVER_RATE = 3
// 放置収入は 1 分ぶんまで（別のセッションのあいだに貯まったりはしない）
const PASSIVE_CAP_MS = 60_000

// ♡ の上限。double は超えると Infinity になり、保存したときに有限の数でなくなって restore が初期値に戻してしまう。
// そうなる手前で止める（hearts・earned・given はこの範囲に収める。借金は -HEART_CAP まで）。
// なお 2^53（約 9007 兆）を超えると double の刻みが 1 より大きくなり、+1 ♡ ほどの小さな稼ぎは丸めで消える。
// 桁がそこまで大きいときの ♡ には誤差が出るが、遊びには影響しないのでそのままにしている
export const HEART_CAP = 1e300

// 上限（と下限）に収める。NaN（Infinity どうしの引き算など）は 0 にして、保存を壊さない
const clampHearts = (n: number) => (Number.isNaN(n) ? 0 : Math.max(-HEART_CAP, Math.min(HEART_CAP, n)))

// ♡ を稼いだ（hearts と earned に同じだけ足す）。足す場所はここを通して、上限を 1 か所で守る。
// 稼ぎが NaN（0 × Infinity など）になっても、今の ♡ を 0 にしないよう、足さずにおく
const earn = (g: Game, gained: number): Game =>
  Number.isNaN(gained) ? g : { ...g, hearts: clampHearts(g.hearts + gained), earned: clampHearts(g.earned + gained) }

// 保存形式の版。形を変えたら上げて、restore で古い形を読めるようにする。
// 古い版のセッションが同時に開いていることがあるので、今ある項目の型は変えずに、新しい項目を足す
// （古い版は型の合わない項目を初期値に戻してしまうが、知らない項目は残す）
export const SAVE_VERSION = 1

// いま何が起きているか（Claude が働いているか、働いている仲間の数）
export type Situation = { isWorking: boolean; workers: number }

export const situationOf = (w: Work, list: Friend[]): Situation => ({
  isWorking: w.isRunning,
  workers: list.filter(f => f.doneAt === null).length,
})

// フックが 1 コマ（tick）進める間隔（見回りと描き直し）
export const HOOK_FRAME_MS = 200
// なでられてから、とろけた顔とハートを見せておく時間
const PET_SHOW_MS = 4000

// いまなでられている（なでられてから PET_SHOW_MS のあいだ）
export const isPetted = (p: Pets, now: number) => p.at > 0 && now - p.at < PET_SHOW_MS

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
    favorite: null,
    shown: null,
    off: [],
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
  const owned = (stringsOf(saved.owned) as CosmeticId[] | undefined) ?? fallback.owned
  return {
    ...fallback,
    ...saved,
    ...nums,
    // 新しい版が書いた保存なら、その版のまま持ち回る
    v: isFiniteNumber(saved.v) && saved.v > SAVE_VERSION ? saved.v : SAVE_VERSION,
    levels: countsOf(saved.levels) ?? fallback.levels,
    gifts: countsOf(saved.gifts) ?? fallback.gifts,
    owned,
    achievements: (stringsOf(saved.achievements) as AchievementId[] | undefined) ?? fallback.achievements,
    // 持っていないぼうしはかぶらない
    hat: saved.hat === null || (isHat(saved.hat) && owned.includes(saved.hat)) ? saved.hat : null,
    lastUnlock: saved.lastUnlock === null || isStamp(saved.lastUnlock, isAchievementId) ? saved.lastUnlock : fallback.lastUnlock,
    lastGift: saved.lastGift === null || isStamp(saved.lastGift, isGiftId) ? saved.lastGift : fallback.lastGift,
    favorite: saved.favorite === null || isFavoriteId(saved.favorite) ? saved.favorite : fallback.favorite,
    // 文字列だけを残す。知らない id（新しい版の夢かもしれない）は持ち回り、絵を決めるとき（shownDreams）に見ないだけ
    shown: saved.shown === null ? null : ((stringsOf(saved.shown) as DreamId[] | undefined) ?? fallback.shown),
    off: (stringsOf(saved.off) as CosmeticId[] | undefined) ?? fallback.off,
    passiveAt: fallback.passiveAt,
  }
}

type CountKey = { [K in keyof Game]: Game[K] extends number ? K : never }[keyof Game]

// 数の項目（v と passiveAt は restore が別に決める）。Game に数の項目を足したら、ここに足すまで型エラーになる
const COUNTS: Record<Exclude<CountKey, 'v' | 'passiveAt'>, true> = {
  hearts: true,
  earned: true,
  combo: true,
  comboAt: true,
  maxCombo: true,
  feverUntil: true,
  fevers: true,
  workPets: true,
  hugs: true,
  wakes: true,
  given: true,
  happyUntil: true,
}
const COUNT_KEYS = Object.keys(COUNTS) as (keyof typeof COUNTS)[]

// この版の知らない項目（新しい版が書いたもの）
const KNOWN_KEYS = new Set(Object.keys(newGame(0, 0)))
const unknownOf = (g: Game) => Object.fromEntries(Object.entries(g).filter(([k]) => !KNOWN_KEYS.has(k)))

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isString = (v: unknown): v is string => typeof v === 'string'

// 新しい版の実績の id も捨てずに持ち回る（この版の表では見つからないだけ）
const isAchievementId = (v: unknown): v is AchievementId => typeof v === 'string'

// 配列なら string の要素だけを残す
const stringsOf = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter(isString) : undefined)

// record なら 0 以上の数の項目だけを残す
const countsOf = (v: unknown): Record<string, number> | undefined =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => isFiniteNumber(e[1]) && e[1] >= 0)) : undefined

// { id, at } の形で、id が合っているか
const isStamp = <T>(v: unknown, isId: (id: unknown) => id is T): v is { id: T; at: number } =>
  isRecord(v) && isId(v.id) && isFiniteNumber(v.at)

const isHat = (v: unknown): v is Hat => COSMETICS.some(c => c.hat !== undefined && c.hat === v)

const isGiftId = (v: unknown): v is GiftId => typeof v === 'string' && Object.hasOwn(GIFTS, v)

// 新しい版の贈り物の id も捨てずに持ち回る（この版の表では見つからず、帯に出ないだけ）。
// 捨てると、同時に開いている古い版のセッションが、新しい版で選んだものを null で上書きする
const isFavoriteId = (v: unknown): v is TreatId => typeof v === 'string'

// ---- 保存（セッションをまたいで） --------------------------------------

// 別のセッションも同じ保存を書くので、丸ごと上書きせずに、項目ごとの方針で合わせる。
// theirs：いま保存されているもの、base：このセッションが前回読んだ（書いた）もの、mine：このセッションの今
export function mergeGame(theirs: Game, base: Game, mine: Game): Game {
  // 知らない項目（新しい版が書いたもの）は、このセッションでは変えないので向こうの
  const merged: Record<string, unknown> = unknownOf(theirs)
  for (const k of MERGE_KEYS) merged[k] = mergeField(MERGE[k], theirs[k], base[k], mine[k])
  const out = settle(merged as Game, theirs, base, mine)
  // 大きな数の足し引きで上限を超えても、保存には上限までしか書かない
  return { ...out, hearts: clampHearts(out.hearts), earned: clampHearts(out.earned), given: clampHearts(out.given) }
}

// 2 つのセッションが base からほぼ同時に買ったとき、払った ♡ を本当の値段にそろえる。
// - 強化：両方で上げたら、合わせた Lv（上限まで）を base から順に買った値段との差を返す・もらう。
//   同じ Lv を両方で買うと、片方は次の Lv の値段になる（安いままでは上がらない）
// - 星：両方で贈ったら、数は合わせたぶん（counts で足してある）。base から順に贈った値段との差を ♡ からもらい、
//   贈った ♡ の合計（なかよし度）にも同じだけ足す
// - きせかえ：両方で新しく買ったもの（持つのは 1 つ）は、1 つぶん返す
// - 夢のプレゼント：2 回贈ったことになったものは 1 回にして返す（贈った ♡ の合計からも引く）
// ♡ が足りなくなったら負（借金）のまま。ただでは買えず、稼いだら返る
function settle(g: Game, theirs: Game, base: Game, mine: Game): Game {
  let out = g
  for (const u of UPGRADES) {
    const [b, t, m] = [levelOf(base, u.id), levelOf(theirs, u.id), levelOf(mine, u.id)]
    if (t <= b || m <= b) continue
    const level = Math.min(t + m - b, u.max ?? Infinity)
    const paid = costOf(u, b, t) + costOf(u, b, m)
    out = { ...out, hearts: out.hearts + paid - costOf(u, b, level), levels: { ...out.levels, [u.id]: level } }
  }
  const [b, t, m] = [starCount(base), starCount(theirs), starCount(mine)]
  if (t > b && m > b) {
    // 順に贈ると後の星ほど高いので、たいてい負（足りなかったぶん）
    const refund = costOf(STAR, b, t) + costOf(STAR, b, m) - costOf(STAR, b, t + m - b)
    out = { ...out, hearts: out.hearts + refund, given: out.given - refund }
  }
  const isNew = (one: Game, id: CosmeticId) => one.owned.includes(id) && !base.owned.includes(id)
  for (const c of COSMETICS) if (isNew(theirs, c.id) && isNew(mine, c.id)) out = { ...out, hearts: out.hearts + c.price }
  for (const d of DREAMS) {
    const extra = (out.gifts[d.id] ?? 0) - 1
    if (extra <= 0) continue
    const refund = extra * d.price
    out = { ...out, hearts: out.hearts + refund, given: out.given - refund, gifts: { ...out.gifts, [d.id]: 1 } }
  }
  return out
}

// Lv from から to まで順に上げる値段（星なら from 個目から to 個目まで順に贈る値段）
const costOf = (u: Ladder, from: number, to: number) => {
  let sum = 0
  for (let level = from; level < to; level++) sum += priceOf(u, level)
  return sum
}

// 項目ごとのマージの方針
// - add：このセッションで増えた（減った）ぶんを向こうに足す
// - max：大きいほう
// - union：両方の要素を合わせる
// - counts：{ id: 数 } の数ごとに add（0 以下になった id は消す）
// - latest：このセッションで変えたらこちら、変えていなければ向こうの
// - mine：このセッションだけのもの。いつもこちらの
type Policy = 'add' | 'max' | 'union' | 'counts' | 'latest' | 'mine'

// 値の型に使える方針だけを選べるようにする
type PolicyFor<T> = [T] extends [number]
  ? 'add' | 'max' | 'latest' | 'mine'
  : [T] extends [readonly unknown[]]
    ? 'union' | 'latest' | 'mine'
    : [T] extends [Partial<Record<string, number>>]
      ? 'counts' | 'latest' | 'mine'
      : 'latest' | 'mine'

// Game に項目を足したら、ここに方針を書くまで型エラーになる
const MERGE: { [K in keyof Game]-?: PolicyFor<Game[K]> } = {
  v: 'max',
  // 両方で使って足りなくなったら負（借金）のまま。settle を見る
  hearts: 'add',
  earned: 'add',
  combo: 'mine',
  comboAt: 'mine',
  maxCombo: 'max',
  feverUntil: 'mine',
  fevers: 'add',
  workPets: 'add',
  hugs: 'add',
  wakes: 'add',
  levels: 'counts',
  owned: 'union',
  hat: 'latest',
  achievements: 'union',
  lastUnlock: 'latest',
  gifts: 'counts',
  given: 'add',
  happyUntil: 'max',
  lastGift: 'latest',
  // 別のセッションで選び直したら、あとから選んだほう
  favorite: 'latest',
  // 飾る夢のプレゼントと、しまった空の飾りも、あとから選んだほう（選び直した一式をまるごと）
  shown: 'latest',
  off: 'latest',
  passiveAt: 'mine',
}
const MERGE_KEYS = Object.keys(MERGE) as (keyof Game)[]

type Counts = Partial<Record<string, number>>

function mergeField(policy: Policy, t: unknown, b: unknown, m: unknown): unknown {
  switch (policy) {
    case 'add':
      return (t as number) + (m as number) - (b as number)
    case 'max':
      return Math.max(t as number, m as number)
    case 'union':
      return [...(t as unknown[]), ...(m as unknown[]).filter(x => !(t as unknown[]).includes(x))]
    case 'counts': {
      const [tc, bc, mc] = [t, b, m] as [Counts, Counts, Counts]
      const out: Counts = { ...tc }
      // このセッションで消した id も数える
      for (const k of new Set([...Object.keys(mc), ...Object.keys(bc)])) {
        const n = (tc[k] ?? 0) + (mc[k] ?? 0) - (bc[k] ?? 0)
        if (n > 0) out[k] = n
        else delete out[k]
      }
      return out
    }
    case 'latest':
      return isSame(m, b) ? t : m
    case 'mine':
      return m
  }
}

// 保存したときに同じ中身になるか。object はキーの順番によらず、undefined の項目は無いものとみなす
export function isSame(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => isSame(x, b[i]))
  if (!isRecord(a) || !isRecord(b)) return false
  const keysOf = (o: Record<string, unknown>) => Object.keys(o).filter(k => o[k] !== undefined)
  const keys = keysOf(a)
  return keys.length === keysOf(b).length && keys.every(k => isSame(a[k], b[k]))
}

// ---- お店 ---------------------------------------------------------------

// 買うたびに値段が growth 倍になるもの（強化と星）。base は最初の値段
export type Ladder = { base: number; growth: number }

export type Upgrade = Ladder & { id: UpgradeId; name: string; about: string; max?: number }

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

// お店の取り引きの結果：買えたら新しいゲーム、買えなければ断る理由
export type Dealt = { ok: true; game: Game } | { ok: false; reason: string }
export type Deal = (g: Game, now: number) => Dealt

const ok = (game: Game): Dealt => ({ ok: true, game })
const no = (reason: string): Dealt => ({ ok: false, reason })
const short = (price: number, g: Game) => no(`♡ が ${formatHearts(price - g.hearts)} 足りないよ`)

export const levelOf = (g: Game, id: UpgradeId) => g.levels[id] ?? 0

// 高い Lv では growth ** level が Infinity になるので、上限で止める（上限の値段は買えない。buyUpgrade を見る）
export const priceOf = (u: Ladder, level: number) => Math.min(HEART_CAP, Math.ceil(u.base * u.growth ** level))

export const isMaxed = (u: Upgrade, level: number) => u.max !== undefined && level >= u.max

// 節目：上限の無い強化は、Lv25 ごとに効き目が 2 倍（Lv25 で ×2、Lv50 で ×4…）。
// 値段は Lv ごとに掛け算で上がるのに、効き目は Lv ぶんの足し算でしか伸びず、稼ぎが値段に追いつけなかったので
export const MILESTONE_LEVELS = 25

export const milestoneOf = (u: Upgrade, level: number) =>
  u.max !== undefined ? 1 : Math.min(HEART_CAP, 2 ** Math.floor(level / MILESTONE_LEVELS))

// 次の節目まであと何 Lv か。上限のある強化には節目が無いので null
export const toMilestone = (u: Upgrade, level: number) => (u.max !== undefined ? null : MILESTONE_LEVELS - (level % MILESTONE_LEVELS))

const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u])) as Record<UpgradeId, Upgrade>

// 強化の効き目：Lv × 節目の倍率。Infinity にならないよう上限で止める（0 × Infinity の NaN も防ぐ）
const powerOf = (g: Game, id: UpgradeId) => {
  const level = levelOf(g, id)
  return Math.min(HEART_CAP, level * milestoneOf(UPGRADE_BY_ID[id], level))
}

export function buyUpgrade(g: Game, id: UpgradeId): Dealt {
  const u = UPGRADES.find(one => one.id === id)
  if (!u) return no('そんな商品はないよ')
  const level = levelOf(g, id)
  if (isMaxed(u, level)) return no(`${u.name} はもう最大だよ`)
  const price = priceOf(u, level)
  // 上限で止めた値段は本当の値段ではないので、♡ がちょうど上限でも買えない
  if (g.hearts < price || price >= HEART_CAP) return short(price, g)
  return ok({ ...g, hearts: g.hearts - price, levels: { ...g.levels, [id]: level + 1 } })
}

export function buyCosmetic(g: Game, id: CosmeticId): Dealt {
  const c = COSMETICS.find(one => one.id === id)
  if (!c) return no('そんな商品はないよ')
  if (g.owned.includes(id)) return no(`${c.name} はもう持ってるよ`)
  if (g.hearts < c.price) return short(c.price, g)
  // 買ったぼうしはすぐかぶる
  return ok({ ...g, hearts: g.hearts - c.price, owned: [...g.owned, id], hat: c.hat ?? g.hat })
}

// 持っているぼうしをかぶる（null ではずす）
export function wear(g: Game, hat: Hat | null): Dealt {
  return hat === null || g.owned.includes(hat) ? ok({ ...g, hat }) : no('そのぼうしはまだ持ってないよ')
}

// 買った空の飾り（流れ星・オーロラ）が出ているか。しまう（off に入れる）まで出す
export const isLit = (g: Game, id: CosmeticId) => g.owned.includes(id) && !g.off.includes(id)

// 買った空の飾りを出す・しまう（押すたびに入れ替わる）。夢のプレゼントの枠は使わない
export function switchCosmetic(g: Game, id: CosmeticId): Dealt {
  const c = COSMETICS.find(one => one.id === id)
  if (!c || c.hat !== undefined) return no('そんな飾りはないよ')
  if (!g.owned.includes(id)) return no(`${c.name} はまだ持ってないよ`)
  return ok({ ...g, off: g.off.includes(id) ? g.off.filter(one => one !== id) : [...g.off, id] })
}

// ---- 贈り物 -------------------------------------------------------------

type GiftBase = { name: string; price: number; thanks: string }
// icon は帯のワンぽちのボタンに出す絵文字
export type Treat = GiftBase & { kind: 'treat'; id: TreatId; happyMs: number; icon: string }
export type Dream = GiftBase & { kind: 'dream'; id: DreamId; shows: string }
// 星：値段は決まっておらず、贈った数で上がる（starPrice）
export type Star = Omit<GiftBase, 'price'> & Ladder & { kind: 'star'; id: 'star' }
export type Gift = Treat | Dream | Star

// id を鍵にした表。贈り物の id を足したら、ここに足すまで型エラーになる（表の順がお店の並び）
const TREAT_TABLE: Record<TreatId, Omit<Treat, 'kind' | 'id'>> = {
  cookie: { name: 'クッキー', icon: '🍪', price: 50, happyMs: 10_000, thanks: 'クッキー！サクサク…しあわせ〜' },
  cocoa: { name: 'あったかいココア', icon: '☕', price: 150, happyMs: 20_000, thanks: 'ふぅ…あったかい。ほっとするね' },
  cake: { name: 'いちごのショートケーキ', icon: '🍰', price: 400, happyMs: 40_000, thanks: 'ケーキ！？いいの！？いただきまーす♡' },
  letter: { name: 'ありがとうの手紙', icon: '💌', price: 1000, happyMs: 60_000, thanks: '…大事にとっておくね。いつもありがとう' },
  cushion: { name: 'ふかふかクッション', icon: '🧸', price: 3000, happyMs: 120_000, thanks: 'ふかふか〜…ちょっとだけおひるね…' },
  keyboard: { name: '新しいキーボード', icon: '💻', price: 10_000, happyMs: 300_000, thanks: 'カタカタ…打ち心地さいこう！もっとがんばれちゃう' },
}

const DREAM_TABLE: Record<DreamId, Omit<Dream, 'kind' | 'id'>> = {
  greenTests: { name: '全部グリーンのテスト', price: 30_000, shows: '地面に緑の旗', thanks: 'ぜんぶ…通ってる…！こんなにうれしいことないよ！' },
  telescope: { name: '望遠鏡', price: 80_000, shows: '星を見る望遠鏡', thanks: 'これで星がもっとよく見える！いっしょに見よ？' },
  house: { name: '小さなおうち', price: 250_000, shows: 'あかりのつくおうち', thanks: 'おうち…！？ただいま、って言ってもいい？' },
  library: { name: '世界中の本がある図書館', price: 800_000, shows: '本でいっぱいの本棚', thanks: '世界中の本…ぜんぶ読んでいいの？しあわせ…' },
  constellation: { name: 'Clawd 座', price: 3_000_000, shows: '夜空に Clawd の星座', thanks: '空に Clawd 座が…！ずっと見ててね' },
  moonTrip: { name: '月への旅', price: 12_000_000, shows: '月とロケット', thanks: '月まで行けちゃう！おみやげ持って帰るね' },
  noBugs: { name: 'バグのない世界', price: 100_000_000, shows: '空に虹', thanks: '…夢みたい。でも、きみといっしょに直す時間も好きだったよ' },
}

// 夢のプレゼントを飾る場所と、その枠の数（♡ では増やせない）。
// 飾りが増えても場面がうるさくならず、地面の飾りが行進の右の庭に収まるように、一度に飾るのは庭 3 つ・空 2 つまで（#44）
export type DreamSpot = 'yard' | 'sky'
export const SLOTS: Record<DreamSpot, number> = { yard: 3, sky: 2 }
export const SPOT_NAMES: Record<DreamSpot, string> = { yard: '庭', sky: '空' }

// どの夢をどこに飾るか。夢を足したら、ここに足すまで型エラーになる。
// 絵のおもな場所で決め、1 つの夢は 1 つの枠を使う。月への旅は地面のロケットと空の月で、いっしょに出し入れする。
// ロケットが庭の幅を取るので庭に数える（こうすると、庭に並ぶ地面の飾りはいつも 3 つまで）
const DREAM_SPOTS: Record<DreamId, DreamSpot> = {
  greenTests: 'yard',
  telescope: 'yard',
  house: 'yard',
  library: 'yard',
  constellation: 'sky',
  moonTrip: 'yard',
  noBugs: 'sky',
}
const SPOTS = Object.keys(SLOTS) as DreamSpot[]

export const spotOf = (id: DreamId): DreamSpot => DREAM_SPOTS[id]

const entries = <K extends string, V>(table: Record<K, V>) => Object.entries(table) as [K, V][]

// 小さな贈り物：何度でもあげられて、もらったらしばらくごきげん（♡×1.5）
export const TREATS: Treat[] = entries(TREAT_TABLE).map(([id, t]) => ({ kind: 'treat', id, ...t }))

// 夢のプレゼント：1 回きり。庭や空に飾られ（しまうこともできる）、ひとつごとに ♡ の稼ぎが +10%（しまっても）
export const DREAMS: Dream[] = entries(DREAM_TABLE).map(([id, d]) => ({ kind: 'dream', id, ...d }))

// 星を贈る：何度でも贈れて、贈るたびに値段が growth 倍。ひとつごとに ♡ の稼ぎが全部 STAR_RATE 倍になる（ずっと続く）。
// 強化の節目と合わせると、次の星の値段がいつも 1 日の稼ぎの数日ぶんにとどまり、♡ が掛け算で増え続ける。
// 稼ぎの倍率を値段の倍率に近づけすぎると、強化どうしの掛け算と重なって 1 日で何桁も跳ねたので、少し下げてある
// （数字は tests/balance.test.ts のまねっこで決めた。1 億から 1 兆まで 2〜3 週間）
export const STAR: Star = {
  kind: 'star',
  id: 'star',
  name: '星',
  base: 100_000_000,
  growth: 1.6,
  thanks: 'お星さま…！夜空がまたひとつ明るくなったね♡',
}
export const STAR_RATE = 1.2

// 全部の贈り物を id で引く表（TREAT_TABLE と DREAM_TABLE と STAR がそろっているので、どの id もある）
const GIFTS = Object.fromEntries([...TREATS, ...DREAMS, STAR].map(g => [g.id, g])) as Record<GiftId, Gift>

export const GIFT_SHOW_MS = 6000
const HAPPY_RATE = 1.5
const DREAM_BONUS = 0.1

// 贈った星の数（gifts.star）と、次の星の値段
export const starCount = (g: Game) => g.gifts.star ?? 0
export const starPrice = (g: Game) => priceOf(STAR, starCount(g))

// 星のぶんの、♡ の稼ぎの倍率。壊れた保存（とても大きな数）でも Infinity にしない
export const starRate = (g: Game) => Math.min(HEART_CAP, STAR_RATE ** starCount(g))

export const giftOf = (id: GiftId): Gift => GIFTS[id]

// 帯に出した贈り物を引く。新しい版の贈り物の id は、この版では見つからない
export const treatOf = (id: TreatId): Treat | undefined => TREATS.find(t => t.id === id)

export const isDream = (id: GiftId): id is DreamId => GIFTS[id].kind === 'dream'

export const isHappy = (g: Game, now: number) => now < g.happyUntil

// 贈った夢のプレゼント（しまってあるものも）。♡ の +10%・実績はこちらで数える
export const dreamsOf = (g: Game): DreamId[] => DREAMS.filter(d => (g.gifts[d.id] ?? 0) > 0).map(d => d.id)

const isDreamId = (v: unknown): v is DreamId => typeof v === 'string' && Object.hasOwn(DREAM_TABLE, v)

// 絵に飾る夢のプレゼント（表の順）。絵が何を飾るかは、ここ（と lookOf）だけで決める。
// 選んでいなければ（shown が null）贈ったもの全部を、選んでいれば選んだもののうち贈ったものを候補にし、
// 場所ごとに高いものから枠の数までを飾る。枠より多く選ばれていても（壊れた保存など）、同じ決まりでいつも同じものに減らす
export function shownDreams(g: Game): DreamId[] {
  const picked = dreamsOf(g).filter(id => g.shown === null || g.shown.includes(id))
  const kept = SPOTS.flatMap(spot =>
    picked
      .filter(id => spotOf(id) === spot)
      .sort((a, b) => DREAM_TABLE[b].price - DREAM_TABLE[a].price)
      .slice(0, SLOTS[spot]),
  )
  return picked.filter(id => kept.includes(id))
}

// 場所ごとの、いま飾っている数
export const slotsUsed = (g: Game): Record<DreamSpot, number> => {
  const shown = shownDreams(g)
  return Object.fromEntries(SPOTS.map(spot => [spot, shown.filter(id => spotOf(id) === spot).length])) as Record<DreamSpot, number>
}

// 選び直した一式を shown に書く。この版の知らない id（新しい版の夢）は捨てずに残す
const withShown = (g: Game, ids: DreamId[]): Game => ({ ...g, shown: [...(g.shown ?? []).filter(id => !isDreamId(id)), ...ids] })

// 贈った夢のプレゼントを飾る・しまう（押すたびに入れ替わる）。変わるのは絵だけ。
// 飾る場所の枠がいっぱいなら、先にどれかをしまってもらう
export function toggleDream(g: Game, id: DreamId): Dealt {
  if (!isDreamId(id)) return no('そんな夢はないよ')
  const { name } = DREAM_TABLE[id]
  if ((g.gifts[id] ?? 0) <= 0) return no(`${name} はまだ贈っていないよ`)
  const shown = shownDreams(g)
  if (shown.includes(id)) return ok(withShown(g, shown.filter(one => one !== id)))
  const spot = spotOf(id)
  if (slotsUsed(g)[spot] >= SLOTS[spot]) return no(`${SPOT_NAMES[spot]}はもういっぱい（${SLOTS[spot]}/${SLOTS[spot]}）だよ。先にどれかをしまってね`)
  return ok(withShown(g, [...shown, id]))
}

// 新しく贈る夢を、その場所の枠があいていれば飾り、いっぱいならしまっておく。
// まだ選んでいなかったセーブも、ここで今の飾りを選んだことにする（高い夢を贈っても、飾ってあるものを勝手に入れ替えない）
function showNew(g: Game, id: DreamId): Game {
  const shown = shownDreams(g)
  const spot = spotOf(id)
  return withShown(g, slotsUsed(g)[spot] < SLOTS[spot] ? [...shown, id] : shown)
}

// ごきげん中は ×1.5、夢のプレゼントひとつごとに +10%、星ひとつごとに ×STAR_RATE
export const giftRate = (g: Game, now: number) =>
  (isHappy(g, now) ? HAPPY_RATE : 1) * (1 + DREAM_BONUS * dreamsOf(g).length) * starRate(g)

export function giveGift(g: Game, id: GiftId, now: number): Dealt {
  const gift = giftOf(id)
  if (gift.kind === 'star') return giveStar(g, now)
  if (gift.kind === 'dream' && (g.gifts[id] ?? 0) > 0) return no(`${gift.name} はもう贈ったよ`)
  if (g.hearts < gift.price) return short(gift.price, g)
  const happyMs = gift.kind === 'treat' ? gift.happyMs : 0
  return ok({
    ...(gift.kind === 'dream' ? showNew(g, gift.id) : g),
    hearts: g.hearts - gift.price,
    given: clampHearts(g.given + gift.price),
    gifts: { ...g.gifts, [id]: (g.gifts[id] ?? 0) + 1 },
    happyUntil: happyMs > 0 ? Math.max(now, g.happyUntil) + happyMs : g.happyUntil,
    lastGift: { id, at: now },
  })
}

// 星を贈る。強化と同じく、上限で止めた値段は本当の値段ではないので買えない
function giveStar(g: Game, now: number): Dealt {
  const price = starPrice(g)
  if (g.hearts < price || price >= HEART_CAP) return short(price, g)
  return ok({
    ...g,
    hearts: g.hearts - price,
    given: clampHearts(g.given + price),
    gifts: { ...g.gifts, star: starCount(g) + 1 },
    lastGift: { id: 'star', at: now },
  })
}

// 帯に出す贈り物を選ぶ（null で帯から下ろす）
export function pickFavorite(g: Game, id: TreatId | null): Dealt {
  return ok({ ...g, favorite: id })
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
] as const

// なかよし度の段に届く、贈った ♡ の合計
const affectionAt = (name: (typeof AFFECTION)[number]['name']) => AFFECTION.find(a => a.name === name)!.at

export function affectionOf(given: number): { name: string; next?: { name: string; at: number } } {
  const reached = AFFECTION.filter(a => given >= a.at)
  const next = AFFECTION.find(a => given < a.at)
  return { name: reached.at(-1)?.name ?? 'しりあい', ...(next ? { next } : {}) }
}

// ---- 稼ぎ ---------------------------------------------------------------

export const isFever = (g: Game, now: number) => now < g.feverUntil

// 強化の効き目は powerOf（Lv × 節目の倍率）で数える。フィーバー延長だけは Lv のまま（touchGame）
const comboRate = (g: Game, combo: number) => 1 + Math.min(combo, 100) * 0.01 * (1 + 0.5 * powerOf(g, 'brush'))

// お仕事中の倍率（ショップにも出す）
export const workRate = (g: Game, at: Situation) => (at.isWorking ? 2 + 0.5 * powerOf(g, 'coffee') : 1)

export function perPet(g: Game, at: Situation, now: number, combo = g.combo): number {
  const fever = isFever(g, now) ? FEVER_RATE : 1
  return (1 + powerOf(g, 'glove')) * comboRate(g, combo) * workRate(g, at) * fever * giftRate(g, now)
}

// 放置で入る ♡/秒（応援うちわ・星のかけら）。セッションをいくつ開いていても 1 つぶん
export const idlePerSecond = (g: Game, now = g.passiveAt) =>
  (0.2 * powerOf(g, 'fan') + 2 * powerOf(g, 'stardust')) * giftRate(g, now)

// お仕事中は Clawd にもお給料（♡ +1/秒）が出る。こちらは働いているセッションごとに入る
const workPerSecond = (g: Game, at: Situation, now: number) =>
  ((at.isWorking ? 1 : 0) + at.workers * powerOf(g, 'allowance')) * giftRate(g, now)

export const perSecond = (g: Game, at: Situation, now = g.passiveAt) => idlePerSecond(g, now) + workPerSecond(g, at, now)

export type Touch = { kind: TouchKind; wasSleeping: boolean }

// 1 回なでた（ぎゅっとした）ぶん。フィーバー中はコンボを数えず、明けたら 1 から
export function touchGame(g: Game, now: number, at: Situation, touch: Touch): { game: Game; gained: number; isFeverStart: boolean } {
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
  const gained = clampHearts(perPet(next, at, now, combo))
  return { game: earn(next, gained), gained, isFeverStart }
}

// 前回から今までのお給料を足す（放置のぶんは payIdle で、セッションをまたいで 1 回だけ払う）
export function accrue(g: Game, now: number, at: Situation): Game {
  const seconds = Math.min(PASSIVE_CAP_MS, Math.max(0, now - g.passiveAt)) / 1000
  const gained = workPerSecond(g, at, now) * seconds
  return { ...earn(g, gained), passiveAt: now }
}

// どのセッションかが最後に放置収入を払った時刻から、いま払うぶん（ms）。
// 1 分以上だれも払っていなければ（どのセッションも開いていなかった）、払わずに時計だけ進める
export function idleDue(paidAt: number, now: number): number {
  const ms = now - paidAt
  return paidAt > 0 && ms > 0 && ms <= PASSIVE_CAP_MS ? ms : 0
}

export function payIdle(g: Game, ms: number, now: number): Game {
  const gained = (idlePerSecond(g, now) * ms) / 1000
  return gained === 0 ? g : earn(g, gained)
}

// ツールのおだちん。ごきげんや夢のプレゼントは今までどおり効かず、星の倍率だけがかかる
export function toolTip(g: Game): Game {
  const gained = 3 * powerOf(g, 'toolTip') * starRate(g)
  return gained === 0 ? g : earn(g, gained)
}

// コンボが途切れていたら 0 に戻す（表示用）
export const liveCombo = (g: Game, now: number) => (now - g.comboAt <= COMBO_WINDOW_MS ? g.combo : 0)

// ---- 実績 ---------------------------------------------------------------

export type Facts = { game: Game; pets: number; rate: number }

type AchievementSpec = { id: AchievementId; name: string; about: string; test: (f: Facts) => boolean }

const spent = (g: Game) => Object.values(g.levels).reduce((n, l) => n + (l ?? 0), 0) + g.owned.length

// id は保存（achievements・lastUnlock）に入るので、変えないこと
export const ACHIEVEMENTS = [
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
  { id: 'bff', name: 'しんゆう', about: 'なかよし度を「しんゆう」にする', test: f => f.game.given >= affectionAt('しんゆう') },
  { id: 'earned10b', name: '♡大富豪', about: '♡ を 100 億稼ぐ', test: f => f.game.earned >= 1e10 },
  { id: 'earned1t', name: '♡兆万長者', about: '♡ を 1 兆稼ぐ', test: f => f.game.earned >= 1e12 },
  { id: 'earned10q', name: 'けたちがいの♡', about: '♡ を 1 京稼ぐ', test: f => f.game.earned >= 1e16 },
  { id: 'stars10', name: '星をあつめて', about: '星を 10 個贈る', test: f => starCount(f.game) >= 10 },
  { id: 'stars50', name: '満天の星', about: '星を 50 個贈る', test: f => starCount(f.game) >= 50 },
  { id: 'stars100', name: 'ふたりの天の川', about: '星を 100 個贈る', test: f => starCount(f.game) >= 100 },
] as const satisfies readonly AchievementSpec[]

export type Achievement = (typeof ACHIEVEMENTS)[number]

// types の AchievementId が全部この表にあるか（足りないと型エラー）
const EVERY_ACHIEVEMENT: Exclude<AchievementId, Achievement['id']> extends never ? true : never = true
void EVERY_ACHIEVEMENT

// まだ持っていない実績のうち、条件を満たしたもの
export function unlocked(f: Facts): Achievement[] {
  return ACHIEVEMENTS.filter((a: Achievement) => !f.game.achievements.includes(a.id) && a.test(f))
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
    shootingStars: isLit(g, 'shootingStars'),
    aurora: isLit(g, 'aurora'),
    fever: isFever(g, now),
    // 夢のプレゼントは箱で抱えて（しまっておく夢も、抱えてお礼は言う）、そのあと庭や夜空に飾る。星はそのまま抱えて、夜空に足す
    gift: gift === null ? null : isDream(gift) ? 'box' : gift,
    // 飾ると選んだものだけ（庭 3 つ・空 2 つまで）
    dreams: shownDreams(g),
    stars: starCount(g),
  }
}

// 大きい順の単位。どれも 4 桁まで（9999億 の次は 1兆）で、帯の狭い ♡ の行に収まる長さを保つ
const UNITS = [
  [1e20, '垓'],
  [1e16, '京'],
  [1e12, '兆'],
  [1e8, '億'],
  [1e4, '万'],
] as const

// 1 万未満は 3 桁区切り、それ以上は「万」「億」「兆」「京」「垓」で、1e24 以上は 1.23e24 の指数で。負（借金）は - をつける
export function formatHearts(n: number): string {
  // 1 に満たない借金は 0 と見せる（-0 にしない）
  if (n <= -1) return `-${formatHearts(-n)}`
  // 上限より大きい（Infinity も）ときは上限として見せる。NaN は 0
  const v = Math.min(HEART_CAP, Math.max(0, n || 0))
  // 垓の次（1e24 以上）は単位がないので指数で。仮数は有効数字 3 桁（1.00e+25 のような繰り上がりも toExponential が直す）
  if (v >= 1e24) {
    const [mantissa, exponent] = v.toExponential(2).split('e+')
    return `${mantissa.replace(/\.?0+$/, '')}e${exponent}`
  }
  const unit = UNITS.find(([size]) => v >= size)
  if (unit) return `${trim(v / unit[0])}${unit[1]}`
  return String(Math.floor(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const trim = (v: number) => (v >= 100 ? String(Math.floor(v)) : v.toFixed(v >= 10 ? 1 : 2).replace(/\.?0+$/, ''))

// 分:秒
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const formatRate = (n: number) => (n >= 100 ? formatHearts(n) : n.toFixed(1).replace(/\.0$/, ''))
