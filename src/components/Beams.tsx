/**
 * ★画面の主役。PFC の3本バー。
 * 白い縦線が目標位置。そこに届いていれば正解、という読み方ができる形にする。
 * 数字を読まなくても判断できることを優先する。
 */

/** 目標位置をバーのどこに置くか（右に余白を残して超過を見せる） */
const TARGET_AT = 82

function Beam({
  cls,
  label,
  value,
  target,
  unit = 'g',
}: {
  cls: string
  label: string
  value: number
  target: number
  unit?: string
}) {
  const pct = Math.min((value / target) * TARGET_AT, 100)
  const rest = Math.round(target - value)
  return (
    <div className={`beam ${cls}`}>
      <div className="beam-top">
        <span>{label}</span>
        <em>
          {Math.round(value)}
          <s>
            / {target}
            {unit}
          </s>
        </em>
      </div>
      <div className="rail">
        <div className={`fill${value > target * 1.12 ? ' over' : ''}`} style={{ width: `${pct}%` }} />
        <div className="notch" style={{ left: `${TARGET_AT}%` }} />
      </div>
      <div className="beam-foot">
        <span>
          摂取 {Math.round(value)}
          {unit}
        </span>
        <span className="rest">
          {rest >= 0 ? `残り ${rest}${unit}` : `${-rest}${unit} 超過`}
        </span>
      </div>
    </div>
  )
}

export function Beams({
  eaten,
  target,
  kcal,
  weekLine,
  weekOk,
}: {
  eaten: { proteinG: number; fatG: number; carbG: number; kcal: number }
  target: { proteinG: number; fatG: number; carbG: number }
  kcal: number
  weekLine: string
  weekOk: boolean
}) {
  return (
    <div className="beams">
      <Beam cls="p" label="PROTEIN" value={eaten.proteinG} target={target.proteinG} />
      <Beam cls="f" label="FAT" value={eaten.fatG} target={target.fatG} />
      <Beam cls="c" label="CARB" value={eaten.carbG} target={target.carbG} />
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
