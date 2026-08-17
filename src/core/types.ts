/**
 * 計量 KEIRYO — 型定義
 *
 * 仕様書 = KEIRYO-SPEC-v3.md ／ 引き継ぎ書 = KEIRYO-HANDOFF.md（v3 を正とする）
 * 数値・係数はここと core/ の外に書かないこと。
 */

export type FoodCategory =
  | 'protein'
  | 'carb'
  | 'veg'
  | 'fat'
  | 'sweet'
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
  /** 塩分(g)。茎わかめ醤油漬のように高いものがあるので任意で持つ */
  saltG?: number
  category: FoodCategory
  /** 主力食材（毎日使う）。ソルバーは同点ならこちらを先に選ぶ */
  isStaple?: boolean
  /** ★嫌いで食べない。true のものは絶対に提案しない */
  isExcluded?: boolean
  /** ★在庫。false のものは今日は提案しない */
  inStock?: boolean
  /** 調整の刻み幅（米=10g、卵=1個） */
  stepAmount?: number
  /** 1食の下限 */
  minAmount?: number
  /** ★1食の現実的な上限。これが無いソルバーは使い物にならない */
  maxAmount?: number
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
  ratio: { protein: number; fat: number; carb: number }
}
