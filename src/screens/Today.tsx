/**
 * 「今日」画面 — このアプリの入口。
 *
 * 毎日やることは3つだけ：起床を押す／提案どおり食べて記録する／ズレたら組み直す。
 * それ以外は下に置く。
 */

import { useMemo, useState } from 'react'
import { Beams } from '../components/Beams'
import { solve } from '../core/solver'
import { macrosOf } from '../core/solver'
import { planWeek, weekProgress } from '../core/weekBudget'
import { buildSchedule, remainingMeals } from '../core/weightJudge'
import { weekDates } from '../core/dateBoundary'
import { mealFromFood, mealsOf, sumMeals, useStore } from '../store'
import type { MealLog } from '../store'
import { uid } from '../store'

const hhmm = (d: Date) =>
  `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`

export function Today() {
  const { state, update, today, plan } = useStore()
  const [wants, setWants] = useState<string[]>([])
  const [panel, setPanel] = useState<'' | 'stock' | 'sweet' | 'out'>('')
  const [outKcal, setOutKcal] = useState('')
  const [outP, setOutP] = useState('')
  const [note, setNote] = useState<{ title: string; body: string; calm?: boolean } | null>(null)

  const todayMeals = mealsOf(state, today)
  const eaten = sumMeals(todayMeals)
  const day = state.days[today] ?? {}
  const wakeAt = day.wakeAt ? new Date(day.wakeAt) : null
  const now = new Date()

  // 記録済みの「食事」の回数（甘いもの単品や外食は食事回数に数えない）
  const eatenMealCount = new Set(
    todayMeals.filter((m) => m.kind === 'meal').map((m) => m.eatenAt.slice(0, 13))
  ).size

  const mealCount = wakeAt ? remainingMeals(wakeAt, now, eatenMealCount, state.profile.boundaryHour) : 0

  // 今日（この log_date）が終わる実時刻
  const dayEnd = (() => {
    const d = new Date(now.getTime())
    if (d.getHours() >= state.profile.boundaryHour) d.setDate(d.getDate() + 1)
    d.setHours(state.profile.boundaryHour, 0, 0, 0)
    return d
  })()

  /**
   * 残りの食事をいつ食べるか。
   * 起床が遅い日は「起床+8h」のような固定の型に当てはめると境界を越えてしまうので、
   * 今から境界までを残り食数で割って置く。表示が必ず今日のうちに収まる。
   */
  const mealSlots = (() => {
    if (!wakeAt || mealCount <= 0) return [] as Date[]
    const start = Math.max(now.getTime(), wakeAt.getTime() + 0.5 * 3600 * 1000)
    const span = Math.max(0, dayEnd.getTime() - start)
    return Array.from({ length: mealCount }, (_, i) => new Date(start + (span * i) / mealCount))
  })()

  // 起床が普通の時間なら、仕様書どおりの相対スケジュールも見せる
  const schedule = wakeAt ? buildSchedule(wakeAt, now) : []
  const scheduleFitsToday = schedule.every((s) => s.at.getTime() < dayEnd.getTime())

  // ---- 週予算 ----
  const week = useMemo(() => {
    const dates = weekDates(today)
    const eatOutDates =
      state.profile.eatOutDow == null
        ? []
        : dates.filter((d) => new Date(d + 'T00:00:00').getDay() === state.profile.eatOutDow)
    const wp = planWeek({
      dailyTargetKcal: plan.kcal,
      eatOutDates,
      eatOutKcal: state.profile.eatOutKcal,
    })
    const intakes = dates.map((d) => ({ logDate: d, kcal: sumMeals(mealsOf(state, d)).kcal }))
    return { plan: wp, progress: weekProgress(wp, intakes, today) }
  }, [state, today, plan])

  // ---- ★ソルバー ----
  const result = useMemo(
    () =>
      solve({
        target: {
          kcal: plan.kcal,
          proteinG: plan.proteinG,
          fatG: plan.fatG,
          carbG: plan.carbG,
          fatFloorG: plan.fatFloorG,
        },
        eaten,
        mealCount,
        foods: state.foods,
        wants,
      }),
    [plan, eaten, mealCount, state.foods, wants]
  )

  const suggestedFoods = result.meals.flatMap((m) => m.items.map((i) => i.food))
  const uniqueSuggested = suggestedFoods.filter(
    (f, i) => suggestedFoods.findIndex((x) => x.id === f.id) === i
  )
  const sweets = state.foods.filter((f) => f.category === 'sweet' && !f.isExcluded && f.inStock !== false)

  // -------------------------------------------------------------------
  function wake() {
    const at = new Date()
    update((s) => ({ ...s, days: { ...s.days, [today]: { ...s.days[today], wakeAt: at.toISOString() } } }))
    setNote({
      title: `起床 ${hhmm(at)} を起点に組み直しました`,
      body: '時刻ではなく起床からの相対でスケジュールを作ります。遅い日は自動的に縮みます。',
      calm: true,
    })
  }

  function outOfStock(foodId: string, name: string) {
    update((s) => ({
      ...s,
      foods: s.foods.map((f) => (f.id === foodId ? { ...f, inStock: false } : f)),
    }))
    setPanel('')
    setNote({
      title: `${name} を在庫から外して組み直しました`,
      body: 'タンパク質は同じ量を確保し、脂質が減るぶんは下限を割らないよう補っています。',
    })
  }

  function addSweet(id: string, name: string, kcal: number) {
    const before = result.riceTotalG
    setWants((w) => [...w, id])
    setPanel('')
    // 差分は再計算後に出したいので、ここでは見込みで出す
    const est = Math.round(kcal / 1.56 / 10) * 10
    setNote({
      title: `${name}（${kcal}kcal）を枠に入れました`,
      body: `ご飯を約 ${est}g 減らして相殺します（今日の主食 ${before}g → 約 ${Math.max(0, before - est)}g）。タンパク質は目標のままです。`,
    })
  }

  function recordEatOut() {
    const k = Number(outKcal)
    if (!k) return
    const p = Number(outP) || 0
    const log: MealLog = {
      id: uid(),
      name: '外食',
      amount: 1,
      unit: '回',
      kcal: k,
      proteinG: p,
      fatG: Math.round(k * 0.3 / 9),
      carbG: Math.max(0, Math.round((k - p * 4 - (k * 0.3)) / 4)),
      saltG: 0,
      eatenAt: new Date().toISOString(),
      logDate: today,
      kind: 'eat_out',
    }
    update((s) => ({ ...s, meals: [...s.meals, log] }))
    setPanel('')
    setOutKcal('')
    setOutP('')
    setNote({
      title: `外食 ${k.toLocaleString()}kcal を差し引いて組み直しました`,
      body: '残りの食事を縮めて収めます。タンパク質は日次の目標を優先して確保します。',
    })
  }

  function recordMeal(index: number) {
    const meal = result.meals[index]
    if (!meal) return
    const at = new Date()
    const logs = meal.items.map((it) =>
      mealFromFood(it.food, it.amount, state.profile.boundaryHour, it.food.category === 'sweet' ? 'sweet' : 'meal', at)
    )
    update((s) => ({ ...s, meals: [...s.meals, ...logs] }))
    setWants([])
    setNote({
      title: `${meal.index}食目を記録しました`,
      body: `P${Math.round(meal.totals.proteinG)}g / ${Math.round(meal.totals.kcal)}kcal。残りは自動で組み直しました。`,
      calm: true,
    })
  }

  // -------------------------------------------------------------------
  return (
    <div className="view">
      <h2>今日</h2>
      <p className="sub">
        {wakeAt
          ? '起床から相対で組み直しています。目標線に届けば正解。'
          : 'まず「起床」を押してください。そこを起点に1日を組みます。'}
      </p>

      <Beams
        eaten={eaten}
        target={{ proteinG: plan.proteinG, fatG: plan.fatG, carbG: plan.carbG }}
        kcal={plan.kcal}
        weekLine={`週 ${Math.round(week.progress.consumedKcal).toLocaleString()} / ${week.plan.weeklyBudgetKcal.toLocaleString()}`}
        weekOk={week.progress.status !== 'over'}
      />

      {!wakeAt && (
        <button className="primary" onClick={wake}>
          起床（いま）
        </button>
      )}

      {note && (
        <div className={`log${note.calm ? ' calm' : ''}`}>
          <b>{note.title}</b>
          {note.body}
        </div>
      )}

      {wakeAt && (
        <div className="card">
          <div className="card-h">
            <div className="t">
              今日の流れ<span>起床 {hhmm(wakeAt)}</span>
            </div>
            <div className="s">残り{mealCount}食</div>
          </div>
          {scheduleFitsToday ? (
            schedule.map((s) => (
              <div className="item" key={s.key}>
                <span style={{ color: s.past ? 'var(--dim)' : undefined }}>{s.label}</span>
                <span className="amt">{hhmm(s.at)}</span>
              </div>
            ))
          ) : (
            <>
              {mealSlots.map((t, i) => (
                <div className="item" key={i}>
                  <span>{eatenMealCount + i + 1}食目</span>
                  <span className="amt">{hhmm(t)}</span>
                </div>
              ))}
              <div className="item">
                <span style={{ color: 'var(--dim)' }}>ここで1日が変わります</span>
                <span className="amt">{state.profile.boundaryHour}:00</span>
              </div>
            </>
          )}
          {!scheduleFitsToday && (
            <p className="hint" style={{ marginTop: 10 }}>
              起床が遅いので、残り時間に合わせて詰めています。
            </p>
          )}
        </div>
      )}

      {result.meals.map((m, i) => (
        <div className="card" key={m.index}>
          <div className="card-h">
            <div className="t">
              次の{eatenMealCount + i + 1}食目
              <span>{mealSlots[i] ? hhmm(mealSlots[i]) : ''}</span>
            </div>
            <div className="s">
              P{Math.round(m.totals.proteinG)} ／ {Math.round(m.totals.kcal)} kcal
            </div>
          </div>
          {m.items.map((it, k) => (
            <div className="item new" key={k}>
              <span>{it.food.name.replace(/（.*?）/, '')}</span>
              <span className="amt">
                {it.amount}
                {it.unit}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            <button className="primary" style={{ marginBottom: 0 }} onClick={() => recordMeal(i)}>
              この内容で食べた
            </button>
          </div>
        </div>
      ))}

      {/* 献立を組んだときだけ補足を出す。起床前や1日の終わりに
          「目標に届きません」と言われても、まだ何も始まっていない／もう打つ手がない */}
      {wakeAt && mealCount > 0 && result.notes.length > 0 && (
        <div className="log calm">
          <b>ソルバーからの補足</b>
          {result.notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}

      {mealCount === 0 && wakeAt && (
        <div className="empty">
          今日の食事はここまでです。
          <br />
          記録は「記録」タブから直せます。
        </div>
      )}

      {/* ---- 再計算トリガー ---- */}
      <div className="acts">
        <button aria-pressed={panel === 'stock'} onClick={() => setPanel(panel === 'stock' ? '' : 'stock')}>
          <i>RESOLVE</i>
          在庫が切れた
        </button>
        <button aria-pressed={panel === 'sweet'} onClick={() => setPanel(panel === 'sweet' ? '' : 'sweet')}>
          <i>RESOLVE</i>
          甘いもの食べたい
        </button>
        <button aria-pressed={panel === 'out'} onClick={() => setPanel(panel === 'out' ? '' : 'out')}>
          <i>RESOLVE</i>
          外食する
        </button>
        <button
          onClick={() => {
            setWants([])
            setNote(null)
            setPanel('')
          }}
        >
          <i>RESET</i>
          提案を戻す
        </button>
      </div>

      {panel === 'stock' && (
        <div className="card">
          <div className="card-h">
            <div className="t">どれが切れましたか</div>
            <div className="s">外すと二度と提案しません</div>
          </div>
          {uniqueSuggested.map((f) => (
            <div className="item" key={f.id}>
              <span>{f.name}</span>
              <button className="ghost" onClick={() => outOfStock(f.id, f.name)}>
                切れた
              </button>
            </div>
          ))}
          <p className="hint">戻すときは「食材」タブの在庫スイッチから。</p>
        </div>
      )}

      {panel === 'sweet' && (
        <div className="card">
          <div className="card-h">
            <div className="t">何を食べますか</div>
            <div className="s">そのぶん主食を減らします</div>
          </div>
          {sweets.map((f) => (
            <div className="item" key={f.id}>
              <span>
                {f.name}
                <span className="sub2">
                  {f.baseAmount}
                  {f.baseUnit} ・ {f.kcal}kcal
                </span>
              </span>
              <button className="ghost" onClick={() => addSweet(f.id, f.name, f.kcal)}>
                入れる
              </button>
            </div>
          ))}
        </div>
      )}

      {panel === 'out' && (
        <div className="card">
          <div className="card-h">
            <div className="t">外食のカロリー</div>
            <div className="s">わかる範囲で</div>
          </div>
          <div className="row">
            <div className="field">
              <label>カロリー (kcal)</label>
              <input
                inputMode="numeric"
                value={outKcal}
                onChange={(e) => setOutKcal(e.target.value)}
                placeholder="1105"
              />
            </div>
            <div className="field">
              <label>タンパク質 (g)</label>
              <input
                inputMode="numeric"
                value={outP}
                onChange={(e) => setOutP(e.target.value)}
                placeholder="58"
              />
            </div>
          </div>
          <button className="primary" onClick={recordEatOut} disabled={!outKcal}>
            記録して組み直す
          </button>
          <p className="hint">1日超えても警告は出しません。週の予算で見ます。</p>
        </div>
      )}

      <p className="hint">
        {week.progress.message}
        <br />
        {week.plan.eatOutDates.length > 0 && `外食日を除いた平日目標 ${week.plan.normalTargetKcal.toLocaleString()}kcal`}
      </p>
    </div>
  )
}

/** 甘いものを1つ食べたときの栄養価（記録用） */
export function sweetMacros(food: Parameters<typeof macrosOf>[0]) {
  return macrosOf(food, food.baseAmount)
}
