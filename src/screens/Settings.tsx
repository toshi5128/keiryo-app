/**
 * 「設定」画面 — プロフィールと目標。
 * ★目標体重は入力させない。目標体脂肪率から逆算する。
 */

import { useRef } from 'react'
import { ACTIVITY_LEVELS, goalFromTargetBodyFat } from '../core/calc'
import { DEFAULT_PROFILE, useStore } from '../store'
import type { Profile } from '../store'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

export function Settings() {
  const { state, update, plan } = useStore()
  const p = state.profile
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    update((s) => ({ ...s, profile: { ...s.profile, [k]: v } }))

  let goal: { goalWeightKg: number; fatToLoseKg: number } | null = null
  let goalError = ''
  try {
    goal = goalFromTargetBodyFat(plan.lbmKg, p.weightKg, p.targetBodyFatPct)
  } catch (e) {
    goalError = e instanceof Error ? e.message : String(e)
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `keiryo-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function importData(file: File) {
    const r = new FileReader()
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result))
        update(() => parsed)
      } catch {
        alert('読み込めませんでした')
      }
    }
    r.readAsText(file)
  }

  return (
    <div className="view">
      <h2>設定</h2>
      <p className="sub">ここの数値から目標が決まります。触ったら「今日」に即反映されます。</p>

      <div className="card">
        <div className="card-h">
          <div className="t">いまの目標</div>
          <div className="s">自動計算</div>
        </div>
        <div className="item">
          <span>除脂肪体重 LBM</span>
          <span className="amt">{plan.lbmKg} kg</span>
        </div>
        <div className="item">
          <span>基礎代謝 BMR</span>
          <span className="amt">{Math.round(plan.bmr).toLocaleString()} kcal</span>
        </div>
        <div className="item">
          <span>消費 TDEE</span>
          <span className="amt">{Math.round(plan.tdee).toLocaleString()} kcal</span>
        </div>
        <div className="item">
          <span>1日の目標</span>
          <span className="amt">{plan.kcal.toLocaleString()} kcal</span>
        </div>
        <div className="item">
          <span>P / F / C</span>
          <span className="amt">
            {plan.proteinG} / {plan.fatG} / {plan.carbG} g
          </span>
        </div>
        <div className="item">
          <span>脂質の下限（絶対に割らない）</span>
          <span className="amt">{plan.fatFloorG} g</span>
        </div>
        <div className="item">
          <span>週予算</span>
          <span className="amt">{(plan.kcal * 7).toLocaleString()} kcal</span>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">からだ</div>
          <div className="s">体組成計の数値</div>
        </div>
        <div className="row3">
          <div className="field">
            <label>身長 cm</label>
            <input inputMode="decimal" value={p.heightCm} onChange={(e) => set('heightCm', Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>体重 kg</label>
            <input inputMode="decimal" value={p.weightKg} onChange={(e) => set('weightKg', Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label>体脂肪 %</label>
            <input
              inputMode="decimal"
              value={p.bodyFatPct ?? ''}
              onChange={(e) => set('bodyFatPct', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label>骨格筋量 kg（体脂肪率が無いときに使います。換算 ×1.75）</label>
          <input
            inputMode="decimal"
            value={p.skeletalMuscleKg ?? ''}
            onChange={(e) => set('skeletalMuscleKg', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">ゴール</div>
          <div className="s">体重は入力しません</div>
        </div>
        <div className="field">
          <label>目標体脂肪率 %</label>
          <input
            inputMode="decimal"
            value={p.targetBodyFatPct}
            onChange={(e) => set('targetBodyFatPct', Number(e.target.value) || 0)}
          />
        </div>
        {goal ? (
          <div className="explain">
            除脂肪 {plan.lbmKg}kg を保ったまま体脂肪 {p.targetBodyFatPct}% にすると
            <span className="hi"> {goal.goalWeightKg.toFixed(1)}kg</span> になります。
            いまから <span className="hi">{Math.max(0, goal.fatToLoseKg).toFixed(1)}kg</span> です。
          </div>
        ) : (
          <div className="explain warn">{goalError}</div>
        )}
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">カロリーの決め方</div>
          <div className="s">TDEE から引く</div>
        </div>
        <div className="field">
          <label>活動係数</label>
          <select value={p.activity} onChange={(e) => set('activity', Number(e.target.value))}>
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.value} — {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>1日の赤字 kcal</label>
          <input inputMode="numeric" value={p.deficit} onChange={(e) => set('deficit', Number(e.target.value) || 0)} />
        </div>
        <div className="field">
          <label>目標を手で決める（空なら自動）</label>
          <input
            inputMode="numeric"
            value={p.overrideKcal ?? ''}
            onChange={(e) => set('overrideKcal', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="自動"
          />
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">生活</div>
          <div className="s">週予算と日付の境目</div>
        </div>
        <div className="field">
          <label>1日の境界（この時刻より前は前日ぶん）</label>
          <select value={p.boundaryHour} onChange={(e) => set('boundaryHour', Number(e.target.value))}>
            {[0, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label>外食の曜日</label>
            <select
              value={p.eatOutDow ?? ''}
              onChange={(e) => set('eatOutDow', e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">なし</option>
              {DOW.map((d, i) => (
                <option key={i} value={i}>
                  {d}曜
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>外食日の想定 kcal</label>
            <input
              inputMode="numeric"
              value={p.eatOutKcal}
              onChange={(e) => set('eatOutKcal', Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <p className="hint">
          外食日を決めると、週予算からその分を先に取り置いて、残りの日に配り直します。
          <br />
          1日超えても警告は出しません。
        </p>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">データ</div>
          <div className="s">この端末に保存されています</div>
        </div>
        <div className="row">
          <button className="ghost" onClick={exportData}>
            書き出す
          </button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>
            読み込む
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
        />
        <p className="hint">
          記録 {state.meals.length}件 ／ 体重 {state.weights.length}件 ／ 食材 {state.foods.length}件
        </p>
        <div className="sep" />
        <button
          className="ghost danger"
          onClick={() => {
            if (confirm('プロフィールを初期値に戻します。記録は消えません。')) {
              update((s) => ({ ...s, profile: { ...DEFAULT_PROFILE } }))
            }
          }}
        >
          プロフィールを初期値に戻す
        </button>
      </div>
    </div>
  )
}
