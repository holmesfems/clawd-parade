export type MoodKind =
  | 'idle'
  | 'working'
  | 'permission'
  | 'question'
  | 'plan'
  | 'done'
  | 'waiting'
  | 'aborted'
  | 'error'
  | 'refusal'
  | 'sleeping'

export type Character = 'clawd' | 'neko'

export type Mood = { kind: MoodKind; at: number }

export type Friend = {
  id: string
  type: string
  label: string
  tool: string | null
  doneAt: number | null
}

export type Work = {
  startedAt: number
  tool: string | null
  durationMs: number | null
  helpers: number
  isRunning: boolean
}

// なでる（Clawd）か、ぎゅっとする（仲間）か
export type TouchKind = 'pet' | 'hug'

// Client（端末のパレード・デスクトップの手ざわり層）からフックへ post するメッセージ
export type ClientMessage =
  // Clawd をなではじめた。x はさわった絵のドットの列（手ざわり層だけが送る）
  | { kind: 'pet'; x?: number }
  // 押したまま、なでた 1 回ぶん動かした
  | { kind: 'stroke'; x?: number }
  // 仲間をぎゅっとした。id はその仲間（手ざわり層だけが送る）
  | { kind: 'hug'; id?: string }
  // 帯に出した贈り物の札を押した（広いデスクトップの手ざわり層だけが送る）
  | { kind: 'gift' }

export type Pets = {
  total: number
  // いちばん最近さわった時刻と、続けてなでている間の始まり
  at: number
  from: number
  kind: TouchKind
  // デスクトップの手ざわり層から：手のあるドットの列、ぎゅっとした仲間
  hand: number | null
  friend: string | null
}

export type Tick = { n: number; at: number }

// 天気（#42）。日付から決まる、つくりものの天気（ほんとうの天気ではない。hooks/weather.ts の weatherOf）。
// 保存には入らない
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow'

// ---- なでなでゲーム ----

export type UpgradeId = 'glove' | 'brush' | 'coffee' | 'fan' | 'allowance' | 'toolTip' | 'stardust' | 'feverTime'

export type Hat = 'ribbon' | 'catEars' | 'santa' | 'crown'

export type CosmeticId = Hat | 'shootingStars' | 'aurora'

// 小さな贈り物（何度でも）と、夢のプレゼント（1 回きりで、ずっと飾られる）
export type TreatId = 'cookie' | 'cocoa' | 'cake' | 'letter' | 'cushion' | 'keyboard'
// 1.7.0 で足した 4 つ（流れ星の丘・空飛ぶ船・Clawd の銅像・ふたりの星）は、後ろに足した。id は保存に入るので変えないこと
export type DreamId =
  | 'greenTests'
  | 'telescope'
  | 'house'
  | 'library'
  | 'constellation'
  | 'moonTrip'
  | 'noBugs'
  | 'starHill'
  | 'airship'
  | 'statue'
  | 'twinStars'
// 星は何度でも贈れて、贈るたびに値段が上がる（数は gifts.star に入る）
export type GiftId = TreatId | DreamId | 'star'

// 実績の id（hooks/game.ts の ACHIEVEMENTS と同じ並び）。保存に入るので、変えないこと。
// plugin.json の types は 1 ファイルで閉じている決まりなので、game.ts から引かずにここに並べる
export type AchievementId =
  | 'pets1'
  | 'pets100'
  | 'pets1k'
  | 'pets10k'
  | 'pets100k'
  | 'pets1m'
  | 'combo10'
  | 'fever1'
  | 'fever10'
  | 'fever100'
  | 'work100'
  | 'work1k'
  | 'hug10'
  | 'wake'
  | 'earned10k'
  | 'earned1m'
  | 'earned100m'
  | 'shop1'
  | 'glove25'
  | 'idle10'
  | 'hat'
  | 'collector'
  | 'gift1'
  | 'sweets10'
  | 'letter'
  | 'dream1'
  | 'dreamAll'
  | 'bff'
  | 'earned10b'
  | 'earned1t'
  | 'earned10q'
  | 'stars10'
  | 'stars50'
  | 'stars100'
  | 'family'
  | 'destiny'
  | 'forever'
  | 'dreamHill'
  | 'dreamAirship'
  | 'dreamStatue'
  | 'dreamTwinStars'
  // 1.10.0（#43）：きょうの日記と、つづけて使った日数
  | 'streak3'
  | 'streak7'
  | 'streak30'
  | 'tools100'
  | 'agents100'
  | 'hours100'
  | 'turns1000'

// きょうの日記（#43）で、日ごとに数えるもの：Claude が働いた時間（ミリ秒）、終わったターン、ツールを使った回数、
// 来てくれた仲間（サブエージェント）、なでた回数（ぎゅっも）。数だけを持ち、何をしたか（文やファイルやツールの名前）は持たない
export type DiaryKind = 'workMs' | 'turns' | 'tools' | 'agents' | 'pets'

// これまでの合計を持つもの。なでた回数の合計は、前からある store の pets がそれなので、ここには入れない
export type TotalKind = Exclude<DiaryKind, 'pets'>

export type Game = {
  // 保存形式の版。v の無い保存（1.1.2 まで）は v1 として読む
  v: number
  // 今の ♡ と、これまでに稼いだ ♡（小数のまま持つ）
  hearts: number
  earned: number
  combo: number
  comboAt: number
  maxCombo: number
  feverUntil: number
  fevers: number
  // お仕事中になでた回数、ぎゅっとした回数、寝ているところを起こした回数
  workPets: number
  hugs: number
  wakes: number
  levels: Partial<Record<UpgradeId, number>>
  owned: CosmeticId[]
  hat: Hat | null
  // 新しい版の実績の id が入っていることもある（この版では見つからないだけ）
  achievements: AchievementId[]
  lastUnlock: { id: AchievementId; at: number } | null
  // あげた贈り物の数、贈った ♡ の合計（なかよし度）、ごきげんが続く時刻、最後の贈り物
  gifts: Partial<Record<GiftId, number>>
  given: number
  happyUntil: number
  lastGift: { id: GiftId; at: number } | null
  // 帯に出して、ワンぽちで贈れる小さな贈り物（ショップの ☆ で選ぶ）。null は出さない
  favorite: TreatId | null
  // 飾ると選んだ夢のプレゼント（ショップの「飾る／しまう」で選ぶ）。null はまだ選んでいない
  // （場所ごとに高いものから枠の数まで飾る。hooks/game.ts の shownDreams）。
  // しまっても絵から消えるだけで、♡ の +10%・なかよし度・実績・贈ったことはそのまま
  shown: DreamId[] | null
  // しまってある、買った空の飾り（流れ星・オーロラ）。入っていなければ出す
  off: CosmeticId[]
  // きょうの日記（#43）。'2026-11-10.tools' のように「PC のタイムゾーンの日付.数えるもの」を鍵にした数だけの表で、
  // 30 日より前の日は保存するときに消す。'2026-10-11.streak' だけは、消した日までつづいていた日数（つづけて使った日数を、
  // 30 日より長くても数えられるように残す。hooks/diary.ts の pruneDiary）
  diary: Partial<Record<string, number>>
  // これまでの合計（日記を消しても減らない）
  totals: Partial<Record<TotalKind, number>>
  // いちばん長くつづけて使った日数（日記を消しても残るよう、この数だけは持つ）
  bestStreak: number
  // 最後に放置収入を足した時刻。0 はこのセッションでまだ読み込んでいない
  passiveAt: number
}

// このセッションで Clawd が贈り物をかかえはじめた時刻。
// 自分で贈ったときと、別のセッションで贈ったものが保存から届いたときに始まる
export type Holding = { id: GiftId; from: number } | null

// 前回 store と合わせたときのゲームとなでた回数（複数のセッションで保存を分け合う）
export type Synced = { game: Game; pets: number }

// 夜空と Clawd の飾り
// テーマの背景（/parade theme）に描く場面。止まった 1 枚の絵なので、コマ・なでた・♡ の数は持たない
export type BackdropScene = {
  hour: number
  date: { month: number; day: number }
  weather: Weather
  mood: MoodKind
  // 仲間の、絵に出るところだけ（使っているツールの名前は持たない）
  friends: Friend[]
  character: Character
  look: Look
}

export type Look = {
  hat: Hat | null
  shootingStars: boolean
  aurora: boolean
  fever: boolean
  // 今 Clawd が抱えている贈り物（夢のプレゼントは箱で）
  gift: TreatId | 'box' | 'star' | null
  // 描く夢のプレゼント（しまってあるものは入らない。庭 3 つ・空 2 つまでにそろえてあるのは lookOf の仕事で、
  // drawScene はここにあるものをそのまま描く）
  dreams: DreamId[]
  // 贈った星の数。夜空に明るい星を足し、多くなったら天の川にする
  stars: number
  // なかよし度が「あいぼう」から：ひまなとき、ときどき手をふる（ねこは耳をぴくっとさせる）。
  // 無ければふらない（前からある絵は、この項目が無くても同じに描ける）
  waves?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-parade': {
      mood: Mood
      friends: Friend[]
      work: Work
      tick: Tick
      isHidden: boolean
      character: Character
      pets: Pets
      game: Game
      // /parade debug：手ざわり層のふちを見えるようにする
      touchDebug: boolean
      // /parade debug 12/25：この日として描く（このセッションだけ。保存しない）。null は今日
      dateOverride: { month: number; day: number } | null
      // /parade debug rain：この天気で描く（このセッションだけ。保存しない）。null は日付から決める
      weatherOverride: Weather | null
      synced: Synced
      holding: Holding
      // /parade theme：アプリの背景（テーマ）にパレードを描く。store にも残し、次のセッションでも描く
      backdrop: boolean
      // 背景に描く場面。変わったときだけ書くので、背景はそのときだけ描き直す（毎コマ描き直すとチカチカする）
      backdropScene: BackdropScene | null
    }
  }
}
