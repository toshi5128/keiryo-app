/**
 * 実際に出る献立を「読める形」で固定するテスト。
 * 数字が変わったらここが落ちるので、変更の影響が一目でわかる。
 * （制約テストは solver.test.ts。こちらは中身の記録）
 */
import { describe, expect, it } from 'vitest'
import { solve } from '../src/core/solver'
import type { SolveResult, SolveTarget } from '../src/core/solver'
import { SEED_FOODS } from '../src/data/seedFoods'
import type { Food } from '../src/core/types'

const TARGET: SolveTarget = { kcal: 2200, proteinG: 170, fatG: 60, carbG: 245, fatFloorG: 58 }
const MEAL1 = { kcal: 671, proteinG: 54, fatG: 18, carbG: 82, saltG: 2 }
const foods = (patch: Record<string, Partial<Food>> = {}): Food[] =>
  SEED_FOODS.map((f) => ({ ...f, ...(patch[f.id] ?? {}) }))

const render = (r: SolveResult) =>
  [
    `1日合計 P${r.dayTotals.proteinG.toFixed(1)} F${r.dayTotals.fatG.toFixed(1)} C${r.dayTotals.carbG.toFixed(1)} ${Math.round(r.dayTotals.kcal)}kcal`,
    ...r.meals.map(
      (m) =>
        `${m.index}食目 P${m.totals.proteinG.toFixed(1)} ${Math.round(m.totals.kcal)}kcal: ` +
        m.items.map((i) => `${i.food.name.replace(/（.*?）/, '')}${i.amount}${i.unit}`).join('・')
    ),
  ].join('\n')

describe('8/17 の実シナリオ', () => {
  it('基準（1食目のあと残り2食）', () => {
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P169.4 F59.7 C272.6 2200kcal
      1食目 P55.1 699kcal: 鶏もも肉200g・白米200g・卵1個・ブロッコリー150g・オリーブオイル1杯
      2食目 P60.4 830kcal: 鶏もも肉200g・白米240g・卵1個・茎わかめ醤油漬100g・オクラ50g・納豆1P"
    `)
  })

  it('鶏ももが在庫切れ', () => {
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods({ momo: { inStock: false } }) })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P170.9 F59.3 C261.0 2205kcal
      1食目 P55.9 709kcal: 鶏そぼろ180g・白米170g・卵1個・ブロッコリー150g・オリーブオイル2杯
      2食目 P61.0 825kcal: 鶏そぼろ180g・白米200g・卵1個・茎わかめ醤油漬100g・オクラ50g・納豆1P・オリーブオイル1杯"
    `)
  })

  it('羊羹1切れを食べたい', () => {
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods(), wants: ['youk'] })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P170.8 F60.0 C269.5 2201kcal
      1食目 P54.8 627kcal: 鶏もも肉205g・白米150g・卵1個・ブロッコリー150g・オリーブオイル1杯
      2食目 P62.0 903kcal: 鶏もも肉205g・白米190g・卵1個・茎わかめ醤油漬100g・オクラ50g・納豆1P・羊羹1切れ"
    `)
  })

  it('外食 1,105kcal のあと', () => {
    const eaten = { kcal: 671 + 1105, proteinG: 54 + 58, fatG: 18 + 40, carbG: 82 + 95, saltG: 5 }
    const r = solve({ target: TARGET, eaten, mealCount: 2, foods: foods() })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P170.8 F81.9 C204.3 2308kcal
      1食目 P27.3 211kcal: 鶏もも肉80g・卵1個・ブロッコリー150g
      2食目 P31.6 320kcal: 鶏もも肉80g・卵1個・茎わかめ醤油漬100g・オクラ50g・納豆1P"
    `)
  })

  it('起床が20時（残り1食）', () => {
    const r = solve({ target: TARGET, eaten: {}, mealCount: 1, foods: foods() })
    expect(render(r) + '\n' + r.notes.join('\n')).toMatchInlineSnapshot(`
      "1日合計 P75.7 F41.9 C141.9 1200kcal
      1食目 P75.7 1200kcal: 鶏もも肉250g・白米350g・卵1個・ブロッコリー150g・納豆1P・オリーブオイル4杯
      脂質が下限 58g にあと 16g 届きません。脂質源（オリーブオイル・卵など）を足せる場合は足してください。
      残り1食では目標に届きません（タンパク質があと 94g）。今日は下振れで終わらせてよい。明日きっちり取れば問題ありません。"
    `)
  })
})
