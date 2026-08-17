/**
 * 「食材」画面 — マスタの一覧・除外・在庫・追加編集。
 *
 * ★アプリの価値は登録食材数に比例する。だから登録の手間を極限まで減らす。
 * ★除外した食材はソルバーが二度と提案しない。
 */

import { useState } from 'react'
import type { Food, FoodCategory } from '../core/types'
import { uid, useStore } from '../store'

const GROUPS: { key: FoodCategory; label: string }[] = [
  { key: 'protein', label: 'タンパク質' },
  { key: 'carb', label: '主食' },
  { key: 'veg', label: '野菜・海藻' },
  { key: 'fat', label: '脂質' },
  { key: 'sweet', label: '甘いもの' },
  { key: 'other', label: 'その他' },
]

const blank = (): Food => ({
  id: uid(),
  name: '',
  baseAmount: 100,
  baseUnit: 'g',
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbG: 0,
  category: 'protein',
  stepAmount: 5,
  maxAmount: 250,
  inStock: true,
  isExcluded: false,
})

export function Foods() {
  const { state, update } = useStore()
  const [edit, setEdit] = useState<Food | null>(null)

  const toggle = (id: string, key: 'isExcluded' | 'inStock') =>
    update((s) => ({
      ...s,
      foods: s.foods.map((f) => (f.id === id ? { ...f, [key]: !(key === 'inStock' ? f.inStock !== false : f.isExcluded) } : f)),
    }))

  function save() {
    if (!edit || !edit.name) return
    update((s) => ({
      ...s,
      foods: s.foods.some((f) => f.id === edit.id)
        ? s.foods.map((f) => (f.id === edit.id ? edit : f))
        : [...s.foods, edit],
    }))
    setEdit(null)
  }

  function remove(id: string) {
    update((s) => ({ ...s, foods: s.foods.filter((f) => f.id !== id) }))
    setEdit(null)
  }

  const excludedCount = state.foods.filter((f) => f.isExcluded).length
  const outCount = state.foods.filter((f) => f.inStock === false).length

  return (
    <div className="view">
      <h2>食材</h2>
      <p className="sub">
        登録が増えるほど、組み方の幅が広がります。
        <br />
        左を切ると二度と提案されません。右は在庫。
      </p>

      <div className="acts">
        <button className="wide" onClick={() => setEdit(blank())}>
          <i>ADD</i>
          食材を追加する
        </button>
      </div>

      {edit && (
        <div className="card">
          <div className="card-h">
            <div className="t">{state.foods.some((f) => f.id === edit.id) ? '編集' : '新しい食材'}</div>
            <div className="s">基準量あたりの数値</div>
          </div>
          <div className="field">
            <label>名前</label>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="豚ヒレ肉" />
          </div>
          <div className="row">
            <div className="field">
              <label>基準量</label>
              <input
                inputMode="decimal"
                value={edit.baseAmount}
                onChange={(e) => setEdit({ ...edit, baseAmount: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label>単位</label>
              <input value={edit.baseUnit} onChange={(e) => setEdit({ ...edit, baseUnit: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>kcal</label>
              <input
                inputMode="decimal"
                value={edit.kcal}
                onChange={(e) => setEdit({ ...edit, kcal: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label>P (g)</label>
              <input
                inputMode="decimal"
                value={edit.proteinG}
                onChange={(e) => setEdit({ ...edit, proteinG: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="row3">
            <div className="field">
              <label>F (g)</label>
              <input
                inputMode="decimal"
                value={edit.fatG}
                onChange={(e) => setEdit({ ...edit, fatG: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label>C (g)</label>
              <input
                inputMode="decimal"
                value={edit.carbG}
                onChange={(e) => setEdit({ ...edit, carbG: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label>塩分 (g)</label>
              <input
                inputMode="decimal"
                value={edit.saltG ?? ''}
                onChange={(e) => setEdit({ ...edit, saltG: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>種類</label>
              <select
                value={edit.category}
                onChange={(e) => setEdit({ ...edit, category: e.target.value as FoodCategory })}
              >
                {GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>1食の上限（{edit.baseUnit}）</label>
              <input
                inputMode="decimal"
                value={edit.maxAmount ?? ''}
                onChange={(e) => setEdit({ ...edit, maxAmount: Number(e.target.value) || undefined })}
              />
            </div>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={!!edit.isStaple}
              onChange={(e) => setEdit({ ...edit, isStaple: e.target.checked })}
            />
            主力食材（毎日使う。提案で優先されます）
          </label>
          <button className="primary" onClick={save} disabled={!edit.name}>
            保存する
          </button>
          <div className="row">
            <button className="ghost" onClick={() => setEdit(null)}>
              やめる
            </button>
            {state.foods.some((f) => f.id === edit.id) && (
              <button className="ghost danger" onClick={() => remove(edit.id)}>
                この食材を消す
              </button>
            )}
          </div>
          <p className="hint">1食の上限は大事です。「鶏もも530g」のような答えを防ぎます。</p>
        </div>
      )}

      {GROUPS.map((g) => {
        const list = state.foods.filter((f) => f.category === g.key)
        if (list.length === 0) return null
        return (
          <div key={g.key}>
            <div className="tagline">{g.label}</div>
            {list.map((f) => (
              <div
                className={`food${f.isExcluded ? ' off' : ''}${f.inStock === false ? ' nostock' : ''}`}
                key={f.id}
              >
                <div className="nm" onClick={() => setEdit({ ...f })} style={{ cursor: 'pointer' }}>
                  {f.name}
                  <i>
                    {f.baseAmount}
                    {f.baseUnit} ・ {f.kcal}kcal ・ P{f.proteinG} F{f.fatG} C{f.carbG}
                    {f.maxAmount ? ` ・ 上限${f.maxAmount}${f.baseUnit}` : ''}
                  </i>
                </div>
                <div>
                  <button
                    className={`sw${f.isExcluded ? '' : ' on'}`}
                    role="switch"
                    aria-checked={!f.isExcluded}
                    aria-label={`${f.name} を食べる`}
                    onClick={() => toggle(f.id, 'isExcluded')}
                  />
                  <div className="swlbl">食べる</div>
                </div>
                <div>
                  <button
                    className={`sw stock${f.inStock === false ? '' : ' on'}`}
                    role="switch"
                    aria-checked={f.inStock !== false}
                    aria-label={`${f.name} の在庫`}
                    onClick={() => toggle(f.id, 'inStock')}
                  />
                  <div className="swlbl">在庫</div>
                </div>
              </div>
            ))}
          </div>
        )
      })}

      <p className="hint">
        除外 {excludedCount}件 ／ 在庫切れ {outCount}件
        <br />
        除外した食材は提案に絶対に出てきません。
      </p>
    </div>
  )
}
