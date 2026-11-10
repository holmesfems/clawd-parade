// 帯のセリフ・info・♡ の行（bandText）の単体テスト
import { expect, test } from 'claude-code/testing'

import type { Friend, Pets, TreatId, Work } from '../types'
import type { BandState } from '../hooks/band'
import { bandText, linesOf } from '../hooks/band'
import { clockText, isPetted, newGame } from '../hooks/game'

const NOW = 100_000
const resting: Work = { startedAt: 0, tool: null, durationMs: null, helpers: 0, isRunning: false }
const untouched: Pets = { total: 7, at: 0, from: 0, kind: 'pet', hand: null, friend: null }

const state = (over: Partial<BandState> = {}): BandState => ({
  mood: { kind: 'idle', at: 0 },
  work: resting,
  friends: [],
  pets: untouched,
  game: { ...newGame(1_234, NOW), achievements: [] },
  holding: null,
  tick: { n: 0, at: NOW },
  // 夜 9 時（夜のセリフは前と同じ）
  hour: 21,
  ...over,
})

test('ふだんは表情ごとのセリフと ♡ の行', () => {
  const text = bandText(state())
  expect(text.say).toBe('よろしくね！なんでも言ってね')
  expect(text.sayColor).toBe('#d97757')
  expect(text.info).toBe('')
  expect(text.score).toBe('♡ 1,234 · +0/秒')
  expect(text.isFever).toBe(false)
  // お仕事中のセリフは 25 コマごとに入れかわる
  const working = (n: number) => bandText(state({ mood: { kind: 'working', at: 0 }, tick: { n, at: NOW } })).say
  expect(working(0)).toBe('おしごと中…カタカタ')
  expect(working(25)).toBe('がんばってるよ！')
})

test('なでられている間は、とろけたセリフとなでた回数', () => {
  const petted = { ...untouched, at: NOW - 1_000 }
  const text = bandText(state({ pets: petted }))
  expect(text.say).toBe('えへへ…♡ もっとなでて〜')
  expect(text.sayColor).toBe('#ff6b9a')
  expect(text.info).toBe('なでなで 7 回目 ♡')
  expect(bandText(state({ pets: petted, mood: { kind: 'error', at: 0 } })).say).toBe('ぐすん…なぐさめてくれるの？♡')
  expect(bandText(state({ pets: { ...petted, kind: 'hug' } })).say).toBe('なかまもよろこんでるよ♡')
  // 4 秒たつと、もとのセリフにもどる
  expect(bandText(state({ pets: { ...untouched, at: NOW - 4_000 } })).say).toBe('よろしくね！なんでも言ってね')
})

test('贈り物をかかえている間は、なにより先にお礼', () => {
  const game = { ...newGame(0, NOW), gifts: { cake: 2 } }
  const text = bandText(state({ game, holding: { id: 'cake', from: NOW - 1_000 }, pets: { ...untouched, at: NOW } }))
  expect(text.say).toBe('ケーキ！？いいの！？いただきまーす♡')
  expect(text.info).toBe('🎁 いちごのショートケーキ · 2 個目')
  const dream = bandText(state({ holding: { id: 'house', from: NOW } }))
  expect(dream.info).toBe('🎁 小さなおうち がやってきた！')
})

test('取ったばかりの実績は info に 5 秒出す', () => {
  const game = { ...newGame(0, NOW), lastUnlock: { id: 'pets1' as const, at: NOW - 4_000 } }
  expect(bandText(state({ game })).info).toBe('🏆 実績「はじめてのなでなで」ゲット！')
  expect(bandText(state({ game, tick: { n: 0, at: NOW + 1_000 } })).info).toBe('')
})

test('お仕事中とおわったあとはタイマー', () => {
  const running: Work = { startedAt: NOW - 83_000, tool: 'Bash', durationMs: null, helpers: 0, isRunning: true }
  expect(bandText(state({ work: running })).info).toBe('⏱ 1:23 · Bash')
  const done: Work = { ...running, durationMs: 5_000, helpers: 2, isRunning: false }
  expect(bandText(state({ work: done })).info).toBe('⏱ 0:05 でおわり · なかま 2匹がてつだったよ')
})

test('♡ の行：お仕事中の稼ぎ・コンボ・ごきげん・フィーバー', () => {
  const crew: Friend[] = [{ id: 'a', type: 'Explore', label: '', tool: null, doneAt: null }]
  const working: Work = { ...resting, isRunning: true }
  expect(bandText(state({ work: working, friends: crew })).score).toBe('♡ 1,234 · +1/秒')

  const combo = { ...newGame(10, NOW), combo: 5, comboAt: NOW - 500, happyUntil: NOW + 30_000 }
  expect(bandText(state({ game: combo })).score).toBe('♡ 10 · +0/秒 · 5 コンボ！')
  expect(bandText(state({ game: { ...combo, combo: 0 } })).score).toBe('♡ 10 · +0/秒 · ごきげん 0:30')

  const fever = bandText(state({ game: { ...newGame(10, NOW), feverUntil: NOW + 2_500 } }))
  expect(fever.score).toBe('★ フィーバー ★ ♡×3 あと 3 秒 · ♡ 10')
  expect(fever.scoreColor).toBe('#ffb347')
  expect(fever.isFever).toBe(true)
})

test('帯に出した贈り物：ワンぽちのボタンの文字と、♡ が足りるか', () => {
  expect(bandText(state()).gift).toBeNull()
  const cake = { ...newGame(1_234, NOW), favorite: 'cake' as const }
  expect(bandText(state({ game: cake })).gift).toEqual({ id: 'cake', label: '🍰 あげる 400♡', canAfford: true })
  expect(bandText(state({ game: { ...cake, hearts: 399 } })).gift?.canAfford).toBe(false)
  expect(bandText(state({ game: { ...cake, favorite: 'keyboard' } })).gift?.label).toBe('💻 あげる 1万♡')
  // 新しい版で選んだ、この版の知らない贈り物は出さない
  expect(bandText(state({ game: { ...cake, favorite: 'tea' as TreatId } })).gift).toBeNull()
})

test('時間帯でセリフが変わる。無い表情はふだんのまま', () => {
  const at = (hour: number, kind: BandState['mood']['kind'] = 'idle', n = 0) =>
    bandText(state({ hour, mood: { kind, at: 0 }, tick: { n, at: NOW } })).say
  expect(at(7)).toBe('おはよう！今日もよろしくね')
  expect(at(7, 'idle', 25)).toBe('おはよ〜…コーヒーいれよっか？')
  expect(at(12)).toBe('こんにちは！なんでも言ってね')
  expect(at(17)).toBe('こんばんは！もうひとがんばり？')
  expect(at(0)).toBe('よろしくね！なんでも言ってね')
  expect(at(3, 'idle', 25)).toBe('もう寝ようぜ…つづきは明日にしよ？')
  expect(at(3, 'done')).toBe('おわったよ…ほめて…そして寝よ？')
  expect(at(3, 'working')).toBe('ねむいけど…がんばる…')
  // 時間帯のセリフが無い表情は、どの時間帯もふだんのセリフ
  for (const hour of [7, 12, 17, 21, 3]) expect(at(hour, 'permission')).toBe('これ、やってもいい？おねがい〜')

  // なでられたときも、表情ごとのセリフが無ければ時間帯のひとこと
  const petted = { ...untouched, at: NOW - 1_000 }
  expect(bandText(state({ hour: 7, pets: petted })).say).toBe('おはようのなでなで…♡ 元気でた！')
  expect(bandText(state({ hour: 3, pets: petted })).say).toBe('むにゃ…なでなで…ねむくなっちゃう…♡')
  expect(bandText(state({ hour: 12, pets: petted })).say).toBe('えへへ…♡ もっとなでて〜')
  expect(bandText(state({ hour: 3, pets: petted, mood: { kind: 'error', at: 0 } })).say).toBe('ぐすん…なぐさめてくれるの？♡')
})

test('isPetted と clockText', () => {
  expect(isPetted(untouched, NOW)).toBe(false)
  expect(isPetted({ ...untouched, at: NOW - 3_999 }, NOW)).toBe(true)
  expect(clockText(83_400)).toBe('1:23')
  expect(clockText(-5)).toBe('0:00')
})

test('なかよし度でセリフが増える：だいすきからはあまえたあいさつ、しんゆうからは寝言とおわったときのひとこと', () => {
  const say = (given: number, kind: BandState['mood']['kind'], n: number, hour = 21) =>
    bandText(state({ hour, mood: { kind, at: 0 }, tick: { n, at: NOW }, game: { ...newGame(0, NOW), given } })).say
  // まだ贈っていなければ今までと同じ（いちばん目のセリフも、入れかわりも）
  expect(linesOf('idle', 'night', 0)).toEqual(['よろしくね！なんでも言ってね', 'こんばんは！夜のコーディング、わくわくするね', '星がきれいな夜だね'])
  expect(linesOf('idle', 'night', 29_999)).toEqual(linesOf('idle', 'night', 0))
  // だいすき：時間帯のセリフの後ろに足す。いちばん目は変わらず、25 コマごとの入れかわりに混ざる
  const fond = linesOf('idle', 'night', 30_000)
  expect(fond.slice(0, 3)).toEqual(linesOf('idle', 'night', 0))
  expect(fond.length).toBe(5)
  expect(say(30_000, 'idle', 0)).toBe('よろしくね！なんでも言ってね')
  expect(say(30_000, 'idle', 75)).toBe('きみがいると、なんだか安心する')
  expect(say(30_000, 'idle', 100)).toBe('ねえねえ、今日もいっしょだね♡')
  expect(say(30_000, 'idle', 125)).toBe('よろしくね！なんでも言ってね')
  // 朝のあいさつも残る
  expect(say(30_000, 'idle', 0, 7)).toBe('おはよう！今日もよろしくね')
  // だいすきでは、寝言とおわったときのひとことはまだ
  expect(linesOf('sleeping', 'night', 30_000)).toEqual(linesOf('sleeping', 'night', 0))
  expect(linesOf('done', 'night', 30_000)).toEqual(['おわったよ！ほめてほめて〜'])
  // しんゆう：寝言と、おわったときのひとこと
  expect(say(300_000, 'sleeping', 25)).toBe('むにゃ…テスト、ぜんぶとおった…')
  expect(say(300_000, 'done', 25)).toBe('おわったよ！ふたりならなんでもできるね')
  expect(say(300_000, 'done', 25, 3)).toBe('おわったよ！ふたりならなんでもできるね')
  // ほかの表情（許可待ちなど）は増えない
  expect(linesOf('permission', 'night', 1e16)).toEqual(['これ、やってもいい？おねがい〜'])
})

test('なかよし度でセリフが増える：上の段ほど、そのぶん足される', () => {
  const extra = (given: number) => linesOf('idle', 'night', given).slice(3)
  expect(extra(3_000_000)).toContain('あいぼう、つぎは何しよっか？')
  expect(extra(1e8)).toEqual(extra(3_000_000))
  expect(extra(1e10)).toContain('ここがおうちだね。ただいま♡')
  expect(extra(1e12)).toContain('きみに会えたのは、きっとうんめいだね')
  expect(extra(1e16)).toContain('これからも、ずっとずっといっしょだよ♡')
  for (const given of [1e10, 1e12, 1e16]) expect(extra(given).length).toBeGreaterThan(extra(given / 100).length)
  expect(linesOf('done', 'night', 1e16)).toContain('おわったよ。つぎも、そのつぎも、いっしょだよ')
  expect(linesOf('sleeping', 'night', 1e12)).toContain('むにゃ…どこにもいかないでね…')
  // 帯は狭いので、足したセリフはどれも 22 字まで
  for (const kind of ['idle', 'done', 'sleeping'] as const)
    for (const line of linesOf(kind, 'night', 1e16).slice(linesOf(kind, 'night', 0).length)) expect([...line].length).toBeLessThanOrEqual(22)
})

test('なでられている・お礼のときは、なかよし度のセリフより先', () => {
  const game = { ...newGame(0, NOW), given: 1e16 }
  expect(bandText(state({ game, pets: { ...untouched, at: NOW - 1_000 } })).say).toBe('えへへ…♡ もっとなでて〜')
  expect(bandText(state({ game, holding: { id: 'twinStars', from: NOW } })).say).toBe('きみの星と、Clawd の星。ずっとならんで光ってるね')
  expect(bandText(state({ game, holding: { id: 'twinStars', from: NOW } })).info).toBe('🎁 ふたりの星 がやってきた！')
})
