import { Suspense, lazy, useState } from 'react'
import { StoreProvider, mealsOf, useStore } from './store'
import { Today } from './screens/Today'
import { Records } from './screens/Records'
import { Foods } from './screens/Foods'
import { Settings } from './screens/Settings'

// グラフ(recharts)は重いので、「からだ」を開いたときに読み込む
const Body = lazy(() => import('./screens/Body').then((m) => ({ default: m.Body })))
import { remainingMeals } from './core/weightJudge'

const TABS = [
  { key: 'today', no: '01', label: '今日' },
  { key: 'log', no: '02', label: '記録' },
  { key: 'foods', no: '03', label: '食材' },
  { key: 'body', no: '04', label: 'からだ' },
  { key: 'more', no: '05', label: '設定' },
] as const

type TabKey = (typeof TABS)[number]['key']

const WD = ['日', '月', '火', '水', '木', '金', '土']

function Shell() {
  const [tab, setTab] = useState<TabKey>('today')
  const { state, today } = useStore()

  const d = new Date(today + 'T00:00:00')
  const day = state.days[today] ?? {}
  const wakeAt = day.wakeAt ? new Date(day.wakeAt) : null
  const eatenMealCount = new Set(
    mealsOf(state, today)
      .filter((m) => m.kind === 'meal')
      .map((m) => m.eatenAt.slice(0, 13))
  ).size
  const left = wakeAt ? remainingMeals(wakeAt, new Date(), eatenMealCount, state.profile.boundaryHour) : null

  return (
    <div className="app">
      <div className="bar">
        <span>
          {d.getMonth() + 1}/{d.getDate()} <b>{WD[d.getDay()]}</b>
        </span>
        <span>
          {wakeAt
            ? `起床 ${wakeAt.getHours()}:${wakeAt.getMinutes().toString().padStart(2, '0')} ・ 残り${left}食`
            : '起床まだ'}
        </span>
      </div>

      {tab === 'today' && <Today />}
      {tab === 'log' && <Records />}
      {tab === 'foods' && <Foods />}
      {tab === 'body' && (
        <Suspense fallback={<div className="view"><div className="empty">読み込み中</div></div>}>
          <Body />
        </Suspense>
      )}
      {tab === 'more' && <Settings />}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            <span className="ic">{t.no}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
