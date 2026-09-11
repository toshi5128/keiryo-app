/**
 * ★停滞したときの手の打ち方（KEIRYO-HANDOFF-v4.md §7 / §12）
 *
 * 判定は自動でも、実行は本人が選ぶ。ここはその「選択肢を組み立てる」ところ。
 *
 * ★引き継ぎ書が守れと言っていること：
 *   ・カロリー削減と有酸素追加を同時にやらない（どちらか一方）
 *   ・1週目の停滞では動かない。必ず2週連続を待つ
 *   ・削る順番は C → F → P。P は最後まで触らない
 *     （実際の計算は calc.applyAdjustment が C だけを動かす）
 *
 * なぜ全自動にしないか：
 *   -100kcal と 有酸素追加 は「どちらか一方」であって、どちらが正しいかは
 *   その週にジムへ行く時間があるかどうかで決まる。アプリには分からない。
 *   だからアプリは「2週連続で停滞しています。どちらか選んでください」までをやる。
 */

import { addLogDays, weekStart } from './dateBoundary'
import { applyAdjustment, fixedWeekAverage, MIN_DAYS_FOR_JUDGMENT } from './calc'
import type { ReviewResult, WeighIn } from './calc'
import type { NutritionPlan } from './types'

/** 打った手の種類 */
export type AdjustmentKind = 'kcal' | 'cardio'

/** ★いつ・なぜ・いくつに変えたかの記録。これが無いと3ヶ月後に理由が分からなくなる */
export interface AdjustmentLog {
  id: string
  /** 記録した日 */
  logDate: string
  /** どの週に対する手か（固定週の開始日） */
  weekStart: string
  kind: AdjustmentKind
  /** kcal のとき: 変更前後の目標 */
  fromKcal?: number
  toKcal?: number
  deltaKcal?: number
  /** なぜそうしたか。判定の文言をそのまま残す */
  reason: string
}

/** 画面に出す選択肢1つぶん */
export interface AdjustmentOption {
  kind: AdjustmentKind
  label: string
  /** 押したあとどうなるか */
  detail: string
  /** kcal のときの増減。有酸素は 0 */
  deltaKcal: number
  nextKcal?: number
}

export interface AdjustmentOffer {
  /** 選択肢を出すべきか */
  show: boolean
  title: string
  body: string
  options: AdjustmentOption[]
  /** 出さない／選ばせない理由（すでに今週打った、など） */
  note?: string
}

/**
 * ★前の週も停滞だったか。
 * 「1週目の停滞では動かない」を機械的に守るために、前週と前々週も比べる。
 */
export function wasStalledLastWeek(weighIns: WeighIn[], logDate: string): boolean {
  const lastStart = addLogDays(weekStart(logDate), -7)
  const beforeStart = addLogDays(lastStart, -7)
  const last = fixedWeekAverage(weighIns, lastStart)
  const before = fixedWeekAverage(weighIns, beforeStart)
  if (
    last.avgKg == null ||
    before.avgKg == null ||
    last.days < MIN_DAYS_FOR_JUDGMENT ||
    before.days < MIN_DAYS_FOR_JUDGMENT
  ) {
    // 判断できるだけの記録が無いなら「停滞していなかった」とみなす。
    // 記録不足を理由にカロリーを削るのは順序が逆。
    return false
  }
  const delta = Math.round((last.avgKg - before.avgKg) * 1000) / 1000
  return delta > -0.1
}

/**
 * ★骨格筋量の2週変化。安全弁（2週で -0.5kg 以上減ったら +200kcal）に使う。
 * 体組成計は機種が違えば比較できないので、★同じ機種どうしでしか比べない。
 */
export function skeletalMuscleChange2Weeks(
  weighIns: WeighIn[],
  logDate: string,
  deviceOf?: (w: WeighIn) => string | undefined
): number | null {
  const withSmm = weighIns
    .filter((w) => w.skeletalMuscleKg != null)
    .sort((a, b) => a.logDate.localeCompare(b.logDate))
  if (withSmm.length < 2) return null
  const latest = withSmm[withSmm.length - 1]
  const cutoff = addLogDays(logDate, -21)
  const of = deviceOf ?? ((x: WeighIn) => x.deviceName)
  const device = of(latest)
  const earlier = withSmm
    .slice(0, -1)
    .filter((w) => w.logDate >= cutoff)
    // ★機種が違う測定は比較しない（同じ日に13.7%と18.2%が出た実績がある）
    .filter((w) => (device == null ? true : of(w) === device))
  if (earlier.length === 0) return null
  const base = earlier[0]
  return Math.round((latest.skeletalMuscleKg! - base.skeletalMuscleKg!) * 100) / 100
}

/** その週にもう手を打っているか（同じ週に2回いじらない） */
export function alreadyAdjustedThisWeek(history: AdjustmentLog[], logDate: string): AdjustmentLog | null {
  const start = weekStart(logDate)
  return history.find((h) => h.weekStart === start) ?? null
}

/**
 * ★判定から「押せる選択肢」を組み立てる。
 *
 * 出るのは次の2場面だけ。
 *   ① 2週連続の停滞 → -100kcal か 有酸素、どちらか一方
 *   ② 落としすぎ／骨格筋が減った → 増やす（こちらは選択肢は1つ）
 */
export function buildAdjustmentOffer(
  review: ReviewResult | null,
  plan: NutritionPlan,
  history: AdjustmentLog[],
  logDate: string
): AdjustmentOffer {
  const none: AdjustmentOffer = { show: false, title: '', body: '', options: [] }
  if (!review) return none
  if (review.kcalAdjustment === 0) return none

  const done = alreadyAdjustedThisWeek(history, logDate)
  if (done) {
    return {
      show: true,
      title: '今週はもう手を打っています',
      body:
        done.kind === 'kcal'
          ? `${done.fromKcal?.toLocaleString()} → ${done.toKcal?.toLocaleString()}kcal に変更済みです。`
          : '有酸素を足す、で記録済みです。',
      options: [],
      note: '★1週間に2つ以上の手を同時に打ちません。効いたかどうかが分からなくなります。来週の判定を待ってください。',
    }
  }

  const next = applyAdjustment(plan, review.kcalAdjustment)
  const sign = review.kcalAdjustment > 0 ? '+' : ''
  const kcalOption: AdjustmentOption = {
    kind: 'kcal',
    label: `${sign}${review.kcalAdjustment}kcal にする`,
    detail:
      `目標が ${plan.kcal.toLocaleString()} → ${next.kcal.toLocaleString()}kcal になります。` +
      `動くのは炭水化物だけ（${plan.carbG}g → ${next.carbG}g）。` +
      `タンパク質 ${plan.proteinG}g と 脂質 ${plan.fatG}g は触りません。`,
    deltaKcal: review.kcalAdjustment,
    nextKcal: next.kcal,
  }

  // 増やす場面（落としすぎ・骨格筋が減った）は迷う余地がないので選択肢は1つ
  if (review.kcalAdjustment > 0) {
    return {
      show: true,
      title: review.message,
      body: '減らしすぎると筋肉から先に落ちます。ここは増やす一択です。',
      options: [kcalOption],
    }
  }

  // 停滞して減らす場面。★どちらか一方しか選べないことを明記する
  return {
    show: true,
    title: '2週連続で停滞しています',
    body: 'どちらか一方を選んでください。両方を同時にやると、どちらが効いたのか分からなくなります。',
    options: [
      kcalOption,
      {
        kind: 'cardio',
        label: '有酸素を足す',
        detail:
          '目標カロリーは変えません。週に2〜3回、20〜30分の有酸素を足して、来週の平均で確かめます。',
        deltaKcal: 0,
      },
    ],
    note: '★どちらを選んでも、効いたかどうかが分かるのは来週です。1週間は追加で何もしないでください。',
  }
}
