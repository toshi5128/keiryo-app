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
import { formatLogDate, toLogDate } from './core/dateBoundary'
import { SEED_FOODS } from './data/seedFoods'

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
}

export interface WeighIn {
  logDate: string
  measuredAt: string
  weightKg: number
  bodyFatPct?: number | null
  skeletalMuscleKg?: number | null
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

export interface AppState {
  profile: Profile
  foods: Food[]
  meals: MealLog[]
  weights: WeighIn[]
  bench: BenchLog[]
  days: Record<string, DayInfo>
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
    weights: [],
    bench: [],
    days: {},
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const base = initialState()
    return {
      profile: { ...base.profile, ...(parsed.profile ?? {}) },
      foods: parsed.foods?.length ? parsed.foods : base.foods,
      meals: parsed.meals ?? [],
      weights: parsed.weights ?? [],
      bench: parsed.bench ?? [],
      days: parsed.days ?? {},
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
