/**
 * 「からだ」画面 — 体重・7日移動平均・水分変動の説明・ベンチプレス。
 *
 * ★判断は生の体重で行わない。必ず7日移動平均。
 * ★測定条件を毎回表示する。条件がズレると数字が読めなくなる。
 * ★増えた理由を必ず説明する。説明が無いと自己判断でカロリーを削り始める。
 */

import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compareFixedWeeks, goalFromTargetBodyFat, movingAverage, reviewWeek } from '../core/calc'
import { estimateOneRepMax, explainWeightChange, judgeBench } from '../core/weightJudge'
import {
  buildAdjustmentOffer,
  skeletalMuscleChange2Weeks,
  wasStalledLastWeek,
} from '../core/adjustment'
import type { AdjustmentOption } from '../core/adjustment'
import {
  applyKcalAdjustment,
  mealsOf,
  recentDates,
  recordCardioChoice,
  sumMeals,
  undoAdjustment,
  useStore,
} from '../store'

export function Body() {
  const { state, update, today, plan } = useStore()
  const [w, setW] = useState('')
  const [bf, setBf] = useState('')
  const [smm, setSmm] = useState('')
  // ★体組成計の機種名。同じ日に3台で13.7%と18.2%に割れた実績があるので必須（v4 §9）
  const [device, setDevice] = useState('')
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

  // ★判定は固定週どうしの比較で出す（v4 §7）。移動窓だと毎日答えが動いてしまう。
  //   グラフに引く7日移動平均線（movingAverage）は今までどおり移動窓のまま。
  const weeks = useMemo(() => compareFixedWeeks(weights, today), [weights, today])

  /**
   * ★判定には「前の週も停滞だったか」と「骨格筋の2週変化」を必ず渡す。
   * 渡さないと ①1週目の停滞でカロリーを削ってしまう ②安全弁が効かない。
   */
  const review = useMemo(() => {
    if (!weeks.ready || weeks.thisWeek.avgKg == null || weeks.lastWeek.avgKg == null) return null
    return reviewWeek({
      thisWeekAvgKg: weeks.thisWeek.avgKg,
      lastWeekAvgKg: weeks.lastWeek.avgKg,
      stalledLastWeek: wasStalledLastWeek(weights, today),
      smmChange2WeeksKg: skeletalMuscleChange2Weeks(weights, today),
    })
  }, [weeks, weights, today])

  // ★判定から「押せる選択肢」を作る。実行するのは本人（v4 §7）
  const offer = useMemo(
    () => buildAdjustmentOffer(review, plan, state.adjustments, today),
    [review, plan, state.adjustments, today]
  )

  function choose(opt: AdjustmentOption) {
    const reason = review?.message ?? ''
    if (opt.kind === 'kcal' && opt.nextKcal != null) {
      const next = opt.nextKcal
      update((s) => applyKcalAdjustment(s, plan.kcal, next, reason, today))
    } else {
      update((s) => recordCardioChoice(s, reason, today))
    }
  }

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

  /** これまでに使った体組成計の機種名（入力候補に出す） */
  const deviceNames = useMemo(
    () => [...new Set(weights.map((x) => x.deviceName).filter((d): d is string => !!d))],
    [weights]
  )

  const goal = goalFromTargetBodyFat(plan.lbmKg, state.profile.weightKg, state.profile.targetBodyFatPct)
  const benchLatest = state.bench[state.bench.length - 1] ?? null
  /**
   * ★比べる相手はこれまでの自己ベスト（推定1RM）。
   * 「重量が維持〜向上している限り、筋肉は落ちていない」(v4 §7) を機械的に見るため、
   * 重量と回数を推定1RMにまとめてから比べる。回数だけで見ると
   * 125kg×1回（自己ベスト）が「低下」に化ける。
   */
  const benchBest = useMemo(() => {
    const all = state.bench.map((b) => estimateOneRepMax(b.weightKg, b.reps))
    return all.length ? Math.max(...all) : undefined
  }, [state.bench])
  const benchJudge = judgeBench(benchLatest, benchBest)

  function saveWeight() {
    const kg = Number(w)
    if (!kg) return
    const rec = {
      logDate: today,
      measuredAt: new Date().toISOString(),
      weightKg: kg,
      bodyFatPct: bf ? Number(bf) : null,
      skeletalMuscleKg: smm ? Number(smm) : null,
      deviceName: device.trim() || undefined,
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
    // 機種名は次回も同じことが多いので残す
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

      <div className="card">
        <div className="card-h">
          <div className="t">
            今週の判定
            <span>
              {weeks.thisWeek.weekStart.slice(5).replace('-', '/')}〜
              {weeks.thisWeek.weekEnd.slice(5).replace('-', '/')}
            </span>
          </div>
          <div className="s">
            {review
              ? `${review.deltaKg > 0 ? '+' : ''}${review.deltaKg.toFixed(2)}kg / 週`
              : `${weeks.thisWeek.days}/7日`}
          </div>
        </div>
        {review ? (
          <>
            <div className="item">
              <span>
                今週の平均
                <span className="sub2">
                  {weeks.thisWeek.days}日ぶん
                </span>
              </span>
              <span className="amt">{weeks.thisWeek.avgKg!.toFixed(2)}kg</span>
            </div>
            <div className="item">
              <span>
                前週の平均
                <span className="sub2">
                  {weeks.lastWeek.weekStart.slice(5).replace('-', '/')}〜
                  {weeks.lastWeek.weekEnd.slice(5).replace('-', '/')}・{weeks.lastWeek.days}日ぶん
                </span>
              </span>
              <span className="amt">{weeks.lastWeek.avgKg!.toFixed(2)}kg</span>
            </div>
            <div className="explain" style={{ marginTop: 12 }}>
              {review.message}
            </div>
          </>
        ) : (
          <div className="explain">
            {weeks.reason}
            <br />
            ★週の区切りは固定です。毎日ちがう答えが出ないように、日をまたいで平均を取り直しません。
          </div>
        )}
      </div>

      {/* ★判定から出た手。実行するのは本人（v4 §7：カロリー削減と有酸素は同時にやらない） */}
      {offer.show && (
        <div className={`card${offer.options.length > 0 ? ' urgent' : ''}`}>
          <div className="card-h">
            <div className="t">
              {offer.options.length > 0 ? '打てる手' : '今週の対応'}
              <span>週に1つまで</span>
            </div>
          </div>
          <div className="explain" style={{ marginBottom: offer.options.length ? 12 : 0 }}>
            <b style={{ display: 'block', marginBottom: 4 }}>{offer.title}</b>
            {offer.body}
          </div>
          {offer.options.map((opt) => (
            <div key={opt.kind} style={{ marginBottom: 10 }}>
              <button className="primary" style={{ marginBottom: 6 }} onClick={() => choose(opt)}>
                {opt.label}
              </button>
              <p className="hint" style={{ margin: 0 }}>
                {opt.detail}
              </p>
            </div>
          ))}
          {offer.note && <p className="hint">{offer.note}</p>}
        </div>
      )}

      {/* ★打った手の履歴。3ヶ月後に「なんでこの数字なんだっけ」とならないように */}
      {state.adjustments.length > 0 && (
        <div className="card">
          <div className="card-h">
            <div className="t">
              打った手の履歴<span>いつ・なぜ・いくつに</span>
            </div>
            <div className="s">{state.adjustments.length}件</div>
          </div>
          {state.adjustments.slice(0, 6).map((a) => (
            <div className="item" key={a.id}>
              <span>
                {a.logDate.slice(5).replace('-', '/')}{' '}
                {a.kind === 'kcal'
                  ? `${a.fromKcal?.toLocaleString()} → ${a.toKcal?.toLocaleString()}kcal`
                  : '有酸素を足す'}
                <span className="sub2">{a.reason}</span>
              </span>
              <button className="ghost" onClick={() => update((st) => undoAdjustment(st, a.id))}>
                取消
              </button>
            </div>
          ))}
          <p className="hint">
            目標カロリーは
            {state.profile.overrideKcal != null
              ? `いま ${state.profile.overrideKcal.toLocaleString()}kcal に固定しています。`
              : '自動計算のままです。'}
            自動計算に戻すときは設定タブの「1日の目標」を空にしてください。
          </p>
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
        {(bf || smm) && (
          <div className="field">
            <label>体組成計の機種（★必須）</label>
            <input
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="自宅 / FIT-EASY / InBody"
              list="keiryo-devices"
            />
            <datalist id="keiryo-devices">
              {deviceNames.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <p className="hint" style={{ marginTop: 6 }}>
              ★機種が違うと比べられません（同じ日に3台で 13.7% と 18.2% に割れた実績があります）。
              機種名を入れておくと、同じ機種どうしだけで判断します。
            </p>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={isRef} onChange={(e) => setIsRef(e.target.checked)} />
          条件が違う（参考値にする。7日平均から外れます）
        </label>
        <button className="primary" onClick={saveWeight} disabled={!w || ((!!bf || !!smm) && !device.trim())}>
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
              <span className="sub2">
                {benchJudge.e1RM}kg相当
                {benchBest != null && ` ／ 自己ベスト ${benchBest}kg相当`}
              </span>
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
