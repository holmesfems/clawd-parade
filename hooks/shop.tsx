// なでなでショップ（/parade shop で開くパネル）

import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import type { Character, Game } from '../types'
import type { Scene } from './game'

import {
  ACHIEVEMENTS,
  COSMETICS,
  DREAMS,
  TREATS,
  UPGRADES,
  affectionOf,
  buyCosmetic,
  buyUpgrade,
  formatHearts,
  formatRate,
  giveGift,
  isHappy,
  isMaxed,
  levelOf,
  perPet,
  perSecond,
  priceOf,
  wear,
} from './game'
import { clockText } from './band'

export const SHOP = 'parade-shop'

// お店の取り引き：買えたら新しいゲーム、買えなければ断る理由
export type Deal = (g: Game, now: number) => Game | string

export type ShopInput = {
  game: Game
  at: Scene
  petsTotal: number
  character: Character
  // ボタンを押したときの買い物（足りなければ断られる）。label は買えたときのトースト
  buy: (label: string, deal: Deal) => () => Promise<void>
  // 押しても何も起きないボタンの、ひとこと
  say: (text: string) => () => Promise<void>
}

// ショップを描く（ui は $.ui.resolve(e) の部品）
export function shopView(ui: Elements[RenderSurface], input: ShopInput): RenderElement {
  const { Box, Text, Button } = ui
  const { game: g, at, character: who, buy: deal } = input
  // 放置収入は 1 秒ごとに足されるので、その時刻を「いま」とみなす
  const now = g.passiveAt

  const header = (title: string) => (
    <Box key={`h-${title}`} paddingTop={1}>
      <Text bold color="#ff9ec7">
        ── {title} ──
      </Text>
    </Box>
  )

  const workBoost = at.isWorking ? `（お仕事中 ×${2 + 0.5 * levelOf(g, 'coffee')}）` : ''
  const done = ACHIEVEMENTS.filter(a => g.achievements.includes(a.id)).length
  const affection = affectionOf(g.given)
  const lasts = (ms: number) => (ms >= 60_000 ? `${ms / 60_000} 分` : `${ms / 1000} 秒`)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="#ff6b9a">
        ♡ {formatHearts(g.hearts)}
      </Text>
      <Text dimColor>
        放置 +{formatRate(perSecond(g, at))}/秒 · 1 なで {formatRate(perPet(g, at, now, 0))} ♡{workBoost}
      </Text>
      <Text dimColor>なで続けると コンボ、30 コンボで フィーバー（♡×3）！</Text>

      {header('おかいもの')}
      {UPGRADES.map(u => {
        const level = levelOf(g, u.id)
        const isTop = isMaxed(u, level)
        const price = priceOf(u, level)
        return (
          <Box key={`u-${u.id}`} columnGap={1}>
            <Button
              key={`buy-${u.id}`}
              variant={!isTop && g.hearts >= price ? 'primary' : 'secondary'}
              onPress={deal(`${u.name} を Lv${level + 1} にしたよ！`, one => buyUpgrade(one, u.id))}
            >
              {u.name} Lv{level} <Text dimColor>{isTop ? 'MAX' : `${formatHearts(price)}♡`}</Text>
            </Button>
            <Text dimColor wrap="truncate-end">
              {u.about}
            </Text>
          </Box>
        )
      })}

      {header('きせかえ')}
      {COSMETICS.map(c => {
        const isOwned = g.owned.includes(c.id)
        const isWorn = c.hat !== undefined && g.hat === c.hat
        const label = !isOwned ? `${c.name} ${formatHearts(c.price)}♡` : isWorn ? `${c.name} ✓かぶってる` : c.hat ? `${c.name} をかぶる` : `${c.name} ✓`
        const press = !isOwned
          ? deal(`${c.name} を買ったよ！`, one => buyCosmetic(one, c.id))
          : c.hat
            ? deal(isWorn ? `${c.name} をはずしたよ` : `${c.name} をかぶったよ！`, one => wear(one, isWorn ? null : c.hat ?? null))
            : input.say(`${c.name} はもう夜空にあるよ`)
        const about = c.id === 'catEars' && who === 'neko' ? 'ねこはもとからねこみみ（Clawd だけ）' : c.about
        return (
          <Box key={`c-${c.id}`} columnGap={1}>
            <Button key={`dress-${c.id}`} variant={!isOwned && g.hearts >= c.price ? 'primary' : 'secondary'} onPress={press}>
              {label}
            </Button>
            <Text dimColor wrap="truncate-end">
              {about}
            </Text>
          </Box>
        )
      })}

      {header(`プレゼント · なかよし度「${affection.name}」`)}
      <Text dimColor>
        {affection.next
          ? `あと ♡${formatHearts(affection.next.at - g.given)} 贈ると「${affection.next.name}」`
          : 'これ以上ないくらいなかよし！'}
        {isHappy(g, now) ? ` · ごきげん中 ♡×1.5（あと ${clockText(g.happyUntil - now)}）` : ''}
      </Text>
      {TREATS.map(treat => {
        const count = g.gifts[treat.id] ?? 0
        return (
          <Box key={`t-${treat.id}`} columnGap={1}>
            <Button
              key={`gift-${treat.id}`}
              variant={g.hearts >= treat.price ? 'primary' : 'secondary'}
              onPress={deal(`🎁 ${treat.name} をあげたよ！`, (one, when) => giveGift(one, treat.id, when))}
            >
              {treat.name} <Text dimColor>{formatHearts(treat.price)}♡</Text>
            </Button>
            <Text dimColor wrap="truncate-end">
              ごきげん {lasts(treat.happyMs)}
              {count > 0 ? ` · ${count} 回あげた` : ''}
            </Text>
          </Box>
        )
      })}

      {header('夢のプレゼント（ひとつごとに ♡ ずっと +10%）')}
      {DREAMS.map(dream => {
        const isGiven = (g.gifts[dream.id] ?? 0) > 0
        return (
          <Box key={`d-${dream.id}`} columnGap={1}>
            {isGiven ? (
              <Button key={`gift-${dream.id}`} onPress={input.say(`${dream.name} はもう飾ってあるよ`)}>
                {dream.name} ✓
              </Button>
            ) : (
              <Button
                key={`gift-${dream.id}`}
                variant={g.hearts >= dream.price ? 'primary' : 'secondary'}
                onPress={deal(`🎁 ${dream.name} を贈ったよ！`, (one, when) => giveGift(one, dream.id, when))}
              >
                {dream.name} <Text dimColor>{formatHearts(dream.price)}♡</Text>
              </Button>
            )}
            <Text dimColor wrap="truncate-end">
              {dream.shows}
            </Text>
          </Box>
        )
      })}

      {header(`実績 ${done}/${ACHIEVEMENTS.length}`)}
      {ACHIEVEMENTS.map(a => {
        const isMine = g.achievements.includes(a.id)
        return (
          <Box key={`a-${a.id}`} columnGap={1}>
            <Text {...(isMine ? { color: '#ffd166' } : { dimColor: true })}>
              {isMine ? '🏆' : '・'} {a.name}
            </Text>
            <Text dimColor wrap="truncate-end">
              {a.about}
            </Text>
          </Box>
        )
      })}

      {header('きろく')}
      <Text dimColor>
        なでた回数 {formatHearts(input.petsTotal)} 回 · 稼いだ ♡ {formatHearts(g.earned)} · 贈った ♡ {formatHearts(g.given)}
      </Text>
      <Text dimColor>
        最高コンボ {g.maxCombo} · フィーバー {g.fevers} 回 · お仕事中のなでなで {formatHearts(g.workPets)} 回 · ぎゅっ {g.hugs} 回
      </Text>
    </Box>
  )
}
