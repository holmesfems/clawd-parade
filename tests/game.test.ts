// game.ts の純粋な関数の単体テスト。$ を使わず、値を渡して返りを見る

import { expect, test } from 'claude-code/testing'

import type { Game } from '../types'
import type { Dealt } from '../hooks/game'
import {
  COMBO_WINDOW_MS,
  FEVER_COMBO,
  FEVER_MS,
  DREAMS,
  TREATS,
  UPGRADES,
  affectionOf,
  buyCosmetic,
  buyUpgrade,
  formatHearts,
  formatRate,
  giftOf,
  giveGift,
  idleDue,
  isSame,
  isDream,
  isMaxed,
  mergeGame,
  newGame,
  payIdle,
  priceOf,
  restore,
  touchGame,
  unlocked,
  wear,
} from '../hooks/game'
import type { Situation } from '../hooks/game'

const resting: Situation = { isWorking: false, workers: 0 }
const pet = { kind: 'pet', wasSleeping: false } as const

const game = (over: Partial<Game> = {}): Game => ({ ...newGame(0, 1_000), ...over })

const upgrade = (id: string) => UPGRADES.find(u => u.id === id)!

// 買えたときのゲーム（断られたらテストを落とす）
const bought = (dealt: Dealt): Game => {
  if (!dealt.ok) throw new Error(dealt.reason)
  return dealt.game
}

// ---- 保存 ----

test('restore：保存が無ければ、なでた回数を ♡ にした新しいゲーム', () => {
  for (const saved of [undefined, null, 'x', 3, []]) {
    const g = restore(saved, newGame(42, 5_000))
    expect(g.hearts).toBe(42)
    expect(g.earned).toBe(42)
    expect(g.levels).toEqual({})
    expect(g.passiveAt).toBe(5_000)
  }
})

test('restore：古い形（gifts も v も無い）をそのまま読み、足りない項目は初期値で埋める', () => {
  const old = { hearts: 120, earned: 300, levels: { glove: 2 }, owned: ['ribbon'], hat: 'ribbon', achievements: ['pets1'] }
  const g = restore(old, newGame(7, 5_000))
  expect(g.hearts).toBe(120)
  expect(g.earned).toBe(300)
  expect(g.levels).toEqual({ glove: 2 })
  expect(g.owned).toEqual(['ribbon'])
  expect(g.hat).toBe('ribbon')
  expect(g.achievements).toEqual(['pets1'])
  expect(g.gifts).toEqual({})
  expect(g.lastGift).toBeNull()
  expect(g.v).toBe(1)
  // 放置収入の時計は、いつも読み込んだ時刻から
  expect(g.passiveAt).toBe(5_000)
})

test('restore：型が壊れた項目だけを初期値に戻し、ほかは残す', () => {
  const broken = {
    hearts: 50,
    earned: 'many',
    maxCombo: Infinity,
    fevers: NaN,
    levels: null,
    owned: 'crown',
    achievements: ['pets1', 3, null, 'fever1'],
    gifts: { cake: 2, cookie: -1, cocoa: 'x', keyboard: Infinity },
    hat: 'witch',
    lastUnlock: { id: 7, at: 1 },
    lastGift: { id: 'pizza', at: 1 },
    given: 400,
  }
  const g = restore(broken, newGame(9, 5_000))
  expect(g.hearts).toBe(50)
  expect(g.given).toBe(400)
  expect(g.earned).toBe(9)
  expect(g.maxCombo).toBe(0)
  expect(g.fevers).toBe(0)
  expect(g.levels).toEqual({})
  expect(g.owned).toEqual([])
  // 配列と数の表は、合っている要素だけを残す
  expect(g.achievements).toEqual(['pets1', 'fever1'])
  expect(g.gifts).toEqual({ cake: 2 })
  expect(g.hat).toBeNull()
  expect(g.lastUnlock).toBeNull()
  expect(g.lastGift).toBeNull()
})

test('restore：♡ が壊れていたら、なでた回数から作り直す。ほかの項目は残す', () => {
  const g = restore({ hearts: 'lots', earned: 900, owned: ['crown'] }, newGame(33, 5_000))
  expect(g.hearts).toBe(33)
  expect(g.earned).toBe(900)
  expect(g.owned).toEqual(['crown'])
})

test('restore：持っていないぼうしはかぶらない', () => {
  expect(restore({ hearts: 1, hat: 'crown', owned: 'oops' }, newGame(0, 5_000)).hat).toBeNull()
  expect(restore({ hearts: 1, hat: 'crown', owned: ['ribbon'] }, newGame(0, 5_000)).hat).toBeNull()
})

test('restore：今の形のゲームは、読み直しても変わらない', () => {
  const g = game({ hearts: 5, levels: { glove: 2 }, owned: ['ribbon'], hat: 'ribbon', gifts: { cake: 1 }, lastGift: { id: 'cake', at: 3 } })
  expect(restore(g, newGame(0, g.passiveAt))).toEqual(g)
  // 前の版のセッションに残っていた v の無いゲームには、v を埋める
  const { v: _, ...older } = g
  expect(restore(older, newGame(0, g.passiveAt))).toEqual(g)
})

test('restore：形の合う hat・lastUnlock・lastGift は残す', () => {
  const g = restore(
    { hearts: 1, owned: ['crown'], hat: 'crown', lastUnlock: { id: 'pets1', at: 10 }, lastGift: { id: 'cake', at: 20 } },
    newGame(0, 5_000),
  )
  expect(g.hat).toBe('crown')
  expect(g.lastUnlock).toEqual({ id: 'pets1', at: 10 })
  expect(g.lastGift).toEqual({ id: 'cake', at: 20 })
})

test('restore：知らない項目（新しい版が書いたもの）と、新しい版の v は残す', () => {
  const g = restore({ hearts: 1, v: 2, favorite: 'cake' }, newGame(0, 5_000)) as Game & { favorite?: unknown }
  expect(g.favorite).toBe('cake')
  expect(g.v).toBe(2)
  expect(restore({ hearts: 1, v: 'x' }, newGame(0, 5_000)).v).toBe(1)
})

test('restore：壊れた保存を読んでも、そのあとの計算で例外が出ない', () => {
  const g = restore({ hearts: 10, levels: null, gifts: [], owned: 5, achievements: {} }, newGame(0, 5_000))
  const touched = touchGame(g, 6_000, resting, pet)
  expect(touched.gained).toBe(1.01)
  expect(giveGift(touched.game, 'cookie', 6_000).ok).toBe(false)
})

test('newGame は保存形式の版 v: 1 を持つ', () => {
  expect(newGame(0, 0).v).toBe(1)
})

test('mergeGame：数は差分を足し、♡ は 0 で止める', () => {
  const base = game({ hearts: 100, earned: 100, fevers: 1, workPets: 5, hugs: 2, wakes: 1, given: 0 })
  const theirs = { ...base, hearts: 150, earned: 150, fevers: 2 }
  const mine = { ...base, hearts: 130, earned: 130, workPets: 8, hugs: 3, wakes: 2 }
  const merged = mergeGame(theirs, base, mine)
  expect(merged.hearts).toBe(180)
  expect(merged.earned).toBe(180)
  expect(merged.fevers).toBe(2)
  expect(merged.workPets).toBe(8)
  expect(merged.hugs).toBe(3)
  expect(merged.wakes).toBe(2)

  // 両方で使ったら、負にはならず 0 で止まる
  expect(mergeGame({ ...base, hearts: 10 }, base, { ...base, hearts: 20 }).hearts).toBe(0)
})

test('mergeGame：♡ だけは 0 で止め、ほかの数は差分をそのまま足す', () => {
  const base = game({ hearts: 10, earned: 10 })
  const merged = mergeGame({ ...base, hearts: 0, earned: 0 }, base, { ...base, hearts: 5, earned: 5 })
  expect(merged.hearts).toBe(0)
  expect(merged.earned).toBe(-5)
})

test('mergeGame：このセッションで消した id も、差分として数える', () => {
  const base = game({ gifts: { cake: 2 } })
  const merged = mergeGame({ ...base, gifts: { cake: 3 } }, base, { ...base, gifts: {} })
  expect(merged.gifts).toEqual({ cake: 1 })
})

test('mergeGame：レベルと贈り物の数は差分を足し、0 以下は消す', () => {
  const base = game({ levels: { glove: 1, fan: 1 }, gifts: { cake: 1 } })
  const theirs = { ...base, levels: { glove: 2, fan: 1 }, gifts: { cake: 1, cookie: 1 } }
  const mine = { ...base, levels: { glove: 1, fan: 1, brush: 1 }, gifts: { cake: 2 } }
  const merged = mergeGame(theirs, base, mine)
  expect(merged.levels).toEqual({ glove: 2, fan: 1, brush: 1 })
  expect(merged.gifts).toEqual({ cake: 2, cookie: 1 })

  const gone = mergeGame(game({ levels: { glove: 0 } }), game({ levels: { glove: 1 } }), game({ levels: { glove: 1 } }))
  expect(gone.levels).toEqual({})
})

test('mergeGame：持ち物と実績は合わせ、最大コンボとごきげんは大きいほう', () => {
  const base = game({ owned: ['ribbon'], achievements: ['pets1'], maxCombo: 5, happyUntil: 100 })
  const theirs: Game = { ...base, owned: ['ribbon', 'crown'], achievements: ['pets1', 'fever1'], maxCombo: 12 }
  const mine: Game = { ...base, owned: ['ribbon', 'aurora'], achievements: ['pets1', 'combo10'], happyUntil: 500 }
  const merged = mergeGame(theirs, base, mine)
  expect(merged.owned).toEqual(['ribbon', 'crown', 'aurora'])
  expect(merged.achievements).toEqual(['pets1', 'fever1', 'combo10'])
  expect(merged.maxCombo).toBe(12)
  expect(merged.happyUntil).toBe(500)
})

test('mergeGame：ぼうし・最後の実績・最後の贈り物は、このセッションで変えたときだけこちらの値', () => {
  const base = game({ hat: 'ribbon', lastUnlock: { id: 'pets1', at: 1 }, lastGift: null })
  const theirs = { ...base, hat: 'crown' as const, lastGift: { id: 'cake' as const, at: 5 } }
  // こちらは何も変えていない
  const kept = mergeGame(theirs, base, base)
  expect(kept.hat).toBe('crown')
  expect(kept.lastGift).toEqual({ id: 'cake', at: 5 })
  // こちらでぼうしをはずした
  const changed = mergeGame(theirs, base, { ...base, hat: null })
  expect(changed.hat).toBeNull()
  expect(changed.lastUnlock).toEqual({ id: 'pets1', at: 1 })
})

test('mergeGame：キーの順番が違うだけなら、変えていないとみなす', () => {
  const base = game({ lastGift: { id: 'cake', at: 5 } })
  const theirs = { ...base, lastGift: { id: 'cookie' as const, at: 9 } }
  // 保存から読み直すと、キーの順番が変わることがある
  const reordered = { ...base, lastGift: { at: 5, id: 'cake' as const } }
  expect(mergeGame(theirs, base, reordered).lastGift).toEqual({ id: 'cookie', at: 9 })
})

test('isSame：中身で比べ、object のキーの順番によらない', () => {
  expect(isSame({ id: 'cake', at: 5 }, { at: 5, id: 'cake' })).toBe(true)
  expect(isSame({ id: 'cake', at: 5 }, { id: 'cake', at: 6 })).toBe(false)
  // 保存すると undefined の項目は消えるので、無いのと同じ
  expect(isSame({ id: 'cake' }, { id: 'cake', at: undefined })).toBe(true)
  expect(isSame({ id: 'cake', at: 5 }, { id: 'cake', at: undefined })).toBe(false)
  expect(isSame(null, null)).toBe(true)
  expect(isSame(null, {})).toBe(false)
  expect(isSame(['a', 'b'], ['a', 'b'])).toBe(true)
  expect(isSame(['a', 'b'], ['b', 'a'])).toBe(false)
  expect(isSame([], {})).toBe(false)
  expect(isSame(0, -0)).toBe(true)
})

test('mergeGame：知らない項目（新しい版が書いたもの）は、向こうの値を残す', () => {
  const base = { ...game(), favorite: 'cookie' } as Game
  const theirs = { ...base, favorite: 'cake', v: 2 } as Game
  const merged = mergeGame(theirs, base, { ...base, hearts: 5 }) as Game & { favorite?: unknown }
  expect(merged.favorite).toBe('cake')
  expect(merged.v).toBe(2)
  expect(merged.hearts).toBe(5)
})

test('mergeGame：セッションだけのもの（コンボ・フィーバー・放置の時計）はこちらの値', () => {
  const base = game()
  const theirs = { ...base, combo: 9, comboAt: 9, feverUntil: 9, passiveAt: 9 }
  const mine = { ...base, combo: 3, comboAt: 3, feverUntil: 3, passiveAt: 3 }
  const merged = mergeGame(theirs, base, mine)
  expect([merged.combo, merged.comboAt, merged.feverUntil, merged.passiveAt]).toEqual([3, 3, 3, 3])
})

test('実績「しんゆう」は、なかよし度が「しんゆう」に届いたとき', () => {
  const ids = (given: number) => unlocked({ game: game({ given }), pets: 0, rate: 0 }).map(a => a.id)
  expect(affectionOf(300_000).name).toBe('しんゆう')
  expect(ids(300_000)).toContain('bff')
  expect(ids(299_999)).not.toContain('bff')
})

// ---- 放置収入 ----

test('idleDue：最後に払ってから 1 分以内のぶんだけ払う', () => {
  expect(idleDue(1_000, 3_000)).toBe(2_000)
  expect(idleDue(1_000, 61_000)).toBe(60_000)
  // 1 分を超えて空いた（どのセッションも開いていなかった）
  expect(idleDue(1_000, 61_001)).toBe(0)
  // まだだれも払っていない・時計が戻った
  expect(idleDue(0, 3_000)).toBe(0)
  expect(idleDue(3_000, 3_000)).toBe(0)
  expect(idleDue(4_000, 3_000)).toBe(0)
})

test('payIdle：応援うちわと星のかけらのぶんを足す', () => {
  const g = game({ levels: { fan: 5, stardust: 1 } })
  const paid = payIdle(g, 2_000, 1_000)
  // (0.2 × 5 + 2 × 1) × 2 秒
  expect(paid.hearts).toBe(6)
  expect(paid.earned).toBe(6)
  // 放置の強化が無ければ、そのまま返す
  const idle = game()
  expect(payIdle(idle, 2_000, 1_000)).toBe(idle)
})

// ---- 表示 ----

test('formatHearts：1 万未満は 3 桁区切り、それ以上は万・億', () => {
  expect(formatHearts(0)).toBe('0')
  expect(formatHearts(-5)).toBe('0')
  expect(formatHearts(999.9)).toBe('999')
  expect(formatHearts(1_234)).toBe('1,234')
  expect(formatHearts(12_000)).toBe('1.2万')
  expect(formatHearts(10_000)).toBe('1万')
  expect(formatHearts(123_456)).toBe('12.3万')
  expect(formatHearts(1_234_567)).toBe('123万')
  expect(formatHearts(250_000_000)).toBe('2.5億')
})

test('formatRate：100 未満は小数 1 桁、それ以上は formatHearts', () => {
  expect(formatRate(0)).toBe('0')
  expect(formatRate(2.25)).toBe('2.3')
  expect(formatRate(3)).toBe('3')
  expect(formatRate(12_345)).toBe('1.23万')
})

test('affectionOf：贈った ♡ でなかよし度が上がり、次の段を教える', () => {
  expect(affectionOf(0)).toEqual({ name: 'しりあい', next: { name: 'ともだち', at: 300 } })
  expect(affectionOf(300)).toEqual({ name: 'ともだち', next: { name: 'なかよし', at: 3_000 } })
  expect(affectionOf(299_999).name).toBe('だいすき')
  expect(affectionOf(100_000_000)).toEqual({ name: 'ずっといっしょ' })
})

// ---- お店 ----

test('priceOf と isMaxed', () => {
  expect(priceOf(upgrade('glove'), 0)).toBe(15)
  expect(priceOf(upgrade('glove'), 1)).toBe(18)
  // 600 × 1.6² は小数の誤差で 1536 を少し超えるので、切り上げて 1537
  expect(priceOf(upgrade('feverTime'), 2)).toBe(1537)
  expect(isMaxed(upgrade('feverTime'), 4)).toBe(false)
  expect(isMaxed(upgrade('feverTime'), 5)).toBe(true)
  // 上限の無い強化は、いつまでも買える
  expect(isMaxed(upgrade('glove'), 1_000)).toBe(false)
})

test('お店：買えたら ok と新しいゲーム、買えなければ理由', () => {
  const rich = game({ hearts: 10_000, owned: ['ribbon'] })
  expect(bought(buyUpgrade(rich, 'glove')).levels).toEqual({ glove: 1 })
  expect(buyUpgrade(game({ levels: { feverTime: 5 } }), 'feverTime')).toEqual({ ok: false, reason: 'フィーバー延長 はもう最大だよ' })
  // 買ったぼうしはすぐかぶる
  expect(bought(buyCosmetic(rich, 'crown')).hat).toBe('crown')
  expect(buyCosmetic(rich, 'ribbon')).toEqual({ ok: false, reason: 'リボン はもう持ってるよ' })
  // 持っていないぼうしはかぶれない
  expect(wear(rich, 'santa')).toEqual({ ok: false, reason: 'そのぼうしはまだ持ってないよ' })
  expect(bought(wear(rich, 'ribbon')).hat).toBe('ribbon')
})

test('贈り物の表：どの id も引け、小さな贈り物と夢のプレゼントを kind で見分ける', () => {
  for (const t of TREATS) expect(giftOf(t.id)).toMatchObject({ kind: 'treat', id: t.id })
  for (const d of DREAMS) expect(giftOf(d.id)).toMatchObject({ kind: 'dream', id: d.id })
  expect(isDream('house')).toBe(true)
  expect(isDream('cake')).toBe(false)
  // お店の並びは表の順
  expect(TREATS.map(t => t.id)).toEqual(['cookie', 'cocoa', 'cake', 'letter', 'cushion', 'keyboard'])
})

// ---- なでなで ----

test('touchGame：続けてなでるとコンボが伸び、間があくと 1 から', () => {
  let g = game()
  for (let i = 0; i < 3; i++) g = touchGame(g, 2_000 + i * 200, resting, pet).game
  expect(g.combo).toBe(3)
  expect(g.maxCombo).toBe(3)
  // コンボの分だけ 1 なでの ♡ が増える：1.01 + 1.02 + 1.03
  expect(g.hearts).toBeGreaterThan(3.0599)
  expect(g.hearts).toBeLessThan(3.0601)

  const later = touchGame(g, 2_400 + COMBO_WINDOW_MS + 1, resting, pet).game
  expect(later.combo).toBe(1)
  expect(later.maxCombo).toBe(3)
})

test('touchGame：30 コンボでフィーバー。その間はコンボを数えず ♡×3、明けたら 1 から', () => {
  let g = game({ levels: { feverTime: 1 } })
  let starts = 0
  let at = 2_000
  for (let i = 0; i < FEVER_COMBO; i++) {
    const touched = touchGame(g, (at += 100), resting, pet)
    g = touched.game
    if (touched.isFeverStart) starts += 1
  }
  expect(starts).toBe(1)
  expect(g.fevers).toBe(1)
  expect(g.combo).toBe(0)
  // フィーバー延長 Lv1 で 2 秒長い
  expect(g.feverUntil).toBe(at + FEVER_MS + 2_000)

  const inFever = touchGame(g, (at += 100), resting, pet)
  expect(inFever.isFeverStart).toBe(false)
  expect(inFever.game.combo).toBe(0)
  expect(inFever.gained).toBe(3)

  const after = touchGame(inFever.game, g.feverUntil + 1, resting, pet)
  expect(after.game.combo).toBe(1)
  expect(after.gained).toBe(1.01)
})

test('touchGame：お仕事中は ♡ 2 倍。ぎゅっ・起こした回数を数える', () => {
  const working = touchGame(game(), 2_000, { isWorking: true, workers: 1 }, { kind: 'hug', wasSleeping: true })
  // 1 コンボめ（×1.01）のお仕事中（×2）
  expect(working.gained).toBe(2.02)
  expect(working.game.workPets).toBe(1)
  expect(working.game.hugs).toBe(1)
  expect(working.game.wakes).toBe(1)
})

// ---- 贈り物 ----

test('giveGift：小さな贈り物は何度でも。ごきげんの時間は積み増す', () => {
  const g = game({ hearts: 1_000 })
  const once = bought(giveGift(g, 'cookie', 2_000))
  expect(once.hearts).toBe(950)
  expect(once.given).toBe(50)
  expect(once.gifts).toEqual({ cookie: 1 })
  expect(once.happyUntil).toBe(12_000)
  expect(once.lastGift).toEqual({ id: 'cookie', at: 2_000 })

  const twice = bought(giveGift(once, 'cookie', 3_000))
  expect(twice.gifts).toEqual({ cookie: 2 })
  expect(twice.happyUntil).toBe(22_000)
})

test('giveGift：夢のプレゼントは 1 回きりで、ごきげんにはならない。♡ が足りなければ断る', () => {
  const g = game({ hearts: 100_000 })
  const dream = bought(giveGift(g, 'greenTests', 2_000))
  expect(dream.gifts).toEqual({ greenTests: 1 })
  expect(dream.happyUntil).toBe(0)
  expect(giveGift(dream, 'greenTests', 3_000)).toEqual({ ok: false, reason: '全部グリーンのテスト はもう飾ってあるよ' })
  expect(giveGift(game({ hearts: 10 }), 'cookie', 2_000)).toEqual({ ok: false, reason: '♡ が 40 足りないよ' })
})
