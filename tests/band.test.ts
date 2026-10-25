// 帯のセリフ・info・♡ の行（bandText）の単体テスト
import { expect, test } from 'claude-code/testing'

import type { Friend, Pets, Work } from '../types'
import type { BandState } from '../hooks/band'
import { bandText, clockText, isPetted } from '../hooks/band'
import { newGame } from '../hooks/game'

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
  ...over,
})

test('ふだんは表情ごとのセリフと ♡ の行', () => {
  const text = bandText(state(), NOW)
  expect(text.say).toBe('よろしくね！なんでも言ってね')
  expect(text.sayColor).toBe('#d97757')
  expect(text.info).toBe('')
  expect(text.score).toBe('♡ 1,234 · +0/秒')
  expect(text.isFever).toBe(false)
  // お仕事中のセリフは 25 コマごとに入れかわる
  const working = (n: number) => bandText(state({ mood: { kind: 'working', at: 0 }, tick: { n, at: NOW } }), NOW).say
  expect(working(0)).toBe('おしごと中…カタカタ')
  expect(working(25)).toBe('がんばってるよ！')
})

test('なでられている間は、とろけたセリフとなでた回数', () => {
  const petted = { ...untouched, at: NOW - 1_000 }
  const text = bandText(state({ pets: petted }), NOW)
  expect(text.say).toBe('えへへ…♡ もっとなでて〜')
  expect(text.sayColor).toBe('#ff6b9a')
  expect(text.info).toBe('なでなで 7 回目 ♡')
  expect(bandText(state({ pets: petted, mood: { kind: 'error', at: 0 } }), NOW).say).toBe('ぐすん…なぐさめてくれるの？♡')
  expect(bandText(state({ pets: { ...petted, kind: 'hug' } }), NOW).say).toBe('なかまもよろこんでるよ♡')
  // 4 秒たつと、もとのセリフにもどる
  expect(bandText(state({ pets: { ...untouched, at: NOW - 4_000 } }), NOW).say).toBe('よろしくね！なんでも言ってね')
})

test('贈り物をかかえている間は、なにより先にお礼', () => {
  const game = { ...newGame(0, NOW), gifts: { cake: 2 } }
  const text = bandText(state({ game, holding: { id: 'cake', from: NOW - 1_000 }, pets: { ...untouched, at: NOW } }), NOW)
  expect(text.say).toBe('ケーキ！？いいの！？いただきまーす♡')
  expect(text.info).toBe('🎁 いちごのショートケーキ · 2 個目')
  const dream = bandText(state({ holding: { id: 'house', from: NOW } }), NOW)
  expect(dream.info).toBe('🎁 小さなおうち がやってきた！')
})

test('取ったばかりの実績は info に 5 秒出す', () => {
  const game = { ...newGame(0, NOW), lastUnlock: { id: 'pets1', at: NOW - 4_000 } }
  expect(bandText(state({ game }), NOW).info).toBe('🏆 実績「はじめてのなでなで」ゲット！')
  expect(bandText(state({ game }), NOW + 1_000).info).toBe('')
})

test('お仕事中とおわったあとはタイマー', () => {
  const running: Work = { startedAt: NOW - 83_000, tool: 'Bash', durationMs: null, helpers: 0, isRunning: true }
  expect(bandText(state({ work: running }), NOW).info).toBe('⏱ 1:23 · Bash')
  const done: Work = { ...running, durationMs: 5_000, helpers: 2, isRunning: false }
  expect(bandText(state({ work: done }), NOW).info).toBe('⏱ 0:05 でおわり · なかま 2匹がてつだったよ')
})

test('♡ の行：お仕事中の稼ぎ・コンボ・ごきげん・フィーバー', () => {
  const crew: Friend[] = [{ id: 'a', type: 'Explore', label: '', tool: null, doneAt: null }]
  const working: Work = { ...resting, isRunning: true }
  expect(bandText(state({ work: working, friends: crew }), NOW).score).toBe('♡ 1,234 · +1/秒')

  const combo = { ...newGame(10, NOW), combo: 5, comboAt: NOW - 500, happyUntil: NOW + 30_000 }
  expect(bandText(state({ game: combo }), NOW).score).toBe('♡ 10 · +0/秒 · 5 コンボ！')
  expect(bandText(state({ game: { ...combo, combo: 0 } }), NOW).score).toBe('♡ 10 · +0/秒 · ごきげん 0:30')

  const fever = bandText(state({ game: { ...newGame(10, NOW), feverUntil: NOW + 2_500 } }), NOW)
  expect(fever.score).toBe('★ フィーバー ★ ♡×3 あと 3 秒 · ♡ 10')
  expect(fever.scoreColor).toBe('#ffb347')
  expect(fever.isFever).toBe(true)
})

test('isPetted と clockText', () => {
  expect(isPetted(untouched, NOW)).toBe(false)
  expect(isPetted({ ...untouched, at: NOW - 3_999 }, NOW)).toBe(true)
  expect(clockText(83_400)).toBe('1:23')
  expect(clockText(-5)).toBe('0:00')
})
