/**
 * ★水分変動の自動説明（仕様書 §7 / 引き継ぎ書 §8）
 *
 * 実運用で最も繰り返した説明がこれ。
 * これが無いと、ユーザーは毎回「なぜ増えたのか」を人に聞くことになり、
 * 説明が無いまま不安になって自己判断でカロリーを削り始める。それが一番の失敗パターン。
 *
 * 「脂肪1kg増えるには7,700kcalの黒字が必要」という一文は必ず添える。
 */

/** 脂肪 1kg に相当するカロリー */
export const KCAL_PER_FAT_KG = 7700
/** この幅を超えた増加のときに説明を出す */
export const EXPLAIN_THRESHOLD_KG = 0.5
/** 糖質 1g が保持する水分の目安(g) */
export const WATER_PER_CARB_G = 3

export interface DayContext {
  logDate: string
  /** その日の摂取 */
  kcal: number
  carbG: number
  saltG: number
  trained: boolean
  ateOut: boolean
  /** 体重を測った時刻（時。9.5 = 9:30） */
  measuredHour?: number | null
}

export interface ExplainInput {
  /** 今日の体重 */
  todayKg: number
  /** 前日の体重 */
  yesterdayKg: number
  /** 前日の食事・トレの状況 */
  yesterday: DayContext
  /** 直近の平均。「普段より多い」の基準にする */
  baseline: { carbG: number; saltG: number }
  /** 今日の測定時刻（時） */
  todayMeasuredHour?: number | null
}

export interface ExplainResult {
  deltaKg: number
  /** 説明を出すべきか */
  shouldExplain: boolean
  /** 推定した理由 */
  reasons: string[]
  /** 必ず添える一文 */
  reassurance: string
  /** 脂肪だとしたら必要だった黒字 */
  requiredSurplusKcal: number
}

/**
 * 前日比 +0.5kg 以上のときに、理由を推定して並べる。
 * 断定はしない。「〜の可能性」という言い方に統一する。
 */
export function explainWeightChange(input: ExplainInput): ExplainResult {
  const deltaKg = Math.round((input.todayKg - input.yesterdayKg) * 100) / 100
  const y = input.yesterday
  const reasons: string[] = []

  if (y.saltG > input.baseline.saltG * 1.3 && y.saltG > 0) {
    reasons.push(
      `前日の塩分が普段より多め（${y.saltG.toFixed(1)}g / 普段 ${input.baseline.saltG.toFixed(1)}g）です。塩分による水分保持の可能性があります`
    )
  }
  if (y.carbG > input.baseline.carbG * 1.2 && y.carbG > 0) {
    const extraCarb = Math.round(y.carbG - input.baseline.carbG)
    const water = (extraCarb * WATER_PER_CARB_G) / 1000
    reasons.push(
      `前日の炭水化物が普段より ${extraCarb}g 多いです。糖質1gにつき水を約3g保持するため、${water.toFixed(1)}kg ほどは水分です`
    )
  }
  if (y.trained) {
    reasons.push('前日にトレーニングがあります。筋の修復による水分貯留が起きます')
  }
  if (y.ateOut) {
    reasons.push('前日に外食の記録があります。外食後は +1〜1.5kg 出ますが、通常メニューに戻せば3日ほどで戻ります')
  }
  if (
    input.todayMeasuredHour != null &&
    y.measuredHour != null &&
    Math.abs(input.todayMeasuredHour - y.measuredHour) >= 2
  ) {
    reasons.push(
      `測定時刻が前日と ${Math.abs(input.todayMeasuredHour - y.measuredHour).toFixed(1)} 時間ずれています。測定条件の差の可能性があります`
    )
  }

  // 前日の食事が1件も記録されていないときに「摂取0kcal」と書くと嘘になる
  const hasIntake = y.kcal > 0
  if (!hasIntake) {
    reasons.push('前日の食事が記録されていません。記録があると理由をもっと絞り込めます')
  }

  const requiredSurplusKcal = Math.round(Math.max(0, deltaKg) * KCAL_PER_FAT_KG)
  const reassurance =
    deltaKg > 0
      ? `脂肪が ${deltaKg.toFixed(1)}kg 増えるには ${requiredSurplusKcal.toLocaleString()}kcal の黒字が必要です。` +
        (hasIntake
          ? `前日の摂取は ${Math.round(y.kcal).toLocaleString()}kcal なので、これは脂肪ではありません。`
          : '1日でそれだけ食べるのは現実的ではないので、これは脂肪ではありません。')
      : ''

  return {
    deltaKg,
    shouldExplain: deltaKg >= EXPLAIN_THRESHOLD_KG,
    reasons: reasons.length > 0 ? reasons : ['はっきりした心当たりはありません。数日ならしてから判断してください'],
    reassurance,
    requiredSurplusKcal,
  }
}

// ===========================================================================
// ベンチプレス（体組成計より確実な筋量の指標）
// ===========================================================================

/** 基準: ベンチプレス 100kg × 7回 */
export const BENCH_BASELINE = { weightKg: 100, reps: 7 }

export type BenchVerdict = 'holding' | 'slight_drop' | 'big_drop'

/**
 * 体重が動かないときに「重量が上がっているなら筋肉は落ちていない」と言えるようにする。
 * 不安を減らすのが目的なので、断定的に落ちたとは言わない。
 */
export function judgeBench(current: { weightKg: number; reps: number } | null) {
  if (!current) {
    return {
      verdict: 'holding' as BenchVerdict,
      kcalAdjustment: 0,
      message: 'ベンチプレスの記録を入れると、筋肉が落ちていないかを体重より確実に見られます',
    }
  }
  // 同じ重量での回数、または重量そのもので比較する
  const sameWeight = current.weightKg >= BENCH_BASELINE.weightKg
  if (!sameWeight) {
    return {
      verdict: 'big_drop' as BenchVerdict,
      kcalAdjustment: 200,
      message: `基準の ${BENCH_BASELINE.weightKg}kg を扱えていません。減量の一時停止を検討してください`,
    }
  }
  if (current.reps >= BENCH_BASELINE.reps) {
    return {
      verdict: 'holding' as BenchVerdict,
      kcalAdjustment: 0,
      message: '重量が落ちていないので筋肉は落ちていません。体重が動かなくても設計は正しいです',
    }
  }
  if (current.reps >= 5) {
    return {
      verdict: 'slight_drop' as BenchVerdict,
      kcalAdjustment: 150,
      message: `${BENCH_BASELINE.weightKg}kg が ${current.reps}回に落ちています。+150〜200kcal を提案します`,
    }
  }
  return {
    verdict: 'big_drop' as BenchVerdict,
    kcalAdjustment: 200,
    message: `${BENCH_BASELINE.weightKg}kg が ${current.reps}回まで落ちています。減量の一時停止を検討してください`,
  }
}

// ===========================================================================
// 起床からの相対スケジュール（仕様書 §2）
// ===========================================================================

/** 起床を起点にした相対時間。時刻固定のリマインダーは機能しない */
export const SCHEDULE_OFFSETS_H = [
  { key: 'meal1', label: '1食目', hours: 0.5 },
  { key: 'protein', label: 'プロテイン', hours: 4.5 },
  { key: 'meal2', label: '2食目', hours: 8 },
  { key: 'train', label: 'トレーニング', hours: 12 },
  { key: 'meal3', label: '3食目', hours: 14.5 },
] as const

export interface ScheduleSlot {
  key: string
  label: string
  at: Date
  isMeal: boolean
  past: boolean
}

/** 起床時刻から、その日の予定を組む */
export function buildSchedule(wakeAt: Date, now: Date): ScheduleSlot[] {
  return SCHEDULE_OFFSETS_H.map((s) => {
    const at = new Date(wakeAt.getTime() + s.hours * 3600 * 1000)
    return {
      key: s.key,
      label: s.label,
      at,
      isMeal: s.key.startsWith('meal'),
      past: at.getTime() <= now.getTime(),
    }
  })
}

/**
 * 起床時刻と現在時刻から、★今日のうちにまだ食べられる食事の回数を出す。
 *
 * 日付境界(既定4:00)をまたいだ食事は「明日ぶん」なので数えない。
 * これがあるので「起床20時 → 今日は実質1食」が自動的に出る。
 */
export function remainingMeals(
  wakeAt: Date,
  now: Date,
  eatenCount: number,
  boundaryHour = 4,
  totalMeals = 3
): number {
  // now が属する1日の終わり（＝次の境界時刻）
  const dayEnd = new Date(now.getTime())
  if (dayEnd.getHours() >= boundaryHour) dayEnd.setDate(dayEnd.getDate() + 1)
  dayEnd.setHours(boundaryHour, 0, 0, 0)

  // 次に食べられるのは「起床30分後」か「今」の遅いほう
  const first = Math.max(now.getTime(), wakeAt.getTime() + 0.5 * 3600 * 1000)
  if (first >= dayEnd.getTime()) return 0

  const hoursLeft = (dayEnd.getTime() - first) / 3600 / 1000
  const fits = 1 + Math.floor(hoursLeft / MIN_MEAL_GAP_H)
  return Math.max(0, Math.min(totalMeals - eatenCount, fits))
}

/** 食事と食事のあいだの最低間隔(時間)。これ以上詰めても現実に食べられない */
export const MIN_MEAL_GAP_H = 4
