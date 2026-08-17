import { describe, expect, it } from 'vitest'
import {
  addLogDays,
  isLateNight,
  logDateLabel,
  logDateRange,
  toLogDate,
  weekDates,
  weekStart,
} from '../src/core/dateBoundary'

/** ローカル時刻で Date を作る。new Date('...Z') は UTC ずれを起こすので使わない */
const at = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0)

describe('★日付境界 04:00 — 引き継ぎ書 §6 の4ケース', () => {
  it('8/17 23:59 → 8/17（そのまま）', () => {
    expect(toLogDate(at(2026, 8, 17, 23, 59))).toBe('2026-08-17')
  })

  it('8/18 00:00 → 8/17（前日に付ける）', () => {
    expect(toLogDate(at(2026, 8, 18, 0, 0))).toBe('2026-08-17')
  })

  it('8/18 03:59 → 8/17（前日に付ける）', () => {
    expect(toLogDate(at(2026, 8, 18, 3, 59))).toBe('2026-08-17')
  })

  it('8/18 04:00 → 8/18（ここから新しい1日）', () => {
    expect(toLogDate(at(2026, 8, 18, 4, 0))).toBe('2026-08-18')
  })
})

describe('トレ後の食事が両日の集計を壊さない', () => {
  it('24:30（＝翌0:30）の3食目は前日ぶんになる', () => {
    expect(toLogDate(at(2026, 8, 18, 0, 30))).toBe('2026-08-17')
  })

  it('同じ日の 19:00 の2食目と 0:30 の3食目が同じ log_date に入る', () => {
    const meal2 = toLogDate(at(2026, 8, 17, 19, 0))
    const meal3 = toLogDate(at(2026, 8, 18, 0, 30))
    expect(meal2).toBe(meal3)
  })

  it('月をまたぐ深夜も正しく前月末に付く', () => {
    expect(toLogDate(at(2026, 9, 1, 1, 0))).toBe('2026-08-31')
  })

  it('年をまたぐ深夜も正しく前年末に付く', () => {
    expect(toLogDate(at(2027, 1, 1, 2, 0))).toBe('2026-12-31')
  })
})

describe('境界時刻は設定で変えられる', () => {
  it('境界を 0 時にすると深夜の食事は当日ぶんになる', () => {
    expect(toLogDate(at(2026, 8, 18, 0, 30), 0)).toBe('2026-08-18')
  })

  it('境界を 5 時にすると 4:30 は前日ぶんになる', () => {
    expect(toLogDate(at(2026, 8, 18, 4, 30), 5)).toBe('2026-08-17')
  })
})

describe('★記録画面に「どの日の記録か」を明示する', () => {
  // 注: 仕様書とモックは 8/17 を「日」と書いているが、2026-08-17 は実際には月曜。
  //     曜日は Date から引くので、資料の誤記に合わせない。
  it('深夜0:30 は「8/17(月)の記録として保存されます」', () => {
    expect(logDateLabel(at(2026, 8, 18, 0, 30))).toBe('8/17(月)の記録として保存されます')
  })

  it('昼の13:35 は当日ぶん', () => {
    expect(logDateLabel(at(2026, 8, 17, 13, 35))).toBe('8/17(月)の記録として保存されます')
  })

  it('日曜の深夜ぶんは土曜に付く', () => {
    expect(logDateLabel(at(2026, 8, 16, 1, 0))).toBe('8/15(土)の記録として保存されます')
  })

  it('深夜ぶんかどうかを判定できる', () => {
    expect(isLateNight(at(2026, 8, 18, 0, 30))).toBe(true)
    expect(isLateNight(at(2026, 8, 17, 23, 30))).toBe(false)
  })
})

describe('log_date の実時刻レンジ', () => {
  it('8/17 は 8/17 4:00 〜 8/18 4:00', () => {
    const r = logDateRange('2026-08-17')
    expect(r.start.getDate()).toBe(17)
    expect(r.start.getHours()).toBe(4)
    expect(r.end.getDate()).toBe(18)
    expect(r.end.getHours()).toBe(4)
  })
})

describe('週（月曜始まり）', () => {
  it('日曜 8/16 が属する週は 8/10(月) 始まり', () => {
    expect(weekStart('2026-08-16')).toBe('2026-08-10')
  })

  it('月曜 8/17 はその日が週初め', () => {
    expect(weekStart('2026-08-17')).toBe('2026-08-17')
  })

  it('週は月曜から日曜の7日', () => {
    const d = weekDates('2026-08-16')
    expect(d).toHaveLength(7)
    expect(d[0]).toBe('2026-08-10')
    expect(d[6]).toBe('2026-08-16')
  })

  it('日付の加算が月をまたいでも壊れない', () => {
    expect(addLogDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addLogDays('2026-09-01', -1)).toBe('2026-08-31')
  })
})
