/**
 * ★固定週での比較（KEIRYO-HANDOFF-v4.md §7）
 *
 * 「移動窓ではなく固定週で比較する」。判定が毎日ぶれると、本人が何を信じてよいか
 * 分からなくなり、自己判断でカロリーを削りはじめる。それが一番の失敗パターン。
 */
import { describe, expect, it } from 'vitest'
import {
  MIN_DAYS_FOR_JUDGMENT,
  compareFixedWeeks,
  fixedWeekAverage,
  movingAverage,
  reviewWeek,
} from '../src/core/calc'
import type { WeighIn } from '../src/core/calc'
import { SEED_WEIGHTS } from '../src/data/seedWeights'

/** v4 §18 の実績（9/6〜9/12） */
const REAL: WeighIn[] = SEED_WEIGHTS.map((w) => ({
  logDate: w.logDate,
  weightKg: w.weightKg,
  isReference: w.isReference,
}))

const row = (logDate: string, weightKg: number): WeighIn => ({ logDate, weightKg })

describe('固定週の平均', () => {
  it('週の始まりから7日ぶんだけを平均する', () => {
    // 9/7(月)〜9/13(日)。実績は 9/7〜9/12 の6日ぶん
    const w = fixedWeekAverage(REAL, '2026-09-07')
    expect(w.weekStart).toBe('2026-09-07')
    expect(w.weekEnd).toBe('2026-09-13')
    expect(w.days).toBe(6)
    expect(w.avgKg).toBeCloseTo((80.8 + 80.8 + 79.6 + 80.8 + 80.6 + 80.6) / 6, 3)
  })

  it('週の外の測定は混ぜない', () => {
    const w = fixedWeekAverage(REAL, '2026-08-31')
    // 実績のうち 8/31〜9/6 に入るのは 9/6 の1件だけ
    expect(w.days).toBe(1)
    expect(w.avgKg).toBe(80.2)
  })

  it('参考値（測定条件を満たさない日）は除く', () => {
    const withRef: WeighIn[] = [
      row('2026-09-07', 80.0),
      { logDate: '2026-09-08', weightKg: 99.9, isReference: true },
    ]
    const w = fixedWeekAverage(withRef, '2026-09-07')
    expect(w.days).toBe(1)
    expect(w.avgKg).toBe(80.0)
  })

  it('1件も無い週は null', () => {
    expect(fixedWeekAverage(REAL, '2026-01-05').avgKg).toBeNull()
  })
})

describe('★固定週どうしの比較', () => {
  /**
   * 2週ぶん7日ずつそろったデータ。日々はバラつくが、週平均は 81.0 → 80.5（-0.5kg = 順調）。
   * 日々を一定にすると移動窓でもズレが出ず、固定週の意味を確かめられない。
   */
  const twoWeeks: WeighIn[] = [
    row('2026-08-31', 81.3),
    row('2026-09-01', 80.7),
    row('2026-09-02', 81.5),
    row('2026-09-03', 80.6),
    row('2026-09-04', 81.2),
    row('2026-09-05', 80.8),
    row('2026-09-06', 80.9),
    row('2026-09-07', 80.9),
    row('2026-09-08', 80.2),
    row('2026-09-09', 81.0),
    row('2026-09-10', 80.1),
    row('2026-09-11', 80.6),
    row('2026-09-12', 80.3),
    row('2026-09-13', 80.4),
  ]

  it('今週と前週の固定週を返す', () => {
    const c = compareFixedWeeks(twoWeeks, '2026-09-13')
    expect(c.thisWeek.weekStart).toBe('2026-09-07')
    expect(c.lastWeek.weekStart).toBe('2026-08-31')
    expect(c.ready).toBe(true)
    expect(c.thisWeek.avgKg).toBeCloseTo(80.5, 3)
    expect(c.lastWeek.avgKg).toBeCloseTo(81.0, 3)
  })

  it('判定は −0.5kg で「順調」になる', () => {
    const c = compareFixedWeeks(twoWeeks, '2026-09-13')
    const r = reviewWeek({ thisWeekAvgKg: c.thisWeek.avgKg!, lastWeekAvgKg: c.lastWeek.avgKg! })
    expect(r.verdict).toBe('on_track')
    expect(r.kcalAdjustment).toBe(0)
  })

  it('★週の途中は答えが動かない（火曜も金曜も同じ週を見る）', () => {
    const tue = compareFixedWeeks(twoWeeks, '2026-09-08')
    const fri = compareFixedWeeks(twoWeeks, '2026-09-11')
    expect(tue.thisWeek.weekStart).toBe(fri.thisWeek.weekStart)
    expect(tue.lastWeek.weekStart).toBe(fri.lastWeek.weekStart)
  })

  it('★移動窓と違って、日が変わっても前週の基準がずれない', () => {
    // 移動窓だと「7日前を終端にした平均」なので、日をまたぐたび基準が変わる
    const movingTue = movingAverage(twoWeeks, '2026-09-01', 7)
    const movingFri = movingAverage(twoWeeks, '2026-09-04', 7)
    expect(movingTue).not.toBe(movingFri)
    // 固定週は同じ
    const fixedTue = compareFixedWeeks(twoWeeks, '2026-09-08').lastWeek.avgKg
    const fixedFri = compareFixedWeeks(twoWeeks, '2026-09-11').lastWeek.avgKg
    expect(fixedTue).toBe(fixedFri)
  })

  it(`記録が ${MIN_DAYS_FOR_JUDGMENT} 日に満たない週は判定を出さず「集計中」と言う`, () => {
    const thin: WeighIn[] = [
      ...['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'].map((d) => row(d, 81.0)),
      row('2026-09-07', 80.5),
    ]
    const c = compareFixedWeeks(thin, '2026-09-08')
    expect(c.ready).toBe(false)
    expect(c.reason).toContain('集計中')
  })

  it('前週の記録が無ければ判定しない（初週に判定を出さない）', () => {
    const c = compareFixedWeeks([row('2026-09-07', 80.5)], '2026-09-08')
    expect(c.ready).toBe(false)
    expect(c.reason).toContain('前の週')
  })
})

describe('v4 §18 の実績値で確かめる', () => {
  it('9/6 は 80.2kg から始まっている', () => {
    expect(REAL[0]).toEqual({ logDate: '2026-09-06', weightKg: 80.2, isReference: false })
  })

  it('9/7〜9/12 の平均は 80.53kg', () => {
    expect(fixedWeekAverage(REAL, '2026-09-07').avgKg).toBeCloseTo(80.53, 2)
  })

  it('★判定は日々の増減ではなく平均で出す（9/9 の −1.2kg に引っ張られない）', () => {
    // 9/8 80.8 → 9/9 79.6 は1日で -1.2kg。これで「落としすぎ」と言ってはいけない
    const avg = fixedWeekAverage(REAL, '2026-09-07').avgKg!
    const r = reviewWeek({ thisWeekAvgKg: avg, lastWeekAvgKg: 81.0 })
    expect(r.verdict).toBe('on_track')
  })
})
