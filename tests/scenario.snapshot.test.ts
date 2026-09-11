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

describe('実シナリオ（v4 の食材マスタ）', () => {
  it('基準（1食目のあと残り2食）', () => {
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P169.9 F60.1 C261.6 2198kcal
      1食目 P55.3 696kcal: 鶏そぼろ140g・白米170g・卵1個・ブロッコリー150g・オリーブオイル8g
      2食目 P60.6 831kcal: 鶏そぼろ140g・白米210g・卵1個・オクラ150g・納豆1P・オリーブオイル6g"
    `)
  })

  it('そぼろが在庫切れ', () => {
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods({ sobo: { inStock: false } }) })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P169.8 F60.0 C263.9 2195kcal
      1食目 P55.1 678kcal: 豚ヒレ175g・白米190g・卵1個・ブロッコリー150g・オリーブオイル6g
      2食目 P60.6 846kcal: 豚ヒレ175g・白米240g・卵1個・オクラ150g・納豆1P・オリーブオイル6g"
    `)
  })

  it('羊羹1切れを食べたい', () => {
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods(), wants: ['youk'] })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P169.7 F60.0 C262.3 2202kcal
      1食目 P54.3 634kcal: 鶏そぼろ140g・白米130g・卵1個・ブロッコリー150g・オリーブオイル8g
      2食目 P61.3 898kcal: 鶏そぼろ140g・白米160g・卵1個・オクラ150g・納豆1P・羊羹1切れ・オリーブオイル6g"
    `)
  })

  it('外食 1,105kcal のあと', () => {
    const eaten = { kcal: 671 + 1105, proteinG: 54 + 58, fatG: 18 + 40, carbG: 82 + 95, saltG: 5 }
    const r = solve({ target: TARGET, eaten, mealCount: 2, foods: foods() })
    expect(render(r)).toMatchInlineSnapshot(`
      "1日合計 P168.0 F77.8 C205.2 2278kcal
      1食目 P25.9 206kcal: 鶏そぼろ50g・卵1個・ブロッコリー150g
      2食目 P30.1 296kcal: 鶏そぼろ50g・卵1個・オクラ150g・納豆1P"
    `)
  })

  it('起床が20時（残り1食）', () => {
    const r = solve({ target: TARGET, eaten: {}, mealCount: 1, foods: foods() })
    expect(render(r) + '\n' + r.notes.join('\n')).toMatchInlineSnapshot(`
      "1日合計 P78.0 F38.5 C152.3 1243kcal
      1食目 P78.0 1243kcal: 鶏そぼろ180g・白米350g・卵1個・ブロッコリー150g・納豆1P・オリーブオイル20g
      1食のタンパク質が 80g を超えないよう量を抑えました
      脂質が下限 58g にあと 19g 届きません。脂質源（オリーブオイル・卵など）を足せる場合は足してください。
      残り1食では目標に届きません（タンパク質があと 92g）。今日は下振れで終わらせてよい。明日きっちり取れば問題ありません。"
    `)
  })
})
