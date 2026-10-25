// 入力欄の上の帯。セリフ・info・♡ の行は bandText（$ に触らない純粋な関数）で作り、
// renderBand が面（端末・デスクトップ）に合わせて絵と並べる

import type { Elements, RenderElement, RenderSurface } from 'claude-code'

import type { Character, Friend, Game, Holding, Mood, MoodKind, Pets, Tick, TreatId, Work } from '../types'
import { ACHIEVEMENTS, HOOK_FRAME_MS, clockText, formatHearts, formatRate, giftOf, heldGift, isDream, isFever, isHappy, isPetted, liveCombo, lookOf, perSecond, situationOf, treatOf } from './game'
import type { ViewProps } from './parade-view'
import { NIGHT, PALETTES, QUICK_GIFT_DOTS, SCENE_ROWS, clawdText, coatOf, drawScene, encodeCells, frameOf, hex, kaomoji, layout, putHeart, putQuickGift, quickGiftSpot, timeOfDay, toSvg } from './scene'
import type { Frame, TimeOfDay } from './scene'
import type { TouchProps } from './touch-pad'

// 取った実績を帯に出しておく時間
const UNLOCK_SHOW_MS = 5000
// デスクトップの星は大きく見えてせわしないので、またたきを 1/4 の速さにする
const DESKTOP_TWINKLE_TICKS = 4
// SVG 本来の 1 ドットの大きさ。舞台の幅まで縮められるよう、大きめにしておく
const DESKTOP_MARKUP_PIXEL = 16
// 手ざわり層の高さ（行）。上端から置き、地面まで届くよう絵より少し高めにとる。
// 下にはみ出たぶんは舞台で切る（デスクトップは bottom での配置が効かず、層ごと消えた）。
// デスクトップの 1 行はおよそ 28px、夜空はおよそ 160px なので 7 行で足りる
const TOUCH_ROWS = 7
// ぎゅっとされた仲間が跳ねている、フックのコマ数（端末の Client は自分のコマで VIEW_HOP_FRAMES）
const HOOK_HOP_FRAMES = 6
// 絵が出せる帯の幅（マス）
const MIN_SCENE_CELLS = 40

const LINES: Record<MoodKind, string[]> = {
  idle: ['よろしくね！なんでも言ってね'],
  working: ['おしごと中…カタカタ', 'がんばってるよ！', 'もうちょっと待ってね', 'ふむふむ…なるほど'],
  permission: ['これ、やってもいい？おねがい〜'],
  question: ['ちょっと聞きたいことがあるの'],
  plan: ['プランできたよ！見てみて'],
  done: ['おわったよ！ほめてほめて〜'],
  waiting: ['どうする？おへんじ待ってるね'],
  aborted: ['あっ、とめられちゃった…'],
  error: ['エラーになっちゃった…ごめんね'],
  refusal: ['それはできないの…ごめんね'],
  sleeping: ['すやすや…（話しかけたら起きるよ）'],
}

// 時間帯ごとのセリフ。無い表情は LINES のまま。夜は LINES と同じ
const TIME_LINES: Record<TimeOfDay, Partial<Record<MoodKind, string[]>>> = {
  morning: {
    idle: ['おはよう！今日もよろしくね', 'おはよ〜…コーヒーいれよっか？', 'あさだ！なにからはじめる？'],
    done: ['おわったよ！朝からえらい！ほめて〜'],
    sleeping: ['むにゃ…あと 5 分…（話しかけたら起きるよ）'],
  },
  day: {
    idle: ['こんにちは！なんでも言ってね', 'お昼ごはん、ちゃんと食べた？', 'いい天気だね〜（たぶん）'],
    sleeping: ['すぴー…おひるね中…（話しかけたら起きるよ）'],
  },
  evening: {
    idle: ['こんばんは！もうひとがんばり？', 'ゆうやけ、きれいだね', 'そろそろ晩ごはんの時間かな？'],
    done: ['おわったよ！今日もおつかれさま〜'],
  },
  night: {
    idle: ['よろしくね！なんでも言ってね', 'こんばんは！夜のコーディング、わくわくするね', '星がきれいな夜だね'],
  },
  lateNight: {
    idle: ['ふぁ…まだ起きてるの？', 'もう寝ようぜ…つづきは明日にしよ？', 'ねむい…でも、もうちょっとだけ付き合うよ'],
    working: ['ねむいけど…がんばる…', 'カタカタ…（夜ふかし中）', 'もうちょっと待ってね…ふぁ〜'],
    done: ['おわったよ…ほめて…そして寝よ？'],
    sleeping: ['すやすや…（もう夜おそいね。話しかけたら起きるよ）'],
  },
}

// なでられたときの、時間帯ごとのひとこと（表情ごとの PETTED_LINES が無いとき）
const TIME_PETTED: Partial<Record<TimeOfDay, string>> = {
  morning: 'おはようのなでなで…♡ 元気でた！',
  lateNight: 'むにゃ…なでなで…ねむくなっちゃう…♡',
}

const PETTED_LINES: Partial<Record<MoodKind, string>> = {
  working: 'えへへ…おしごと中だけどうれしい♡',
  permission: 'なでなでより先に、おへんじほしいな…♡',
  error: 'ぐすん…なぐさめてくれるの？♡',
  aborted: 'ううん、だいじょうぶ…♡',
  sleeping: 'むにゃ…なでなで…♡',
}

const TONE: Record<MoodKind, string> = {
  idle: '#d97757',
  working: '#d97757',
  permission: '#ff7a59',
  question: '#ffd166',
  plan: '#ffe066',
  done: '#ff6b9a',
  waiting: '#ffd166',
  aborted: '#9ec9ff',
  error: '#6ec6ff',
  refusal: '#ff5c5c',
  sleeping: '#9ec9ff',
}

// 種類ごとにまとめる（Map.groupBy は型の lib が es2023 なので使わない）
function groupBy<T, K>(list: T[], keyOf: (one: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const one of list) {
    const key = keyOf(one)
    const group = out.get(key)
    if (group) group.push(one)
    else out.set(key, [one])
  }
  return out
}

// 帯に出す文字を作るのに使う状態。hour は今の「時」（0〜23、使う人のタイムゾーン）
export type BandState = { mood: Mood; work: Work; friends: Friend[]; pets: Pets; game: Game; holding: Holding; tick: Tick; hour: number }

export type BandText = {
  // セリフと、その色（なでられている・お礼のときはピンク）。tone は表情の色
  say: string
  sayColor: string
  tone: string
  // 2 行目：実績・贈り物・なでた回数・タイマー（無ければ ''）
  info: string
  // なでなでゲームの行
  score: string
  scoreColor: string
  isFever: boolean
  // 帯に出したワンぽちの贈り物（ショップの ☆ で選んだもの）。選んでいなければ null
  gift: { id: TreatId; label: string; canAfford: boolean } | null
}

// 帯のセリフ・info・♡ の行。時刻は最後のコマ（tick.at）
export function bandText(s: BandState): BandText {
  const { mood: m, work: w, pets: p, game: g } = s
  const now = s.tick.at
  const petted = isPetted(p, now)
  // 贈り物をもらった直後は、なにより先にその贈り物へのお礼を言う
  const holdingId = heldGift(s.holding, now)
  const thanked = holdingId ? giftOf(holdingId) : undefined
  const time = timeOfDay(s.hour)
  const lines = TIME_LINES[time][m.kind] ?? LINES[m.kind]
  const say = thanked
    ? thanked.thanks
    : petted
      ? p.kind === 'hug' ? 'なかまもよろこんでるよ♡' : PETTED_LINES[m.kind] ?? TIME_PETTED[time] ?? 'えへへ…♡ もっとなでて〜'
      : lines[Math.floor(s.tick.n / 25) % lines.length] ?? lines[0]!
  // 取ったばかりの実績は、しばらくなでなで回数やタイマーの行に出す
  const unlock = g.lastUnlock && now - g.lastUnlock.at < UNLOCK_SHOW_MS ? ACHIEVEMENTS.find(a => a.id === g.lastUnlock?.id) : undefined
  const info =
    unlock ? `🏆 実績「${unlock.name}」ゲット！` :
    thanked ? `🎁 ${thanked.name}${isDream(thanked.id) ? ' がやってきた！' : ` · ${g.gifts[thanked.id] ?? 1} 個目`}` :
    petted ? `なでなで ${p.total} 回目 ♡` :
    w.isRunning ? `⏱ ${clockText(now - w.startedAt)}${w.tool ? ` · ${w.tool}` : ''}` :
    w.durationMs !== null ? `⏱ ${clockText(w.durationMs)} でおわり${w.helpers ? ` · なかま ${w.helpers}匹がてつだったよ` : ''}` :
    ''

  // なでなでゲームの行：フィーバー中はのこり時間、ふだんは ♡ と放置収入とコンボ
  const combo = liveCombo(g, now)
  const isFeverNow = isFever(g, now)
  const happy = isHappy(g, now) ? ` · ごきげん ${clockText(g.happyUntil - now)}` : ''
  const score = isFeverNow
    ? `★ フィーバー ★ ♡×3 あと ${Math.ceil((g.feverUntil - now) / 1000)} 秒 · ♡ ${formatHearts(g.hearts)}`
    : `♡ ${formatHearts(g.hearts)} · +${formatRate(perSecond(g, situationOf(w, s.friends), now))}/秒${combo >= 2 ? ` · ${combo} コンボ！` : happy}`
  return {
    say,
    sayColor: petted || thanked ? '#ff6b9a' : TONE[m.kind],
    tone: TONE[m.kind],
    info,
    score,
    scoreColor: isFeverNow ? '#ffb347' : '#ff9ec7',
    isFever: isFeverNow,
    gift: giftButtonOf(g),
  }
}

function giftButtonOf(g: Game): BandText['gift'] {
  const treat = g.favorite === null ? undefined : treatOf(g.favorite)
  if (!treat) return null
  return { id: treat.id, label: `${treat.icon} あげる ${formatHearts(treat.price)}♡`, canAfford: g.hearts >= treat.price }
}

// デスクトップの SVG。さわったぶんのハート・傾き・仲間のジャンプと、帯に出した贈り物の札を足して描く。
// 札を描くときは、frame.paradeColumns をもう QUICK_GIFT_DOTS 引いておく（札はそのすぐ右）
export function desktopSvg(scene: ViewProps, frame: Frame, p: Pets, now: number, gift: BandText['gift'] = null) {
  const petted = isPetted(p, now)
  const age = Math.floor((now - p.from) / HOOK_FRAME_MS)
  const isStroked = petted && p.kind === 'pet'
  const hugged = petted && p.kind === 'hug' && p.friend !== null && age < HOOK_HOP_FRAMES ? [p.friend] : []
  const spots = layout(frame.columns, frame.paradeColumns, scene.friends, scene.character)
  const { x, w } = spots.leader
  const sway = p.hand !== null ? Math.round((p.hand - (x + w / 2)) / 3) : [0, 1, 0, -1][age % 4] ?? 0
  // 空の色は、絵（drawScene）と背景（toSvg）に同じものを渡す
  const palette = scene.palette ?? NIGHT
  const g = drawScene({
    ...scene,
    palette,
    paradeColumns: frame.paradeColumns,
    twinkleTicks: DESKTOP_TWINKLE_TICKS,
    headroom: frame.headroom,
    petted: isStroked ? { sway } : null,
    hopping: hugged,
  })
  if (isStroked) {
    // なでている間は 2 コマごとにハートを出し、両脇から昇らせる
    const { hearts } = spots
    const lastTouch = Math.floor((p.at - p.from) / HOOK_FRAME_MS)
    for (let k = Math.max(0, Math.ceil((age - 11) / 2)); k * 2 <= Math.min(age, lastTouch + 4); k++) {
      putHeart(g, hearts[k % hearts.length]!, frame.headroom + 8 - (age - k * 2), k % 2 === 0)
    }
  }
  if (gift) putQuickGift(g, quickGiftSpot(frame.paradeColumns).x, gift.id, gift.canAfford)
  return toSvg(g, DESKTOP_MARKUP_PIXEL, palette)
}

// 帯を描くのに使うもの。onPet は、絵が出せないほど狭いデスクトップの「なでる」ボタン。
// onGift は、帯に出した贈り物のワンぽちのボタン
export type BandInput = BandState & {
  surface: RenderSurface
  // 帯の幅（マス）と、端末で使える行数
  cols: number
  maxRows: number
  character: Character
  isDebug: boolean
  onPet: () => void
  onGift: (id: TreatId) => void
}

// 入力欄の上の帯を描く（ui は $.ui.resolve(e) の部品）
export function bandView(ui: Elements[RenderSurface], input: BandInput): RenderElement {
  const { mood: m, friends: list, tick: t, character: who, pets: petted, game: g, holding: held, isDebug, cols } = input
  const text = bandText(input)

  const { Box, Text, Button } = ui
  const isDesktop = input.surface === 'desktop'
  const { gift } = text

  // デスクトップは夜空を帯の幅いっぱいに広げ、広いときは右側の空をセリフに空けておく
  const wide = frameOf(isDesktop ? 'desktop' : 'terminal', cols)
  // 広いデスクトップでは、帯に出した贈り物をボタンにせず、行進とセリフの空のあいだに札で描いて手ざわり層で押す
  // （ボタンを ♡ の行に並べると、セリフの空に入りきらず ♡ が見切れた）
  const skyGift = isDesktop && wide.isWide && cols >= MIN_SCENE_CELLS && 'Svg' in ui && 'Client' in ui ? gift : null
  const frame = skyGift ? { ...wide, paradeColumns: wide.paradeColumns - QUICK_GIFT_DOTS } : wide

  // ♡ の行。帯に贈り物を出していれば（札にしないときは）、その右にワンぽちで贈るボタンを置く
  const scoreText = (
    <Text key="score" color={text.scoreColor} bold={text.isFever} wrap="truncate-end">
      {text.score}
    </Text>
  )
  const scoreLine = gift && !skyGift ? (
    <Box key="score-row" columnGap={1} alignItems="center">
      {scoreText}
      <Button key="quick-gift" label={gift.label} variant={gift.canAfford ? 'primary' : 'secondary'} onPress={() => input.onGift(gift.id)} />
    </Box>
  ) : (
    scoreText
  )
  // セリフ・info・♡ の行。横に並べる版と、夜空に重ねる版で同じものを使う
  const lines = [
    <Text key="say" color={text.sayColor} bold wrap="truncate-end">
      {text.say}
    </Text>,
    text.info !== '' && (
      <Text key="info" dimColor wrap="truncate-end">
        {text.info}
      </Text>
    ),
    scoreLine,
  ]

  const legend = list.map(f => (
    <Box key={`f-${f.id}`}>
      <Text color={hex(coatOf(f.type))}>● {f.type} </Text>
      <Text dimColor wrap="truncate-end">
        {f.doneAt !== null ? 'おつかれさま！' : `${f.label}${f.tool ? ` · ${f.tool}` : ''}`}
      </Text>
    </Box>
  ))

  const words = (
    <Box key="words" flexDirection="column" flexShrink={1}>
      {lines}
      {legend}
    </Box>
  )

  // 夜空に重ねる版：右端に寄せ、空の高さに収まるよう仲間は色つきの名札 1 行にまとめる
  const crews = [...groupBy(list, f => f.type)]
  const skyWords = (
    <Box key="words" flexDirection="column" alignItems="flex-end" paddingRight={2}>
      {lines}
      {list.length > 0 && (
        <Box key="chips" columnGap={1} overflow="hidden">
          {crews.map(([type, crew]) => (
            <Text key={`c-${type}`} color={hex(coatOf(type))} wrap="truncate-end">
              ● {type}
              {crew.length > 1 ? ` ×${crew.length}` : ''}
              {crew.every(f => f.doneAt !== null) ? ' ♡' : ''}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )

  const { isWide, columns: sceneColumns } = frame
  const room = SCENE_ROWS + (isWide ? 0 : 3 + list.length)
  const sceneProps: ViewProps = {
    columns: sceneColumns,
    mood: m.kind,
    tick: t.n,
    friends: list,
    character: who,
    look: lookOf(g, t.at, held),
    palette: PALETTES[timeOfDay(input.hour)],
  }
  // デスクトップの絵は px で描くので、行数の余裕は見ない
  const canDraw = cols >= MIN_SCENE_CELLS && (isDesktop || (input.surface === 'terminal' && input.maxRows >= room))

  // 端末はなでなでできる Client を優先し、無い面では絵だけの Raster にする。
  // デスクトップは SVG の上に、同じ大きさの見えない手ざわり層（Client）を重ねる
  const scene =
    canDraw && isDesktop && 'Svg' in ui ? (
      (() => {
        const svg = desktopSvg(sceneProps, frame, petted, t.at, skyGift)
        const alt = `${who === 'clawd' ? 'Clawd' : 'ねこ'}${list.length ? `となかま ${list.length} 匹` : ''}のパレード${skyGift ? `（${skyGift.label}）` : ''}`
        const touchProps: TouchProps = {
          columns: sceneColumns,
          paradeColumns: frame.paradeColumns,
          rows: TOUCH_ROWS,
          friends: list,
          character: who,
          isDebug,
          gift: skyGift ? quickGiftSpot(frame.paradeColumns) : null,
        }
        // 割合（100%）の大きさはデスクトップで効かず層が左上に縮んだので、層も絵も同じマス数で置く。
        // セリフは手ざわり層より後に置き、層の上に重ねる
        return (
          <Box key="stage" width={cols} overflow="hidden">
            <ui.Svg source={svg.source} alt={alt} />
            {'Client' in ui && (
              <Box key="touch-layer" position="absolute" top={0} left={0} width={cols} height={TOUCH_ROWS}>
                <ui.Client key="touch" module="./touch-pad.tsx" props={touchProps} width={cols} height={TOUCH_ROWS} />
              </Box>
            )}
            {isWide && (
              <Box
                key="sky-words"
                position="absolute"
                top={0}
                bottom={0}
                right={0}
                width={frame.wordsCells}
                flexDirection="column"
                justifyContent="center"
                overflow="hidden"
              >
                {skyWords}
              </Box>
            )}
          </Box>
        )
      })()
    ) : canDraw && 'Client' in ui ? (
      <ui.Client key="parade" module="./parade-view.tsx" props={sceneProps} width={sceneColumns} height={SCENE_ROWS} />
    ) : canDraw && 'Raster' in ui ? (
      (() => {
        const cells = encodeCells(drawScene(sceneProps))
        return <ui.Raster key="scene" columns={cells.columns} rows={cells.rows} cells={cells.cells} />
      })()
    ) : null

  // 広いデスクトップはセリフも夜空の中にあるので、絵だけを返す
  if (scene && isDesktop && isWide) return scene

  if (scene) {
    return (
      <Box flexDirection={isWide ? 'row' : 'column'}>
        {scene}
        <Box key="side" flexDirection="column" paddingLeft={isWide ? 1 : 0} paddingTop={isWide ? 1 : 0}>
          {words}
        </Box>
      </Box>
    )
  }

  const crew = list.map(f => (
    <Text key={`k-${f.id}`} color={hex(coatOf(f.type))}>
      {who === 'clawd'
        ? f.doneAt !== null ? '▗▛▜▖♡' : (t.n + f.id.length) % 2 ? '▗▛▜▖' : ' ▗▛▜▖'
        : f.doneAt !== null ? '(=^ᴗ^=)ﾉ' : (t.n + f.id.length) % 2 ? '(=･ω･=)' : '(=･ω･=)ﾉ'}{' '}
    </Text>
  ))

  // 絵が出せないほど狭いとき。デスクトップでは絵を直接なでられないので、ボタンでなでる
  return (
    <Box flexDirection="column">
      <Box key="row">
        {crew}
        <Text color={text.tone} bold>
          {who === 'clawd' ? clawdText(m.kind, t.n) : kaomoji(m.kind, t.n)}{' '}
        </Text>
        <Text color={text.tone}>{text.say}</Text>
      </Box>
      {text.info !== '' && <Text dimColor>{text.info}</Text>}
      {scoreLine}
      {isDesktop && (
        <Box key="pet-row" paddingTop={1}>
          <Button key="pet" label="なでる ♡" onPress={input.onPet} />
        </Box>
      )}
    </Box>
  )
}
