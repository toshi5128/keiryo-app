/**
 * 「からだ」画面 — 体重・7日移動平均・水分変動の説明・ベンチプレス。
 *
 * ★判断は生の体重で行わない。必ず7日移動平均。
 * ★測定条件を毎回表示する。条件がズレると数字が読めなくなる。
 * ★増えた理由を必ず説明する。説明が無いと自己判断でカロリーを削り始める。
 */

import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { goalFromTargetBodyFat, movingAverage, reviewWeek } from '../core/calc'
import { addLogDays } from '../core/dateBoundary'
import { explainWeightChange, judgeBench } from '../core/weightJudge'
import { mealsOf, recentDates, sumMeals, useStore } from '../store'

export function Body() {
  const { state, update, today, plan } = useStore()
  const [w, setW] = useState('')
  const [bf, setBf] = useState('')
  const [smm, setSmm] = useState('')
  const [isRef, setIsRef] = useState(false)
  const [bench, setBench] = useState({ weightKg: '100', reps: '' })

  const weights = [...state.weights].sort((a, b) => a.logDate.localeCompare(b.logDate))
  const latest = weights[weights.length - 1]
  const prev = weights[weights.length - 2]

  // ---- グラフ（生 + 7日移動平均の2本） ----
  const chart = useMemo(() => {
    const days = recentDates(today, 28).reverse()
    return days.map((d) => {
      const hit = weights.find((x) => x.logDate === d)
      return {
        d: d.slice(5).replace('-', '/'),
        raw: hit ? hit.weightKg : null,
        avg: movingAverage(weights, d, 7),
      }
    })
  }, [weights, today])

  // 目盛りは実測の幅だけで決める。目標線(76.3kg)まで含めると縦に潰れて読めなくなる
  const yDomain = useMemo<[number, number]>(() => {
    const vals = chart.flatMap((c) => [c.raw, c.avg]).filter((v): v is number => v != null)
    if (vals.length === 0) return [80, 86]
    return [Math.floor((Math.min(...vals) - 0.5) * 2) / 2, Math.ceil((Math.max(...vals) + 0.5) * 2) / 2]
  }, [chart])

  const thisAvg = movingAverage(weights, today, 7)
  const lastAvg = movingAverage(weights, addLogDays(today, -7), 7)
  const review = thisAvg != null && lastAvg != null ? reviewWeek({ thisWeekAvgKg: thisAvg, lastWeekAvgKg: lastAvg }) : null

  // ---- 水分変動の自動説明 ----
  const explain = useMemo(() => {
    if (!latest || !prev) return null
    const yDate = prev.logDate
    const yMeals = mealsOf(state, yDate)
    const ySum = sumMeals(yMeals)
    const base = recentDates(today, 14)
      .map((d) => sumMeals(mealsOf(state, d)))
      .filter((s) => s.kcal > 0)
    const baseline = base.length
      ? {
          carbG: base.reduce((a, s) => a + s.carbG, 0) / base.length,
          saltG: base.reduce((a, s) => a + s.saltG, 0) / base.length,
        }
      : { carbG: plan.carbG, saltG: 7 }
    return explainWeightChange({
      todayKg: latest.weightKg,
      yesterdayKg: prev.weightKg,
      yesterday: {
        logDate: yDate,
        kcal: ySum.kcal,
        carbG: ySum.carbG,
        saltG: ySum.saltG,
        trained: !!state.days[yDate]?.trained,
        ateOut: yMeals.some((m) => m.kind === 'eat_out'),
        measuredHour: new Date(prev.measuredAt).getHours(),
      },
      baseline,
      todayMeasuredHour: new Date(latest.measuredAt).getHours(),
    })
  }, [latest, prev, state, today, plan])

  const goal = goalFromTargetBodyFat(plan.lbmKg, state.profile.weightKg, state.profile.targetBodyFatPct)
  const benchLatest = state.bench[state.bench.length - 1] ?? null
  const benchJudge = judgeBench(benchLatest)

  function saveWeight() {
    const kg = Number(w)
    if (!kg) return
    const rec = {
      logDate: today,
      measuredAt: new Date().toISOString(),
      weightKg: kg,
      bodyFatPct: bf ? Number(bf) : null,
      skeletalMuscleKg: smm ? Number(smm) : null,
      isReference: isRef,
    }
    update((s) => ({
      ...s,
      weights: [...s.weights.filter((x) => x.logDate !== today), rec],
      // 体組成計の値が入ったらプロフィールも追随させる（目標が古い体重のままにならないように）
      profile: {
        ...s.profile,
        weightKg: isRef ? s.profile.weightKg : kg,
        bodyFatPct: bf ? Number(bf) : s.profile.bodyFatPct,
        skeletalMuscleKg: smm ? Number(smm) : s.profile.skeletalMuscleKg,
      },
    }))
    setW('')
    setBf('')
    setSmm('')
    setIsRef(false)
  }

  function saveBench() {
    const reps = Number(bench.reps)
    if (!reps) return
    update((s) => ({
      ...s,
      bench: [...s.bench, { logDate: today, weightKg: Number(bench.weightKg) || 100, reps }],
    }))
    setBench({ weightKg: bench.weightKg, reps: '' })
  }

  const delta = latest && prev ? latest.weightKg - prev.weightKg : null

  return (
    <div className="view">
      <h2>からだ</h2>
      <p className="sub">判断は7日移動平均だけ。日々の増減には理由があります。</p>

      <div className="card">
        {latest ? (
          <div className="wt-now">
            <div className="n">
              {latest.weightKg.toFixed(1)}
              <s>kg</s>
            </div>
            {delta != null && (
              <div className={`d${delta <= 0 ? ' dn' : ''}`}>
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)}
              </div>
            )}
          </div>
        ) : (
          <div className="empty">体重を入れるとグラフが出ます</div>
        )}

        <div style={{ height: 150, marginBottom: 6 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#2A323C" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: '#8A939E', fontSize: 9 }} interval={6} axisLine={false} tickLine={false} />
              <YAxis
                domain={yDomain}
                tick={{ fill: '#8A939E', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip
                contentStyle={{ background: '#1D242D', border: '1px solid #2A323C', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#8A939E' }}
                formatter={(v: number) => `${v.toFixed(1)}kg`}
              />
              {/* 目標線はグラフの範囲に入っているときだけ引く */}
              <ReferenceLine
                y={goal.goalWeightKg}
                stroke="#7BA36F"
                strokeDasharray="4 4"
                ifOverflow="hidden"
              />
              <Line type="monotone" dataKey="raw" stroke="#3D4855" strokeWidth={1.5} dot={false} connectNulls name="実測" />
              <Line type="monotone" dataKey="avg" stroke="#D9A441" strokeWidth={2.5} dot={false} connectNulls name="7日平均" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="beam-foot">
          <span>実測（細い線）</span>
          <span className="rest">7日平均（太い線）／ 目標 {goal.goalWeightKg.toFixed(1)}kg</span>
        </div>
      </div>

      {explain?.shouldExplain && (
        <div className="card">
          <div className="explain">
            <b>
              {explain.deltaKg > 0 ? '+' : ''}
              {explain.deltaKg.toFixed(1)}kg の理由を推定しました
            </b>
            <ul>
              {explain.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>{explain.reassurance}</div>
          </div>
        </div>
      )}

      {review && (
        <div className="card">
          <div className="card-h">
            <div className="t">今週の判定</div>
            <div className="s">
              {review.deltaKg > 0 ? '+' : ''}
              {review.deltaKg.toFixed(2)}kg / 週
            </div>
          </div>
          <div className="explain">{review.message}</div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <div className="t">体重を入れる</div>
          <div className="s">1日1回</div>
        </div>
        <div className="cond" style={{ marginBottom: 12 }}>
          <span>起床後</span>
          <span>トイレ後</span>
          <span>食前</span>
          <span>下着のみ</span>
        </div>
        <div className="row3">
          <div className="field">
            <label>体重 kg</label>
            <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="83.3" />
          </div>
          <div className="field">
            <label>体脂肪 %</label>
            <input inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} placeholder="15.7" />
          </div>
          <div className="field">
            <label>骨格筋 kg</label>
            <input inputMode="decimal" value={smm} onChange={(e) => setSmm(e.target.value)} placeholder="40.1" />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={isRef} onChange={(e) => setIsRef(e.target.checked)} />
          条件が違う（参考値にする。7日平均から外れます）
        </label>
        <button className="primary" onClick={saveWeight} disabled={!w}>
          記録する
        </button>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">ベンチプレス</div>
          <div className="s">体組成計より確実な筋量の指標</div>
        </div>
        {benchLatest && (
          <div className="item">
            <span>
              {benchLatest.weightKg}kg × {benchLatest.reps}回
            </span>
            <span className={`amt ${benchJudge.verdict === 'holding' ? 'ok' : 'warn'}`}>
              {benchJudge.verdict === 'holding' ? '維持' : '低下'}
            </span>
          </div>
        )}
        <div className="explain" style={{ marginBottom: 12 }}>
          {benchJudge.message}
        </div>
        <div className="row">
          <div className="field">
            <label>重量 kg</label>
            <input
              inputMode="decimal"
              value={bench.weightKg}
              onChange={(e) => setBench({ ...bench, weightKg: e.target.value })}
            />
          </div>
          <div className="field">
            <label>回数</label>
            <input inputMode="numeric" value={bench.reps} onChange={(e) => setBench({ ...bench, reps: e.target.value })} />
          </div>
        </div>
        <button className="primary" onClick={saveBench} disabled={!bench.reps}>
          記録する
        </button>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="t">目標まで</div>
          <div className="s">体脂肪 {state.profile.targetBodyFatPct}%</div>
        </div>
        <div className="item">
          <span>目標体重（除脂肪 {plan.lbmKg}kg から逆算）</span>
          <span className="amt">{goal.goalWeightKg.toFixed(1)}kg</span>
        </div>
        <div className="item">
          <span>残り</span>
          <span className="amt">{Math.max(0, goal.fatToLoseKg).toFixed(1)}kg</span>
        </div>
      </div>
    </div>
  )
}
