// game.ts の純粋な関数の単体テスト。$ を使わず、値を渡して返りを見る

import { expect, test } from 'claude-code/testing'

import type { DreamId, Game, TreatId } from '../types'
import type { Dealt } from '../hooks/game'
import {
  COMBO_WINDOW_MS,
  FEVER_COMBO,
  FEVER_MS,
  HEART_CAP,
  DREAMS,
  STAR,
  STAR_RATE,
  TREATS,
  UPGRADES,
  affectionOf,
  affectionsOf,
  accrue,
  buyCosmetic,
  buyUpgrade,
  formatHearts,
  formatRate,
  giftOf,
  giveGift,
  grant,
  idleDue,
  isSame,
  isDream,
  isFond,
  isMaxed,
  lookOf,
  mergeGame,
  milestoneOf,
  newGame,
  payIdle,
  SLOTS,
  dreamsOf,
  giftRate,
  pickFavorite,
  priceOf,
  restore,
  shownDreams,
  slotsUsed,
  spotOf,
  starCount,
  starPrice,
  starRate,
  switchCosmetic,
  toMilestone,
  toggleDream,
  toolTip,
  touchGame,
  treatOf,
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
  const g = restore({ hearts: 1, v: 2, futureKey: 'x' }, newGame(0, 5_000)) as Game & { futureKey?: unknown }
  expect(g.futureKey).toBe('x')
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

test('mergeGame：数は差分を足す', () => {
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

  // 両方で使って足りなくなったら、負（借金）になる
  expect(mergeGame({ ...base, hearts: 10 }, base, { ...base, hearts: 20 }).hearts).toBe(-70)
})

// ---- 同時に買ったとき（#10） ----

test('同時の買い物：♡ が足りないのに両方で買えたら、♡ は借金として負のまま', () => {
  // 1,000 ♡ のとき、2 つのセッションで同時に 800 ♡ と 500 ♡ の買い物をした
  const base = game({ hearts: 1_000 })
  const merged = mergeGame({ ...base, hearts: 200, levels: { stardust: 1 } }, base, { ...base, hearts: 500, levels: { fan: 1 } })
  expect(merged.hearts).toBe(-300)
  expect(merged.levels).toEqual({ stardust: 1, fan: 1 })
  // 借金があるあいだは何も買えない
  expect(buyUpgrade(merged, 'glove')).toEqual({ ok: false, reason: '♡ が 315 足りないよ' })
  expect(formatHearts(merged.hearts)).toBe('-300')
})

test('同時の買い物：上限のある強化は上限で止め、超えたぶんを返す', () => {
  const base = game({ hearts: 0, levels: { feverTime: 4 } })
  const paid = priceOf(upgrade('feverTime'), 4)
  const merged = mergeGame({ ...base, levels: { feverTime: 5 } }, base, { ...base, levels: { feverTime: 5 } })
  expect(merged.levels).toEqual({ feverTime: 5 })
  expect(merged.hearts).toBe(paid)
})

test('同時の買い物：同じ Lv を両方で買ったら、片方は次の Lv の値段になる', () => {
  const glove = upgrade('glove')
  const base = game({ hearts: 1_000, levels: { glove: 10 } })
  const once = bought(buyUpgrade(base, 'glove'))
  const merged = mergeGame(once, base, once)
  expect(merged.levels).toEqual({ glove: 12 })
  // Lv10→11 と Lv11→12 の値段を払ったことになる
  expect(merged.hearts).toBe(1_000 - priceOf(glove, 10) - priceOf(glove, 11))
})

test('同時の買い物：上限まで何 Lv か上げたら、本当の値段との差だけ返す', () => {
  const fever = upgrade('feverTime')
  // Lv3 から、両方のセッションで Lv5 まで上げた
  const base = game({ hearts: 0, levels: { feverTime: 3 } })
  const both = { ...base, levels: { feverTime: 5 } }
  const merged = mergeGame(both, base, both)
  expect(merged.levels).toEqual({ feverTime: 5 })
  expect(merged.hearts).toBe(priceOf(fever, 3) + priceOf(fever, 4))
})

test('同時の買い物：同じきせかえを両方で買ったら、1 つぶん返す', () => {
  const base = game({ hearts: 5_000 })
  const theirs = bought(buyCosmetic(base, 'crown'))
  const mine = bought(buyCosmetic(base, 'crown'))
  const merged = mergeGame(theirs, base, mine)
  expect(merged.owned).toEqual(['crown'])
  expect(merged.hearts).toBe(0)
  // 片方だけが買ったものは、そのまま
  const one = mergeGame(theirs, base, bought(buyCosmetic(base, 'ribbon')))
  expect(one.owned).toEqual(['crown', 'ribbon'])
  expect(one.hearts).toBe(5_000 - 5_000 - 300)
})

test('同時の買い物：同じ夢のプレゼントを両方で贈ったら、1 つぶん返す', () => {
  const base = game({ hearts: 100_000 })
  const theirs = bought(giveGift(base, 'greenTests', 2_000))
  const mine = bought(giveGift(base, 'greenTests', 2_100))
  const merged = mergeGame(theirs, base, mine)
  expect(merged.gifts).toEqual({ greenTests: 1 })
  expect(merged.given).toBe(30_000)
  expect(merged.hearts).toBe(70_000)
  // 次に合わせるときに、もう一度返したりしない
  const later = mergeGame(merged, merged, { ...merged, hearts: merged.hearts + 1 })
  expect(later.hearts).toBe(70_001)
})

test('mergeGame：ほかの数は差分をそのまま足す', () => {
  const base = game({ hearts: 10, earned: 10 })
  const merged = mergeGame({ ...base, hearts: 0, earned: 0 }, base, { ...base, hearts: 5, earned: 5 })
  expect(merged.hearts).toBe(-5)
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

test('帯に出す贈り物：小さな贈り物だけを読み、別のセッションで選び直したらあとのほう', () => {
  expect(newGame(0, 0).favorite).toBeNull()
  // 前の版の保存（favorite が無い）は、出さない
  expect(restore({ hearts: 1 }, game()).favorite).toBeNull()
  expect(restore({ hearts: 1, favorite: 'cake' }, game()).favorite).toBe('cake')
  // 知らない id（新しい版の贈り物かもしれない）も、選び直されるまで持ち回る。型の違うものは読まない
  expect(restore({ hearts: 1, favorite: 'tea' }, game()).favorite as string).toBe('tea')
  for (const broken of [3, { id: 'cake' }]) expect(restore({ hearts: 1, favorite: broken }, game()).favorite).toBeNull()
  expect(treatOf('tea' as TreatId)).toBeUndefined()

  const base = game({ favorite: 'cake' })
  const theirs = { ...base, favorite: 'cookie' as const }
  expect(mergeGame(theirs, base, base).favorite).toBe('cookie')
  expect(mergeGame(theirs, base, { ...base, favorite: null }).favorite).toBeNull()

  expect(bought(pickFavorite(base, 'letter')).favorite).toBe('letter')
  expect(bought(pickFavorite(base, null)).favorite).toBeNull()
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
  const base = { ...game(), futureKey: 'a' } as Game
  const theirs = { ...base, futureKey: 'b', v: 2 } as Game
  const merged = mergeGame(theirs, base, { ...base, hearts: 5 }) as Game & { futureKey?: unknown }
  expect(merged.futureKey).toBe('b')
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
  // 負（借金）は - をつける。1 に満たないぶんは 0
  expect(formatHearts(-5)).toBe('-5')
  expect(formatHearts(-12_000)).toBe('-1.2万')
  expect(formatHearts(-0.5)).toBe('0')
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

test('formatHearts：兆・京・垓と、1e24 以上の指数（境目も）', () => {
  const table: [number, string][] = [
    [9_999e8, '9999億'],
    [1e12, '1兆'],
    [1234e12, '1234兆'],
    [12.5e12, '12.5兆'],
    [9999e12, '9999兆'],
    [1e16, '1京'],
    [1.5e16, '1.5京'],
    [9999e16, '9999京'],
    [1e20, '1垓'],
    [123e20, '123垓'],
    [9999e20, '9999垓'],
    [1e24, '1e24'],
    [1.234e24, '1.23e24'],
    [9.999e24, '1e25'],
    [1.5e100, '1.5e100'],
    [HEART_CAP, '1e300'],
  ]
  for (const [n, text] of table) expect(formatHearts(n)).toBe(text)
  // 負（借金）は - をつけたまま
  expect(formatHearts(-1234e12)).toBe('-1234兆')
  expect(formatHearts(-1.234e24)).toBe('-1.23e24')
  // 上限より大きい数や Infinity、NaN でも壊れない
  expect(formatHearts(Infinity)).toBe('1e300')
  expect(formatHearts(-Infinity)).toBe('-1e300')
  expect(formatHearts(NaN)).toBe('0')
})

test('formatHearts：どんな大きさでも、今までの最長（4 桁 + 単位）を超えない', () => {
  for (let e = 0; e <= 300; e++) {
    for (const m of [1, 1.5, 9.99, 9.9999, 99.9, 999.9, 9999]) {
      const text = formatHearts(m * 10 ** e)
      // 4 桁 + 単位（5 字）か、最長の指数 1.23e300（8 字）
      expect(text.length).toBeLessThanOrEqual(8)
    }
  }
})

test('formatHearts：1 兆より小さい数の表示は変わらない', () => {
  expect(formatHearts(9_999)).toBe('9,999')
  expect(formatHearts(99_999_999)).toBe('9999万')
  expect(formatHearts(100_000_000)).toBe('1億')
  expect(formatHearts(999_999_999_999)).toBe('9999億')
})

test('formatRate：大きな ♡/秒も formatHearts と同じ単位で', () => {
  expect(formatRate(1e12)).toBe('1兆')
  expect(formatRate(2.5e16)).toBe('2.5京')
  expect(formatRate(1e24)).toBe('1e24')
  expect(formatRate(99.94)).toBe('99.9')
})

test('affectionOf：贈った ♡ でなかよし度が上がり、次の段を教える', () => {
  expect(affectionOf(0)).toEqual({ name: 'しりあい', next: { name: 'ともだち', at: 300 } })
  expect(affectionOf(300)).toEqual({ name: 'ともだち', next: { name: 'なかよし', at: 3_000 } })
  expect(affectionOf(299_999).name).toBe('だいすき')
  // 1.7.0 で「ずっといっしょ」の先に 3 段（100 億・1 兆・1 京）を足した
  expect(affectionOf(100_000_000)).toEqual({ name: 'ずっといっしょ', next: { name: 'かぞく', at: 1e10 } })
  expect(affectionOf(1e10)).toEqual({ name: 'かぞく', next: { name: 'うんめいのふたり', at: 1e12 } })
  expect(affectionOf(1e12)).toEqual({ name: 'うんめいのふたり', next: { name: 'えいえん', at: 1e16 } })
  expect(affectionOf(1e16 - 1e3).name).toBe('うんめいのふたり')
  expect(affectionOf(1e16)).toEqual({ name: 'えいえん' })
  expect(affectionOf(HEART_CAP)).toEqual({ name: 'えいえん' })
  expect(affectionsOf(3_000_000)).toEqual(['しりあい', 'ともだち', 'なかよし', 'だいすき', 'しんゆう', 'あいぼう'])
  expect(isFond(2_999_999, 'あいぼう')).toBe(false)
  expect(isFond(3_000_000, 'あいぼう')).toBe(true)
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
  // しまってあることもあるので「もう贈った」と断る
  expect(giveGift(dream, 'greenTests', 3_000)).toEqual({ ok: false, reason: '全部グリーンのテスト はもう贈ったよ' })
  expect(giveGift(game({ hearts: 10 }), 'cookie', 2_000)).toEqual({ ok: false, reason: '♡ が 40 足りないよ' })
})

// ---- とても大きな ♡ ----

const BIG = [1e12, 1e16, 1e20]

test('大きな ♡：なでると増え、強化も買える', () => {
  for (const hearts of BIG) {
    const g = game({ hearts, earned: hearts })
    const petted = touchGame(g, 10_000, resting, pet).game
    // 1垓 では +1 ほどの稼ぎは丸めで入らない（下のテスト）ので、減らないことまで
    expect(petted.hearts).toBeGreaterThanOrEqual(hearts)
    if (hearts < 1e20) expect(petted.hearts).toBeGreaterThan(hearts)
    expect(petted.earned).toBeGreaterThanOrEqual(hearts)
    const next = bought(buyUpgrade(g, 'glove'))
    expect(next.hearts).toBe(hearts - 15)
    expect(next.levels.glove).toBe(1)
  }
})

test('大きな ♡：保存して読み込んでも、そのまま戻る', () => {
  for (const hearts of [...BIG, 1e24, HEART_CAP]) {
    const g = game({ hearts, earned: hearts, given: hearts })
    const back = restore(JSON.parse(JSON.stringify(g)), newGame(7, 5_000))
    expect(back.hearts).toBe(hearts)
    expect(back.earned).toBe(hearts)
    expect(back.given).toBe(hearts)
  }
})

test('大きな ♡：2 つのセッションの足し合わせも有限で、差分が足される', () => {
  for (const hearts of BIG) {
    const base = game({ hearts, earned: hearts })
    const theirs = { ...base, hearts: hearts + hearts / 2, earned: hearts + hearts / 2 }
    const mine = { ...base, hearts: hearts + hearts / 4, earned: hearts + hearts / 4 }
    const merged = mergeGame(theirs, base, mine)
    expect(merged.hearts).toBe(hearts * 1.75)
    expect(merged.earned).toBe(hearts * 1.75)
    // 強化を両方で買ったときの払い戻しも壊れない
    const both = mergeGame(bought(buyUpgrade(base, 'glove')), base, bought(buyUpgrade(base, 'glove')))
    expect(Number.isFinite(both.hearts)).toBe(true)
    expect(both.levels.glove).toBe(2)
  }
})

test('上限：上限で足しても有限のまま、上限を超えない', () => {
  const g = game({ hearts: HEART_CAP, earned: HEART_CAP, given: HEART_CAP, levels: { glove: 5, toolTip: 3, fan: 4 }, passiveAt: 0 })
  const petted = touchGame(g, 10_000, resting, pet)
  expect(petted.game.hearts).toBe(HEART_CAP)
  expect(petted.game.earned).toBe(HEART_CAP)
  expect(accrue(g, 1_000, { isWorking: true, workers: 3 }).hearts).toBe(HEART_CAP)
  expect(payIdle(g, 60_000, 1_000).hearts).toBe(HEART_CAP)
  expect(toolTip(g).hearts).toBe(HEART_CAP)
  const gift = giveGift(g, 'cookie', 1_000)
  expect(gift.ok && gift.game.given).toBe(HEART_CAP)
  // 足す量そのものが Infinity でも、有限のまま
  const wild = touchGame(game({ levels: { glove: 1e308 } }), 10_000, resting, pet)
  expect(wild.game.hearts).toBe(HEART_CAP)
  expect(Number.isFinite(wild.gained)).toBe(true)
  // 上限どうしの合流も、上限まで
  const merged = mergeGame({ ...g, hearts: HEART_CAP }, game(), { ...g, hearts: HEART_CAP })
  expect(merged.hearts).toBe(HEART_CAP)
  expect(merged.earned).toBe(HEART_CAP)
  expect(merged.given).toBe(HEART_CAP)
  // 上限のままでも、保存から戻せる
  const back = restore(JSON.parse(JSON.stringify(petted.game)), newGame(7, 5_000))
  expect(back.hearts).toBe(HEART_CAP)
})

test('上限：高すぎる Lv の値段も有限で、買えない', () => {
  for (const u of UPGRADES) {
    expect(Number.isFinite(priceOf(u, 1e6))).toBe(true)
    expect(priceOf(u, 1e6)).toBe(HEART_CAP)
  }
  const g = game({ hearts: HEART_CAP, levels: { glove: 1e6 } })
  expect(buyUpgrade(g, 'glove').ok).toBe(false)
  // 買えない理由も、大きな数のまま読める
  const poor = buyUpgrade(game({ levels: { glove: 1e6 } }), 'glove')
  expect(!poor.ok && poor.reason).toBe('♡ が 1e300 足りないよ')
})

test('2^53（約 9007 兆）以上では、+1 ♡ ほどの小さな稼ぎは丸めで消える（そのまま受け入れる）', () => {
  const limit = 2 ** 53
  expect(formatHearts(limit)).toBe('9007兆')
  // 放置で ♡ +1/秒（応援うちわ Lv5）の 1 秒ぶん
  const rich = (hearts: number) => game({ hearts, earned: hearts, levels: { fan: 5 } })
  // +1 は、2^53 より手前なら入る
  expect(payIdle(rich(limit - 2), 1_000, 1_000).hearts).toBe(limit - 1)
  // 2^53 では丸めで消える
  expect(payIdle(rich(limit), 1_000, 1_000).hearts).toBe(limit)
  // 2^53 を超えても、刻み（2）以上の稼ぎは入る
  expect(payIdle(rich(limit), 2_000, 1_000).hearts).toBe(limit + 2)
})


// ---- 星を贈る・強化の節目（#39） ----

const working: Situation = { isWorking: true, workers: 2 }

// 小数の誤差を許して等しい
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9 * Math.max(1, Math.abs(b)))

// n 個目まで順に贈った値段の合計
const starsCost = (n: number) => Array.from({ length: n }, (_, k) => priceOf(STAR, k)).reduce((a, b) => a + b, 0)

test('星：何度でも贈れて、贈るたびに値段が 1.6 倍。贈った ♡ はなかよし度に入り、Clawd がかかえてお礼を言う', () => {
  expect(starPrice(game())).toBe(100_000_000)
  const g = game({ hearts: 300_000_000, happyUntil: 0 })
  const one = bought(giveGift(g, 'star', 2_000))
  expect(one.hearts).toBe(200_000_000)
  expect(one.given).toBe(100_000_000)
  expect(one.gifts).toEqual({ star: 1 })
  expect(one.lastGift).toEqual({ id: 'star', at: 2_000 })
  // ごきげんにはならない（ずっと続く倍率のほう）
  expect(one.happyUntil).toBe(0)
  expect(starPrice(one)).toBe(160_000_000)
  const two = bought(giveGift(one, 'star', 3_000))
  expect(starCount(two)).toBe(2)
  expect(two.hearts).toBe(40_000_000)
  expect(two.given).toBe(260_000_000)
  // 次は 2.56 億。足りなければ断る
  expect(giveGift(two, 'star', 4_000)).toEqual({ ok: false, reason: '♡ が 2.16億 足りないよ' })
  expect(giftOf('star')).toMatchObject({ kind: 'star', name: '星' })
  expect(giftOf('star').thanks).toMatch(/星/)
  expect(isDream('star')).toBe(false)
  // かかえている間は星の絵を持ち、空の星の数も見た目に渡す
  expect(lookOf(two, 3_500, { id: 'star', from: 3_000 })).toMatchObject({ gift: 'star', stars: 2 })
  expect(lookOf(game(), 0, null).stars).toBe(0)
})

test('星：ひとつごとに ♡ の稼ぎが全部 ×1.2（なでる・放置・お給料・手当・おだちん）', () => {
  const levels = { glove: 3, fan: 5, stardust: 2, allowance: 2, toolTip: 4 }
  const plain = game({ levels })
  const starry = game({ levels, gifts: { star: 2 } })
  const k = STAR_RATE ** 2
  near(starRate(starry), 1.44)
  const ratio = (a: number, b: number) => near(a / b, k)
  ratio(touchGame(starry, 2_000, working, pet).gained, touchGame(plain, 2_000, working, pet).gained)
  ratio(payIdle(starry, 2_000, 1_000).earned, payIdle(plain, 2_000, 1_000).earned)
  ratio(accrue(starry, 31_000, working).earned, accrue(plain, 31_000, working).earned)
  ratio(toolTip(starry).earned, toolTip(plain).earned)
})

test('星：とても多くても数があふれず、上限の値段の星は買えない', () => {
  const lots = game({ hearts: HEART_CAP, gifts: { star: 1e6 }, levels: { glove: 1e308, allowance: 1e308, fan: 0 } })
  expect(starRate(lots)).toBe(HEART_CAP)
  expect(starPrice(lots)).toBe(HEART_CAP)
  expect(giveGift(lots, 'star', 2_000).ok).toBe(false)
  // 稼ぎが 0 のところ（放置の強化なし・働いている仲間なし）に大きな倍率がかかっても、NaN で ♡ が消えない
  const rich = { ...lots, hearts: 5e20, earned: 5e20 }
  expect(payIdle(rich, 60_000, 1_000)).toBe(rich)
  const rested = accrue(rich, 61_000, resting)
  expect(rested.hearts).toBe(5e20)
  for (const g of [touchGame(rich, 2_000, working, pet).game, accrue(rich, 61_000, working), toolTip({ ...rich, levels: { toolTip: 1e308 } })]) {
    expect(Number.isFinite(g.hearts)).toBe(true)
    expect(g.hearts).toBeGreaterThan(0)
  }
})

test('節目：上限の無い強化は Lv25 ごとに効き目が 2 倍。フィーバー延長は変わらない', () => {
  const glove = upgrade('glove')
  expect([0, 24, 25, 49, 50, 75].map(level => milestoneOf(glove, level))).toEqual([1, 1, 2, 2, 4, 8])
  expect(milestoneOf(upgrade('feverTime'), 5)).toBe(1)
  expect(toMilestone(glove, 22)).toBe(3)
  expect(toMilestone(glove, 25)).toBe(25)
  expect(toMilestone(upgrade('feverTime'), 3)).toBeNull()
  // 1 なで：Lv24 は 1 + 24、Lv25 は 1 + 25 × 2、Lv50 は 1 + 50 × 4（コンボ 0、休み中）
  const gained = (level: number) => touchGame(game({ levels: { glove: level }, comboAt: -1e9 }), 2_000, resting, pet).gained / 1.01
  near(gained(24), 25)
  near(gained(25), 51)
  near(gained(50), 201)
  // 放置：応援うちわ Lv25 は 0.2 × 25 × 2 = 10/秒
  near(payIdle(game({ levels: { fan: 25 } }), 1_000, 1_000).hearts, 10)
  // おだちん：Lv25 は 3 × 25 × 2
  expect(toolTip(game({ levels: { toolTip: 25 } })).hearts).toBe(150)
  // フィーバー延長 Lv5 は 2 秒 × 5 のまま
  let g = game({ levels: { feverTime: 5 } })
  for (let i = 0; i < FEVER_COMBO; i++) g = touchGame(g, 2_000 + i * 100, resting, pet).game
  expect(g.feverUntil).toBe(2_000 + (FEVER_COMBO - 1) * 100 + FEVER_MS + 10_000)
  // 高い Lv でも有限
  expect(milestoneOf(glove, 1e9)).toBe(HEART_CAP)
})

test('同時の星：2 つのセッションが同じ base から贈ったら、数は合わせたぶん、♡ は順に贈った値段', () => {
  const base = game({ hearts: 1_000_000_000, given: 5_000 })
  // 向こうは 1 個、こちらは 2 個（どちらも 1 個目を 1 億で買ったつもり）
  const theirs = bought(giveGift(base, 'star', 2_000))
  const mine = bought(giveGift(bought(giveGift(base, 'star', 2_100)), 'star', 2_200))
  const merged = mergeGame(theirs, base, mine)
  expect(starCount(merged)).toBe(3)
  // 1 億 + 1.6 億 + 2.56 億 を払ったことになる（二重払いも、安いままの 2 個目も無い）
  const cost = starsCost(3)
  expect(Math.round(cost / 1e6)).toBe(516)
  expect(merged.hearts).toBe(1_000_000_000 - cost)
  expect(merged.given).toBe(5_000 + cost)
  // 次に合わせるときに、もう一度そろえたりしない
  const later = mergeGame(merged, merged, { ...merged, hearts: merged.hearts + 1 })
  expect(later.hearts).toBe(merged.hearts + 1)
  expect(later.given).toBe(merged.given)
  expect(starCount(later)).toBe(3)
  // 片方だけが贈ったときは、そのまま
  const one = mergeGame(theirs, base, base)
  expect(starCount(one)).toBe(1)
  expect(one.hearts).toBe(900_000_000)
  expect(one.given).toBe(5_000 + 100_000_000)
  // 同じ 1 個目を両方で贈ったら、片方は 2 個目の値段
  const both = mergeGame(theirs, base, bought(giveGift(base, 'star', 2_300)))
  expect(starCount(both)).toBe(2)
  expect(both.hearts).toBe(1_000_000_000 - starsCost(2))
  expect(both.given).toBe(5_000 + starsCost(2))
})

test('同時の星：♡ が足りなくなったら借金のまま', () => {
  const base = game({ hearts: 150_000_000 })
  const theirs = bought(giveGift(base, 'star', 2_000))
  const mine = bought(giveGift(base, 'star', 2_000))
  const merged = mergeGame(theirs, base, mine)
  expect(starCount(merged)).toBe(2)
  expect(merged.hearts).toBe(150_000_000 - starsCost(2))
  expect(giveGift(merged, 'star', 3_000).ok).toBe(false)
})

test('restore：1.4.3 のセーブ（星の無いころ）はそのまま読める', () => {
  const saved = {
    v: 1,
    hearts: 123_456_789.5,
    earned: 987_654_321,
    combo: 4,
    comboAt: 9,
    maxCombo: 88,
    feverUntil: 0,
    fevers: 321,
    workPets: 4_000,
    hugs: 12,
    wakes: 3,
    levels: { glove: 45, brush: 20, coffee: 15, fan: 45, toolTip: 25, allowance: 20, feverTime: 5, stardust: 50 },
    owned: ['ribbon', 'catEars', 'santa', 'shootingStars', 'crown', 'aurora'],
    hat: 'crown',
    achievements: ['pets1', 'earned100m', 'dreamAll', 'bff'],
    lastUnlock: { id: 'dreamAll', at: 50 },
    gifts: { cookie: 10, greenTests: 1, telescope: 1, house: 1, library: 1, constellation: 1, moonTrip: 1, noBugs: 1 },
    given: 116_130_500,
    happyUntil: 0,
    lastGift: { id: 'noBugs', at: 40 },
    favorite: 'cookie',
    passiveAt: 77,
  }
  const g = restore(JSON.parse(JSON.stringify(saved)), newGame(0, 5_000))
  // 1.6.0 で足した項目（飾る夢・しまった空の飾り）は「まだ選んでいない」で埋まる
  expect(g).toEqual({ ...saved, shown: null, off: [], passiveAt: 5_000 } as Game)
  expect(starCount(g)).toBe(0)
  expect(starRate(g)).toBe(1)
})

test('実績：100 億・1 兆・1 京を稼ぐ、星を 10・50・100 個贈る', () => {
  const ids = (over: Partial<Game>) => unlocked({ game: game(over), pets: 0, rate: 0 }).map(a => a.id)
  expect(ids({ earned: 1e10 - 1 })).not.toContain('earned10b')
  expect(ids({ earned: 1e10 })).toContain('earned10b')
  expect(ids({ earned: 1e12 })).toContain('earned1t')
  expect(ids({ earned: 1e16 - 1e3 })).not.toContain('earned10q')
  for (const id of ['earned10b', 'earned1t', 'earned10q'] as const) expect(ids({ earned: 1e16 })).toContain(id)
  expect(ids({ gifts: { star: 9 } })).not.toContain('stars10')
  expect(ids({ gifts: { star: 10 } })).toContain('stars10')
  for (const id of ['stars10', 'stars50'] as const) expect(ids({ gifts: { star: 50 } })).toContain(id)
  expect(ids({ gifts: { star: 100 } })).toContain('stars100')
  expect(STAR.growth).toBe(1.6)
})

// ---- 飾る数の上限と、飾る・しまう（#44） ----

const ALL_DREAMS = DREAMS.map(d => d.id)
// 1.6.0 までの 7 つの夢（1.7.0 で 10 億からの 4 つを後ろに足した）
const OLD_DREAMS: DreamId[] = ['greenTests', 'telescope', 'house', 'library', 'constellation', 'moonTrip', 'noBugs']
// 1.6.0 までの夢を全部贈ってあるセーブ（#44 の飾る・しまうのテストは、このころの夢で書いてある）
const dreamer = (over: Partial<Game> = {}) => game({ gifts: Object.fromEntries(OLD_DREAMS.map(id => [id, 1])), ...over })
// 1.7.0 の夢まで全部贈ってあるセーブ
const allDreamer = (over: Partial<Game> = {}) => game({ gifts: Object.fromEntries(ALL_DREAMS.map(id => [id, 1])), ...over })

test('飾る場所：庭 3 つ・空 2 つ。夢はどれも庭か空のどちらか 1 つ（月への旅はロケットが庭の幅を取るので庭）', () => {
  expect(SLOTS).toEqual({ yard: 3, sky: 2 })
  expect(Object.fromEntries(ALL_DREAMS.map(id => [id, spotOf(id)]))).toEqual({
    greenTests: 'yard',
    telescope: 'yard',
    house: 'yard',
    library: 'yard',
    constellation: 'sky',
    moonTrip: 'yard',
    noBugs: 'sky',
    starHill: 'yard',
    airship: 'sky',
    statue: 'yard',
    twinStars: 'sky',
  })
})

test('飾る夢：まだ選んでいなければ、場所ごとに高いものから枠の数まで（ほかはしまっておく）', () => {
  expect(shownDreams(game())).toEqual([])
  const g = dreamer()
  expect(g.shown).toBeNull()
  // 庭は月への旅・図書館・おうち、空は Clawd 座・虹（表の順で返す）
  expect(shownDreams(g)).toEqual(['house', 'library', 'constellation', 'moonTrip', 'noBugs'])
  expect(slotsUsed(g)).toEqual({ yard: 3, sky: 2 })
  expect(lookOf(g, 5_000, null).dreams).toEqual(shownDreams(g))
  // 枠より少なければ、贈ったものは全部
  const few = game({ gifts: { greenTests: 1, telescope: 1, noBugs: 1 } })
  expect(shownDreams(few)).toEqual(['greenTests', 'telescope', 'noBugs'])
})

test('飾る夢：選んであれば、選んだもののうち贈ったものだけ。枠より多ければ、いつも高いものから枠の数まで', () => {
  // 贈っていない夢（library）が選ばれていても飾らない
  expect(shownDreams(game({ gifts: { greenTests: 1 }, shown: ['greenTests', 'library'] }))).toEqual(['greenTests'])
  // 何も選んでいない（全部しまった）
  expect(shownDreams(dreamer({ shown: [] }))).toEqual([])
  // 枠より多く選ばれていても（壊れた保存など）、場所ごとに高いものから。並びや重なりによらず同じ
  const over = dreamer({ shown: ['greenTests', 'telescope', 'house', 'library', 'noBugs', 'constellation', 'greenTests'] })
  expect(shownDreams(over)).toEqual(['telescope', 'house', 'library', 'constellation', 'noBugs'])
  expect(shownDreams(dreamer({ shown: [...ALL_DREAMS].reverse() }))).toEqual(shownDreams(dreamer()))
  // 知らない id（新しい版の夢かもしれない）は見ないだけ
  expect(shownDreams(dreamer({ shown: ['rainbowRoad' as DreamId, 'telescope'] }))).toEqual(['telescope'])
})

test('飾る・しまう：変わるのは絵だけ。♡ の +10%・実績・贈ったことはそのまま', () => {
  const g = dreamer({ achievements: ['dream1', 'dreamAll'] })
  const stowed = bought(toggleDream(g, 'house'))
  expect(stowed.shown).toEqual(['library', 'constellation', 'moonTrip', 'noBugs'])
  expect(lookOf(stowed, 5_000, null).dreams).not.toContain('house')
  expect(dreamsOf(stowed)).toEqual(dreamsOf(g))
  expect(giftRate(stowed, 5_000)).toBe(giftRate(g, 5_000))
  near(giftRate(stowed, 5_000), 1.7)
  expect(stowed.gifts).toEqual(g.gifts)
  expect(stowed.given).toBe(g.given)
  expect(stowed.achievements).toEqual(g.achievements)
  // 全部しまっても、♡ の稼ぎと実績の条件は変わらない
  let none = stowed
  for (const id of shownDreams(stowed)) none = bought(toggleDream(none, id))
  expect(lookOf(none, 5_000, null).dreams).toEqual([])
  expect(giftRate(none, 5_000)).toBe(giftRate(g, 5_000))
  // 夢をぜんぶ（1.7.0 からは 11 個全部）贈ってあれば、全部しまっても実績の条件は満たしたまま
  let allNone = allDreamer()
  for (const id of shownDreams(allNone)) allNone = bought(toggleDream(allNone, id))
  expect(lookOf(allNone, 5_000, null).dreams).toEqual([])
  expect(unlocked({ game: allNone, pets: 0, rate: 0 }).map(a => a.id)).toContain('dreamAll')

  // あいた庭に、しまってあった旗を飾る。もう 1 つは入らない
  const flag = bought(toggleDream(stowed, 'greenTests'))
  expect(shownDreams(flag)).toEqual(['greenTests', 'library', 'constellation', 'moonTrip', 'noBugs'])
  expect(toggleDream(flag, 'telescope')).toEqual({ ok: false, reason: '庭はもういっぱい（3/3）だよ。先にどれかをしまってね' })
  // 空も 2 つまで（いまの空の夢は 2 つなので、しまってから飾り直す）
  const sky = bought(toggleDream(flag, 'noBugs'))
  expect(slotsUsed(sky)).toEqual({ yard: 3, sky: 1 })
  expect(slotsUsed(bought(toggleDream(sky, 'noBugs')))).toEqual({ yard: 3, sky: 2 })
  // 贈っていない夢は飾れない
  expect(toggleDream(game(), 'house')).toEqual({ ok: false, reason: '小さなおうち はまだ贈っていないよ' })
})

test('飾る・しまう：知らない id（新しい版の夢）は選び直しても捨てない', () => {
  const g = dreamer({ shown: ['rainbowRoad' as DreamId, 'house'] })
  const next = bought(toggleDream(g, 'library'))
  expect(next.shown).toEqual(['rainbowRoad', 'house', 'library'] as DreamId[])
})

test('新しく贈った夢：枠があいていれば飾り、いっぱいならしまっておく（お礼に箱をかかえるのは同じ）', () => {
  // まだ選んでいないセーブ：庭に 3 つあるところへ、もっと高い図書館を贈っても、飾ってあるものは入れ替えない
  const three = game({ hearts: 10_000_000, gifts: { greenTests: 1, telescope: 1, house: 1 } })
  const library = bought(giveGift(three, 'library', 2_000))
  expect(library.gifts.library).toBe(1)
  expect(shownDreams(library)).toEqual(['greenTests', 'telescope', 'house'])
  expect(library.shown).toEqual(['greenTests', 'telescope', 'house'])
  const look = lookOf(library, 2_100, { id: 'library', from: 2_000 })
  expect(look.gift).toBe('box')
  expect(look.dreams).not.toContain('library')
  // ♡ の +10% はしまってあっても入る
  near(giftRate(library, 2_000), 1.4)
  // 空はあいているので、Clawd 座は飾る
  const constellation = bought(giveGift({ ...library, hearts: 10_000_000 }, 'constellation', 3_000))
  expect(shownDreams(constellation)).toEqual(['greenTests', 'telescope', 'house', 'constellation'])

  // 選んであるセーブ：しまって枠をあけてあれば、新しい夢を飾る
  const picked = game({ hearts: 1_000_000, gifts: { greenTests: 1, telescope: 1, house: 1 }, shown: ['house'] })
  expect(shownDreams(bought(giveGift(picked, 'library', 2_000)))).toEqual(['house', 'library'])
  // はじめての夢は、そのまま飾る
  expect(shownDreams(bought(giveGift(game({ hearts: 100_000 }), 'greenTests', 2_000)))).toEqual(['greenTests'])
})

test('流れ星・オーロラ：買ったら出て、押すたびにしまう・出す。夢の枠は使わない', () => {
  const g = dreamer({ owned: ['shootingStars', 'aurora', 'crown'] })
  expect(lookOf(g, 5_000, null)).toMatchObject({ shootingStars: true, aurora: true })
  const off = bought(switchCosmetic(g, 'aurora'))
  expect(off.off).toEqual(['aurora'])
  expect(lookOf(off, 5_000, null)).toMatchObject({ shootingStars: true, aurora: false })
  expect(lookOf(off, 5_000, null).dreams).toEqual(lookOf(g, 5_000, null).dreams)
  expect(bought(switchCosmetic(off, 'aurora')).off).toEqual([])
  // 持っていないもの・ぼうしは出し入れしない
  expect(switchCosmetic(game(), 'aurora')).toEqual({ ok: false, reason: 'オーロラ はまだ持ってないよ' })
  expect(switchCosmetic(g, 'crown').ok).toBe(false)
  // しまっていても、買ったことは変わらない（コレクターの実績もそのまま）
  expect(off.owned).toEqual(g.owned)
})

test('restore：飾る夢としまった空の飾りを読む。型の違うものは「まだ選んでいない」、文字列でない要素は捨てる', () => {
  expect(restore({ hearts: 1, shown: ['house', 3, null, 'library'], off: ['aurora', {}] }, game())).toMatchObject({
    shown: ['house', 'library'],
    off: ['aurora'],
  })
  expect(restore({ hearts: 1, shown: [] }, game()).shown).toEqual([])
  for (const broken of [undefined, 'house', 3, { house: true }]) {
    expect(restore({ hearts: 1, shown: broken, off: broken }, game())).toMatchObject({ shown: null, off: [] })
  }
  // 知らない id も持ち回り、絵には出さない
  const g = restore({ hearts: 1, gifts: { house: 1 }, shown: ['spaceship', 'house'], off: ['comet'] }, game())
  expect(g.shown as string[]).toEqual(['spaceship', 'house'])
  expect(lookOf(g, 5_000, null).dreams).toEqual(['house'])
  // 今の形は読み直しても変わらない
  const chosen = dreamer({ shown: ['house'], off: ['aurora'] })
  expect(restore(JSON.parse(JSON.stringify(chosen)), newGame(0, chosen.passiveAt))).toEqual(chosen)
})

test('restore：1.5.0 のセーブ（星があり、飾る夢を選んでいないころ）は ♡・強化・贈り物・実績がそのまま。飾りは高い 3 + 2 つ', () => {
  const saved = {
    v: 1,
    hearts: 5e12,
    earned: 9e12,
    levels: { glove: 60, stardust: 80, feverTime: 5 },
    owned: ['shootingStars', 'aurora', 'crown'],
    hat: 'crown',
    achievements: ['dream1', 'dreamAll', 'stars10'],
    gifts: { cookie: 3, greenTests: 1, telescope: 1, house: 1, library: 1, constellation: 1, moonTrip: 1, noBugs: 1, star: 12 },
    given: 2e10,
    lastGift: { id: 'star', at: 40 },
    favorite: 'cake',
  }
  const g = restore(JSON.parse(JSON.stringify(saved)), newGame(0, 5_000))
  expect(g).toMatchObject(saved)
  expect(g).toMatchObject({ shown: null, off: [] })
  expect(dreamsOf(g)).toEqual(OLD_DREAMS)
  // ♡ の稼ぎは全部の夢のぶん（+70%）のまま
  near(giftRate(g, 5_000), 1.7 * STAR_RATE ** 12)
  expect(lookOf(g, 5_000, null)).toMatchObject({
    shootingStars: true,
    aurora: true,
    dreams: ['house', 'library', 'constellation', 'moonTrip', 'noBugs'],
    stars: 12,
  })
})

test('mergeGame：飾る夢・しまった空の飾りは、このセッションで選び直したときだけこちらの一式', () => {
  const base = dreamer({ shown: null, off: [] })
  const theirs = { ...base, shown: ['greenTests'] as DreamId[], off: ['aurora' as const] }
  // こちらは選んでいない：向こうで選んだものが届く
  const kept = mergeGame(theirs, base, base)
  expect(kept.shown).toEqual(['greenTests'])
  expect(kept.off).toEqual(['aurora'])
  expect(shownDreams(kept)).toEqual(['greenTests'])
  // こちらであとから選び直した：こちらの一式
  const mine = { ...base, shown: ['house', 'noBugs'] as DreamId[] }
  const merged = mergeGame(theirs, base, mine)
  expect(merged.shown).toEqual(['house', 'noBugs'])
  expect(merged.off).toEqual(['aurora'])
  // 両方で贈った夢が重なっても、贈った数は 1 回にそろう（飾る選び方とは別）
  expect(merged.gifts).toEqual(base.gifts)
})

// ---- 1 億より先の夢・なかよし度（#40） ----

test('1.7.0 の夢：10 億・100 億・1000 億・1 兆。表の後ろに足し、前からある 7 つの並びと値段は変わらない', () => {
  expect(DREAMS.map(d => [d.id, d.price])).toEqual([
    ['greenTests', 30_000],
    ['telescope', 80_000],
    ['house', 250_000],
    ['library', 800_000],
    ['constellation', 3_000_000],
    ['moonTrip', 12_000_000],
    ['noBugs', 100_000_000],
    ['starHill', 1e9],
    ['airship', 1e10],
    ['statue', 1e11],
    ['twinStars', 1e12],
  ])
  for (const d of DREAMS) {
    expect(d.thanks.length).toBeGreaterThan(0)
    // 帯に出すお礼は、前からあるいちばん長いものくらいまで
    expect(d.thanks.length).toBeLessThanOrEqual(30)
  }
  // 贈ると箱をかかえてお礼を言い、♡ の稼ぎが +10%
  const g = bought(giveGift(allDreamer({ gifts: Object.fromEntries(OLD_DREAMS.map(id => [id, 1])), hearts: 2e9 }), 'starHill', 2_000))
  expect(g.hearts).toBe(1e9)
  expect(g.given).toBe(1e9)
  expect(lookOf(g, 2_100, { id: 'starHill', from: 2_000 }).gift).toBe('box')
  near(giftRate(g, 2_000), 1.8)
  expect(giveGift(g, 'starHill', 3_000)).toEqual({ ok: false, reason: '流れ星の丘 はもう贈ったよ' })
})

test('1.7.0 の夢：全部贈ったセーブは、庭に銅像・丘・ロケットと月、空に空飛ぶ船とふたりの星（場所ごとに高いもの）', () => {
  const g = allDreamer()
  expect(shownDreams(g)).toEqual(['moonTrip', 'starHill', 'airship', 'statue', 'twinStars'])
  expect(slotsUsed(g)).toEqual({ yard: 3, sky: 2 })
  near(giftRate(g, 5_000), 2.1)
})

test('1.7.0 の夢：1.6.0 で飾りを選んであるセーブに新しい夢を贈ると、枠があいていれば飾り、いっぱいならしまっておく', () => {
  // 庭も空もいっぱい（まだ選んでいない 1.6.0 のセーブ）：新しい夢はしまっておき、飾ってあるものはそのまま
  const full = dreamer({ hearts: 2e12 })
  const before = shownDreams(full)
  for (const id of ['starHill', 'airship', 'statue', 'twinStars'] as const) {
    const next = bought(giveGift(full, id, 2_000))
    expect(shownDreams(next)).toEqual(before)
    expect(lookOf(next, 2_100, { id, from: 2_000 }).gift).toBe('box')
    expect(dreamsOf(next)).toContain(id)
  }
  // 空を 1 つあけてあれば、空飛ぶ船は飾る（庭がいっぱいなので丘はしまっておく）
  const roomy = dreamer({ hearts: 2e12, shown: ['house', 'library', 'moonTrip', 'constellation'] })
  const ship = bought(giveGift(roomy, 'airship', 2_000))
  expect(shownDreams(ship)).toEqual(['house', 'library', 'constellation', 'moonTrip', 'airship'])
  const hill = bought(giveGift(ship, 'starHill', 3_000))
  expect(shownDreams(hill)).toEqual(shownDreams(ship))
  // しまってある新しい夢も、ショップで入れ替えて飾れる
  const swapped = bought(toggleDream(bought(toggleDream(hill, 'house')), 'starHill'))
  expect(shownDreams(swapped)).toEqual(['library', 'constellation', 'moonTrip', 'starHill', 'airship'])
})

test('実績：「夢をぜんぶ」は 11 個全部。1.6.0 で 7 つ全部贈って取ったものは、読み直しても消えない', () => {
  const ids = (g: Game) => unlocked({ game: g, pets: 0, rate: 0 }).map(a => a.id)
  // 1.6.0 の 7 つだけでは、まだ取れない
  expect(ids(dreamer())).not.toContain('dreamAll')
  expect(ids(allDreamer())).toContain('dreamAll')
  // 前に取ったセーブは、そのまま持っている（unlocked はまだ持っていないものだけを見て、grant は足すだけ）
  const saved = restore(JSON.parse(JSON.stringify(dreamer({ achievements: ['dream1', 'dreamAll'] }))), newGame(0, 5_000))
  expect(saved.achievements).toEqual(['dream1', 'dreamAll'])
  expect(ids(saved)).not.toContain('dreamAll')
  const later = grant(saved, unlocked({ game: { ...saved, gifts: { ...saved.gifts, starHill: 1 } }, pets: 0, rate: 0 }), 6_000)
  expect(later.achievements).toEqual(['dream1', 'dreamAll', 'dreamHill'])
})

test('実績：1.7.0 の夢をひとつずつ贈る、なかよし度「かぞく」「うんめいのふたり」「えいえん」', () => {
  const ids = (over: Partial<Game>) => unlocked({ game: game(over), pets: 0, rate: 0 }).map(a => a.id)
  expect(ids({ gifts: { starHill: 1 } })).toContain('dreamHill')
  expect(ids({ gifts: { airship: 1 } })).toContain('dreamAirship')
  expect(ids({ gifts: { statue: 1 } })).toContain('dreamStatue')
  expect(ids({ gifts: { twinStars: 1 } })).toContain('dreamTwinStars')
  expect(ids({ gifts: { house: 1 } })).not.toContain('dreamHill')
  expect(ids({ given: 1e10 - 1 })).not.toContain('family')
  for (const id of ['bff', 'family'] as const) expect(ids({ given: 1e10 })).toContain(id)
  expect(ids({ given: 1e12 })).toContain('destiny')
  expect(ids({ given: 1e12 })).not.toContain('forever')
  for (const id of ['family', 'destiny', 'forever'] as const) expect(ids({ given: 1e16 })).toContain(id)
})

test('restore：1.6.0 のセーブ（飾りを選んである）は、♡・強化・贈り物・星・飾り・実績がそのまま', () => {
  const saved = {
    v: 1,
    hearts: 7.5e13,
    earned: 3e14,
    combo: 0,
    comboAt: 0,
    maxCombo: 140,
    feverUntil: 0,
    fevers: 900,
    workPets: 30_000,
    hugs: 40,
    wakes: 9,
    levels: { glove: 80, brush: 40, coffee: 30, fan: 70, toolTip: 50, allowance: 40, feverTime: 5, stardust: 90 },
    owned: ['ribbon', 'catEars', 'santa', 'shootingStars', 'crown', 'aurora'],
    hat: 'santa',
    achievements: ['pets1', 'dream1', 'dreamAll', 'bff', 'stars10', 'earned1t'],
    lastUnlock: { id: 'earned1t', at: 70 },
    gifts: { cake: 4, greenTests: 1, telescope: 1, house: 1, library: 1, constellation: 1, moonTrip: 1, noBugs: 1, star: 24 },
    given: 9e12,
    happyUntil: 0,
    lastGift: { id: 'star', at: 60 },
    favorite: 'cocoa',
    shown: ['greenTests', 'telescope', 'house', 'noBugs'],
    off: ['aurora'],
    passiveAt: 55,
  }
  const g = restore(JSON.parse(JSON.stringify(saved)), newGame(0, 5_000))
  expect(g).toEqual({ ...saved, passiveAt: 5_000 } as Game)
  expect(shownDreams(g)).toEqual(['greenTests', 'telescope', 'house', 'noBugs'])
  expect(lookOf(g, 5_000, null)).toMatchObject({ aurora: false, shootingStars: true, dreams: ['greenTests', 'telescope', 'house', 'noBugs'], stars: 24 })
  // 新しい段：贈った ♡ 9 兆は「うんめいのふたり」。実績はまだ渡していないので、次に見たときに取れる
  expect(affectionOf(g.given).name).toBe('うんめいのふたり')
  for (const id of ['family', 'destiny'] as const) expect(unlocked({ game: g, pets: 0, rate: 0 }).map(a => a.id)).toContain(id)
})

test('lookOf：なかよし度が「あいぼう」からは、手をふる', () => {
  expect(lookOf(game({ given: 2_999_999 }), 5_000, null).waves).toBe(false)
  expect(lookOf(game({ given: 3_000_000 }), 5_000, null).waves).toBe(true)
})
