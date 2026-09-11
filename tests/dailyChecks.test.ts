/**
 * ★その日のうちに気づかないと手遅れになるものの判定（KEIRYO-HANDOFF-v4.md §1 / §3 / §10 / §12）
 */
import { describe, expect, it } from 'vitest'
import {
  APPETITE_HIGH_DAYS_WARN,
  APPETITE_MIN_RECORDS,
  FIRST_MEAL_PROTEIN_MIN_G,
  MONOTONY_DAYS,
  SLEEP_SHORT_H,
  appetiteCheck,
  appetitePressure,
  isShortSleep,
  checkFirstMeal,
  checkMonotony,
  checkSalt,
  checkWater,
} from '../src/core/dailyChecks'
import type { Appetite } from '../src/core/dailyChecks'
import { SALT_LIMIT_G, waterTargetMl } from '../src/core/calc'
import { SEED_FOODS } from '../src/data/seedFoods'
import { standardMealMacros } from '../src/core/standardMenu'

describe('★1食目のタンパク質（v4 §1 / §12 — 最多の失敗パターン）', () => {
  it('まだ食べていないときは何も言わない', () => {
    expect(checkFirstMeal(null)).toBeNull()
  })

  it('45g 未満は alert（赤）', () => {
    const c = checkFirstMeal(30)
    expect(c?.level).toBe('alert')
    expect(c?.body).toContain('1日で取り返せません')
  })

  it('ちょうど 45g は ok', () => {
    expect(checkFirstMeal(FIRST_MEAL_PROTEIN_MIN_G)?.level).toBe('ok')
  })

  it('★標準メニュー1食（P44）だけでは1食目の基準に1g届かない', () => {
    // 引き継ぎ書 §4 の標準メニューは1食 P44。§12 の警告ラインは 45。
    // 1食目はプロテインも飲む前提（§4「プロテイン2杯＝1食目とジム後」）なので、
    // 1食目にプロテインを合わせれば P65 になり余裕で超える。
    const meal = standardMealMacros(SEED_FOODS)
    expect(checkFirstMeal(meal.proteinG)?.level).toBe('alert')
    expect(checkFirstMeal(meal.proteinG + 21)?.level).toBe('ok')
  })

  it('足りないときは具体的な補い方を出す', () => {
    expect(checkFirstMeal(30)?.body).toMatch(/プロテイン1杯|そぼろ\d+g/)
  })
})

describe('★塩分（v4 §3 / §8 — 翌朝の増加を先に予告する）', () => {
  it('少なければ何も言わない', () => {
    expect(checkSalt(2.1, SALT_LIMIT_G)).toBeNull()
  })

  it('上限の8割を超えたら warn', () => {
    expect(checkSalt(5.5, SALT_LIMIT_G)?.level).toBe('warn')
  })

  it('★上限超過は alert で、翌朝の増加と「脂肪ではない」を必ず添える', () => {
    const c = checkSalt(9.4, SALT_LIMIT_G)
    expect(c?.level).toBe('alert')
    expect(c?.body).toContain('+0.5〜1kg')
    expect(c?.body).toContain('脂肪ではありません')
  })

  it('★「水を控えると逆効果」を必ず書く（控えると溜まる）', () => {
    expect(checkSalt(9.4, SALT_LIMIT_G)?.body).toContain('水を控えると')
  })
})

describe('★水分（v4 §3）', () => {
  const target = waterTargetMl(80.6)

  it('80.6kg でも 83.3kg でも目標は 3.0L に落ち着く', () => {
    expect(waterTargetMl(80.6)).toBe(3000)
    expect(waterTargetMl(83.3)).toBe(3000)
  })

  it('達成したら ok', () => {
    expect(checkWater(3000, target)?.level).toBe('ok')
  })

  it('1日の終わりに足りなければ warn', () => {
    const c = checkWater(1200, target, 1)
    expect(c?.level).toBe('warn')
    expect(c?.body).toContain('飲むほうが落ちます')
  })

  it('まだ日中なら急かさない', () => {
    expect(checkWater(1200, target, 0.5)).toBeNull()
  })
})

describe('★同じ食材が続いている（v4 §10 — 飽きが最大のリスク）', () => {
  const sobo = 'sobo'

  it(`${MONOTONY_DAYS}日未満なら何も言わない`, () => {
    expect(checkMonotony([sobo, sobo, sobo], SEED_FOODS)).toBeNull()
  })

  it(`${MONOTONY_DAYS}日続いたら代替候補を出す`, () => {
    const r = checkMonotony(Array(MONOTONY_DAYS).fill(sobo), SEED_FOODS)
    expect(r).not.toBeNull()
    expect(r?.days).toBe(MONOTONY_DAYS)
    expect(r?.alternatives.length).toBeGreaterThan(0)
  })

  it('★代替候補に嫌いな食材（鶏もも・豆腐・サラダチキン）を出さない', () => {
    const r = checkMonotony(Array(7).fill(sobo), SEED_FOODS)
    const ids = r?.alternatives.map((f) => f.id) ?? []
    for (const bad of ['momo', 'momo_kawa', 'tofu', 'mune', 'saladchicken']) {
      expect(ids).not.toContain(bad)
    }
  })

  it('★代替候補に「生」の参照行を出さない', () => {
    const r = checkMonotony(Array(7).fill(sobo), SEED_FOODS)
    expect(r?.alternatives.map((f) => f.id) ?? []).not.toContain('sobo_raw')
  })

  it('強制せず「替えてかまわない」と伝える', () => {
    const r = checkMonotony(Array(7).fill(sobo), SEED_FOODS)
    expect(r?.check.body).toContain('替えて')
    expect(r?.check.body).toContain('タンパク質の量が同じなら')
  })

  it('続いていない日が挟まればカウントは切れる', () => {
    expect(checkMonotony([sobo, sobo, 'sake', sobo, sobo, sobo, sobo], SEED_FOODS)).toBeNull()
  })
})

// ===========================================================================

describe('★食欲（削りすぎの一番早いサイン）', () => {
  const hi: Appetite = 'high'
  const ok: Appetite = 'normal'

  it('記録が少ないうちは何も言わない', () => {
    const p = appetitePressure([hi, hi, hi])
    expect(p.recorded).toBe(3)
    expect(p.strained).toBe(false)
    expect(appetiteCheck(p)).toBeNull()
  })

  it(`記録が${APPETITE_MIN_RECORDS}日以上あり、${APPETITE_HIGH_DAYS_WARN}日「やたら減る」なら止める`, () => {
    const p = appetitePressure([hi, hi, ok, hi, hi, ok, ok])
    expect(p.highDays).toBe(4)
    expect(p.strained).toBe(true)
    expect(appetiteCheck(p)?.body).toContain('続かなくなる可能性')
  })

  it('ふつうの日が多ければ止めない', () => {
    const p = appetitePressure([ok, ok, hi, ok, ok, ok, hi])
    expect(p.strained).toBe(false)
  })

  it('直近7日だけを見る（それより前は持ち出さない）', () => {
    const p = appetitePressure([ok, ok, ok, ok, ok, ok, ok, hi, hi, hi, hi, hi])
    expect(p.highDays).toBe(0)
    expect(p.strained).toBe(false)
  })

  it('未記録の日は数に入れない', () => {
    const p = appetitePressure([hi, undefined, hi, undefined, hi, undefined, hi])
    expect(p.recorded).toBe(4)
    expect(p.highDays).toBe(4)
    expect(p.strained).toBe(true)
  })
})

describe('睡眠（判定には使わず、あとで見るための印）', () => {
  it(`${SLEEP_SHORT_H}時間未満は「短い」`, () => {
    expect(isShortSleep(5)).toBe(true)
    expect(isShortSleep(7)).toBe(false)
  })

  it('未記録・0時間は印を付けない', () => {
    expect(isShortSleep(undefined)).toBe(false)
    expect(isShortSleep(0)).toBe(false)
  })
})
