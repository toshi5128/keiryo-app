/**
 * ★ソルバー — このアプリの心臓部（仕様書 §4 / 引き継ぎ書 §4）
 *
 * 足し算で積み上げるのではなく、目標から引いて主菜の量を「逆算」する。
 * 参照実装は keiryo-mock.html の solve()。以下3点だけ意図的に直している：
 *
 *   ①【順序】甘いもの・外食を「米で埋める」より前に確定する。
 *     モックは米の計算の後に甘いものを足していたため、羊羹を食べても米が減らず
 *     145kcal がそのまま上乗せされていた（看板機能が効いていなかった）。
 *   ②【下限】脂質はオイル1杯を足して終わりではなく、下限を満たすまで足す。
 *     モックは鶏もも切れの場面で F 50.5g（下限58g）まで落ちていた。
 *   ③【候補】主菜を ID 直書き(['momo','sobo','sake'])ではなくカテゴリから選ぶ。
 *     直書きだと食材を50種に増やしても主菜の幅が広がらない（§3の設計思想と矛盾）。
 *
 * 仕様書の数値（下限58g・1食P上限80g・max_amount・刻み幅）は変更していない。
 */

import type { Food, Macros, MealPlan, PlanItem } from './types'

/** 【絶対】1食の P がこれを超えない（吸収されず無駄になる） */
export const MAX_PROTEIN_PER_MEAL_G = 80
/** 【推奨】1食の P の理想レンジ */
export const IDEAL_PROTEIN_PER_MEAL_G = { min: 35, max: 45 }
/** 各食に置く野菜の量(g)（仕様書 §4-4） */
export const VEG_PER_MEAL_G = 150
/** P が目標に対してこの範囲に収まれば達成とみなす(g) */
export const PROTEIN_TOLERANCE_G = 5
/** プロテインの追加は最大3杯まで */
const MAX_WHEY_SCOOPS = 3
/** 逆算の収束回数。米の見込み量と実量のズレを埋める */
const FIXPOINT_PASSES = 6

export const ZERO: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, saltG: 0 }

// ===========================================================================
// 小道具
// ===========================================================================

/** 食材を amount(baseUnit単位) だけ食べたときの栄養価 */
export function macrosOf(food: Food, amount: number): Macros {
  const r = amount / food.baseAmount
  return {
    kcal: food.kcal * r,
    proteinG: food.proteinG * r,
    fatG: food.fatG * r,
    carbG: food.carbG * r,
    saltG: (food.saltG ?? 0) * r,
  }
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    fatG: a.fatG + b.fatG,
    carbG: a.carbG + b.carbG,
    saltG: a.saltG + b.saltG,
  }
}

export function tally(items: PlanItem[]): Macros {
  return items.reduce((acc, it) => addMacros(acc, macrosOf(it.food, it.amount)), { ...ZERO })
}

function roundToStep(value: number, step: number): number {
  if (!step || step <= 0) return Math.round(value)
  return Math.round(value / step) * step
}

/** ★除外食材と在庫切れはここで落とす。ソルバーはこの関数を通したものしか触らない。 */
export function usableFoods(foods: Food[]): Food[] {
  return foods.filter((f) => !f.isExcluded && f.inStock !== false)
}

const byId = (foods: Food[], id: string): Food | undefined => foods.find((f) => f.id === id)

/** 1単位あたりの P。主菜の量を逆算するときの割り算の分母になる */
function proteinPerUnit(food: Food): number {
  return food.proteinG / food.baseAmount
}

// ===========================================================================
// 入出力
// ===========================================================================

export interface SolveTarget {
  kcal: number
  proteinG: number
  fatG: number
  carbG: number
  /** ★脂質の下限 = 体重 × 0.7。ここを絶対に割らない */
  fatFloorG: number
}

export interface SolveInput {
  target: SolveTarget
  /** すでに食べた分（外食ぶんもここに入れる） */
  eaten?: Partial<Macros>
  /** 残りの食事回数。起床が遅れた日は 1 になる */
  mealCount: number
  /** 食材マスタ全件。除外・在庫の判定はソルバー内で行う */
  foods: Food[]
  /** 「食べたい」と指定された甘いものの id。最後の食事に先に差し込む */
  wants?: string[]
  /** 1食の P 上限（既定 80g） */
  maxProteinPerMeal?: number
}

export interface SolveResult {
  meals: MealPlan[]
  /** 提案ぶんの合計 */
  totals: Macros
  /** すでに食べた分を含む1日の合計 */
  dayTotals: Macros
  /** 主菜として選ばれた食材（画面のログ用） */
  mainFood: Food | null
  mainAmountPerMeal: number
  /** 主食(米)の合計g。「ご飯を90g減らしました」の差分計算に使う */
  riceTotalG: number
  /** 届かなかった分。起床が遅れた日はここが埋まる */
  shortfall: { proteinG: number; kcal: number; fatG: number }
  /** 制約をすべて満たせたか */
  feasible: boolean
  /** 破ってしまった制約。空であるべき。空でなければ画面に理由を出す */
  violations: string[]
  /** 画面にそのまま出せる説明文 */
  notes: string[]
}

// ===========================================================================
// 本体
// ===========================================================================

export function solve(input: SolveInput): SolveResult {
  const maxPPerMeal = input.maxProteinPerMeal ?? MAX_PROTEIN_PER_MEAL_G
  const mealCount = Math.max(0, Math.floor(input.mealCount))
  const eaten: Macros = { ...ZERO, ...input.eaten }
  const pool = usableFoods(input.foods)

  if (mealCount === 0) {
    return finish([], pool, input, eaten, null, 0, [])
  }

  // -------------------------------------------------------------------
  // 0. 残りを出す ＋ ★食べたい甘いものを先に確定する（モックはここが最後だった）
  // -------------------------------------------------------------------
  const sweets: PlanItem[] = []
  for (const id of input.wants ?? []) {
    const f = byId(pool, id)
    if (!f) continue
    sweets.push({ food: f, amount: f.baseAmount, unit: f.baseUnit })
  }

  // -------------------------------------------------------------------
  // 1. 量が固定のものを先に置く（卵1個/食・野菜150g/食・最後の食事に納豆1P）
  // -------------------------------------------------------------------
  const fixedPerMeal: PlanItem[][] = Array.from({ length: mealCount }, () => [])
  const egg = byId(pool, 'egg')
  const natto = byId(pool, 'natto')
  for (let i = 0; i < mealCount; i++) {
    if (egg) fixedPerMeal[i].push({ food: egg, amount: 1, unit: egg.baseUnit })
    // 野菜は食ごとに顔ぶれをずらす（毎食ブロッコリー150g だと続かない）
    fixedPerMeal[i].push(...pickVegetables(pool, VEG_PER_MEAL_G, i))
  }
  if (natto) {
    const last = mealCount - 1
    fixedPerMeal[last].push({ food: natto, amount: 1, unit: natto.baseUnit })
  }
  // 甘いものは最後の食事へ
  fixedPerMeal[mealCount - 1].push(...sweets)

  // -------------------------------------------------------------------
  // 2. 主菜を選ぶ（★カテゴリから動的に。ID 直書きをやめた）
  // -------------------------------------------------------------------
  const main = pickMainDish(pool, fixedPerMeal.flat())
  const rice = pickStaple(pool)

  const restP = input.target.proteinG - eaten.proteinG
  const restKcal = input.target.kcal - eaten.kcal

  // -------------------------------------------------------------------
  // 3〜6. 主菜量の逆算 → 脂質の下限 → 米で残りkcal を埋める
  //   米の量は主菜の量に影響し、主菜の量は米の量に影響する（P が絡むため）。
  //   見込み値から始めて数回まわし、ズレが無くなるまで収束させる。
  // -------------------------------------------------------------------
  let riceGuess = 0
  let built = buildMeals(0)
  for (let pass = 0; pass < FIXPOINT_PASSES; pass++) {
    const next = buildMeals(riceGuess)
    if (Math.abs(next.riceTotal - riceGuess) < 10) {
      built = next
      break
    }
    riceGuess = next.riceTotal
    built = next
  }

  return finish(built.meals, pool, input, eaten, main, built.mainEach, built.notes)

  /** 米の合計量を仮に riceTotal と置いたときの献立を1回ぶん組み立てる */
  function buildMeals(riceTotalGuess: number) {
    const notes: string[] = []
    const meals: PlanItem[][] = fixedPerMeal.map((items) => [...items])

    // 米に含まれる P の見込み。主菜の量はこれを差し引いて逆算する
    const riceGuessP = rice ? macrosOf(rice, riceTotalGuess).proteinG : 0
    /** その時点の1日の P（すでに食べた分＋献立＋米の見込み） */
    const dayProtein = () => eaten.proteinG + tally(meals.flat()).proteinG + riceGuessP

    // --- 3. 主菜の量を逆算する ---
    // 1食 80g の上限があるので、そもそも今日ここまでしか到達できない、という
    // 上限を先に出しておく。届かない日に無理な量を積まないための歯止め。
    const reachableP = maxPPerMeal * mealCount
    const aimP = Math.min(restP, reachableP)

    let mainEach = 0
    if (main) {
      const perUnit = proteinPerUnit(main)
      const step = main.stepAmount ?? 1
      const needFromMain = aimP - (tally(meals.flat()).proteinG + riceGuessP)
      mainEach = Math.max(0, roundToStep(needFromMain / perUnit / mealCount, step))
      if (main.maxAmount != null) mainEach = Math.min(mainEach, main.maxAmount)
      for (let i = 0; i < mealCount; i++) {
        if (mainEach > 0) meals[i].unshift({ food: main, amount: mainEach, unit: main.baseUnit })
      }
    }

    // --- 3b. 主菜が上限に当たって足りないぶんをプロテインで補う ---
    //     ただし 1食 80g の枠に収まる範囲まで。最大3杯。
    const wheyFood = byId(pool, 'whey')
    let whey = 0
    if (wheyFood) {
      const wheyP = macrosOf(wheyFood, wheyFood.baseAmount).proteinG
      // dayProtein() は「すでに食べた分」を含む1日の合計なので、
      // 比較相手も1日の目標(target.proteinG)にする。restP と比べると外食日に足りなくなる。
      while (whey < MAX_WHEY_SCOOPS && dayProtein() < input.target.proteinG - PROTEIN_TOLERANCE_G) {
        // 一番 P が少ない食に足す
        let slot = 0
        for (let i = 1; i < mealCount; i++) {
          if (tally(meals[i]).proteinG < tally(meals[slot]).proteinG) slot = i
        }
        if (tally(meals[slot]).proteinG + wheyP > maxPPerMeal) break
        const existing = meals[slot].find((it) => it.food.id === wheyFood.id)
        if (existing) existing.amount += wheyFood.baseAmount
        else meals[slot].push({ food: wheyFood, amount: wheyFood.baseAmount, unit: wheyFood.baseUnit })
        whey++
      }
      if (whey > 0 && main) {
        notes.push(
          `主菜だけでは足りないぶん（${main.name} は1食 ${main.maxAmount}${main.baseUnit} まで）を、` +
            `プロテイン${whey}杯で補いました`
        )
      }
    }

    // --- 4. ★1食の P が上限(80g)を超えないよう削る。プロテイン → 主菜 の順 ---
    let trimmed = false
    for (let i = 0; i < mealCount; i++) {
      let guard = 0
      while (tally(meals[i]).proteinG + riceGuessP / mealCount > maxPPerMeal && guard++ < 300) {
        const wheyItem = meals[i].find((it) => it.food.id === 'whey' && it.amount > 0)
        if (wheyItem) {
          wheyItem.amount -= 1
          trimmed = true
          continue
        }
        const mainItem = main ? meals[i].find((it) => it.food.id === main.id) : undefined
        if (mainItem && mainItem.amount > 0) {
          mainItem.amount = Math.max(0, mainItem.amount - (main!.stepAmount ?? 1))
          trimmed = true
          continue
        }
        break
      }
    }
    if (trimmed) {
      notes.push(`1食のタンパク質が ${maxPPerMeal}g を超えないよう量を抑えました`)
    }

    // --- 5. ★脂質が下限を割る間、脂質源を足し続ける（モックは1杯で打ち切っていた） ---
    const fatSource = pool.find((f) => f.category === 'fat')
    if (fatSource) {
      const perUnitFat = macrosOf(fatSource, fatSource.baseAmount).fatG
      let guard = 0
      while (guard < 24) {
        const dayFat = eaten.fatG + tally(meals.flat()).fatG
        if (dayFat >= input.target.fatFloorG - 0.5) break
        if (perUnitFat <= 0) break
        const slot = guard % mealCount
        const existing = meals[slot].find((it) => it.food.id === fatSource.id)
        const nextAmount = (existing?.amount ?? 0) + fatSource.baseAmount
        if (fatSource.maxAmount != null && nextAmount > fatSource.maxAmount) {
          guard++
          continue
        }
        if (existing) existing.amount = nextAmount
        else meals[slot].push({ food: fatSource, amount: fatSource.baseAmount, unit: fatSource.baseUnit })
        guard++
      }
    }

    // --- 6. 残り kcal を主食で埋める（刻み幅で丸める） ---
    let riceTotal = 0
    if (rice) {
      const kcalPerUnit = rice.kcal / rice.baseAmount
      const consumed = tally(meals.flat()).kcal
      const step = rice.stepAmount ?? 10
      riceTotal = Math.max(0, roundToStep((restKcal - consumed) / kcalPerUnit, step))
      const cap = (rice.maxAmount ?? Infinity) * mealCount
      riceTotal = Math.min(riceTotal, cap)

      // 配分。トレ後の最後の食事をやや厚くする
      const shares = splitRice(riceTotal, mealCount, step, rice.maxAmount ?? Infinity)
      for (let i = 0; i < mealCount; i++) {
        if (shares[i] > 0) {
          const insertAt = meals[i].findIndex((it) => main && it.food.id === main.id) + 1
          meals[i].splice(Math.max(0, insertAt), 0, { food: rice, amount: shares[i], unit: rice.baseUnit })
        }
      }
      riceTotal = shares.reduce((a, b) => a + b, 0)
    }

    // 削った結果を反映した実際の1食あたりの主菜量を返す
    const actualMain = main ? meals[0].find((it) => it.food.id === main.id)?.amount ?? 0 : 0
    return { meals, mainEach: actualMain || mainEach, riceTotal, notes }
  }
}

// ===========================================================================
// 部品
// ===========================================================================

/** 各食の野菜。150g に届くまで、主力の野菜から順に積む。rotate で食ごとに顔ぶれをずらす */
function pickVegetables(pool: Food[], gramsPerMeal: number, rotate = 0): PlanItem[] {
  const sorted = pool
    .filter((f) => f.category === 'veg' && f.baseUnit === 'g')
    .sort((a, b) => Number(!!b.isStaple) - Number(!!a.isStaple))
  const shift = sorted.length > 0 ? rotate % sorted.length : 0
  const vegs = [...sorted.slice(shift), ...sorted.slice(0, shift)]
  const out: PlanItem[] = []
  let remain = gramsPerMeal
  for (const v of vegs) {
    if (remain <= 0) break
    const take = Math.min(remain, v.maxAmount ?? remain)
    if (take <= 0) continue
    out.push({ food: v, amount: take, unit: v.baseUnit })
    remain -= take
  }
  return out
}

/**
 * ★主菜を選ぶ。ID の直書きをやめ、カテゴリから選ぶ。
 * 卵・納豆・プロテインのように「量で細かく調整できないもの」は主菜にしない。
 */
export function pickMainDish(pool: Food[], alreadyFixed: PlanItem[] = []): Food | null {
  const usedIds = new Set(alreadyFixed.map((it) => it.food.id))
  const candidates = pool.filter(
    (f) =>
      f.category === 'protein' &&
      f.id !== 'whey' &&
      !usedIds.has(f.id) &&
      // 1単位あたり P が小さすぎるもの（卵など）は主菜にしない
      f.proteinG / f.baseAmount * (f.maxAmount ?? 1) >= 20
  )
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => {
    // 主力食材を優先 → 同点なら P が濃い（kcal あたりの P が多い）もの
    const staple = Number(!!b.isStaple) - Number(!!a.isStaple)
    if (staple !== 0) return staple
    return b.proteinG / b.kcal - a.proteinG / a.kcal
  })[0]
}

/** 主食（カロリー調整の弁）。主力の carb を優先 */
export function pickStaple(pool: Food[]): Food | null {
  const carbs = pool
    .filter((f) => f.category === 'carb' && f.baseUnit === 'g')
    .sort((a, b) => Number(!!b.isStaple) - Number(!!a.isStaple))
  return carbs[0] ?? null
}

/** 米の配分。最後の食事（トレ後）をやや厚くする */
function splitRice(total: number, mealCount: number, step: number, maxPerMeal: number): number[] {
  if (mealCount === 1) return [Math.min(total, maxPerMeal)]
  const out: number[] = new Array(mealCount).fill(0)
  let remain = total
  for (let i = 0; i < mealCount; i++) {
    const isLast = i === mealCount - 1
    const share = isLast ? remain : Math.round((total / mealCount) * 0.9 / step) * step
    const take = Math.min(Math.max(0, share), maxPerMeal, remain)
    out[i] = take
    remain -= take
  }
  // 端数が余ったら前から詰める（上限に当たった場合）
  for (let i = 0; i < mealCount && remain > 0; i++) {
    const room = maxPerMeal - out[i]
    const take = Math.min(room, remain)
    out[i] += take
    remain -= take
  }
  return out
}

// ===========================================================================
// 仕上げ（自己検証）
// ===========================================================================

function finish(
  mealItems: PlanItem[][],
  pool: Food[],
  input: SolveInput,
  eaten: Macros,
  main: Food | null,
  mainEach: number,
  notes: string[]
): SolveResult {
  const maxPPerMeal = input.maxProteinPerMeal ?? MAX_PROTEIN_PER_MEAL_G
  const meals: MealPlan[] = mealItems.map((items, i) => ({
    index: i + 1,
    items: items.filter((it) => it.amount > 0),
    totals: tally(items),
  }))
  const totals = tally(mealItems.flat())
  const dayTotals = addMacros(eaten, totals)

  // ---- 自己検証。黙って壊れた案を出さない ----
  const violations: string[] = []
  const poolIds = new Set(pool.map((f) => f.id))
  for (const it of mealItems.flat()) {
    if (!poolIds.has(it.food.id)) {
      violations.push(`除外または在庫切れの食材が含まれています: ${it.food.name}`)
    }
    if (it.food.maxAmount != null && it.amount > it.food.maxAmount) {
      violations.push(
        `${it.food.name} が1食の上限 ${it.food.maxAmount}${it.food.baseUnit} を超えています（${it.amount}）`
      )
    }
  }
  for (const m of meals) {
    if (m.totals.proteinG > maxPPerMeal + 0.001) {
      violations.push(`${m.index}食目のタンパク質が ${maxPPerMeal}g を超えています（${m.totals.proteinG.toFixed(1)}g）`)
    }
  }
  // 「目標に届かなかった」は違反ではなく shortfall として扱う。
  // 残り1食しかない日に脂質58gへ届かないのは物理的な話であって、ソルバーの誤りではない。
  const proteinShortfall = Math.max(0, input.target.proteinG - dayTotals.proteinG)
  const kcalShortfall = Math.max(0, input.target.kcal - dayTotals.kcal)
  const fatShortfall = Math.max(0, input.target.fatFloorG - dayTotals.fatG)

  const outNotes = [...notes]
  if (fatShortfall > 0.5 && input.mealCount > 0) {
    outNotes.push(
      `脂質が下限 ${input.target.fatFloorG}g にあと ${Math.round(fatShortfall)}g 届きません。` +
        '脂質源（オリーブオイル・卵など）を足せる場合は足してください。'
    )
  }
  if (proteinShortfall > PROTEIN_TOLERANCE_G) {
    // ★起床が遅れた日はここに来る。焦らせない文言にすること（引き継ぎ書 §4）
    outNotes.push(
      `残り${input.mealCount}食では目標に届きません（タンパク質があと ${Math.round(proteinShortfall)}g）。` +
        '今日は下振れで終わらせてよい。明日きっちり取れば問題ありません。'
    )
  }

  const riceItem = mealItems.flat().filter((it) => it.food.category === 'carb')
  const riceTotalG = riceItem.reduce((n, it) => n + it.amount, 0)

  return {
    meals,
    totals,
    dayTotals,
    mainFood: main,
    mainAmountPerMeal: mainEach,
    riceTotalG,
    shortfall: { proteinG: proteinShortfall, kcal: kcalShortfall, fatG: fatShortfall },
    feasible:
      violations.length === 0 &&
      proteinShortfall <= PROTEIN_TOLERANCE_G &&
      fatShortfall <= 0.5,
    violations,
    notes: outNotes,
  }
}
