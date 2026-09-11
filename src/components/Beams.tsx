/**
 * ★画面の主役。PFC の3本バー ＋ v4 で足した 塩分・水分 の2本。
 * 白い縦線が目標位置。そこに届いていれば正解、という読み方ができる形にする。
 * 数字を読まなくても判断できることを優先する。
 *
 * ★PFC と 塩分・水分 は意味が逆なので、見た目で区別する。
 *   PFC・水分 = 届かせるもの（目標線まで伸ばす）
 *   塩分       = 超えてはいけないもの（越えたら朱に変わる）
 */

/** 目標位置をバーのどこに置くか（右に余白を残して超過を見せる） */
const TARGET_AT = 82

function Beam({
  cls,
  label,
  value,
  target,
  unit = 'g',
  thin = false,
  /** 上限系（超えたら悪い）。塩分だけ true */
  isLimit = false,
  /** 小数第1位まで出す（塩分・水分のL表示） */
  decimals = 0,
}: {
  cls: string
  label: string
  value: number
  target: number
  unit?: string
  thin?: boolean
  isLimit?: boolean
  decimals?: number
}) {
  const fmt = (n: number) => (decimals > 0 ? n.toFixed(decimals) : String(Math.round(n)))
  const pct = target > 0 ? Math.min((value / target) * TARGET_AT, 100) : 0
  const rest = target - value
  // 上限系は1gでも超えたら朱。届かせる系は12%超えてから朱（週で帳尻を合わせるため）
  const over = isLimit ? value > target : value > target * 1.12
  return (
    <div className={`beam ${cls}${thin ? ' thin' : ''}`}>
      <div className="beam-top">
        <span>{label}</span>
        <em>
          {fmt(value)}
          <s>
            / {fmt(target)}
            {unit}
          </s>
        </em>
      </div>
      <div className="rail">
        <div className={`fill${over ? ' over' : ''}`} style={{ width: `${pct}%` }} />
        <div className="notch" style={{ left: `${TARGET_AT}%` }} />
      </div>
      {!thin && (
        <div className="beam-foot">
          <span>
            摂取 {fmt(value)}
            {unit}
          </span>
          <span className="rest">
            {rest >= 0 ? `残り ${fmt(rest)}${unit}` : `${fmt(-rest)}${unit} 超過`}
          </span>
        </div>
      )}
      {thin && (
        <div className="beam-foot">
          <span>
            {isLimit
              ? rest >= 0
                ? `上限まであと ${fmt(rest)}${unit}`
                : `★${fmt(-rest)}${unit} 超過`
              : rest > 0
                ? `あと ${fmt(rest)}${unit}`
                : '達成'}
          </span>
        </div>
      )}
    </div>
  )
}

export function Beams({
  eaten,
  target,
  kcal,
  saltLimitG,
  waterMl,
  waterTargetMl,
  weekLine,
  weekOk,
}: {
  eaten: { proteinG: number; fatG: number; carbG: number; kcal: number; saltG: number }
  target: { proteinG: number; fatG: number; carbG: number }
  kcal: number
  saltLimitG: number
  waterMl: number
  waterTargetMl: number
  weekLine: string
  weekOk: boolean
}) {
  return (
    <div className="beams">
      <Beam cls="p" label="PROTEIN" value={eaten.proteinG} target={target.proteinG} />
      <Beam cls="f" label="FAT" value={eaten.fatG} target={target.fatG} />
      <Beam cls="c" label="CARB" value={eaten.carbG} target={target.carbG} />
      <Beam
        cls="salt"
        label="SALT"
        value={eaten.saltG}
        target={saltLimitG}
        thin
        isLimit
        decimals={1}
      />
      <Beam
        cls="water"
        label="WATER"
        value={waterMl / 1000}
        target={waterTargetMl / 1000}
        unit="L"
        thin
        decimals={1}
      />
      <div className="kcal-row">
        <div>
          <div className="lbl">TODAY</div>
          <div className="big">
            {Math.round(eaten.kcal).toLocaleString()}
            <s>/ {kcal.toLocaleString()} kcal</s>
          </div>
        </div>
        <div className="rt">
          {weekLine}
          <br />
          <span className={weekOk ? 'ok' : 'warn'}>
            {weekOk ? '週内で収まっています' : '週予算から充当中'}
          </span>
        </div>
      </div>
    </div>
  )
}
