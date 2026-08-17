/**
 * 「記録」画面 — その日に食べたものの一覧と追加。
 * ★集計は log_date 基準。深夜の食事がどちらの日に付くかを必ず明示する。
 */

import { useState } from 'react'
import { addLogDays, logDateLabel, toLogDate } from '../core/dateBoundary'
import { mealFromFood, mealsOf, round1, sumMeals, uid, useStore } from '../store'
import type { MealLog } from '../store'

const wd = ['日', '月', '火', '水', '木', '金', '土']
const label = (d: string) => {
  const x = new Date(d + 'T00:00:00')
  return `${x.getMonth() + 1}/${x.getDate()}(${wd[x.getDay()]})`
}

export function Records() {
  const { state, update, today } = useStore()
  const [date, setDate] = useState(today)
  const [mode, setMode] = useState<'' | 'food' | 'manual'>('')
  const [pick, setPick] = useState('')
  const [amount, setAmount] = useState('')
  const [man, setMan] = useState({ name: '', kcal: '', p: '', f: '', c: '' })

  const meals = mealsOf(state, date)
  const sum = sumMeals(meals)
  const now = new Date()
  const boundary = state.profile.boundaryHour
  const nowLogDate = toLogDate(now, boundary)
  const picked = state.foods.find((f) => f.id === pick)

  function addFromFood() {
    if (!picked) return
    const a = Number(amount) || picked.baseAmount
    update((s) => ({ ...s, meals: [...s.meals, mealFromFood(picked, a, boundary)] }))
    setPick('')
    setAmount('')
    setMode('')
  }

  function addManual() {
    const kcal = Number(man.kcal)
    if (!man.name || !kcal) return
    const log: MealLog = {
      id: uid(),
      name: man.name,
      amount: 1,
      unit: '食',
      kcal,
      proteinG: round1(Number(man.p) || 0),
      fatG: round1(Number(man.f) || 0),
      carbG: round1(Number(man.c) || 0),
      saltG: 0,
      eatenAt: now.toISOString(),
      logDate: nowLogDate,
      kind: 'meal',
    }
    update((s) => ({ ...s, meals: [...s.meals, log] }))
    setMan({ name: '', kcal: '', p: '', f: '', c: '' })
    setMode('')
  }

  function remove(id: string) {
    update((s) => ({ ...s, meals: s.meals.filter((m) => m.id !== id) }))
  }

  return (
    <div className="view">
      <h2>記録</h2>
      <p className="sub">
        深夜の食事は前の日に付きます（境界 {boundary}:00）。
        <br />
        いま追加すると「{logDateLabel(now, boundary)}」
      </p>

      <div className="card">
        <div className="card-h">
          <div className="t">{label(date)}</div>
          <div className="s">
            P{Math.round(sum.proteinG)} F{Math.round(sum.fatG)} C{Math.round(sum.carbG)} ／{' '}
            {Math.round(sum.kcal).toLocaleString()}kcal
          </div>
        </div>
        <div className="row">
          <button className="ghost" onClick={() => setDate(addLogDays(date, -1))}>
            ← 前の日
          </button>
          <button className="ghost" onClick={() => setDate(addLogDays(date, 1))} disabled={date >= today}>
            次の日 →
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">食べたもの</div>
          <div className="s">{meals.length}件</div>
        </div>
        {meals.length === 0 && <div className="empty">まだ記録がありません</div>}
        {meals.map((m) => (
          <div className="item" key={m.id}>
            <span>
              {m.name}
              <span className="sub2">
                {new Date(m.eatenAt).getHours()}:
                {new Date(m.eatenAt).getMinutes().toString().padStart(2, '0')} ・ P{m.proteinG} F{m.fatG} C
                {m.carbG} ・ {Math.round(m.kcal)}kcal
              </span>
            </span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="amt">
                {m.amount}
                {m.unit}
              </span>
              <button className="ghost danger" onClick={() => remove(m.id)}>
                消す
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="acts">
        <button aria-pressed={mode === 'food'} onClick={() => setMode(mode === 'food' ? '' : 'food')}>
          <i>ADD</i>
          食材から追加
        </button>
        <button aria-pressed={mode === 'manual'} onClick={() => setMode(mode === 'manual' ? '' : 'manual')}>
          <i>ADD</i>
          その場で手入力
        </button>
      </div>

      {mode === 'food' && (
        <div className="card">
          <div className="field">
            <label>食材</label>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">選んでください</option>
              {state.foods
                .filter((f) => !f.isExcluded)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          {picked && (
            <div className="field">
              <label>
                量（{picked.baseUnit}） ／ 基準 {picked.baseAmount}
                {picked.baseUnit} = {picked.kcal}kcal・P{picked.proteinG}
              </label>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(picked.baseAmount)}
              />
            </div>
          )}
          <button className="primary" onClick={addFromFood} disabled={!picked}>
            追加する
          </button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="card">
          <div className="field">
            <label>名前</label>
            <input value={man.name} onChange={(e) => setMan({ ...man, name: e.target.value })} placeholder="牛かつ定食" />
          </div>
          <div className="row">
            <div className="field">
              <label>kcal</label>
              <input inputMode="numeric" value={man.kcal} onChange={(e) => setMan({ ...man, kcal: e.target.value })} />
            </div>
            <div className="field">
              <label>P (g)</label>
              <input inputMode="decimal" value={man.p} onChange={(e) => setMan({ ...man, p: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>F (g)</label>
              <input inputMode="decimal" value={man.f} onChange={(e) => setMan({ ...man, f: e.target.value })} />
            </div>
            <div className="field">
              <label>C (g)</label>
              <input inputMode="decimal" value={man.c} onChange={(e) => setMan({ ...man, c: e.target.value })} />
            </div>
          </div>
          <button className="primary" onClick={addManual} disabled={!man.name || !man.kcal}>
            追加する
          </button>
          <p className="hint">よく食べるものは「食材」タブに登録すると次から1タップになります。</p>
        </div>
      )}
    </div>
  )
}
