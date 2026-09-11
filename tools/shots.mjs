/**
 * 実機幅（iPhone相当 390px）で全タブを撮る。
 * 端末に入っている Chrome をそのまま使う（puppeteer の Chromium は落とさない）。
 *
 *   node tools/shots.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8231/'
const OUT = process.argv[3] ?? 'C:/Users/st106/AppData/Local/Temp/claude/shots'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })

const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})

await page.goto(BASE, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1200))

// 初回は空なので、実データを入れてから撮る（8/17 のシナリオ相当）
await page.evaluate(() => {
  const now = new Date()
  const wake = new Date(now.getTime() - 3 * 3600 * 1000)
  const boundary = 4
  const logDate = (d) => {
    const x = new Date(d.getTime())
    if (x.getHours() < boundary) x.setDate(x.getDate() - 1)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const today = logDate(now)
  const day = (n) => {
    const d = new Date(now.getTime() - n * 86400000)
    return logDate(d)
  }
  // ★v4 の標準メニュー1食（そぼろ120g・卵1個・ご飯190g・オイル9g）＋プロテイン1杯。
  //   1食目 P65 なので 45g の警告は出ず、「確保できています」が出るのが正解。
  const group = 'g1'
  const meal1 = [
    { name: '鶏そぼろ（調理後・薄味）', foodId: 'sobo', amount: 120, unit: 'g', kcal: 204, proteinG: 33.6, fatG: 4.8, carbG: 7.2, saltG: 1 },
    { name: '卵', foodId: 'egg', amount: 1, unit: '個', kcal: 76, proteinG: 6, fatG: 5.2, carbG: 0.2, saltG: 0.2 },
    { name: '白米（炊飯後）', foodId: 'rice', amount: 190, unit: 'g', kcal: 296.4, proteinG: 4.75, fatG: 0.57, carbG: 70.3, saltG: 0 },
    { name: 'オリーブオイル', foodId: 'oil', amount: 9, unit: 'g', kcal: 81, proteinG: 0, fatG: 9, carbG: 0, saltG: 0 },
    { name: 'プロテイン', foodId: 'whey', amount: 1, unit: '杯', kcal: 120, proteinG: 21, fatG: 1.5, carbG: 3, saltG: 0.1 },
  ].map((m, i) => ({
    ...m,
    id: 'seed' + i,
    groupId: group,
    eatenAt: new Date(wake.getTime() + 30 * 60000).toISOString(),
    logDate: today,
    kind: 'meal',
  }))

  // 水分（v4 §3）。途中まで飲んだ状態
  const water = [200, 500, 500].map((ml, i) => ({
    id: 'w' + i,
    logDate: today,
    amountMl: ml,
    loggedAt: new Date(wake.getTime() + (i + 1) * 40 * 60000).toISOString(),
  }))

  const weights = []
  for (let i = 13; i >= 0; i--) {
    const base = 83.9 - (13 - i) * 0.05
    const bump = i === 0 ? 1.4 : 0
    weights.push({
      logDate: day(i),
      measuredAt: new Date(now.getTime() - i * 86400000).toISOString(),
      weightKg: Math.round((base + bump + (i % 3) * 0.12) * 10) / 10,
      isReference: false,
    })
  }

  const raw = JSON.parse(localStorage.getItem('keiryo.v1') || '{}')
  localStorage.setItem(
    'keiryo.v1',
    JSON.stringify({
      ...raw,
      meals: meal1,
      water,
      weights,
      bench: [{ logDate: today, weightKg: 125, reps: 1 }],
      days: { [today]: { wakeAt: wake.toISOString(), trained: true } },
    })
  )
})
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1500))

const tabs = [
  ['01-today', '今日'],
  ['02-log', '記録'],
  ['03-foods', '食材'],
  ['04-body', 'からだ'],
  ['05-more', '設定'],
]

for (const [file, label] of tabs) {
  await page.evaluate((lbl) => {
    const b = [...document.querySelectorAll('.tabs button')].find((x) => x.textContent.includes(lbl))
    b?.click()
  }, label)
  await new Promise((r) => setTimeout(r, 900))
  await page.screenshot({ path: `${OUT}/${file}.png` })
  const scrollable = await page.evaluate(() => {
    const v = document.querySelector('.view')
    return v ? v.scrollHeight > v.clientHeight : false
  })
  if (scrollable) {
    await page.evaluate(() => {
      const v = document.querySelector('.view')
      if (v) v.scrollTop = v.scrollHeight
    })
    await new Promise((r) => setTimeout(r, 600))
    await page.screenshot({ path: `${OUT}/${file}-bottom.png` })
  }
  console.log('shot', file)
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
