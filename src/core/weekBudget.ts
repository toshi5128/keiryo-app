/**
 * 週予算方式（仕様書 §6 / 引き継ぎ書 §7）。
 *
 * ★1日オーバーしても赤警告を出さない。週予算を超えた時だけ知らせる。
 * ★UI 文言に「オーバー」を使わない。「週予算から充当中」のような中立表現にする。
 * ★タンパク質だけは日次で独立評価。外食日も 170g は守る。
 */

import { addLogDays, weekDates, weekStart } from './dateBoundary'

export const DEFAULT_EAT_OUT_KCAL = 3000
/** 平日目標の丸め単位。切り捨てなので週合計は必ず予算内に収まる */
export const NORMAL_TARGET_STEP = 50

export interface WeekPlanInput {
  dailyTargetKcal: number
  /** 外食日の logDate 配列 */
  eatOutDates?: string[]
  eatOutKcal?: number
}

export interface WeekPlan {
  weeklyBudgetKcal: number
  eatOutDates: string[]
  eatOutKcal: number
  normalDays: number
  normalTargetKcal: number
  allocatedKcal: number
  slackKcal: number
  warnings: string[]
}

/**
 * 週予算を外食日と平日に配分する。
 * 例: 15,400 - 3,000 = 12,400 を 6日で割ると 2,066.7。
 *     50kcal 単位で「切り捨て」て 2,050（切り上げると予算を超える）。
 */
export function planWeek(input: WeekPlanInput): WeekPlan {
  const { dailyTargetKcal } = input
  const eatOutDates = input.eatOutDates ?? []
  const eatOutKcal = input.eatOutKcal ?? DEFAULT_EAT_OUT_KCAL
  const warnings: string[] = []
  const weeklyBudgetKcal = dailyTargetKcal * 7
  const normalDays = 7 - eatOutDates.length

  if (normalDays <= 0) {
    warnings.push('週の全日が外食日です。再配分できません')
    const allocated = eatOutKcal * eatOutDates.length
    return {
      weeklyBudgetKcal,
      eatOutDates,
      eatOutKcal,
      normalDays: 0,
      normalTargetKcal: 0,
      allocatedKcal: allocated,
      slackKcal: weeklyBudgetKcal - allocated,
      warnings,
    }
  }

  const remaining = weeklyBudgetKcal - eatOutKcal * eatOutDates.length
  const raw = remaining / normalDays
  const normalTargetKcal = Math.max(0, Math.floor(raw / NORMAL_TARGET_STEP) * NORMAL_TARGET_STEP)
  if (raw <= 0) {
    warnings.push('外食日の想定カロリーが週予算を食い尽くしています。想定値を見直してください')
  }

  const allocatedKcal = normalTargetKcal * normalDays + eatOutKcal * eatOutDates.length
  return {
    weeklyBudgetKcal,
    eatOutDates,
    eatOutKcal,
    normalDays,
    normalTargetKcal,
    allocatedKcal,
    slackKcal: weeklyBudgetKcal - allocatedKcal,
    warnings,
  }
}

/** その日の目標。外食日なら想定値、そうでなければ再配分後の平日目標 */
export function dailyTargetFor(plan: WeekPlan, logDate: string): number {
  return plan.eatOutDates.includes(logDate) ? plan.eatOutKcal : plan.normalTargetKcal
}

export interface Intake {
  logDate: string
  kcal: number
  proteinG?: number
}

export type WeekStatus = 'ok' | 'tight' | 'over'

/**
 * 週の進捗。★1日の超過は評価しない — 見るのは週予算だけ。
 */
export function weekProgress(plan: WeekPlan, intakes: Intake[], todayLogDate: string) {
  const dates = weekDates(todayLogDate)
  const consumedKcal = intakes.reduce(
    (sum, i) => (dates.includes(i.logDate) ? sum + i.kcal : sum),
    0
  )
  const remainingKcal = plan.weeklyBudgetKcal - consumedKcal
  const todayIndex = dates.indexOf(todayLogDate)
  const remainingDays = Math.max(0, 7 - todayIndex)
  const paceKcalPerDay = remainingDays > 0 ? remainingKcal / remainingDays : null

  let status: WeekStatus = 'ok'
  let message = `今週はあと ${Math.round(remainingKcal).toLocaleString()}kcal 使えます`
  if (remainingKcal < 0) {
    status = 'over'
    message = `今週の予算を ${Math.abs(Math.round(remainingKcal)).toLocaleString()}kcal 超えています`
  } else if (paceKcalPerDay != null && paceKcalPerDay < plan.normalTargetKcal * 0.9) {
    status = 'tight'
    message = `残り${remainingDays}日は1日 ${Math.round(paceKcalPerDay).toLocaleString()}kcal ペースです`
  }

  return {
    weekStartDate: weekStart(todayLogDate),
    weeklyBudgetKcal: plan.weeklyBudgetKcal,
    consumedKcal,
    remainingKcal,
    remainingDays,
    paceKcalPerDay,
    status,
    message,
  }
}

/**
 * ★外食日でもタンパク質だけは日次ノルマを維持する。
 * P のバーは週予算とは独立に、毎日それ単体で評価する。
 */
export function proteinStatusFor(dailyProteinTargetG: number, actualG: number) {
  return {
    targetG: dailyProteinTargetG,
    actualG,
    met: actualG >= dailyProteinTargetG,
    shortfallG: Math.max(0, dailyProteinTargetG - actualG),
  }
}

/** 週の平均日次カロリー。下限ガードはこの値で判定する */
export function weeklyAvgDailyKcal(plan: WeekPlan): number {
  return plan.weeklyBudgetKcal / 7
}

/** 曜日固定の外食日から、その週の logDate を求める。dayOfWeek は 0=日 〜 6=土 */
export function eatOutDateForWeek(anyLogDateInWeek: string, dayOfWeek: number): string {
  const monday = weekStart(anyLogDateInWeek)
  return addLogDays(monday, dayOfWeek === 0 ? 6 : dayOfWeek - 1)
}
