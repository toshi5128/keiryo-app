/**
 * 日付境界 04:00（仕様書 §5 / 引き継ぎ書 §6）。
 *
 * トレが24時に終わり、そこから3食目を食べる生活のため、0:30 の食事が翌日に
 * 計上されると前日・当日の両方の集計が壊れる。
 * ★集計は必ず logDate で行い、実時刻(eatenAt)は表示専用にとどめる。
 */

export const DEFAULT_BOUNDARY_HOUR = 4

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

/** Date → 'YYYY-MM-DD'（ローカル基準。toISOString は UTC ずれを起こすので使わない） */
export function formatLogDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 実時刻から、その記録が属する「1日」を決める。 */
export function toLogDate(eatenAt: Date, boundaryHour = DEFAULT_BOUNDARY_HOUR): string {
  const d = new Date(eatenAt.getTime())
  if (d.getHours() < boundaryHour) d.setDate(d.getDate() - 1)
  return formatLogDate(d)
}

/** 記録画面の明示ラベル: 「8/17(日)の記録として保存されます」 */
export function logDateLabel(eatenAt: Date, boundaryHour = DEFAULT_BOUNDARY_HOUR): string {
  const logDate = toLogDate(eatenAt, boundaryHour)
  const d = new Date(logDate + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_JA[d.getDay()]})の記録として保存されます`
}

/** その logDate が実時刻でどこからどこまでか */
export function logDateRange(logDate: string, boundaryHour = DEFAULT_BOUNDARY_HOUR) {
  const start = new Date(logDate + 'T00:00:00')
  start.setHours(boundaryHour, 0, 0, 0)
  const end = new Date(start.getTime())
  end.setDate(end.getDate() + 1)
  return { start, end }
}

/** その実時刻が「深夜ぶん（前日扱い）」か。UI の注意書き判定に使う */
export function isLateNight(eatenAt: Date, boundaryHour = DEFAULT_BOUNDARY_HOUR): boolean {
  return eatenAt.getHours() < boundaryHour
}

export function addLogDays(logDate: string, days: number): string {
  const d = new Date(logDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatLogDate(d)
}

/** その logDate が属する週の開始日（月曜始まり） */
export function weekStart(logDate: string): string {
  const d = new Date(logDate + 'T00:00:00')
  const dow = d.getDay() // 0=日
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return formatLogDate(d)
}

/** 週の7日ぶん（月曜〜日曜） */
export function weekDates(logDate: string): string[] {
  const start = weekStart(logDate)
  const out: string[] = []
  for (let i = 0; i < 7; i++) out.push(addLogDays(start, i))
  return out
}
