// なでなでショップ（/parade shop で開くパネル）

import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import type { Character, Game } from '../types'
import type { Deal, Situation } from './game'

import {
  ACHIEVEMENTS,
  COSMETICS,
  DREAMS,
  MILESTONE_LEVELS,
  SLOTS,
  SPOT_NAMES,
  STAR,
  STAR_RATE,
  TREATS,
  UPGRADES,
  affectionOf,
  buyCosmetic,
  buyUpgrade,
  clockText,
  formatHearts,
  formatRate,
  giveGift,
  isHappy,
  isLit,
  isMaxed,
  levelOf,
  milestoneOf,
  perPet,
  perSecond,
  pickFavorite,
  priceOf,
  shownDreams,
  slotsUsed,
  spotOf,
  starCount,
  starPrice,
  starRate,
  switchCosmetic,
  toMilestone,
  toggleDream,
  wear,
  workRate,
} from './game'

export const SHOP = 'parade-shop'

export type ShopInput = {
  game: Game
  at: Situation
  petsTotal: number
  character: Character
  // ボタンを押したときの取り引き（買う・贈る・かぶる・飾る。できなければ断られる）。label はできたときのトースト
  buy: (label: string, deal: Deal) => () => Promise<void>
}

// ショップを描く（ui は $.ui.resolve(e) の部品）
export function shopView(ui: Elements[RenderSurface], input: ShopInput): RenderElement {
  const { Box, Text, Button } = ui
  const { game: g, at, character: who, buy } = input
  // 放置収入は 1 秒ごとに足されるので、その時刻を「いま」とみなす
  const now = g.passiveAt

  const header = (title: string) => (
    <Box key={`h-${title}`} paddingTop={1}>
      <Text bold color="#ff9ec7">
        ── {title} ──
      </Text>
    </Box>
  )

  const workBoost = at.isWorking ? `（お仕事中 ×${formatRate(workRate(g, at))}）` : ''
  const done = ACHIEVEMENTS.filter(a => g.achievements.includes(a.id)).length
  const affection = affectionOf(g.given)
  const lasts = (ms: number) => (ms >= 60_000 ? `${ms / 60_000} 分` : `${ms / 1000} 秒`)
  // 飾っている夢のプレゼントと、場所ごとの数
  const shown = shownDreams(g)
  const used = slotsUsed(g)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="#ff6b9a">
        ♡ {formatHearts(g.hearts)}
      </Text>
      <Text dimColor>
        放置 +{formatRate(perSecond(g, at))}/秒 · 1 なで {formatRate(perPet(g, at, now, 0))} ♡{workBoost}
      </Text>
      <Text dimColor>なで続けると コンボ、30 コンボで フィーバー（♡×3）！</Text>

      {header(`おかいもの（Lv${MILESTONE_LEVELS} ごとに効き目 2 倍）`)}
      {UPGRADES.map(u => {
        const level = levelOf(g, u.id)
        const isTop = isMaxed(u, level)
        const price = priceOf(u, level)
        // 節目の倍率（×2 から）と、次の節目までの Lv
        const boost = milestoneOf(u, level)
        const toNext = toMilestone(u, level)
        const milestone = toNext === null ? '' : ` · あと ${toNext} Lv で ×${formatRate(boost * 2)}`
        return (
          <Box key={`u-${u.id}`} columnGap={1}>
            <Button
              key={`buy-${u.id}`}
              variant={!isTop && g.hearts >= price ? 'primary' : 'secondary'}
              onPress={buy(`${u.name} を Lv${level + 1} にしたよ！`, one => buyUpgrade(one, u.id))}
            >
              {u.name} Lv{level} <Text dimColor>{isTop ? 'MAX' : `${formatHearts(price)}♡`}</Text>
            </Button>
            <Text dimColor wrap="truncate-end">
              {u.about}
              {boost > 1 ? `（×${formatRate(boost)}）` : ''}
              {milestone}
            </Text>
          </Box>
        )
      })}

      {header('きせかえ')}
      {COSMETICS.map(c => {
        const isOwned = g.owned.includes(c.id)
        const isWorn = c.hat !== undefined && g.hat === c.hat
        // 空の飾り（流れ星・オーロラ）は、ぼうしと同じように押すたびに出す・しまう（夢のプレゼントの枠は使わない）
        const isOn = isLit(g, c.id)
        const label =
          !isOwned ? `${c.name} ${formatHearts(c.price)}♡` :
          c.hat ? (isWorn ? `${c.name} ✓かぶってる` : `${c.name} をかぶる`) :
          isOn ? `${c.name} ✓出てる` : `${c.name} を出す`
        const press = !isOwned
          ? buy(`${c.name} を買ったよ！`, one => buyCosmetic(one, c.id))
          : c.hat
            ? buy(isWorn ? `${c.name} をはずしたよ` : `${c.name} をかぶったよ！`, one => wear(one, isWorn ? null : c.hat ?? null))
            : buy(isOn ? `${c.name} をしまったよ` : `${c.name} を出したよ！`, one => switchCosmetic(one, c.id))
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
      <Text dimColor>☆ を押すと、その贈り物を帯に出して、ワンぽちで贈れるよ</Text>
      {TREATS.map(treat => {
        const count = g.gifts[treat.id] ?? 0
        const isFavorite = g.favorite === treat.id
        return (
          <Box key={`t-${treat.id}`} columnGap={1}>
            <Button
              key={`fav-${treat.id}`}
              onPress={buy(
                isFavorite ? `${treat.name} を帯から下ろしたよ` : `${treat.icon} ${treat.name} を帯に出したよ！ワンぽちで贈れるよ`,
                one => pickFavorite(one, isFavorite ? null : treat.id),
              )}
            >
              {isFavorite ? '★' : '☆'}
            </Button>
            <Button
              key={`gift-${treat.id}`}
              variant={g.hearts >= treat.price ? 'primary' : 'secondary'}
              onPress={buy(`🎁 ${treat.name} をあげたよ！`, (one, when) => giveGift(one, treat.id, when))}
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
      <Text dimColor>
        飾っている数 {(Object.keys(SLOTS) as (keyof typeof SLOTS)[]).map(spot => `${SPOT_NAMES[spot]} ${used[spot]}/${SLOTS[spot]}`).join('・')}
        （贈ったものを押すと 飾る／しまう。しまっても ♡ の +10% はそのまま）
      </Text>
      {DREAMS.map(dream => {
        const isGiven = (g.gifts[dream.id] ?? 0) > 0
        const isShown = shown.includes(dream.id)
        return (
          <Box key={`d-${dream.id}`} columnGap={1}>
            {isGiven ? (
              // 贈ったものは、ぼうしと同じように押すたびに飾る・しまう（しまってあっても「贈った」と出す）
              <Button
                key={`gift-${dream.id}`}
                onPress={buy(isShown ? `${dream.name} をしまったよ` : `${dream.name} を飾ったよ！`, one => toggleDream(one, dream.id))}
              >
                {isShown ? `${dream.name} ✓飾ってる` : `${dream.name} を飾る`}
              </Button>
            ) : (
              <Button
                key={`gift-${dream.id}`}
                variant={g.hearts >= dream.price ? 'primary' : 'secondary'}
                onPress={buy(`🎁 ${dream.name} を贈ったよ！`, (one, when) => giveGift(one, dream.id, when))}
              >
                {dream.name} <Text dimColor>{formatHearts(dream.price)}♡</Text>
              </Button>
            )}
            <Text dimColor wrap="truncate-end">
              {dream.shows}（{SPOT_NAMES[spotOf(dream.id)]}）{isGiven && !isShown ? ' · ✓贈った（しまってある）' : ''}
            </Text>
          </Box>
        )
      })}

      {header(`星を贈る（何度でも · ひとつごとに ♡ ずっと ×${STAR_RATE}）`)}
      <Box key="star" columnGap={1}>
        <Button
          key="gift-star"
          variant={g.hearts >= starPrice(g) ? 'primary' : 'secondary'}
          onPress={buy(`🌟 ${STAR.name}を贈ったよ！夜空がまたひとつ明るくなる`, (one, when) => giveGift(one, 'star', when))}
        >
          星を贈る <Text dimColor>{formatHearts(starPrice(g))}♡</Text>
        </Button>
        <Text dimColor wrap="truncate-end">
          {starCount(g) > 0 ? `${starCount(g)} 個贈った · ♡ の稼ぎ ×${formatRate(starRate(g))}` : '贈るたびに値段が上がる'}
        </Text>
      </Box>

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
