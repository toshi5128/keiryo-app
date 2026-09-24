/**
 * ★今夜のおかず候補（自炊の定番メニュー表から3つ選ぶ）
 *
 * ソルバーは「食材と量」を解くが、夜にキッチンに立つと欲しいのは
 * 「何を作るか」のほう。定番のおかずを数品だけ持っておき、
 * その日の残り（P・kcal・脂質の下限・塩分）に合う順に並べる。
 *
 * ★栄養価はここに焼き付けない。各おかずは食材マスタの id と量で組み、
 *   合計は必ずマスタから計算する（standardMenu.ts と同じ方針。数字を二重に持たない）。
 * ★除外・在庫切れ・参照専用の食材を1つでも含むおかずは出さない（v4 §10 / §16）。
 * ★1日の上限（卵3個・サバ缶1缶）を超えるおかずも出さない。
 * ★ご飯は含めない。ご飯は調整弁（v4 §3「削る順番 C→F→P」）なので、
 *   おかずを決めたあと「残りでご飯は約○g」を別に出す。
 * 外部の AI は使わない。端末の中だけで計算する。
 */

import type { Food, Macros, PlanItem } from './types'
import { ZERO, addMacros, macrosOf, usableFoods } from './solver'

/** 定番おかず1品。amount は food.baseUnit と同じ単位 */
export interface DinnerDish {
  id: string
  name: string
  items: ReadonlyArray<{ foodId: string; amount: number }>
  /** 作り方の一言 */
  how: string
}

/**
 * ★自炊の定番メニュー表。好きなもの（v4 §10）を軸に、食材マスタにある物だけで組む。
 * 鶏もも・鶏むねブロック・サラダチキン・木綿豆腐は最初から入れていない。
 */
export const DINNER_DISHES: ReadonlyArray<DinnerDish> = [
  {
    id: 'sobo_tamago',
    name: 'そぼろの卵とじ',
    items: [{ foodId: 'sobo', amount: 150 }, { foodId: 'egg', amount: 1 }],
    how: 'そぼろを温めて溶き卵を回し入れ、半熟で止める',
  },
  {
    id: 'sobo_broc',
    name: 'そぼろとブロッコリーのオイル炒め',
    items: [
      { foodId: 'sobo', amount: 120 },
      { foodId: 'broc', amount: 100 },
      { foodId: 'oil', amount: 6 },
    ],
    how: 'レンジで温めたブロッコリーとそぼろをオイルで炒め合わせる',
  },
  {
    id: 'saba_meka',
    name: 'サバ缶とめかぶ',
    items: [{ foodId: 'saba', amount: 1 }, { foodId: 'meka', amount: 1 }],
    how: 'サバ缶を器に出してめかぶをのせるだけ（汁は塩分があるので切る）',
  },
  {
    id: 'sake_natto',
    name: '鮭の塩焼き＋納豆',
    items: [{ foodId: 'sake', amount: 1 }, { foodId: 'natto', amount: 1 }],
    how: '鮭はグリルかフライパンで両面焼く',
  },
  {
    id: 'sake_foil',
    name: '鮭2切れのホイル焼き',
    items: [{ foodId: 'sake', amount: 2 }, { foodId: 'shimeji', amount: 100 }],
    how: 'ホイルに鮭としめじを包み、フライパンで蓋をして10分',
  },
  {
    id: 'hire_saute',
    name: '豚ヒレのソテー＋ブロッコリー',
    items: [
      { foodId: 'hire', amount: 150 },
      { foodId: 'oil', amount: 5 },
      { foodId: 'broc', amount: 100 },
    ],
    how: '1.5cm に切って叩き、オイルで両面焼く',
  },
  {
    id: 'hire_shimeji',
    name: '豚ヒレとしめじの炒め',
    items: [
      { foodId: 'hire', amount: 120 },
      { foodId: 'shimeji', amount: 100 },
      { foodId: 'oil', amount: 4 },
    ],
    how: '細切りのヒレとしめじを強火で炒める',
  },
  {
    id: 'gyu_steak',
    name: '牛もも赤身ステーキ',
    items: [{ foodId: 'gyu', amount: 150 }, { foodId: 'broc', amount: 100 }],
    how: '常温に戻して強火で片面2分ずつ、アルミで包んで5分休ませる',
  },
  {
    id: 'roastbeef_cabbage',
    name: 'ローストビーフ＋千切りキャベツ',
    items: [{ foodId: 'roastbeef', amount: 100 }, { foodId: 'cabbage', amount: 100 }],
    how: '買ってきたものを切って盛るだけ',
  },
  {
    id: 'sanma',
    name: 'さんまの塩焼き＋小松菜',
    items: [{ foodId: 'sanma', amount: 1 }, { foodId: 'komatsuna', amount: 100 }],
    how: 'さんまはグリルで。脂が多いので脂質が足りない日向き',
  },
  {
    id: 'takokim_egg',
    name: 'タコキムチ＋ゆで卵',
    items: [{ foodId: 'takokim', amount: 100 }, { foodId: 'egg', amount: 1 }],
    how: '軽く済ませたい日に。タコキムチは塩分が重い',
  },
  {
    id: 'natto_egg',
    name: '納豆＋卵＋めかぶ',
    items: [
      { foodId: 'natto', amount: 1 },
      { foodId: 'egg', amount: 1 },
      { foodId: 'meka', amount: 1 },
    ],
    how: '全部混ぜてご飯にかける。火を使わない',
  },
]

/** 1食のおかずで狙う P の上限（ソルバーの「1食の P 80g」と揃える） */
export const DINNER_P_CAP_G = 80
/** 候補の数 */
export const DINNER_IDEA_COUNT = 3
/** ご飯を足すときの刻み・上限（seedFoods の白米と同じ） */
const RICE_STEP_G = 10
const RICE_MAX_G = 350

export interface DinnerRemaining {
  /** その日の目標 */
  target: { kcal: number; proteinG: number; fatFloorG: number; saltLimitG: number }
  /** その日すでに食べたもの */
  eaten: Macros
  /** 食材ごとのすでに食べた量（1日の上限判定に使う） */
  eatenAmounts: Record<string, number>
  /** 残りの食事回数。今夜のぶんとして 1/n を割り当てる（0 は 1 とみなす） */
  mealsLeft: number
}

export interface DinnerIdea {
  dish: DinnerDish
  items: PlanItem[]
  totals: Macros
  /** このおかずに合わせるご飯の量（g）。0 ならご飯なしで収まる */
  riceG: number
  /** 画面に出す一言（なぜ合うか・注意） */
  reason: string
  /** 小さいほど合っている */
  score: number
}

/** 今夜1食ぶんに割り当てる残り */
export function dinnerShare(r: DinnerRemaining) {
  const n = Math.max(1, r.mealsLeft)
  const left = (target: number, eaten: number) => Math.max(0, target - eaten) / n
  return {
    proteinG: Math.min(DINNER_P_CAP_G, left(r.target.proteinG, r.eaten.proteinG)),
    kcal: left(r.target.kcal, r.eaten.kcal),
    fatG: left(r.target.fatFloorG, r.eaten.fatG),
    saltG: left(r.target.saltLimitG, r.eaten.saltG),
  }
}

/** おかずの行を食材マスタから組む。使えない食材や1日の上限を超えるものがあれば null */
export function buildDish(
  dish: DinnerDish,
  foods: Food[],
  eatenAmounts: Record<string, number> = {}
): PlanItem[] | null {
  const usable = usableFoods(foods)
  const items: PlanItem[] = []
  for (const { foodId, amount } of dish.items) {
    const food = usable.find((f) => f.id === foodId)
    if (!food) return null
    const already = eatenAmounts[foodId] ?? 0
    if (food.dailyMaxAmount != null && already + amount > food.dailyMaxAmount) return null
    items.push({ food, amount, unit: food.baseUnit })
  }
  return items
}

/**
 * ★今夜のおかず候補を合う順に3つ返す。
 *
 * 並べ方（小さいほど上）：
 *   1. P が今夜のぶんに届かない量 × 8   … P は日次必達なので一番重い
 *   2. P の取りすぎ × 1                  … 多すぎても困らないが、他の枠を食う
 *   3. kcal のはみ出し × 0.5             … 週で帳尻を合わせるので軽め
 *   4. 脂質が下限に届かない量 × 4        … 下限は日次の線
 *   5. 塩分のはみ出し × 60               … 翌朝の +1kg を避けたい
 */
export function suggestDinners(r: DinnerRemaining, foods: Food[], count = DINNER_IDEA_COUNT): DinnerIdea[] {
  const share = dinnerShare(r)
  const rice = foods.find((f) => f.id === 'rice')
  const ideas: DinnerIdea[] = []

  for (const dish of DINNER_DISHES) {
    const items = buildDish(dish, foods, r.eatenAmounts)
    if (!items) continue
    const totals = items.reduce((acc, it) => addMacros(acc, macrosOf(it.food, it.amount)), { ...ZERO })

    const pShort = Math.max(0, share.proteinG - totals.proteinG)
    const pOver = Math.max(0, totals.proteinG - share.proteinG)
    const kcalOver = Math.max(0, totals.kcal - share.kcal)
    const fatShort = Math.max(0, share.fatG - totals.fatG)
    const saltOver = Math.max(0, totals.saltG - share.saltG)
    const score = pShort * 8 + pOver * 1 + kcalOver * 0.5 + fatShort * 4 + saltOver * 60

    // 残りの kcal をご飯で埋める（調整弁）
    let riceG = 0
    if (rice && rice.inStock !== false) {
      const room = Math.max(0, share.kcal - totals.kcal)
      riceG = Math.min(RICE_MAX_G, Math.floor(room / (rice.kcal / rice.baseAmount) / RICE_STEP_G) * RICE_STEP_G)
    }

    ideas.push({ dish, items, totals, riceG, reason: reasonOf(pShort, kcalOver, fatShort, saltOver), score })
  }

  return ideas.sort((a, b) => a.score - b.score).slice(0, count)
}

function reasonOf(pShort: number, kcalOver: number, fatShort: number, saltOver: number): string {
  const r = (n: number) => Math.round(n)
  if (saltOver > 0.05) return `塩分が今日の残りを ${saltOver.toFixed(1)}g 超えます（翌朝の体重に出やすい）`
  if (pShort >= 5) return `P があと ${r(pShort)}g 足りません。プロテイン1杯を足すと届きます`
  if (fatShort >= 3) return `脂質の下限まであと ${r(fatShort)}g。オイル小さじ1杯（約5g）を足してください`
  if (kcalOver >= 50) return `カロリーは ${r(kcalOver)}kcal はみ出します（週で帳尻が合えば問題なし）`
  return '残りの P とカロリーにちょうど合います'
}
