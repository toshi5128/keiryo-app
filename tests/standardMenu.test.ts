/**
 * ★標準メニューと v4 の食材データの検証（KEIRYO-HANDOFF-v4.md §4 / §5 / §6 / §10 / §16）
 *
 * ここが落ちたら、引き継ぎ書の「絶対に外してはいけないこと」を壊している。
 */
import { describe, expect, it } from 'vitest'
import { SEED_FOODS, seedFoodById } from '../src/data/seedFoods'
import {
  SOBORO_COOKED_YIELD,
  STANDARD_MEAL,
  standardDayMacros,
  standardMealItems,
  standardMealMacros,
  shoppingList,
  soboroCookedToRaw,
  soboroRawToCooked,
} from '../src/core/standardMenu'
import { usableFoods } from '../src/core/solver'

describe('★そぼろは調理後の重量（v4 §6 / §16）', () => {
  it('調理後100g は P28（生の22ではない）', () => {
    const sobo = seedFoodById('sobo')
    expect(sobo.baseAmount).toBe(100)
    expect(sobo.proteinG).toBe(28)
  })

  it('生の行は別に持ち、P22 のまま', () => {
    expect(seedFoodById('sobo_raw').proteinG).toBe(22)
  })

  it('★生の行は献立にも記録候補にも出ない（二重計上を防ぐ）', () => {
    const pool = usableFoods(SEED_FOODS)
    expect(pool.map((f) => f.id)).not.toContain('sobo_raw')
    expect(pool.map((f) => f.id)).toContain('sobo')
  })

  it('調理後の重量に「調理後」と明示した注意書きが付いている', () => {
    expect(seedFoodById('sobo').note).toContain('調理後')
  })

  it('生800g → 調理後 約624g（78%に目減り）', () => {
    expect(Math.round(soboroRawToCooked(800))).toBe(624)
    expect(SOBORO_COOKED_YIELD).toBeCloseTo(0.78, 2)
  })

  it('調理後360g（1日分）に必要な生は約462g', () => {
    expect(Math.round(soboroCookedToRaw(360))).toBe(462)
  })
})

describe('★嫌い・飽きた食材は提案されない（v4 §10 / §16）', () => {
  const pool = usableFoods(SEED_FOODS).map((f) => f.id)

  it.each(['tofu', 'mune', 'momo', 'momo_kawa', 'saladchicken'])(
    '%s は提案に出ない',
    (id) => {
      expect(pool).not.toContain(id)
    }
  )

  it('鶏むね「ミンチ（そぼろ）」は除外しない', () => {
    expect(pool).toContain('sobo')
  })

  it('嫌いな食材もマスタ自体には残す（「なぜ出ないのか」を画面で示せるように）', () => {
    const all = SEED_FOODS.map((f) => f.id)
    for (const id of ['tofu', 'mune', 'momo', 'saladchicken']) expect(all).toContain(id)
  })

  it('好きなものは残っている', () => {
    for (const id of ['saba', 'egg', 'natto', 'meka', 'takokim', 'blueberry', 'youk']) {
      expect(SEED_FOODS.map((f) => f.id)).toContain(id)
    }
  })
})

describe('★量の上限（v4 §10）', () => {
  it('卵は1食2個まで・1日3個まで', () => {
    const egg = seedFoodById('egg')
    expect(egg.maxAmount).toBe(2)
    expect(egg.dailyMaxAmount).toBe(3)
  })

  it('サバ缶は1日1缶まで', () => {
    expect(seedFoodById('saba').dailyMaxAmount).toBe(1)
  })
})

describe('★標準メニュー（v4 §4）', () => {
  const meal = standardMealMacros(SEED_FOODS)
  const day = standardDayMacros(SEED_FOODS)

  it('構成は そぼろ120g + 卵1個 + ご飯170g + オイル6g の4点', () => {
    expect(STANDARD_MEAL).toHaveLength(4)
    expect(standardMealItems(SEED_FOODS).map((i) => `${i.food.id}${i.amount}`)).toEqual([
      'sobo120',
      'egg1',
      'rice170',
      'oil6',
    ])
  })

  it('1食 = P44 / 599kcal / F16.5（引き継ぎ書の表と一致する）', () => {
    expect(Math.round(meal.proteinG)).toBe(44)
    expect(Math.round(meal.kcal)).toBe(599)
    expect(meal.fatG).toBeCloseTo(16.5, 1)
  })

  it('1食の塩分は約1.2g（引き継ぎ書の1.0gは卵のぶんを数えていない）', () => {
    expect(meal.saltG).toBeCloseTo(1.16, 2)
  })

  it('1日（3食＋プロテイン2杯）は P175 前後で、★日次必達の170gを満たす', () => {
    expect(day.proteinG).toBeGreaterThanOrEqual(170)
    expect(Math.round(day.proteinG)).toBe(174)
  })

  it('1日の塩分は上限6gに対して余裕がある', () => {
    expect(day.saltG).toBeLessThan(6)
    expect(day.saltG).toBeCloseTo(3.7, 1)
  })

  it('★1日のカロリーは目標2,200に対して約160kcal 足りない（引き継ぎ書の2,170は誤り）', () => {
    // 引き継ぎ書 §4 の表は「1食599kcal × 3 ＋ プロテイン240kcal」で 2,038kcal。
    // 同じ表の「1日合計 2,170kcal」とは 132kcal 合わない。食材マスタを正とする。
    expect(Math.round(day.kcal)).toBe(2038)
    expect(2200 - day.kcal).toBeGreaterThan(100)
  })

  it('★脂質は下限58gを下回るので、オイルかご飯での補填が必要', () => {
    expect(day.fatG).toBeLessThan(58)
    expect(day.fatG).toBeCloseTo(52.5, 1)
  })
})

describe('★1週間の買い物（v4 §4）', () => {
  const list = shoppingList(7)
  const find = (label: string) => {
    const line = list.find((l) => l.label.startsWith(label))
    if (!line) throw new Error(`買い物リストに ${label} がありません`)
    return line
  }

  it('鶏むねミンチは「生」で3.2kg', () => {
    expect(find('鶏むねミンチ').amount).toBe(3.2)
    expect(find('鶏むねミンチ').unit).toBe('kg')
  })

  it('卵21個・オリーブオイル126g・プロテイン14杯', () => {
    expect(find('卵').amount).toBe(21)
    expect(find('オリーブオイル').amount).toBe(126)
    expect(find('プロテイン').amount).toBe(14)
  })

  it('米は炊く前の重量で出す', () => {
    expect(find('米').note).toContain('炊飯後 3,570g')
  })
})
