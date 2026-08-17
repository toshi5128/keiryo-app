import { describe, expect, it } from 'vitest'
import {
  dailyTargetFor,
  eatOutDateForWeek,
  planWeek,
  proteinStatusFor,
  weekProgress,
  weeklyAvgDailyKcal,
} from '../src/core/weekBudget'

describe('★週予算 = 1日の目標 × 7', () => {
  it('2,200 × 7 = 15,400kcal', () => {
    expect(planWeek({ dailyTargetKcal: 2200 }).weeklyBudgetKcal).toBe(15400)
  })

  it('外食日が無ければ平日目標は 2,200 のまま', () => {
    expect(planWeek({ dailyTargetKcal: 2200 }).normalTargetKcal).toBe(2200)
  })
})

describe('★外食日を指定すると残り日数に再配分される', () => {
  const plan = planWeek({
    dailyTargetKcal: 2200,
    eatOutDates: ['2026-08-16'],
    eatOutKcal: 3000,
  })

  it('(15,400 - 3,000) ÷ 6 = 2,066.7 → 50kcal単位で切り捨てて 2,050', () => {
    expect(plan.normalTargetKcal).toBe(2050)
  })

  it('切り捨てなので週合計は必ず予算内に収まる', () => {
    expect(plan.allocatedKcal).toBeLessThanOrEqual(plan.weeklyBudgetKcal)
    expect(plan.slackKcal).toBeGreaterThanOrEqual(0)
  })

  it('外食日は想定値、それ以外は再配分後の平日目標', () => {
    expect(dailyTargetFor(plan, '2026-08-16')).toBe(3000)
    expect(dailyTargetFor(plan, '2026-08-17')).toBe(2050)
  })

  it('★週平均で見れば 2,200 のままなので、下限ガードは誤発火しない', () => {
    expect(weeklyAvgDailyKcal(plan)).toBe(2200)
  })

  it('外食日が多すぎて配分できない場合は警告を出す', () => {
    const heavy = planWeek({
      dailyTargetKcal: 2200,
      eatOutDates: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'],
      eatOutKcal: 3200,
    })
    expect(heavy.warnings.length).toBeGreaterThan(0)
  })
})

describe('★1日オーバーしても警告しない。週予算を超えた時だけ', () => {
  const plan = planWeek({ dailyTargetKcal: 2200 })

  it('8/13 の実例（2,725kcal）1日だけでは警告にならない', () => {
    // 8/13: 牛かつ定食 1,105 + おはぎ6個 480 などで 2,725kcal
    const p = weekProgress(plan, [{ logDate: '2026-08-13', kcal: 2725 }], '2026-08-13')
    expect(p.status).not.toBe('over')
  })

  it('週予算を超えて初めて over になる', () => {
    const intakes = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'].map(
      (logDate) => ({ logDate, kcal: 2400 })
    )
    const p = weekProgress(plan, intakes, '2026-08-16')
    expect(p.consumedKcal).toBe(16800)
    expect(p.status).toBe('over')
  })

  it('残りを均すと平日目標を大きく割る場合は tight として知らせる', () => {
    const p = weekProgress(
      plan,
      [
        { logDate: '2026-08-10', kcal: 3000 },
        { logDate: '2026-08-11', kcal: 3000 },
        { logDate: '2026-08-12', kcal: 3000 },
      ],
      '2026-08-12'
    )
    expect(p.status).toBe('tight')
  })

  it('★UI 文言に「オーバー」を使わない', () => {
    const p = weekProgress(plan, [{ logDate: '2026-08-13', kcal: 2725 }], '2026-08-13')
    expect(p.message).not.toContain('オーバー')
  })
})

describe('★タンパク質だけは日次で独立評価する', () => {
  it('外食日でも 170g に届いていなければ未達', () => {
    const s = proteinStatusFor(170, 120)
    expect(s.met).toBe(false)
    expect(s.shortfallG).toBe(50)
  })

  it('届いていれば達成', () => {
    expect(proteinStatusFor(170, 172).met).toBe(true)
  })
})

describe('曜日固定の外食日', () => {
  it('日曜(0)を指定すると、その週の日曜の日付になる', () => {
    // 2026-08-10(月) 始まりの週の日曜は 8/16
    expect(eatOutDateForWeek('2026-08-12', 0)).toBe('2026-08-16')
  })

  it('土曜(6)を指定するとその週の土曜', () => {
    expect(eatOutDateForWeek('2026-08-12', 6)).toBe('2026-08-15')
  })
})
