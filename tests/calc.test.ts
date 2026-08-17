import { describe, expect, it } from 'vitest'
import {
  applyAdjustment,
  buildPlan,
  evaluateCalorieSafety,
  goalFromTargetBodyFat,
  lbmFromSkeletalMuscle,
  movingAverage,
  resolveLbm,
  reviewWeek,
  roundKcal,
  roundMacro,
  SMM_TO_LBM,
} from '../src/core/calc'

/** 仕様書 §1 の実測データ（2026-07-18 の体組成計） */
const BODY = { weightKg: 83.3, bodyFatPct: 15.7, skeletalMuscleKg: 40.1 }

describe('§1 の検算（この数値が動いたら設計が壊れている）', () => {
  const plan = buildPlan({ body: BODY })

  it('LBM = 83.3 × (1 - 0.157) = 70.2kg', () => {
    expect(plan.lbmKg).toBe(70.2)
  })

  it('BMR = 370 + 21.6 × 70.2 = 1886kcal（体組成計の1887とほぼ一致）', () => {
    expect(Math.round(plan.bmr)).toBe(1886)
  })

  it('TDEE = 1886 × 1.45 = 2735kcal', () => {
    expect(Math.round(plan.tdee)).toBe(2735)
  })

  it('目標カロリー = 2200kcal', () => {
    expect(plan.kcal).toBe(2200)
  })

  it('P = 70.2 × 2.4 = 168 → 170g', () => {
    expect(plan.proteinG).toBe(170)
  })

  it('F = 83.3 × 0.72 = 60g', () => {
    expect(plan.fatG).toBe(60)
  })

  it('C = (2200 - 680 - 540) / 4 = 245g', () => {
    expect(plan.carbG).toBe(245)
  })

  it('★脂質の下限 = 体重 × 0.7 = 58g', () => {
    expect(plan.fatFloorG).toBe(58)
  })

  it('PFC の合計カロリーが目標とほぼ一致する', () => {
    const sum = plan.proteinG * 4 + plan.fatG * 9 + plan.carbG * 4
    expect(Math.abs(sum - plan.kcal)).toBeLessThanOrEqual(5)
  })
})

describe('除脂肪体重の換算', () => {
  it('★骨格筋量からの換算係数は 1.75（v1 の 1.85 は誤り）', () => {
    expect(SMM_TO_LBM).toBe(1.75)
    expect(lbmFromSkeletalMuscle(40.1)).toBeCloseTo(70.2, 1)
  })

  it('体脂肪率があればそちらを優先する', () => {
    expect(resolveLbm(BODY)).toBe(70.2)
  })

  it('骨格筋量しか無ければ 1.75 倍で代用する', () => {
    expect(resolveLbm({ weightKg: 83.3, skeletalMuscleKg: 40.1 })).toBe(70.2)
  })

  it('どちらも無ければエラー', () => {
    expect(() => resolveLbm({ weightKg: 83.3 })).toThrow()
  })

  it('0.1kg 単位に丸める（丸めないと BMR が 1kcal ずれる）', () => {
    expect(resolveLbm({ weightKg: 83.34, bodyFatPct: 15.7 })).toBe(70.3)
  })
})

describe('丸め', () => {
  it('カロリーは 50kcal 単位', () => {
    expect(roundKcal(2184.7)).toBe(2200)
    expect(roundKcal(2170)).toBe(2150)
  })

  it('マクロは 5g 単位', () => {
    expect(roundMacro(168.48)).toBe(170)
    expect(roundMacro(59.976)).toBe(60)
  })
})

describe('目標体重は体脂肪率から逆算する（直接入力させない）', () => {
  it('目標8% → 76.3kg', () => {
    const g = goalFromTargetBodyFat(70.2, 83.3, 8)
    expect(g.goalWeightKg).toBeCloseTo(76.3, 1)
    expect(g.fatToLoseKg).toBeCloseTo(7.0, 1)
  })

  it('0% や 100% は弾く', () => {
    expect(() => goalFromTargetBodyFat(70.2, 83.3, 0)).toThrow()
    expect(() => goalFromTargetBodyFat(70.2, 83.3, 100)).toThrow()
  })
})

describe('週次レビューは7日移動平均だけで判断する', () => {
  const base = { lastWeekAvgKg: 83.0 }

  it('-0.7kg より速い → 落としすぎ → +150kcal', () => {
    const r = reviewWeek({ ...base, thisWeekAvgKg: 82.2 })
    expect(r.verdict).toBe('too_fast')
    expect(r.kcalAdjustment).toBe(150)
  })

  it('ちょうど -0.7kg は「順調」（浮動小数点で誤判定しないこと）', () => {
    const r = reviewWeek({ ...base, thisWeekAvgKg: 82.3 })
    expect(r.verdict).toBe('on_track')
    expect(r.kcalAdjustment).toBe(0)
  })

  it('-0.3 〜 -0.1 → やや停滞。1週間は変更しない', () => {
    const r = reviewWeek({ ...base, thisWeekAvgKg: 82.8 })
    expect(r.verdict).toBe('slowing')
    expect(r.kcalAdjustment).toBe(0)
  })

  it('停滞は2週連続で初めて手を打つ', () => {
    const first = reviewWeek({ ...base, thisWeekAvgKg: 83.0 })
    expect(first.verdict).toBe('stalled')
    expect(first.kcalAdjustment).toBe(0)

    const second = reviewWeek({ ...base, thisWeekAvgKg: 83.0, stalledLastWeek: true })
    expect(second.kcalAdjustment).toBe(-100)
  })

  it('★カロリー削減と有酸素追加を同時に提案しない', () => {
    const r = reviewWeek({ ...base, thisWeekAvgKg: 83.0, stalledLastWeek: true })
    expect(r.kcalAdjustment !== 0 && r.suggestCardio).toBe(false)
  })

  it('★安全弁: 骨格筋が2週で -0.5kg 以上減ったら最優先で +200kcal', () => {
    const r = reviewWeek({ ...base, thisWeekAvgKg: 82.9, smmChange2WeeksKg: -0.6 })
    expect(r.kcalAdjustment).toBe(200)
    expect(r.message).toContain('骨格筋')
  })
})

describe('カロリー調整は C だけで行う', () => {
  const plan = buildPlan({ body: BODY })

  it('★P と F はいかなる調整でも減らさない', () => {
    const down = applyAdjustment(plan, -300)
    expect(down.proteinG).toBe(plan.proteinG)
    expect(down.fatG).toBe(plan.fatG)
    expect(down.carbG).toBeLessThan(plan.carbG)
  })

  it('C は下限 100g を割らない', () => {
    const down = applyAdjustment(plan, -2000)
    expect(down.carbG).toBe(100)
  })
})

describe('下限ガードは週平均で判定する', () => {
  const bmr = 1886

  it('週平均が基礎代謝を下回ったら設定させない', () => {
    expect(evaluateCalorieSafety(1800, bmr).level).toBe('blocked')
  })

  it('基礎代謝の1.1倍を下回ったら警告', () => {
    expect(evaluateCalorieSafety(2000, bmr).level).toBe('warn')
  })

  it('★外食週の平日目標 2,050kcal でも、週平均 2,200kcal なら警告しない', () => {
    expect(evaluateCalorieSafety(2200, bmr).level).toBe('ok')
  })
})

describe('7日移動平均', () => {
  const weighIns = [
    { logDate: '2026-08-11', weightKg: 83.0 },
    { logDate: '2026-08-12', weightKg: 83.2 },
    { logDate: '2026-08-13', weightKg: 82.8 },
  ]

  it('期間内の平均を返す', () => {
    expect(movingAverage(weighIns, '2026-08-13')).toBeCloseTo(83.0, 2)
  })

  it('★参考値フラグの測定は除外する', () => {
    const withRef = [...weighIns, { logDate: '2026-08-13', weightKg: 90.0, isReference: true }]
    expect(movingAverage(withRef, '2026-08-13')).toBeCloseTo(83.0, 2)
  })

  it('期間内に測定が無ければ null', () => {
    expect(movingAverage(weighIns, '2026-09-30')).toBeNull()
  })
})
