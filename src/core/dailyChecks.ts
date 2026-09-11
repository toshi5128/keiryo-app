/**
 * ★その日のうちに気づかないと手遅れになるものの判定（KEIRYO-HANDOFF-v4.md §1 / §3 / §10 / §12）
 *
 * ここに入っているのは「あとから直せない失敗」だけ。
 *   ① 1食目のタンパク質が薄い → 1日で取り返せない。最多の失敗パターン。
 *   ② 塩分が6gを超えた     → 翌朝 +0.5〜1.0kg 出る。先に予告しておかないと
 *                              本人が不安になって自己判断でカロリーを削り始める。
 *   ③ 水分が足りない        → 控えると逆に水を溜める。
 *   ④ 同じ食材が続いている  → 「飽きて続かない」ことが最大のリスク。
 */

import type { Food } from './types'

// ===========================================================================
// ① 1食目のタンパク質（v4 §1 / §12）
// ===========================================================================

/** ★1食目でこれを下回ったら赤い警告を出す */
export const FIRST_MEAL_PROTEIN_MIN_G = 45
/** 1食目の理想レンジ */
export const FIRST_MEAL_PROTEIN_IDEAL_G = { min: 45, max: 55 }

export type CheckLevel = 'ok' | 'warn' | 'alert'

export interface Check {
  level: CheckLevel
  title: string
  body: string
}

/**
 * 1食目の判定。
 * まだ1食目を食べていない（proteinG === null）ときは何も言わない。
 * 食べる前から警告を出しても行動が変わらないうえ、警告が意味を失う。
 */
export function checkFirstMeal(firstMealProteinG: number | null): Check | null {
  if (firstMealProteinG == null) return null
  const p = Math.round(firstMealProteinG)
  if (firstMealProteinG >= FIRST_MEAL_PROTEIN_MIN_G) {
    return {
      level: 'ok',
      title: `1食目 P${p}g を確保できています`,
      body: `この時点で ${FIRST_MEAL_PROTEIN_IDEAL_G.min}g 以上あれば、残り2食は無理をせず目標に届きます。`,
    }
  }
  return {
    level: 'alert',
    title: `1食目のタンパク質が ${p}g しかありません`,
    body:
      `★1食目のPが薄いと1日で取り返せません（${FIRST_MEAL_PROTEIN_IDEAL_G.min}〜${FIRST_MEAL_PROTEIN_IDEAL_G.max}g が目安）。` +
      `いまプロテイン1杯（P21g）か そぼろ${Math.max(50, Math.ceil(((FIRST_MEAL_PROTEIN_MIN_G - firstMealProteinG) / 28) * 100 / 10) * 10)}g を足しておくと、あとが楽になります。`,
  }
}

// ===========================================================================
// ② 塩分（v4 §3 / §8）
// ===========================================================================

/** 塩分超過で翌朝に出る増加の目安(kg) */
export const SALT_OVER_WEIGHT_GAIN_KG = { min: 0.5, max: 1.0 }

/**
 * 塩分の判定。★超えたら「翌朝の増加」を先に予告する。
 * 予告しておけば、翌朝の +1kg を見ても脂肪だと誤解しない。
 */
export function checkSalt(saltG: number, limitG: number): Check | null {
  if (saltG <= 0) return null
  if (saltG <= limitG * 0.8) return null
  if (saltG <= limitG) {
    return {
      level: 'warn',
      title: `塩分 ${saltG.toFixed(1)}g / ${limitG}g`,
      body: '上限に近づいています。ここから先の味付けは控えめに。',
    }
  }
  return {
    level: 'alert',
    title: `塩分 ${saltG.toFixed(1)}g（上限 ${limitG}g を超えました）`,
    body:
      `明日の朝は体重が +${SALT_OVER_WEIGHT_GAIN_KG.min}〜${SALT_OVER_WEIGHT_GAIN_KG.max}kg 出ます。` +
      'これは水であって脂肪ではありません。水を控えると逆に溜まるので、いつもどおり飲んでください。2〜3日で戻ります。',
  }
}

// ===========================================================================
// ③ 水分（v4 §3）
// ===========================================================================

/** ★水分にカウントするもの（v4 §3） */
export const WATER_COUNTS = ['水', 'お茶', 'コーヒー', 'プロテイン', '汁物の汁'] as const
/** カウントしないもの */
export const WATER_EXCLUDES = ['食品に含まれる水分'] as const

/** ワンタップで足す量の候補(ml) */
export const WATER_QUICK_ML = [200, 350, 500, 1000] as const

export function checkWater(ml: number, targetMl: number, dayProgress = 1): Check | null {
  const expected = targetMl * Math.min(1, Math.max(0, dayProgress))
  if (ml >= targetMl) {
    return { level: 'ok', title: `水分 ${(ml / 1000).toFixed(1)}L 達成`, body: '十分です。' }
  }
  if (ml >= expected * 0.7) return null
  const short = Math.round((targetMl - ml) / 100) * 100
  return {
    level: 'warn',
    title: `水分があと ${(short / 1000).toFixed(1)}L 足りません`,
    body: `目標 ${(targetMl / 1000).toFixed(1)}L。減量中に水を控えると体は濃度を保つために水を溜めます。飲むほうが落ちます。`,
  }
}

// ===========================================================================
// ④ 同じ食材が続いている（v4 §10「飽きて続かないことが最大のリスク」）
// ===========================================================================

/** これ以上続いたら代替を出す */
export const MONOTONY_DAYS = 5

export interface MonotonyResult {
  /** 続いている食材 */
  food: Food
  days: number
  /** 代わりに出せる候補（嫌い・在庫切れ・参照専用は除く） */
  alternatives: Food[]
  check: Check
}

/**
 * 主菜が何日続いたかを見て、代替候補を出す。
 * ★強制はしない。「切り替えてもいい」と伝えるだけ。タンパク質の総量が同じなら食材は何でもよい。
 *
 * @param dailyMainFoodIds 新しい順に並べた「その日の主菜の食材id」
 */
export function checkMonotony(
  dailyMainFoodIds: (string | null)[],
  foods: Food[]
): MonotonyResult | null {
  const head = dailyMainFoodIds[0]
  if (!head) return null
  let days = 0
  for (const id of dailyMainFoodIds) {
    if (id !== head) break
    days++
  }
  if (days < MONOTONY_DAYS) return null
  const food = foods.find((f) => f.id === head)
  if (!food) return null

  const alternatives = foods
    .filter(
      (f) =>
        f.id !== food.id &&
        f.category === 'protein' &&
        !f.isExcluded &&
        !f.isReference &&
        f.inStock !== false &&
        f.id !== 'whey'
    )
    .sort((a, b) => b.proteinG / b.kcal - a.proteinG / a.kcal)
    .slice(0, 3)

  return {
    food,
    days,
    alternatives,
    check: {
      level: 'warn',
      title: `${food.name} が ${days}日続いています`,
      body:
        alternatives.length > 0
          ? `飽きたら ${alternatives.map((f) => f.name).join('／')} に替えてかまいません。タンパク質の量が同じなら食材は何でもよいです。`
          : '飽きたら別の食材に替えてかまいません。タンパク質の量が同じなら食材は何でもよいです。',
    },
  }
}

// ===========================================================================
// ⑤ 食欲と睡眠（★削りすぎの一番早いサイン）
// ===========================================================================

/**
 * ★なぜ食欲を記録するのか。
 *
 * 「削りすぎ」を最初に教えてくれるのは体重でも体組成計でもない。
 *   体重に出る   … 2週間後
 *   体組成計     … 機種で13.7%と18.2%に割れる（当てにならない）
 *   異常な空腹感 … ★その日に分かる
 *
 * 引き継ぎ書 §7 の安全弁は「骨格筋が2週で-0.5kg」だが、その骨格筋を測る
 * 体組成計が信用できない以上、安全弁が実質作動しない。食欲はその代わりになる。
 *
 * ★ただし食欲だけでカロリーを動かしはしない。「削る提案を出す前に警告する」だけ。
 *   空腹は気分や睡眠でも動くので、単独で決め手にはしない。
 */
export type Appetite = 'low' | 'normal' | 'high'

export const APPETITE_LABELS: Record<Appetite, string> = {
  low: '少ない',
  normal: 'ふつう',
  high: 'やたら減る',
}

/** 直近これだけの日数を見る */
export const APPETITE_WINDOW_DAYS = 7
/** この日数以上「やたら減る」が続いたら、削る提案の前に警告する */
export const APPETITE_HIGH_DAYS_WARN = 4
/** 判断に足りる最低の記録日数。記録が少ないうちは何も言わない */
export const APPETITE_MIN_RECORDS = 4

export interface AppetitePressure {
  /** 直近の窓のうち「やたら減る」だった日数 */
  highDays: number
  /** 記録があった日数 */
  recorded: number
  /** ★削る提案を止めるべきか */
  strained: boolean
}

/** @param recent 新しい順に並べた直近の食欲（未記録は undefined） */
export function appetitePressure(recent: (Appetite | undefined)[]): AppetitePressure {
  const window = recent.slice(0, APPETITE_WINDOW_DAYS)
  const recorded = window.filter((a) => a != null).length
  const highDays = window.filter((a) => a === 'high').length
  return {
    highDays,
    recorded,
    strained: recorded >= APPETITE_MIN_RECORDS && highDays >= APPETITE_HIGH_DAYS_WARN,
  }
}

/** 画面に出す食欲の注意。停滞して削る場面で使う */
export function appetiteCheck(p: AppetitePressure): Check | null {
  if (!p.strained) return null
  return {
    level: 'warn',
    title: `ここ${APPETITE_WINDOW_DAYS}日のうち ${p.highDays}日、空腹が強い日が続いています`,
    body:
      'ここでカロリーを削ると、続かなくなる可能性があります。' +
      '先に有酸素のほうを試すか、1週間ようすを見るのをお勧めします。',
  }
}

// ---- 睡眠 --------------------------------------------------------------

/**
 * 睡眠は判定には使わない。「ベンチが落ちた日は寝ていない日だった」を
 * あとから見て納得するための材料として残すだけ。
 */
export const SLEEP_SHORT_H = 6

export function isShortSleep(hours: number | undefined): boolean {
  return hours != null && hours > 0 && hours < SLEEP_SHORT_H
}
