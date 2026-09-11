/**
 * アプリの状態と保存。
 *
 * Phase 1 は localStorage に保存する（ATLAS と同じ方式）。
 * ログイン不要でその場から使えるのを優先した。Supabase 同期は Phase 2 で足す。
 * DB スキーマ(supabase/migrations/0001_init.sql)はこの形に合わせてある。
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { buildPlan } from './core/calc'
import type { NutritionPlan } from './core/types'
import type { Food } from './core/types'
import { formatLogDate, toLogDate, weekStart } from './core/dateBoundary'
import type { AdjustmentKind, AdjustmentLog } from './core/adjustment'
import { SEED_FOODS, SEED_VERSION } from './data/seedFoods'
import { SEED_WEIGHTS } from './data/seedWeights'
import {
  STANDARD_SHAKE_FOOD_ID,
  standardMealItems,
  standardShakeItem,
} from './core/standardMenu'

const KEY = 'keiryo.v1'

export interface Profile {
  heightCm: number
  weightKg: number
  bodyFatPct: number | null
  skeletalMuscleKg: number | null
  targetBodyFatPct: number
  activity: number
  deficit: number
  overrideKcal: number | null
  boundaryHour: number
  eatOutDow: number | null
  eatOutKcal: number
}

export interface MealLog {
  id: string
  foodId?: string
  name: string
  amount: number
  unit: string
  kcal: number
  proteinG: number
  fatG: number
  carbG: number
  saltG: number
  eatenAt: string
  logDate: string
  kind: 'meal' | 'eat_out' | 'sweet'
  /** 同じ1食としてまとめる鍵。1食目の P を測るのにこれを使う */
  groupId?: string
}

export interface WeighIn {
  logDate: string
  measuredAt: string
  weightKg: number
  bodyFatPct?: number | null
  skeletalMuscleKg?: number | null
  /** ★体組成計の機種名。機種が違うものを並べて比べない（v4 §9） */
  deviceName?: string
  isReference: boolean
  note?: string
}

export interface BenchLog {
  logDate: string
  weightKg: number
  reps: number
}

export interface DayInfo {
  wakeAt?: string
  trained?: boolean
}

/** 水分。★水・お茶・コーヒー・プロテイン・汁物の汁を数える（v4 §3） */
export interface WaterLog {
  id: string
  logDate: string
  amountMl: number
  loggedAt: string
}

export interface AppState {
  profile: Profile
  foods: Food[]
  meals: MealLog[]
  weights: WeighIn[]
  bench: BenchLog[]
  water: WaterLog[]
  /** ★停滞・落としすぎのときに打った手の履歴。いつ・なぜ・いくつに変えたか */
  adjustments: AdjustmentLog[]
  days: Record<string, DayInfo>
  /** 食材シードの版。上がっていたら食材だけ塗り直す */
  seedVersion?: number
}

/** 仕様書 §1 の実測値を初期値にする */
export const DEFAULT_PROFILE: Profile = {
  heightCm: 176,
  weightKg: 83.3,
  bodyFatPct: 15.7,
  skeletalMuscleKg: 40.1,
  targetBodyFatPct: 8,
  activity: 1.45,
  deficit: 550,
  overrideKcal: null,
  boundaryHour: 4,
  eatOutDow: null,
  eatOutKcal: 3000,
}

function initialState(): AppState {
  return {
    profile: { ...DEFAULT_PROFILE },
    foods: SEED_FOODS.map((f) => ({ ...f })),
    meals: [],
    // ★v4 §18 の実績値。初回から7日平均が出るように入れておく
    weights: SEED_WEIGHTS.map((w) => ({ ...w })),
    bench: [],
    water: [],
    adjustments: [],
    days: {},
    seedVersion: SEED_VERSION,
  }
}

/**
 * ★食材シードの版上げ。
 * v4 で そぼろの P が 22 → 28（調理後）に変わり、鶏ももが除外になった。
 * ローカル保存を素通しすると古い数値を使い続けてしまうので、シードの行は
 * 新しい値で上書きし、在庫スイッチと自分で足した食材だけ引き継ぐ。
 */
export function migrateFoods(saved: Food[] | undefined, savedVersion: number | undefined): Food[] {
  const seeds = SEED_FOODS.map((f) => ({ ...f }))
  if (!saved?.length) return seeds
  if (savedVersion === SEED_VERSION) return saved
  const seedIds = new Set(seeds.map((f) => f.id))
  const merged = seeds.map((seed) => {
    const old = saved.find((f) => f.id === seed.id)
    // 在庫は本人が切った状態なので引き継ぐ。栄養価と除外フラグはシードを正とする
    return old && old.inStock === false ? { ...seed, inStock: false } : seed
  })
  // 自分で足した食材は残す
  const userAdded = saved.filter((f) => !seedIds.has(f.id))
  return [...merged, ...userAdded]
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const base = initialState()
    return {
      profile: { ...base.profile, ...(parsed.profile ?? {}) },
      foods: migrateFoods(parsed.foods, parsed.seedVersion),
      meals: parsed.meals ?? [],
      weights: parsed.weights?.length ? parsed.weights : base.weights,
      bench: parsed.bench ?? [],
      water: parsed.water ?? [],
      adjustments: parsed.adjustments ?? [],
      days: parsed.days ?? {},
      seedVersion: SEED_VERSION,
    }
  } catch {
    return initialState()
  }
}

interface Store {
  state: AppState
  update: (fn: (s: AppState) => AppState) => void
  /** いま何の1日か（境界4:00基準） */
  today: string
  plan: NutritionPlan
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  // 日付が変わったことに気づけるよう1分ごとに現在時刻を引き直す
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const today = toLogDate(now, state.profile.boundaryHour)

  const plan = useMemo(
    () =>
      buildPlan({
        body: {
          weightKg: state.profile.weightKg,
          bodyFatPct: state.profile.bodyFatPct,
          skeletalMuscleKg: state.profile.skeletalMuscleKg,
        },
        activity: state.profile.activity,
        deficit: state.profile.deficit,
        overrideKcal: state.profile.overrideKcal ?? undefined,
      }),
    [state.profile]
  )

  const value = useMemo<Store>(
    () => ({
      state,
      update: (fn) => setState((s) => fn(s)),
      today,
      plan,
    }),
    [state, today, plan]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider の外で useStore を呼んでいます')
  return v
}

// ===========================================================================
// 便利関数
// ===========================================================================

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export function mealsOf(state: AppState, logDate: string): MealLog[] {
  return state.meals
    .filter((m) => m.logDate === logDate)
    .sort((a, b) => a.eatenAt.localeCompare(b.eatenAt))
}

export function sumMeals(meals: MealLog[]) {
  return meals.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      proteinG: a.proteinG + m.proteinG,
      fatG: a.fatG + m.fatG,
      carbG: a.carbG + m.carbG,
      saltG: a.saltG + (m.saltG || 0),
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0 }
  )
}

/** 食材と量から記録1件を作る。★栄養価はこの時点の値を写して持つ */
export function mealFromFood(
  food: Food,
  amount: number,
  boundaryHour: number,
  kind: MealLog['kind'] = 'meal',
  at = new Date()
): MealLog {
  const r = amount / food.baseAmount
  return {
    id: uid(),
    foodId: food.id,
    name: food.name,
    amount,
    unit: food.baseUnit,
    kcal: round1(food.kcal * r),
    proteinG: round1(food.proteinG * r),
    fatG: round1(food.fatG * r),
    carbG: round1(food.carbG * r),
    saltG: round1((food.saltG ?? 0) * r),
    eatenAt: at.toISOString(),
    logDate: toLogDate(at, boundaryHour),
    kind,
  }
}

export const round1 = (n: number) => Math.round(n * 10) / 10

/** 直近 n 日の logDate（新しい順） */
export function recentDates(endLogDate: string, n: number): string[] {
  const out: string[] = []
  const d = new Date(endLogDate + 'T00:00:00')
  for (let i = 0; i < n; i++) {
    out.push(formatLogDate(d))
    d.setDate(d.getDate() - 1)
  }
  return out
}

// ===========================================================================
// 水分（v4 §3）
// ===========================================================================

/** その日に飲んだ量(ml) */
export function waterOf(state: AppState, logDate: string): number {
  return state.water.filter((w) => w.logDate === logDate).reduce((n, w) => n + w.amountMl, 0)
}

export function makeWaterLog(amountMl: number, boundaryHour: number, at = new Date()): WaterLog {
  return {
    id: uid(),
    logDate: toLogDate(at, boundaryHour),
    amountMl,
    loggedAt: at.toISOString(),
  }
}

// ===========================================================================
// 1食のまとまり（★1食目のタンパク質を測るのに使う。v4 §12）
// ===========================================================================

/**
 * その日の記録を「1食ごと」に束ねる。
 * groupId があればそれで束ね、無い古い記録は「同じ時（hour）」で束ねる。
 * 戻り値は食べた順。甘いもの単品は食事として数えない。
 */
export function mealGroups(meals: MealLog[]): MealLog[][] {
  const buckets = new Map<string, MealLog[]>()
  for (const m of meals) {
    if (m.kind === 'sweet') continue
    const key = m.groupId ?? m.eatenAt.slice(0, 13)
    const list = buckets.get(key)
    if (list) list.push(m)
    else buckets.set(key, [m])
  }
  return [...buckets.values()].sort((a, b) => a[0].eatenAt.localeCompare(b[0].eatenAt))
}

/** ★1食目のタンパク質(g)。まだ何も食べていなければ null */
export function firstMealProteinG(meals: MealLog[]): number | null {
  const groups = mealGroups(meals)
  if (groups.length === 0) return null
  return round1(groups[0].reduce((n, m) => n + m.proteinG, 0))
}

/** その日の主菜（いちばん P を稼いだ食材）の id。飽きの検知に使う */
export function mainFoodIdOf(meals: MealLog[]): string | null {
  const byFood = new Map<string, number>()
  for (const m of meals) {
    if (!m.foodId || m.kind === 'sweet') continue
    if (m.foodId === STANDARD_SHAKE_FOOD_ID) continue
    byFood.set(m.foodId, (byFood.get(m.foodId) ?? 0) + m.proteinG)
  }
  let best: string | null = null
  let bestP = 0
  for (const [id, p] of byFood) {
    if (p > bestP) {
      best = id
      bestP = p
    }
  }
  return best
}

// ===========================================================================
// 標準メニューのワンタップ記録（v4 §4 / §12。最頻出の操作）
// ===========================================================================

/** 標準メニュー1食ぶんの記録を作る。1回のタップで4行まとめて入る */
export function standardMealLogs(state: AppState, at = new Date()): MealLog[] {
  const group = uid()
  return standardMealItems(state.foods).map((it) => ({
    ...mealFromFood(it.food, it.amount, state.profile.boundaryHour, 'meal', at),
    groupId: group,
  }))
}

/** プロテイン1杯ぶんの記録 */
export function standardShakeLog(state: AppState, at = new Date()): MealLog {
  const it = standardShakeItem(state.foods)
  return {
    ...mealFromFood(it.food, it.amount, state.profile.boundaryHour, 'meal', at),
    groupId: uid(),
  }
}

// ===========================================================================
// ★停滞したときに打つ手（v4 §7）
// ===========================================================================

/**
 * カロリーの目標を変え、履歴に残す。
 *
 * ★目標は profile.overrideKcal に入れる。体重が動いても勝手に戻らないようにするため
 *   （TDEE から引き直すと、せっかく下げた目標が翌週に元へ戻ってしまう）。
 *   自動計算に戻したいときは設定タブで「1日の目標」を空にする。
 */
export function applyKcalAdjustment(
  state: AppState,
  fromKcal: number,
  toKcal: number,
  reason: string,
  logDate: string
): AppState {
  const log: AdjustmentLog = {
    id: uid(),
    logDate,
    weekStart: weekStart(logDate),
    kind: 'kcal',
    fromKcal,
    toKcal,
    deltaKcal: toKcal - fromKcal,
    reason,
  }
  return {
    ...state,
    profile: { ...state.profile, overrideKcal: toKcal },
    adjustments: [log, ...state.adjustments],
  }
}

/** 有酸素を足す、を選んだときの記録。★目標カロリーは変えない */
export function recordCardioChoice(state: AppState, reason: string, logDate: string): AppState {
  const log: AdjustmentLog = {
    id: uid(),
    logDate,
    weekStart: weekStart(logDate),
    kind: 'cardio',
    reason,
  }
  return { ...state, adjustments: [log, ...state.adjustments] }
}

/** 打った手を取り消す（押し間違えたとき） */
export function undoAdjustment(state: AppState, id: string): AppState {
  const log = state.adjustments.find((a) => a.id === id)
  if (!log) return state
  const rest = state.adjustments.filter((a) => a.id !== id)
  if (log.kind !== 'kcal') return { ...state, adjustments: rest }
  // 1つ前の kcal 調整まで戻す。無ければ自動計算へ戻す
  const prevKcal = rest.find((a) => a.kind === 'kcal')?.toKcal ?? null
  return { ...state, profile: { ...state.profile, overrideKcal: prevKcal }, adjustments: rest }
}

export type { AdjustmentKind, AdjustmentLog }
