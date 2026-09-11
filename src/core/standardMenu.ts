/**
 * ★標準メニュー（KEIRYO-HANDOFF-v4.md §4。2026-09-12 確定）
 *
 * 「シンプルで覚えやすい1パターンに固定したい」と本人が決めた形。
 *   そぼろ120g + 卵1個 + ご飯190g + オリーブオイル9g   × 3食
 *   プロテイン2杯（1食目とジム後）
 *
 * ★ご飯とオイルは引き継ぎ書の 170g / 6g から変えている（2026-09-12・本人承認）。
 *   元の配合だと 1日 2,038kcal・脂質52.5g にしかならず、
 *   ★脂質の下限58g を 5.5g 割っていた（カロリーも160kcal 不足）。
 *   カロリーは「週で帳尻が合えばよい」(§3) が、脂質の下限は日次の線なので埋める必要がある。
 *   ご飯190g / オイル9g にすると 2,212kcal・P175・F61.7 で、
 *   この1パターンだけで全部の目標に届く。固定メニューの意味を保つためこちらを採った。
 *
 * アプリ起動時のデフォルト献立であり、最頻出の操作（ワンタップ記録）の中身。
 *
 * ★合計値はここに焼き付けず、必ず食材マスタから計算する。
 *   引き継ぎ書の表は「1日 2,170kcal」と書いているが、同じ表の
 *   「1食 599kcal × 3 ＋ プロテイン240kcal」は 2,038kcal にしかならず食い違っている。
 *   数字を二重に持つとどちらが正か分からなくなるので、食材マスタを唯一の正とする。
 */

import type { Food, Macros, PlanItem } from './types'
import { ZERO, addMacros, macrosOf } from './solver'

/** 1食ぶんの構成。amount は food.baseUnit と同じ単位 */
export const STANDARD_MEAL: ReadonlyArray<{ foodId: string; amount: number }> = [
  { foodId: 'sobo', amount: 120 }, // ★調理後の重量
  { foodId: 'egg', amount: 1 },
  { foodId: 'rice', amount: 190 },
  { foodId: 'oil', amount: 9 },
]

/** 1日の食事回数 */
export const STANDARD_MEALS_PER_DAY = 3
/** プロテインの杯数（1食目とジム後） */
export const STANDARD_SHAKES_PER_DAY = 2
export const STANDARD_SHAKE_FOOD_ID = 'whey'

/** ★生 → 調理後 の歩留まり。生800g → 調理後 約624g（v4 §6） */
export const SOBORO_COOKED_YIELD = 624 / 800
/** 炊飯の増加率。生米 1 → 炊飯後 約2.2 */
export const RICE_COOKED_RATIO = 2.2

/** 生の重量から調理後の重量へ。買い物の量を出すときだけ使う */
export function soboroRawToCooked(rawG: number): number {
  return rawG * SOBORO_COOKED_YIELD
}

/** ★調理後の重量から必要な生の重量へ。買い物リストはこちら */
export function soboroCookedToRaw(cookedG: number): number {
  return cookedG / SOBORO_COOKED_YIELD
}

function findFood(foods: Food[], id: string): Food {
  const f = foods.find((x) => x.id === id)
  if (!f) throw new Error(`標準メニューの食材が見つかりません: ${id}`)
  return f
}

/** 標準メニュー1食ぶんの行。記録にそのまま渡せる形で返す */
export function standardMealItems(foods: Food[]): PlanItem[] {
  return STANDARD_MEAL.map(({ foodId, amount }) => {
    const food = findFood(foods, foodId)
    return { food, amount, unit: food.baseUnit }
  })
}

/** プロテイン1杯ぶんの行 */
export function standardShakeItem(foods: Food[]): PlanItem {
  const food = findFood(foods, STANDARD_SHAKE_FOOD_ID)
  return { food, amount: food.baseAmount, unit: food.baseUnit }
}

export function sumItems(items: PlanItem[]): Macros {
  return items.reduce((acc, it) => addMacros(acc, macrosOf(it.food, it.amount)), { ...ZERO })
}

/** 標準メニュー1食ぶんの栄養価 */
export function standardMealMacros(foods: Food[]): Macros {
  return sumItems(standardMealItems(foods))
}

/** 標準メニュー1日ぶん（3食 ＋ プロテイン2杯）の栄養価 */
export function standardDayMacros(foods: Food[]): Macros {
  const meal = standardMealMacros(foods)
  const shake = macrosOf(findFood(foods, STANDARD_SHAKE_FOOD_ID), 1)
  const mul = (m: Macros, n: number): Macros => ({
    kcal: m.kcal * n,
    proteinG: m.proteinG * n,
    fatG: m.fatG * n,
    carbG: m.carbG * n,
    saltG: m.saltG * n,
  })
  return addMacros(mul(meal, STANDARD_MEALS_PER_DAY), mul(shake, STANDARD_SHAKES_PER_DAY))
}

// ===========================================================================
// 買い物リスト（v4 §4「1週間の買い物」）
// ===========================================================================

export interface ShoppingLine {
  label: string
  amount: number
  unit: string
  note?: string
}

/**
 * 指定日数ぶんの買い物リスト。
 * ★そぼろは「生」の重量で出す。調理後360g/日 ÷ 0.78 = 生 約462g/日。
 */
export function shoppingList(days = 7): ShoppingLine[] {
  const per = (foodId: string) => STANDARD_MEAL.find((x) => x.foodId === foodId)?.amount ?? 0
  const cookedSoboroG = per('sobo') * STANDARD_MEALS_PER_DAY * days
  const rawSoboroG = soboroCookedToRaw(cookedSoboroG)
  const cookedRiceG = per('rice') * STANDARD_MEALS_PER_DAY * days
  return [
    {
      label: '鶏むねミンチ（生）',
      amount: Math.round(rawSoboroG / 100) / 10,
      unit: 'kg',
      note: `調理後 ${cookedSoboroG.toLocaleString()}g ぶん（炒めると78%に目減りします）`,
    },
    { label: '卵', amount: STANDARD_MEALS_PER_DAY * days, unit: '個' },
    {
      label: '米（炊く前）',
      amount: Math.round(cookedRiceG / RICE_COOKED_RATIO / 100) / 10,
      unit: 'kg',
      note: `炊飯後 ${cookedRiceG.toLocaleString()}g ぶん`,
    },
    { label: 'オリーブオイル', amount: per('oil') * STANDARD_MEALS_PER_DAY * days, unit: 'g' },
    { label: 'プロテイン', amount: STANDARD_SHAKES_PER_DAY * days, unit: '杯' },
  ]
}

// ===========================================================================
// そぼろの配合（v4 §6）
// ===========================================================================

/** 薄味版（現在の標準）。むね挽き800gに対しての分量 */
export const SOBORO_RECIPE_LIGHT = {
  label: '薄味版（現在の標準）',
  minceG: 800,
  seasonings: [
    { name: '醤油', amount: '大さじ2（36g）' },
    { name: 'みりん', amount: '大さじ3（54g）', note: '無ければ 酒88g + 砂糖14g' },
    { name: '酒', amount: '大さじ3（44g）' },
  ],
  totalSaltG: 5.1,
  saltPer120gG: 1.0,
  how: '冷たいフライパンに全部入れ、火をつける前に箸4本で混ぜてから中火。800g超は600gずつ分けて炒める（水分が飛ばないため）。',
} as const

/** 通常版。塩分が高いので非推奨 */
export const SOBORO_RECIPE_NORMAL = {
  label: '通常版（塩分が高い・非推奨）',
  minceG: 800,
  seasonings: [
    { name: '醤油', amount: '大さじ4（72g）' },
    { name: 'みりん', amount: '大さじ4（72g）' },
    { name: '酒', amount: '大さじ3（44g）' },
    { name: '砂糖', amount: '小さじ2（10g）' },
  ],
  totalSaltG: 10.2,
  saltPer160gG: 3.4,
} as const
