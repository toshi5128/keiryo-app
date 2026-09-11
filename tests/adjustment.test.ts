/**
 * ★停滞したときの手の打ち方（KEIRYO-HANDOFF-v4.md §7 / §12 / §16）
 *
 * ここが落ちたら「絶対に外してはいけないこと」を壊している：
 *   ✕ 停滞判定1週目でカロリーを削る提案をする
 *   ✕ カロリー削減と有酸素追加を同時に提案する
 *   ✕ P と F を削る
 */
import { describe, expect, it } from 'vitest'
import {
  alreadyAdjustedThisWeek,
  buildAdjustmentOffer,
  skeletalMuscleChange2Weeks,
  wasStalledLastWeek,
} from '../src/core/adjustment'
import type { AdjustmentLog } from '../src/core/adjustment'
import { buildPlan, reviewWeek } from '../src/core/calc'
import type { WeighIn } from '../src/core/calc'

const PLAN = buildPlan({ body: { weightKg: 83.3, bodyFatPct: 15.7 } })

/** 指定の週（月曜始まり）に7日ぶん同じ体重を並べる */
const week = (mondayISO: string, kg: number): WeighIn[] => {
  const out: WeighIn[] = []
  const d = new Date(mondayISO + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const x = new Date(d.getTime())
    x.setDate(x.getDate() + i)
    const pad = (n: number) => (n < 10 ? '0' : '') + n
    out.push({
      logDate: `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`,
      weightKg: kg,
    })
  }
  return out
}

// 8/17(月) / 8/24(月) / 8/31(月) / 9/7(月)
const W0831 = '2026-08-31'
const W0907 = '2026-09-07'
const TODAY = '2026-09-13' // 9/7の週の日曜

describe('★2週連続の停滞を待つ（1週目では動かない）', () => {
  it('前週も停滞していれば true', () => {
    // 8/24週 81.0 → 8/31週 81.0（動いていない＝停滞）
    const w = [...week('2026-08-24', 81.0), ...week(W0831, 81.0), ...week(W0907, 81.0)]
    expect(wasStalledLastWeek(w, TODAY)).toBe(true)
  })

  it('前週は順調に落ちていたなら false', () => {
    // 8/24週 81.5 → 8/31週 81.0（-0.5kg＝順調）
    const w = [...week('2026-08-24', 81.5), ...week(W0831, 81.0), ...week(W0907, 81.0)]
    expect(wasStalledLastWeek(w, TODAY)).toBe(false)
  })

  it('★記録が足りない週は「停滞していた」と決めつけない', () => {
    const w = [...week(W0831, 81.0), ...week(W0907, 81.0)]
    // 前々週(8/24)の記録が無い
    expect(wasStalledLastWeek(w, TODAY)).toBe(false)
  })

  it('★1週目の停滞ではカロリーを削る提案を出さない', () => {
    const r = reviewWeek({ thisWeekAvgKg: 81.0, lastWeekAvgKg: 81.0, stalledLastWeek: false })
    expect(r.kcalAdjustment).toBe(0)
    expect(buildAdjustmentOffer(r, PLAN, [], TODAY).show).toBe(false)
  })
})

describe('★2週連続で停滞 → どちらか一方を選ばせる', () => {
  const review = reviewWeek({ thisWeekAvgKg: 81.0, lastWeekAvgKg: 81.0, stalledLastWeek: true })
  const offer = buildAdjustmentOffer(review, PLAN, [], TODAY)

  it('選択肢が2つ出る', () => {
    expect(offer.show).toBe(true)
    expect(offer.options.map((o) => o.kind)).toEqual(['kcal', 'cardio'])
  })

  it('★「どちらか一方」と必ず書く（同時にやらせない）', () => {
    expect(offer.body).toContain('どちらか一方')
    expect(offer.note).toContain('1週間は追加で何もしない')
  })

  it('カロリーは -100kcal', () => {
    const k = offer.options[0]
    expect(k.deltaKcal).toBe(-100)
    expect(k.nextKcal).toBe(PLAN.kcal - 100)
  })

  it('★動くのは炭水化物だけ。P と F は触らないと明示する', () => {
    const d = offer.options[0].detail
    expect(d).toContain('炭水化物だけ')
    expect(d).toContain(`タンパク質 ${PLAN.proteinG}g`)
    expect(d).toContain(`脂質 ${PLAN.fatG}g`)
  })

  it('有酸素の側は目標カロリーを変えない', () => {
    const c = offer.options[1]
    expect(c.deltaKcal).toBe(0)
    expect(c.nextKcal).toBeUndefined()
    expect(c.detail).toContain('目標カロリーは変えません')
  })
})

describe('★落としすぎ・骨格筋が減った場面は「増やす」一択', () => {
  it('週 -0.9kg なら +150kcal の1択', () => {
    const r = reviewWeek({ thisWeekAvgKg: 80.1, lastWeekAvgKg: 81.0 })
    const offer = buildAdjustmentOffer(r, PLAN, [], TODAY)
    expect(offer.options).toHaveLength(1)
    expect(offer.options[0].deltaKcal).toBe(150)
  })

  it('骨格筋が2週で -0.5kg なら +200kcal の1択（安全弁）', () => {
    const r = reviewWeek({ thisWeekAvgKg: 80.8, lastWeekAvgKg: 81.0, smmChange2WeeksKg: -0.6 })
    const offer = buildAdjustmentOffer(r, PLAN, [], TODAY)
    expect(offer.options).toHaveLength(1)
    expect(offer.options[0].deltaKcal).toBe(200)
  })

  it('増やす場面では有酸素を選ばせない', () => {
    const r = reviewWeek({ thisWeekAvgKg: 80.1, lastWeekAvgKg: 81.0 })
    const offer = buildAdjustmentOffer(r, PLAN, [], TODAY)
    expect(offer.options.map((o) => o.kind)).not.toContain('cardio')
  })
})

describe('★同じ週に2つ以上の手を打たせない', () => {
  const done: AdjustmentLog[] = [
    {
      id: 'a1',
      logDate: '2026-09-08',
      weekStart: W0907,
      kind: 'kcal',
      fromKcal: 2200,
      toKcal: 2100,
      deltaKcal: -100,
      reason: '2週連続で停滞',
    },
  ]

  it('今週ぶんの記録があれば検出する', () => {
    expect(alreadyAdjustedThisWeek(done, TODAY)?.id).toBe('a1')
  })

  it('選択肢を出さず、理由を説明する', () => {
    const r = reviewWeek({ thisWeekAvgKg: 81.0, lastWeekAvgKg: 81.0, stalledLastWeek: true })
    const offer = buildAdjustmentOffer(r, PLAN, done, TODAY)
    expect(offer.show).toBe(true)
    expect(offer.options).toHaveLength(0)
    expect(offer.note).toContain('効いたかどうかが分からなくなります')
  })

  it('週が変われば また選べる', () => {
    const r = reviewWeek({ thisWeekAvgKg: 81.0, lastWeekAvgKg: 81.0, stalledLastWeek: true })
    const offer = buildAdjustmentOffer(r, PLAN, done, '2026-09-20')
    expect(offer.options.length).toBeGreaterThan(0)
  })
})

describe('★体組成計は機種をまたいで比べない（v4 §9）', () => {
  it('同じ機種どうしなら差を出す', () => {
    const w: WeighIn[] = [
      { logDate: '2026-09-01', weightKg: 81, skeletalMuscleKg: 40.5, deviceName: '自宅' },
      { logDate: '2026-09-12', weightKg: 80.6, skeletalMuscleKg: 39.9, deviceName: '自宅' },
    ]
    expect(skeletalMuscleChange2Weeks(w, TODAY)).toBeCloseTo(-0.6, 2)
  })

  it('★機種が違えば比較しない（13.7%と18.2%に割れた実績がある）', () => {
    const w: WeighIn[] = [
      { logDate: '2026-09-01', weightKg: 81, skeletalMuscleKg: 40.5, deviceName: 'FIT-EASY' },
      { logDate: '2026-09-12', weightKg: 80.6, skeletalMuscleKg: 39.9, deviceName: 'InBody' },
    ]
    expect(skeletalMuscleChange2Weeks(w, TODAY)).toBeNull()
  })

  it('記録が1件だけなら判断しない', () => {
    const w: WeighIn[] = [{ logDate: '2026-09-12', weightKg: 80.6, skeletalMuscleKg: 39.9 }]
    expect(skeletalMuscleChange2Weeks(w, TODAY)).toBeNull()
  })

  it('3週より古い記録とは比べない', () => {
    const w: WeighIn[] = [
      { logDate: '2026-07-01', weightKg: 83, skeletalMuscleKg: 41.0, deviceName: '自宅' },
      { logDate: '2026-09-12', weightKg: 80.6, skeletalMuscleKg: 39.9, deviceName: '自宅' },
    ]
    expect(skeletalMuscleChange2Weeks(w, TODAY)).toBeNull()
  })
})
