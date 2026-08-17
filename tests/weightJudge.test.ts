import { describe, expect, it } from 'vitest'
import {
  buildSchedule,
  explainWeightChange,
  judgeBench,
  remainingMeals,
  KCAL_PER_FAT_KG,
} from '../src/core/weightJudge'

const BASE = { carbG: 245, saltG: 7.0 }
const quiet = {
  logDate: '2026-08-16',
  kcal: 2200,
  carbG: 245,
  saltG: 7.0,
  trained: false,
  ateOut: false,
  measuredHour: 9,
}

describe('★水分変動の自動説明', () => {
  it('+0.5kg 未満なら説明を出さない', () => {
    const r = explainWeightChange({
      todayKg: 83.5,
      yesterdayKg: 83.3,
      yesterday: quiet,
      baseline: BASE,
    })
    expect(r.shouldExplain).toBe(false)
  })

  it('+0.5kg 以上で説明を出す', () => {
    const r = explainWeightChange({
      todayKg: 83.9,
      yesterdayKg: 83.3,
      yesterday: quiet,
      baseline: BASE,
    })
    expect(r.shouldExplain).toBe(true)
  })

  it('★脂肪1kg = 7,700kcal の一文を必ず添える', () => {
    const r = explainWeightChange({
      todayKg: 84.3,
      yesterdayKg: 83.3,
      yesterday: quiet,
      baseline: BASE,
    })
    expect(KCAL_PER_FAT_KG).toBe(7700)
    expect(r.reassurance).toContain('7,700kcal')
    expect(r.reassurance).toContain('脂肪ではありません')
    expect(r.requiredSurplusKcal).toBe(7700)
  })

  it('前日の塩分が多ければ「塩分による水分保持」を挙げる', () => {
    const r = explainWeightChange({
      todayKg: 84.0,
      yesterdayKg: 83.3,
      yesterday: { ...quiet, saltG: 12 },
      baseline: BASE,
    })
    expect(r.reasons.join('')).toContain('塩分')
  })

  it('前日の炭水化物が多ければ「糖質1gにつき水3g」を挙げる', () => {
    const r = explainWeightChange({
      todayKg: 84.0,
      yesterdayKg: 83.3,
      yesterday: { ...quiet, carbG: 400 },
      baseline: BASE,
    })
    expect(r.reasons.join('')).toContain('3g')
    expect(r.reasons.join('')).toContain('水分')
  })

  it('前日にトレーニングがあれば「筋の修復による水分貯留」を挙げる', () => {
    const r = explainWeightChange({
      todayKg: 84.0,
      yesterdayKg: 83.3,
      yesterday: { ...quiet, trained: true },
      baseline: BASE,
    })
    expect(r.reasons.join('')).toContain('水分貯留')
  })

  it('前日に外食があれば「3日で戻る」と伝える', () => {
    const r = explainWeightChange({
      todayKg: 84.5,
      yesterdayKg: 83.3,
      yesterday: { ...quiet, ateOut: true },
      baseline: BASE,
    })
    expect(r.reasons.join('')).toContain('3日')
  })

  it('★8/8 の実例: 測定時刻が 12時 → 8:22 に変わった +0.4kg', () => {
    const r = explainWeightChange({
      todayKg: 83.7,
      yesterdayKg: 83.3,
      yesterday: { ...quiet, measuredHour: 12 },
      baseline: BASE,
      todayMeasuredHour: 8.37,
    })
    expect(r.reasons.join('')).toContain('測定条件')
  })

  it('★8/16 の実例: 帰省中の外食で +3.4kg → 脂肪なら26,180kcalの黒字が必要', () => {
    const r = explainWeightChange({
      todayKg: 86.7,
      yesterdayKg: 83.3,
      yesterday: { ...quiet, kcal: 3500, carbG: 420, saltG: 14, ateOut: true },
      baseline: BASE,
    })
    expect(r.deltaKg).toBeCloseTo(3.4, 1)
    expect(r.requiredSurplusKcal).toBe(26180)
    expect(r.reasons.length).toBeGreaterThanOrEqual(3)
  })

  it('心当たりが無くても黙らない', () => {
    const r = explainWeightChange({
      todayKg: 84.0,
      yesterdayKg: 83.3,
      yesterday: quiet,
      baseline: BASE,
    })
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('★前日の記録が無いときに「摂取0kcal」と言わない', () => {
    const r = explainWeightChange({
      todayKg: 84.6,
      yesterdayKg: 83.3,
      yesterday: { ...quiet, kcal: 0, carbG: 0, saltG: 0 },
      baseline: BASE,
    })
    expect(r.reassurance).not.toContain('前日の摂取は')
    expect(r.reassurance).toContain('脂肪ではありません')
    expect(r.reasons.join('')).toContain('記録されていません')
  })
})

describe('★ベンチプレス連動', () => {
  it('100kg×7回は維持。「体重が動かなくても設計は正しい」と伝える', () => {
    const r = judgeBench({ weightKg: 100, reps: 7 })
    expect(r.verdict).toBe('holding')
    expect(r.kcalAdjustment).toBe(0)
    expect(r.message).toContain('落ちていません')
  })

  it('5回に低下 → +150〜200kcal を提案', () => {
    const r = judgeBench({ weightKg: 100, reps: 5 })
    expect(r.verdict).toBe('slight_drop')
    expect(r.kcalAdjustment).toBe(150)
  })

  it('さらに低下 → 一時停止を提案', () => {
    const r = judgeBench({ weightKg: 100, reps: 3 })
    expect(r.verdict).toBe('big_drop')
    expect(r.message).toContain('一時停止')
  })

  it('記録が無いときは責めずに促す', () => {
    expect(judgeBench(null).kcalAdjustment).toBe(0)
  })
})

describe('★起床を起点にした相対スケジュール', () => {
  const wake = new Date(2026, 7, 17, 13, 35)

  it('起床+30分が1食目', () => {
    const s = buildSchedule(wake, wake)
    expect(s[0].label).toBe('1食目')
    expect(s[0].at.getHours()).toBe(14)
    expect(s[0].at.getMinutes()).toBe(5)
  })

  it('起床+14.5時間が3食目（日付をまたぐ）', () => {
    const s = buildSchedule(wake, wake)
    const meal3 = s.find((x) => x.key === 'meal3')!
    expect(meal3.at.getDate()).toBe(18)
    expect(meal3.at.getHours()).toBe(4)
  })

  it('起床が9時なら3食目は23:30（日付をまたがない）', () => {
    const s = buildSchedule(new Date(2026, 7, 17, 9, 0), wake)
    const meal3 = s.find((x) => x.key === 'meal3')!
    expect(meal3.at.getDate()).toBe(17)
    expect(meal3.at.getHours()).toBe(23)
  })

  it('起床直後は3食ぶん残っている', () => {
    expect(remainingMeals(wake, wake, 0)).toBe(3)
  })

  it('2食すませたら残りは1食', () => {
    const now = new Date(2026, 7, 17, 22, 0)
    expect(remainingMeals(wake, now, 2)).toBe(1)
  })

  it('★起床が20時なら、境界4:00まで7.5時間しかないので3食は入らない', () => {
    const late = new Date(2026, 7, 16, 20, 0)
    expect(remainingMeals(late, late, 0)).toBe(2)
  })

  it('★起床が23時なら 23:30 と 3:30 の2食まで', () => {
    const late = new Date(2026, 7, 16, 23, 0)
    expect(remainingMeals(late, late, 0)).toBe(2)
  })

  it('★境界直前（深夜3:50）はもう1食しか入らない', () => {
    const late = new Date(2026, 7, 16, 23, 0)
    expect(remainingMeals(late, new Date(2026, 7, 17, 3, 50), 1)).toBe(1)
  })
})
