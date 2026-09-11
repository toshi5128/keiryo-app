/**
 * ★KEIRYO-HANDOFF-v4.md §18 の実績値（2026-09-06〜09-12）。
 *
 * これは架空のテストデータではなく実測値なので、初期データとして入れておく。
 * 入っていれば初日から7日平均が出る（7日たつまで判定が出ないと使い始めが苦しい）。
 *
 *   9/6   80.2
 *   9/7   80.8   ← 前日そぼろの醤油で塩分多め
 *   9/8   80.8
 *   9/9   79.6
 *   9/10  80.8   ← 前日塩分9.4g
 *   9/11  80.6
 *   9/12  80.6
 *
 * 7日平均（8/31〜9/6）80.57 ／ 前週 81.00 ／ −0.43 → 順調
 */

import type { WeighIn } from '../store'

/** 測定時刻は「起床後・トイレ後・食前・下着のみ」を満たした朝の記録として扱う */
const MORNING = 'T08:30:00'

interface SeedRow {
  logDate: string
  weightKg: number
  note?: string
}

const ROWS: SeedRow[] = [
  { logDate: '2026-09-06', weightKg: 80.2 },
  { logDate: '2026-09-07', weightKg: 80.8, note: '前日そぼろの醤油で塩分多め' },
  { logDate: '2026-09-08', weightKg: 80.8 },
  { logDate: '2026-09-09', weightKg: 79.6 },
  { logDate: '2026-09-10', weightKg: 80.8, note: '前日塩分9.4g' },
  { logDate: '2026-09-11', weightKg: 80.6 },
  { logDate: '2026-09-12', weightKg: 80.6 },
]

export const SEED_WEIGHTS: WeighIn[] = ROWS.map((r) => ({
  logDate: r.logDate,
  measuredAt: r.logDate + MORNING,
  weightKg: r.weightKg,
  bodyFatPct: null,
  skeletalMuscleKg: null,
  isReference: false,
  note: r.note,
}))

/** 前週の7日平均。§18 に記録が残っているぶん（個々の日次は残っていない） */
export const KNOWN_WEEKLY_AVERAGES = [
  { weekStart: '2026-08-24', weekEnd: '2026-08-30', avgKg: 81.0 },
  { weekStart: '2026-08-31', weekEnd: '2026-09-06', avgKg: 80.57 },
] as const

/** ベンチプレスの直近実績（v4 §7） */
export const KNOWN_BENCH = { logDate: '2026-09-08', weightKg: 125, reps: 1 } as const
