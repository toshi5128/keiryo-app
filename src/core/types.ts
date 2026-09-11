/**
 * 計量 KEIRYO — 型定義
 *
 * 仕様書 = KEIRYO-HANDOFF-v4.md（★v4 を正とする。v3 の数値と食い違う場合は v4 が勝つ）
 * 数値・係数はここと core/ の外に書かないこと。
 */

export type FoodCategory =
  | 'protein'
  | 'carb'
  | 'veg'
  | 'fat'
  | 'sweet'
  | 'eating_out'
  | 'other'

/** 食材マスタ1件。DB(keiryo_foods)の1行と1:1で対応する。 */
export interface Food {
  id: string
  name: string
  /** 栄養価の基準となる量。例: 100(g) / 1(個) */
  baseAmount: number
  baseUnit: string
  kcal: number
  proteinG: number
  fatG: number
  carbG: number
  /** 塩分(g)。v4 で塩分6g上限のトラッキングを始めたので原則すべてに入れる */
  saltG?: number
  category: FoodCategory
  /** 主力食材（毎日使う）。ソルバーは同点ならこちらを先に選ぶ */
  isStaple?: boolean
  /** ★嫌い・飽きたので食べない。true のものは絶対に提案しない（v4 §10） */
  isExcluded?: boolean
  /** ★在庫。false のものは今日は提案しない */
  inStock?: boolean
  /**
   * ★参照専用。買い物の量を出すためだけに持つ行（例: そぼろの「生」重量）。
   * 提案にも記録の候補にも出さない。調理後の行と混同させないためのフラグ。
   */
  isReference?: boolean
  /** 栄養価が実測でなく推定（外食で F/C/塩分が公表されていないもの） */
  isEstimated?: boolean
  /** 調整の刻み幅（米=10g、卵=1個） */
  stepAmount?: number
  /** 1食の下限 */
  minAmount?: number
  /** ★1食の現実的な上限。これが無いソルバーは使い物にならない */
  maxAmount?: number
  /** ★1日の上限（卵3個・サバ缶1缶。v4 §10「量の上限」） */
  dailyMaxAmount?: number
  /** 画面に出す注意書き。「調理後の重量で入力」など */
  note?: string
}

/** 献立の1行。「鶏もも肉 215g」 */
export interface PlanItem {
  food: Food
  /** baseUnit と同じ単位での量。base_amount ではなく実量 */
  amount: number
  /** 表示用の単位。'g' / '個' / '杯' など */
  unit: string
}

export interface Macros {
  kcal: number
  proteinG: number
  fatG: number
  carbG: number
  saltG: number
}

/** 1食ぶんの提案 */
export interface MealPlan {
  /** 何食目か（1始まり）。表示ラベルは画面側で作る */
  index: number
  items: PlanItem[]
  totals: Macros
}

/** 目標PFC一式。calc.buildPlan の戻り値 */
export interface NutritionPlan {
  lbmKg: number
  bmr: number
  tdee: number
  kcal: number
  proteinG: number
  fatG: number
  carbG: number
  /** 脂質の下限 = 体重 × 0.7。ソルバーはここを絶対に割らない */
  fatFloorG: number
  /** ★塩分の上限(g)。超えた日は翌朝の増加を予告する（v4 §3/§8） */
  saltLimitG: number
  /** ★水分の目標(ml)。体重×35ml ＋ 発汗分（v4 §3） */
  waterTargetMl: number
  ratio: { protein: number; fat: number; carb: number }
}
