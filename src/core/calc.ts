/**
 * 目標PFCの算出（仕様書 §1 / 引き継ぎ書 §3）。
 *
 * ★係数はこのファイルにしか書かない。画面側は buildPlan の戻り値を正とする。
 * ATLAS(gym-app)の keiryo-calc.js を TypeScript へ移植したもの。
 * 移植元は 185 件のテストが通っている実績のあるコード。数式は変えていない。
 */

import type { NutritionPlan } from './types'

// ===========================================================================
// 係数（仕様書 §1）
// ===========================================================================

/** 骨格筋量 → 除脂肪体重の換算係数。実測 70.2 / 40.1 = 1.75（v1 の 1.85 は過大） */
export const SMM_TO_LBM = 1.75
/** タンパク質: 除脂肪体重 1kg あたり (g) */
export const PROTEIN_PER_LBM = 2.4
/** 脂質: 体重 1kg あたり (g) */
export const FAT_PER_BODYWEIGHT = 0.72
/** ★脂質の下限係数: 体重 1kg あたり (g)。ソルバーはここを絶対に割らない */
export const FAT_FLOOR_PER_BODYWEIGHT = 0.7
/** 炭水化物の下限 (g) */
export const CARB_FLOOR_G = 100
/** 標準の1日あたり赤字 (kcal)。50kcal 丸めの結果 2,735 - 550 → 2,200 に着地する */
export const DEFAULT_DEFICIT = 550
export const DEFAULT_ACTIVITY = 1.45
export const KCAL_P = 4
export const KCAL_F = 9
export const KCAL_C = 4

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'ほぼ運動なし（デスクワークのみ）' },
  { value: 1.375, label: '軽い運動 週1〜3回' },
  { value: 1.45, label: '筋トレ 週4〜5回 ＋ デスクワーク' },
  { value: 1.55, label: '中程度の運動 週3〜5回' },
  { value: 1.725, label: '激しい運動 ほぼ毎日 ＋ 競技' },
] as const

// ===========================================================================
// 丸め
// ===========================================================================

/** カロリーは 50kcal 単位（2,184.7 → 2,200） */
export function roundKcal(kcal: number, step = 50): number {
  return Math.round(kcal / step) * step
}

/** マクロは 5g 単位（168.5 → 170） */
export function roundMacro(g: number, step = 5): number {
  return Math.round(g / step) * step
}

// ===========================================================================
// 除脂肪体重 / BMR / TDEE
// ===========================================================================

export function lbmFromBodyFat(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100)
}

export function lbmFromSkeletalMuscle(smmKg: number): number {
  return smmKg * SMM_TO_LBM
}

export interface BodyInput {
  weightKg: number
  bodyFatPct?: number | null
  skeletalMuscleKg?: number | null
}

/**
 * 体脂肪率を最優先、無ければ骨格筋量から。
 * 0.1kg 単位に丸める（体組成計の表示精度に合わせる。丸めないと BMR が 1kcal ずれる）。
 */
export function resolveLbm(body: BodyInput): number {
  let raw: number | null = null
  if (body.bodyFatPct != null) raw = lbmFromBodyFat(body.weightKg, body.bodyFatPct)
  else if (body.skeletalMuscleKg != null) raw = lbmFromSkeletalMuscle(body.skeletalMuscleKg)
  if (raw == null) throw new Error('体脂肪率か骨格筋量のどちらかが必要です')
  return Math.round(raw * 10) / 10
}

/** Katch-McArdle */
export function bmrFromLbm(lbmKg: number): number {
  return 370 + 21.6 * lbmKg
}

export function tdeeFromBmr(bmr: number, activity: number): number {
  return bmr * activity
}

// ===========================================================================
// 目標カロリーと PFC
// ===========================================================================

/** ★P は LBM 基準、F は体重基準で先に確定し、残りをすべて C に回す。 */
export function macrosForCalories(targetKcal: number, lbmKg: number, weightKg: number) {
  const proteinG = roundMacro(lbmKg * PROTEIN_PER_LBM)
  const fatFloor = weightKg * FAT_FLOOR_PER_BODYWEIGHT
  const fatG = roundMacro(Math.max(weightKg * FAT_PER_BODYWEIGHT, fatFloor))
  const pKcal = proteinG * KCAL_P
  const fKcal = fatG * KCAL_F
  const carbG = Math.max(CARB_FLOOR_G, Math.round((targetKcal - pKcal - fKcal) / KCAL_C))
  return {
    kcal: targetKcal,
    proteinG,
    fatG,
    carbG,
    ratio: {
      protein: (pKcal / targetKcal) * 100,
      fat: (fKcal / targetKcal) * 100,
      carb: (carbG * KCAL_C) / targetKcal * 100,
    },
  }
}

export interface PlanInput {
  body: BodyInput
  activity?: number
  deficit?: number
  overrideKcal?: number
}

/** プロフィールから目標一式を組み立てる。画面はこの戻り値を正とする。 */
export function buildPlan(input: PlanInput): NutritionPlan {
  const activity = input.activity ?? DEFAULT_ACTIVITY
  const deficit = input.deficit ?? DEFAULT_DEFICIT
  const lbmKg = resolveLbm(input.body)
  const bmr = bmrFromLbm(lbmKg)
  const tdee = tdeeFromBmr(bmr, activity)
  const targetKcal = input.overrideKcal ?? roundKcal(tdee - deficit)
  const m = macrosForCalories(targetKcal, lbmKg, input.body.weightKg)
  return {
    lbmKg,
    bmr,
    tdee,
    kcal: m.kcal,
    proteinG: m.proteinG,
    fatG: m.fatG,
    carbG: m.carbG,
    fatFloorG: Math.round(input.body.weightKg * FAT_FLOOR_PER_BODYWEIGHT),
    ratio: m.ratio,
  }
}

// ===========================================================================
// ゴール（仕様書 §1 末尾）
// ===========================================================================

/**
 * ★目標体重は入力させない。目標体脂肪率から逆算する。
 * LBM を下回る体重は物理的に不可能なのでここで弾く。
 */
export function goalFromTargetBodyFat(
  lbmKg: number,
  currentWeightKg: number,
  targetBodyFatPct: number
) {
  if (targetBodyFatPct <= 0 || targetBodyFatPct >= 100) {
    throw new Error('目標体脂肪率は 0〜100% の範囲で入力してください')
  }
  const goalWeightKg = lbmKg / (1 - targetBodyFatPct / 100)
  if (goalWeightKg < lbmKg) throw new Error('除脂肪体重を下回る目標体重は設定できません')
  return { goalWeightKg, fatToLoseKg: currentWeightKg - goalWeightKg }
}

/**
 * 着地予定日。固定文字で焼き付けず、実データの週間ペースから毎回引き直す。
 * 減っていない（ペースが 0 以上）なら予測不能として null。
 */
export function projectLandingDate(
  currentWeightKg: number,
  goalWeightKg: number,
  weeklyChangeKg: number,
  from: Date
): { weeksRemaining: number; date: Date } | null {
  const toLose = currentWeightKg - goalWeightKg
  if (toLose <= 0) return { weeksRemaining: 0, date: new Date(from.getTime()) }
  if (weeklyChangeKg >= 0) return null
  const weeks = toLose / Math.abs(weeklyChangeKg)
  const d = new Date(from.getTime())
  d.setDate(d.getDate() + Math.round(weeks * 7))
  return { weeksRemaining: weeks, date: d }
}

// ===========================================================================
// 下限ガード
// ===========================================================================

export type SafetyLevel = 'ok' | 'warn' | 'blocked'

/**
 * カロリー設定の安全判定。
 *
 * 判定対象は「その日の目標」ではなく「週平均の1日あたり目標」。
 * 週予算方式では外食週の平日目標が 2,050kcal まで下がるが、日次で判定すると
 * 外食を予定するたびに毎週警告が出て、警告が意味を失う。
 */
export function evaluateCalorieSafety(weeklyAvgDailyKcal: number, bmr: number) {
  const warnThreshold = bmr * 1.1
  const stopThreshold = bmr
  const base = { evaluatedKcal: weeklyAvgDailyKcal, warnThreshold, stopThreshold }
  if (weeklyAvgDailyKcal < stopThreshold) {
    return {
      ...base,
      level: 'blocked' as SafetyLevel,
      message: `基礎代謝 ${Math.round(bmr)}kcal を下回る設定はできません`,
    }
  }
  if (weeklyAvgDailyKcal < warnThreshold) {
    return {
      ...base,
      level: 'warn' as SafetyLevel,
      message: `週平均が ${Math.round(warnThreshold)}kcal を下回っています。筋肉が落ちるリスクがあります`,
    }
  }
  return { ...base, level: 'ok' as SafetyLevel, message: undefined as string | undefined }
}

// ===========================================================================
// 週次レビュー（仕様書 §7 / 引き継ぎ書 §8）
// ===========================================================================

export type WeekVerdict = 'too_fast' | 'on_track' | 'slowing' | 'stalled'

export interface ReviewInput {
  thisWeekAvgKg: number
  lastWeekAvgKg: number
  /** 骨格筋量の2週変化。安全弁の判定に使う */
  smmChange2WeeksKg?: number | null
  /** 先週も停滞だったか。2週連続で初めて手を打つ */
  stalledLastWeek?: boolean
}

export interface ReviewResult {
  deltaKg: number
  verdict: WeekVerdict
  kcalAdjustment: number
  suggestCardio: boolean
  message: string
}

/** ★判断は生の体重では絶対に行わない。呼び出し側は必ず7日移動平均を渡すこと。 */
export function reviewWeek(input: ReviewInput): ReviewResult {
  // 浮動小数点の誤差対策。82.3 - 83.0 は -0.7000000000000028 になり、
  // 丸めないと「ちょうど -0.7kg（順調）」が「落としすぎ」に誤判定される。
  const deltaKg = Math.round((input.thisWeekAvgKg - input.lastWeekAvgKg) * 1000) / 1000

  // 実測ベースの安全弁: 骨格筋が2週で -0.5kg 以上減ったら最優先で増やす
  if (input.smmChange2WeeksKg != null && input.smmChange2WeeksKg <= -0.5) {
    return {
      deltaKg,
      verdict: 'too_fast',
      kcalAdjustment: 200,
      suggestCardio: false,
      message: '骨格筋量が2週で0.5kg以上減っています。+200kcal を強く推奨します',
    }
  }
  if (deltaKg < -0.7) {
    return {
      deltaKg,
      verdict: 'too_fast',
      kcalAdjustment: 150,
      suggestCardio: false,
      message: '落としすぎです。筋肉が減るリスクがあります。+150kcal を提案します',
    }
  }
  if (deltaKg <= -0.3) {
    return { deltaKg, verdict: 'on_track', kcalAdjustment: 0, suggestCardio: false, message: '順調です。変更なし' }
  }
  if (deltaKg <= -0.1) {
    return {
      deltaKg,
      verdict: 'slowing',
      kcalAdjustment: 0,
      suggestCardio: false,
      message: 'やや停滞。1週間は変更せず経過観察します',
    }
  }
  // 停滞。2週連続で初めて手を打つ。カロリー削減と有酸素は必ずどちらか一方
  if (!input.stalledLastWeek) {
    return {
      deltaKg,
      verdict: 'stalled',
      kcalAdjustment: 0,
      suggestCardio: false,
      message: '停滞しています。もう1週間ようすを見ます',
    }
  }
  return {
    deltaKg,
    verdict: 'stalled',
    kcalAdjustment: -100,
    suggestCardio: false,
    message: '2週連続で停滞。-100kcal か 有酸素の追加、どちらか一方を選んでください',
  }
}

/** ★カロリー調整は必ず C だけで行う。P と F はいかなる調整でも減らさない。 */
export function applyAdjustment(plan: NutritionPlan, kcalAdjustment: number) {
  const nextKcal = plan.kcal + kcalAdjustment
  const carbG = Math.max(CARB_FLOOR_G, plan.carbG + Math.round(kcalAdjustment / KCAL_C))
  const pKcal = plan.proteinG * KCAL_P
  const fKcal = plan.fatG * KCAL_F
  return {
    kcal: nextKcal,
    proteinG: plan.proteinG,
    fatG: plan.fatG,
    carbG,
    ratio: {
      protein: (pKcal / nextKcal) * 100,
      fat: (fKcal / nextKcal) * 100,
      carb: (carbG * KCAL_C) / nextKcal * 100,
    },
  }
}

export interface WeighIn {
  logDate: string
  weightKg: number
  /** 測定条件を満たさない「参考値」。移動平均から除外する */
  isReference?: boolean
}

/** 直近 windowDays 日の平均。参考値フラグの立った測定は除外する。 */
export function movingAverage(
  weighIns: WeighIn[],
  endLogDate: string,
  windowDays = 7
): number | null {
  const end = new Date(endLogDate + 'T00:00:00')
  const start = new Date(end.getTime())
  start.setDate(start.getDate() - (windowDays - 1))
  const inWindow = weighIns.filter((w) => {
    if (w.isReference) return false
    const d = new Date(w.logDate + 'T00:00:00')
    return d >= start && d <= end
  })
  if (inWindow.length === 0) return null
  return inWindow.reduce((s, w) => s + w.weightKg, 0) / inWindow.length
}
