/**
 * ★今夜のおかず候補（core/dinnerIdeas.ts）
 */
import { describe, expect, it } from 'vitest'
import { SEED_FOODS } from '../src/data/seedFoods'
import { DINNER_DISHES, buildDish, dinnerShare, suggestDinners } from '../src/core/dinnerIdeas'
import type { DinnerRemaining } from '../src/core/dinnerIdeas'
import type { Macros } from '../src/core/types'

const target = { kcal: 2200, proteinG: 170, fatFloorG: 58, saltLimitG: 6 }
const eaten = (m: Partial<Macros>): Macros => ({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0, ...m })
const remaining = (m: Partial<Macros>, extra: Partial<DinnerRemaining> = {}): DinnerRemaining => ({
  target,
  eaten: eaten(m),
  eatenAmounts: {},
  mealsLeft: 1,
  ...extra,
})

describe('定番メニュー表', () => {
  it('すべて食材マスタにある食材だけで組まれている', () => {
    for (const d of DINNER_DISHES) {
      for (const it of d.items) {
        expect(SEED_FOODS.some((f) => f.id === it.foodId), `${d.name}: ${it.foodId}`).toBe(true)
      }
    }
  })

  it('★嫌いな食材・参照専用の食材を含むおかずは無い（v4 §10 / §16）', () => {
    for (const d of DINNER_DISHES) {
      expect(buildDish(d, SEED_FOODS), d.name).not.toBeNull()
    }
  })
})

describe('suggestDinners', () => {
  it('3つ返し、合う順に並ぶ', () => {
    const ideas = suggestDinners(remaining({ kcal: 1500, proteinG: 125, fatG: 40, saltG: 3 }), SEED_FOODS)
    expect(ideas).toHaveLength(3)
    expect(ideas[0].score).toBeLessThanOrEqual(ideas[1].score)
    expect(ideas[1].score).toBeLessThanOrEqual(ideas[2].score)
  })

  it('P が45g残っていれば、P40以上のおかずが先頭に来る', () => {
    const ideas = suggestDinners(remaining({ kcal: 1500, proteinG: 125, fatG: 40, saltG: 3 }), SEED_FOODS)
    expect(ideas[0].totals.proteinG).toBeGreaterThanOrEqual(40)
  })

  it('★在庫切れの食材を使うおかずは出さない', () => {
    const foods = SEED_FOODS.map((f) => (f.id === 'sobo' ? { ...f, inStock: false } : f))
    const ideas = suggestDinners(remaining({ proteinG: 125 }), foods, 99)
    expect(ideas.some((i) => i.items.some((it) => it.food.id === 'sobo'))).toBe(false)
  })

  it('★除外にした食材を使うおかずは出さない（飽きの申告で即切り替え）', () => {
    const foods = SEED_FOODS.map((f) => (f.id === 'sake' ? { ...f, isExcluded: true } : f))
    const ideas = suggestDinners(remaining({ proteinG: 125 }), foods, 99)
    expect(ideas.some((i) => i.items.some((it) => it.food.id === 'sake'))).toBe(false)
  })

  it('★卵をすでに3個食べた日は卵を使うおかずを出さない', () => {
    const ideas = suggestDinners(remaining({ proteinG: 125 }, { eatenAmounts: { egg: 3 } }), SEED_FOODS, 99)
    expect(ideas.some((i) => i.items.some((it) => it.food.id === 'egg'))).toBe(false)
  })

  it('★サバ缶をすでに1缶食べた日はサバ缶を出さない', () => {
    const ideas = suggestDinners(remaining({ proteinG: 125 }, { eatenAmounts: { saba: 1 } }), SEED_FOODS, 99)
    expect(ideas.some((i) => i.items.some((it) => it.food.id === 'saba'))).toBe(false)
  })

  it('塩分が上限ぎりぎりの日は、塩分の重いおかずを先頭にしない', () => {
    const ideas = suggestDinners(remaining({ kcal: 1500, proteinG: 150, fatG: 45, saltG: 5.8 }), SEED_FOODS)
    expect(ideas[0].totals.saltG).toBeLessThan(1)
  })

  it('ご飯は残りのカロリーで埋め、10g刻みで上限350g', () => {
    const ideas = suggestDinners(remaining({ kcal: 1000, proteinG: 125, fatG: 40 }), SEED_FOODS)
    for (const i of ideas) {
      expect(i.riceG % 10).toBe(0)
      expect(i.riceG).toBeLessThanOrEqual(350)
    }
  })

  it('カロリーを使い切った日はご飯0g', () => {
    const ideas = suggestDinners(remaining({ kcal: 2300, proteinG: 150, fatG: 60 }), SEED_FOODS)
    for (const i of ideas) expect(i.riceG).toBe(0)
  })

  it('残り2食なら今夜のぶんは半分', () => {
    const s = dinnerShare(remaining({ kcal: 1200, proteinG: 90 }, { mealsLeft: 2 }))
    expect(s.proteinG).toBe(40)
    expect(s.kcal).toBe(500)
  })
})
