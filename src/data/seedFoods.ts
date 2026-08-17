/**
 * 初期シード食材（仕様書 §3 の表 ＋ モックの FOODS）。
 * 実際に食べているものだけが入っている。ユーザーは自由に足せる。
 *
 * ★is_excluded = true は 木綿豆腐 と 鶏むね肉（ブロック）の2つだけ。
 *   鶏むね「ミンチ（そぼろ）」は食べるので除外しない。
 * ★max_amount は「1食で現実的に食べられる上限」。無いとソルバーが
 *   「鶏もも530g」のような食べられない答えを出す。
 */

import type { Food } from '../core/types'

export const SEED_FOODS: Food[] = [
  // ---- protein ----
  { id: 'momo', name: '鶏もも肉（皮なし・低温調理）', baseAmount: 100, baseUnit: 'g', kcal: 113, proteinG: 19.0, fatG: 5.0, carbG: 0, category: 'protein', isStaple: true, stepAmount: 5, maxAmount: 250 },
  { id: 'momo_kawa', name: '鶏もも肉（皮つき）', baseAmount: 100, baseUnit: 'g', kcal: 190, proteinG: 16.6, fatG: 14.2, carbG: 0, category: 'protein', stepAmount: 5, maxAmount: 250 },
  { id: 'sobo', name: '鶏そぼろ（むねミンチ・調味込み）', baseAmount: 100, baseUnit: 'g', kcal: 135, proteinG: 22.0, fatG: 3.0, carbG: 4.0, category: 'protein', isStaple: true, stepAmount: 5, maxAmount: 250 },
  { id: 'mune', name: '鶏むね肉（皮なし・ブロック）', baseAmount: 100, baseUnit: 'g', kcal: 105, proteinG: 23.0, fatG: 1.5, carbG: 0, category: 'protein', isExcluded: true, stepAmount: 5, maxAmount: 250 },
  { id: 'sake', name: '鮭', baseAmount: 1, baseUnit: '切れ', kcal: 133, proteinG: 22.3, fatG: 4.1, carbG: 0.1, category: 'protein', stepAmount: 1, maxAmount: 2 },
  { id: 'egg', name: '卵', baseAmount: 1, baseUnit: '個', kcal: 76, proteinG: 6.2, fatG: 5.2, carbG: 0.2, category: 'protein', isStaple: true, stepAmount: 1, maxAmount: 3 },
  { id: 'natto', name: '納豆', baseAmount: 1, baseUnit: 'P', kcal: 90, proteinG: 7.4, fatG: 4.5, carbG: 5.4, category: 'protein', isStaple: true, stepAmount: 1, maxAmount: 2 },
  { id: 'tofu', name: '木綿豆腐', baseAmount: 1, baseUnit: '半丁', kcal: 110, proteinG: 10.5, fatG: 6.3, carbG: 2.4, category: 'protein', isExcluded: true, stepAmount: 1, maxAmount: 2 },
  { id: 'whey', name: 'ホエイプロテイン', baseAmount: 1, baseUnit: '杯', kcal: 120, proteinG: 21.0, fatG: 1.5, carbG: 3.0, category: 'protein', stepAmount: 1, maxAmount: 3 },
  { id: 'hire', name: '豚ヒレ肉', baseAmount: 100, baseUnit: 'g', kcal: 118, proteinG: 22.2, fatG: 3.7, carbG: 0.2, category: 'protein', stepAmount: 5, maxAmount: 250 },
  { id: 'gyu', name: '牛もも赤身', baseAmount: 100, baseUnit: 'g', kcal: 140, proteinG: 21.2, fatG: 6.0, carbG: 0.5, category: 'protein', stepAmount: 5, maxAmount: 250 },
  { id: 'saba', name: 'サバ水煮缶', baseAmount: 1, baseUnit: '缶', kcal: 350, proteinG: 39.7, fatG: 20.9, carbG: 0.4, category: 'protein', stepAmount: 1, maxAmount: 1 },
  { id: 'greek', name: 'ギリシャヨーグルト', baseAmount: 100, baseUnit: 'g', kcal: 59, proteinG: 10.0, fatG: 0.4, carbG: 3.9, category: 'protein', stepAmount: 10, maxAmount: 200 },

  // ---- carb ----
  { id: 'rice', name: '白米（炊飯後）', baseAmount: 100, baseUnit: 'g', kcal: 156, proteinG: 2.5, fatG: 0.3, carbG: 37.1, category: 'carb', isStaple: true, stepAmount: 10, maxAmount: 350 },
  { id: 'mochimugi', name: 'もち麦（炊飯後）', baseAmount: 100, baseUnit: 'g', kcal: 130, proteinG: 3.0, fatG: 0.6, carbG: 27.0, category: 'carb', stepAmount: 10, maxAmount: 350 },
  { id: 'onig', name: 'おにぎり（塩）', baseAmount: 1, baseUnit: '個', kcal: 173, proteinG: 2.9, fatG: 0.9, carbG: 38.7, saltG: 1.0, category: 'carb', stepAmount: 1, maxAmount: 3 },
  { id: 'bana', name: 'バナナ', baseAmount: 1, baseUnit: '本', kcal: 86, proteinG: 1.1, fatG: 0.2, carbG: 22.5, category: 'carb', stepAmount: 1, maxAmount: 2 },

  // ---- veg ----
  { id: 'broc', name: 'ブロッコリー（茹で）', baseAmount: 100, baseUnit: 'g', kcal: 30, proteinG: 3.9, fatG: 0.4, carbG: 4.3, category: 'veg', isStaple: true, stepAmount: 10, maxAmount: 200 },
  { id: 'okra', name: 'オクラ（茹で）', baseAmount: 100, baseUnit: 'g', kcal: 30, proteinG: 2.1, fatG: 0.2, carbG: 6.6, category: 'veg', stepAmount: 10, maxAmount: 200 },
  { id: 'aspa', name: 'アスパラガス（茹で）', baseAmount: 100, baseUnit: 'g', kcal: 24, proteinG: 2.6, fatG: 0.1, carbG: 4.6, category: 'veg', stepAmount: 10, maxAmount: 200 },
  { id: 'komatsuna', name: '小松菜（茹で）', baseAmount: 100, baseUnit: 'g', kcal: 14, proteinG: 1.6, fatG: 0.1, carbG: 3.0, category: 'veg', stepAmount: 10, maxAmount: 200 },
  { id: 'spinach', name: 'ほうれん草（茹で）', baseAmount: 100, baseUnit: 'g', kcal: 23, proteinG: 2.6, fatG: 0.5, carbG: 4.0, category: 'veg', stepAmount: 10, maxAmount: 200 },
  { id: 'cabbage', name: 'キャベツ（生）', baseAmount: 100, baseUnit: 'g', kcal: 21, proteinG: 1.3, fatG: 0.2, carbG: 5.2, category: 'veg', stepAmount: 10, maxAmount: 200 },
  { id: 'shimeji', name: 'しめじ', baseAmount: 100, baseUnit: 'g', kcal: 18, proteinG: 2.7, fatG: 0.5, carbG: 4.8, category: 'veg', stepAmount: 10, maxAmount: 200 },
  { id: 'edamame', name: '枝豆（茹で・さや込み）', baseAmount: 100, baseUnit: 'g', kcal: 59, proteinG: 5.8, fatG: 3.1, carbG: 4.3, category: 'veg', stepAmount: 10, maxAmount: 200 },
  { id: 'kim', name: 'キムチ', baseAmount: 50, baseUnit: 'g', kcal: 23, proteinG: 1.3, fatG: 0.2, carbG: 3.9, saltG: 1.1, category: 'veg', stepAmount: 25, maxAmount: 100 },
  { id: 'takokim', name: 'タコキムチ', baseAmount: 50, baseUnit: 'g', kcal: 35, proteinG: 4.0, fatG: 0.3, carbG: 3.0, saltG: 1.2, category: 'veg', stepAmount: 25, maxAmount: 100 },
  { id: 'kuki', name: '茎わかめ醤油漬', baseAmount: 100, baseUnit: 'g', kcal: 49, proteinG: 1.7, fatG: 0.3, carbG: 11.8, saltG: 4.1, category: 'veg', isStaple: true, stepAmount: 10, maxAmount: 100 },
  { id: 'meka', name: 'めかぶ', baseAmount: 1, baseUnit: 'P', kcal: 15, proteinG: 1.0, fatG: 0.2, carbG: 2.0, saltG: 0.4, category: 'veg', stepAmount: 1, maxAmount: 2 },

  // ---- fat / other ----
  { id: 'oil', name: 'オリーブオイル（小さじ）', baseAmount: 1, baseUnit: '杯', kcal: 40, proteinG: 0, fatG: 4.5, carbG: 0, category: 'fat', isStaple: true, stepAmount: 1, maxAmount: 4 },
  { id: 'misoshiru', name: '味噌汁', baseAmount: 1, baseUnit: '杯', kcal: 40, proteinG: 3.0, fatG: 1.5, carbG: 4.0, saltG: 1.5, category: 'other', stepAmount: 1, maxAmount: 2 },

  // ---- sweet ----
  { id: 'wara', name: 'わらび餅', baseAmount: 1, baseUnit: 'P', kcal: 248, proteinG: 1.3, fatG: 0.9, carbG: 58.7, category: 'sweet', stepAmount: 1, maxAmount: 1 },
  { id: 'mizu', name: '水ようかん', baseAmount: 1, baseUnit: '個', kcal: 137, proteinG: 1.8, fatG: 0.1, carbG: 35.3, category: 'sweet', stepAmount: 1, maxAmount: 2 },
  { id: 'youk', name: '羊羹', baseAmount: 1, baseUnit: '切れ', kcal: 145, proteinG: 2.0, fatG: 0.1, carbG: 34.0, category: 'sweet', stepAmount: 1, maxAmount: 2 },
  { id: 'mitarashi', name: 'みたらし団子', baseAmount: 1, baseUnit: '本', kcal: 120, proteinG: 2.0, fatG: 0.4, carbG: 26.0, category: 'sweet', stepAmount: 1, maxAmount: 3 },
  { id: 'ohagi', name: 'おはぎ（ミニ）', baseAmount: 1, baseUnit: '個', kcal: 80, proteinG: 1.2, fatG: 0.5, carbG: 17.0, category: 'sweet', stepAmount: 1, maxAmount: 6 },
]

export const seedFoodById = (id: string): Food => {
  const f = SEED_FOODS.find((x) => x.id === id)
  if (!f) throw new Error(`シードに存在しない食材です: ${id}`)
  return f
}
