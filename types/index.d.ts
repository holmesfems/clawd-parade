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

export type Pets = {
  total: number
  // いちばん最近さわった時刻と、続けてなでている間の始まり
  at: number
  from: number
  kind: 'pet' | 'hug'
  // デスクトップの手ざわり層から：手のあるドットの列、ぎゅっとした仲間
  hand: number | null
  friend: string | null
}

export type Tick = { n: number; at: number }

// ---- なでなでゲーム ----

export type UpgradeId = 'glove' | 'brush' | 'coffee' | 'fan' | 'allowance' | 'toolTip' | 'stardust' | 'feverTime'

export type Hat = 'ribbon' | 'catEars' | 'santa' | 'crown'

export type CosmeticId = Hat | 'shootingStars' | 'aurora'

// 小さな贈り物（何度でも）と、夢のプレゼント（1 回きりで、ずっと飾られる）
export type TreatId = 'cookie' | 'cocoa' | 'cake' | 'letter' | 'cushion' | 'keyboard'
export type DreamId = 'greenTests' | 'telescope' | 'house' | 'library' | 'constellation' | 'moonTrip' | 'noBugs'
export type GiftId = TreatId | DreamId

export type Game = {
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
  achievements: string[]
  lastUnlock: { id: string; at: number } | null
  // あげた贈り物の数、贈った ♡ の合計（なかよし度）、ごきげんが続く時刻、最後の贈り物
  gifts: Partial<Record<GiftId, number>>
  given: number
  happyUntil: number
  lastGift: { id: GiftId; at: number } | null
  // 最後に放置収入を足した時刻。0 はこのセッションでまだ読み込んでいない
  passiveAt: number
}

// 前回 store と合わせたときのゲームとなでた回数（複数のセッションで保存を分け合う）
export type Synced = { game: Game; pets: number }

// 夜空と Clawd の飾り
export type Look = {
  hat: Hat | null
  shootingStars: boolean
  aurora: boolean
  fever: boolean
  // 今 Clawd が抱えている贈り物（夢のプレゼントは箱で）、飾ってある夢のプレゼント
  gift?: TreatId | 'box' | null
  dreams?: DreamId[]
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
      synced: Synced
    }
  }
}
