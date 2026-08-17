import { describe, expect, it } from 'vitest'
import { solve, usableFoods, pickMainDish, MAX_PROTEIN_PER_MEAL_G } from '../src/core/solver'
import type { SolveResult, SolveTarget } from '../src/core/solver'
import { SEED_FOODS } from '../src/data/seedFoods'
import type { Food } from '../src/core/types'

/** 仕様書 §1 の目標。1日ぶん */
const TARGET: SolveTarget = { kcal: 2200, proteinG: 170, fatG: 60, carbG: 245, fatFloorG: 58 }

/** 8/17 の1食目（実績・モックと同じ） */
const MEAL1 = { kcal: 671, proteinG: 54, fatG: 18, carbG: 82, saltG: 2 }

/** テストごとに独立したマスタを作る（フラグを書き換えるため） */
const foods = (patch: Record<string, Partial<Food>> = {}): Food[] =>
  SEED_FOODS.map((f) => ({ ...f, ...(patch[f.id] ?? {}) }))

const names = (r: SolveResult) => r.meals.flatMap((m) => m.items.map((i) => i.food.name))
const dump = (label: string, r: SolveResult) => {
  const lines = r.meals.map(
    (m) =>
      `  ${m.index}食目 P${m.totals.proteinG.toFixed(1)} ${Math.round(m.totals.kcal)}kcal — ` +
      m.items.map((i) => `${i.food.name.replace(/（.*?）/, '')} ${i.amount}${i.unit}`).join(' / ')
  )
  return (
    `\n[${label}] P${r.dayTotals.proteinG.toFixed(1)} F${r.dayTotals.fatG.toFixed(1)} ` +
    `C${r.dayTotals.carbG.toFixed(1)} ${Math.round(r.dayTotals.kcal)}kcal 米${r.riceTotalG}g\n` +
    lines.join('\n')
  )
}

/** どのテストでも必ず満たすべき【絶対】制約 */
function expectHardConstraints(r: SolveResult, target = TARGET) {
  // 除外・在庫切れが混ざっていない
  expect(r.violations).toEqual([])
  // 1食の P が上限を超えない
  for (const m of r.meals) {
    expect(m.totals.proteinG).toBeLessThanOrEqual(MAX_PROTEIN_PER_MEAL_G)
  }
  // max_amount を超えない
  for (const m of r.meals) {
    for (const it of m.items) {
      if (it.food.maxAmount != null) expect(it.amount).toBeLessThanOrEqual(it.food.maxAmount)
    }
  }
  // 脂質の下限を割らない
  expect(r.dayTotals.fatG).toBeGreaterThanOrEqual(target.fatFloorG - 0.5)
}

// ===========================================================================

describe('基準日（1食目を食べ終えて残り2食）', () => {
  const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })

  it('献立が解ける', () => {
    expect(r.feasible, dump('基準', r)).toBe(true)
  })

  it('【絶対】制約をすべて満たす', () => {
    expectHardConstraints(r)
  })

  it('タンパク質が目標 170g に届く（±5g）', () => {
    expect(Math.abs(r.dayTotals.proteinG - 170), dump('基準', r)).toBeLessThanOrEqual(5)
  })

  it('カロリーが目標 2,200kcal に収まる（±100kcal）', () => {
    expect(Math.abs(r.dayTotals.kcal - 2200), dump('基準', r)).toBeLessThanOrEqual(100)
  })

  it('残り2食ぶんの提案が出る', () => {
    expect(r.meals).toHaveLength(2)
    expect(r.meals[0].items.length).toBeGreaterThan(2)
  })

  it('主菜が選ばれ、量が5g刻みになっている', () => {
    expect(r.mainFood).not.toBeNull()
    expect(r.mainAmountPerMeal % 5).toBe(0)
  })
})

// ===========================================================================

describe('★鶏ももが在庫切れ → 組み直す', () => {
  const before = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })
  const after = solve({
    target: TARGET,
    eaten: MEAL1,
    mealCount: 2,
    foods: foods({ momo: { inStock: false } }),
  })

  it('鶏ももが提案から消える', () => {
    expect(names(before)).toContain('鶏もも肉（皮なし・低温調理）')
    expect(names(after)).not.toContain('鶏もも肉（皮なし・低温調理）')
  })

  it('別の主菜に入れ替わる', () => {
    expect(after.mainFood?.id).not.toBe('momo')
    expect(after.mainFood).not.toBeNull()
  })

  it('タンパク質は同じだけ確保される（±5g）', () => {
    expect(Math.abs(after.dayTotals.proteinG - 170), dump('もも切れ', after)).toBeLessThanOrEqual(5)
  })

  it('★脂質が下限 58g を割らない（モックはここで 50.5g に落ちていた）', () => {
    expect(after.dayTotals.fatG, dump('もも切れ', after)).toBeGreaterThanOrEqual(57.5)
  })

  it('【絶対】制約をすべて満たす', () => {
    expectHardConstraints(after)
  })
})

// ===========================================================================

describe('★「羊羹1切れ食べたい」→ 米が減る（このアプリの看板機能）', () => {
  const before = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })
  const after = solve({
    target: TARGET,
    eaten: MEAL1,
    mealCount: 2,
    foods: foods(),
    wants: ['youk'],
  })

  it('羊羹が献立に入る', () => {
    expect(names(after)).toContain('羊羹')
  })

  it('★米が約90g減る（145kcal ÷ 1.56kcal/g ≒ 93g → 10g刻みで90g）', () => {
    const diff = before.riceTotalG - after.riceTotalG
    expect(diff, dump('羊羹', after)).toBeGreaterThanOrEqual(80)
    expect(diff).toBeLessThanOrEqual(100)
  })

  it('★1日の合計カロリーは変わらない（羊羹ぶんが上乗せされない）', () => {
    expect(Math.abs(after.dayTotals.kcal - before.dayTotals.kcal), dump('羊羹', after)).toBeLessThanOrEqual(60)
  })

  it('タンパク質は目標のまま', () => {
    expect(Math.abs(after.dayTotals.proteinG - 170)).toBeLessThanOrEqual(5)
  })

  it('【絶対】制約をすべて満たす', () => {
    expectHardConstraints(after)
  })

  it('わらび餅(248kcal)ならもっと米が減る', () => {
    const wara = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods(), wants: ['wara'] })
    expect(before.riceTotalG - wara.riceTotalG).toBeGreaterThan(before.riceTotalG - after.riceTotalG)
  })
})

// ===========================================================================

describe('★除外食材を絶対に提案しない', () => {
  const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })

  it('木綿豆腐が出てこない', () => {
    expect(names(r)).not.toContain('木綿豆腐')
  })

  it('鶏むね肉（ブロック）が出てこない', () => {
    expect(names(r)).not.toContain('鶏むね肉（皮なし・ブロック）')
  })

  it('鶏そぼろ（むねミンチ）は除外しない — 食べられるので', () => {
    const pool = usableFoods(foods())
    expect(pool.map((f) => f.id)).toContain('sobo')
  })

  it('全食材を除外しても、除外品を出すくらいなら解けないと答える', () => {
    const all = foods()
    const excluded = all.map((f) => ({ ...f, isExcluded: f.category === 'protein' }))
    const r2 = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: excluded })
    expect(names(r2).some((n) => n.includes('鶏') || n.includes('豆腐'))).toBe(false)
    expect(r2.feasible).toBe(false)
  })

  it('★除外を外せば候補に戻る（＝ID直書きではなくマスタを見ている証拠）', () => {
    const pool = usableFoods(foods({ mune: { isExcluded: false }, momo: { inStock: false }, sobo: { inStock: false } }))
    const main = pickMainDish(pool)
    expect(pool.map((f) => f.id)).toContain('mune')
    expect(main).not.toBeNull()
  })

  it('★新しく登録した食材が主菜の候補に入る（登録が増えるほど幅が広がる）', () => {
    const withNew: Food[] = [
      ...foods({ momo: { inStock: false }, sobo: { inStock: false } }),
      {
        id: 'lamb',
        name: 'ラム肩ロース',
        baseAmount: 100,
        baseUnit: 'g',
        kcal: 130,
        proteinG: 24,
        fatG: 4,
        carbG: 0,
        category: 'protein',
        isStaple: true,
        stepAmount: 5,
        maxAmount: 250,
      },
    ]
    const r3 = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: withNew })
    expect(r3.mainFood?.id, dump('新食材', r3)).toBe('lamb')
  })
})

// ===========================================================================

describe('★1食の P が 80g を超えない', () => {
  it('残り1食で P170 を要求されても 80g で頭打ちにする', () => {
    const r = solve({ target: TARGET, eaten: {}, mealCount: 1, foods: foods() })
    expect(r.meals[0].totals.proteinG, dump('1食のみ', r)).toBeLessThanOrEqual(MAX_PROTEIN_PER_MEAL_G)
  })

  it('残り2食でも各食が 80g を超えない', () => {
    const r = solve({ target: TARGET, eaten: {}, mealCount: 2, foods: foods() })
    for (const m of r.meals) expect(m.totals.proteinG).toBeLessThanOrEqual(MAX_PROTEIN_PER_MEAL_G)
  })
})

// ===========================================================================

describe('★max_amount を超えない（鶏もも530gのような答えを出さない）', () => {
  it('主菜が鶏ももしか無くても 250g を超えない', () => {
    const only = foods().map((f) =>
      f.category === 'protein' && !['momo', 'egg', 'whey'].includes(f.id)
        ? { ...f, inStock: false }
        : f
    )
    const r = solve({ target: TARGET, eaten: {}, mealCount: 2, foods: only })
    for (const m of r.meals) {
      const momo = m.items.find((i) => i.food.id === 'momo')
      if (momo) expect(momo.amount, dump('ももだけ', r)).toBeLessThanOrEqual(250)
    }
  })

  it('上限に当たって足りないぶんはプロテインで補う', () => {
    // 主菜が鶏ももだけ、しかも1食150gまでしか食べられない設定
    const tight = foods({ momo: { maxAmount: 150 } }).map((f) =>
      f.category === 'protein' && !['momo', 'egg', 'whey'].includes(f.id)
        ? { ...f, inStock: false }
        : f
    )
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: tight })
    expect(names(r), dump('もも150g上限', r)).toContain('ホエイプロテイン')
    expectHardConstraints(r)
  })

  it('プロテインは3杯までしか足さない', () => {
    const tight = foods({ momo: { maxAmount: 100 } }).map((f) =>
      f.category === 'protein' && !['momo', 'egg', 'whey'].includes(f.id)
        ? { ...f, inStock: false }
        : f
    )
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: tight })
    const scoops = r.meals
      .flatMap((m) => m.items)
      .filter((i) => i.food.id === 'whey')
      .reduce((n, i) => n + i.amount, 0)
    expect(scoops, dump('もも100g上限', r)).toBeLessThanOrEqual(3)
  })

  it('★1食80gの制約と両立できない日は、上限を守って不足を正直に報告する', () => {
    // 1日を2食で組むと 170g ÷ 2 = 85g/食 になり、80g の上限と両立しない。
    // このとき無理に押し込まず、shortfall として返すのが正しい。
    const only = foods().map((f) =>
      f.category === 'protein' && !['momo', 'egg', 'whey'].includes(f.id)
        ? { ...f, inStock: false }
        : f
    )
    const r = solve({ target: TARGET, eaten: {}, mealCount: 2, foods: only })
    for (const m of r.meals) expect(m.totals.proteinG).toBeLessThanOrEqual(MAX_PROTEIN_PER_MEAL_G)
    expect(r.shortfall.proteinG, dump('2食で170g', r)).toBeGreaterThan(0)
    expect(r.notes.join('')).toContain('明日')
  })
})

// ===========================================================================

describe('★起床が20時 → 届かないのは当然。焦らせない', () => {
  const r = solve({ target: TARGET, eaten: {}, mealCount: 1, foods: foods() })

  it('残り1食では目標に届かないと正直に返す', () => {
    expect(r.shortfall.proteinG, dump('起床20時', r)).toBeGreaterThan(0)
    expect(r.feasible).toBe(false)
  })

  it('★「明日きっちり取れば問題ない」と伝える', () => {
    expect(r.notes.join('')).toContain('明日')
    expect(r.notes.join('')).toContain('下振れ')
  })

  it('届く範囲の献立自体はちゃんと出す', () => {
    expect(r.meals[0].items.length).toBeGreaterThan(0)
    expect(r.violations).toEqual([])
  })
})

// ===========================================================================

describe('★外食1,105kcal を差し引いて組み直す', () => {
  // 8/13 の実例: 牛かつ定食 1,105kcal / P58 / C95
  const eaten = { kcal: 671 + 1105, proteinG: 54 + 58, fatG: 18 + 40, carbG: 82 + 95, saltG: 5 }
  const r = solve({ target: TARGET, eaten, mealCount: 2, foods: foods() })

  it('残りの食事が縮む', () => {
    const normal = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })
    expect(r.totals.kcal, dump('外食', r)).toBeLessThan(normal.totals.kcal)
  })

  it('米が真っ先に削られる（C は調整弁）', () => {
    const normal = solve({ target: TARGET, eaten: MEAL1, mealCount: 2, foods: foods() })
    expect(r.riceTotalG).toBeLessThan(normal.riceTotalG)
  })

  it('★タンパク質は日次目標を優先して確保する', () => {
    expect(r.dayTotals.proteinG, dump('外食', r)).toBeGreaterThanOrEqual(170 - 5)
  })

  it('【絶対】制約をすべて満たす', () => {
    expectHardConstraints(r)
  })
})

// ===========================================================================

describe('食事回数が0（もう食べない）', () => {
  it('空の献立を返して落ちない', () => {
    const r = solve({ target: TARGET, eaten: MEAL1, mealCount: 0, foods: foods() })
    expect(r.meals).toEqual([])
    expect(r.violations).toEqual([])
  })
})
