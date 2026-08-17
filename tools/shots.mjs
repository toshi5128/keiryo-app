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
  const meal1 = [
    { name: '白米（炊飯後）', amount: 200, unit: 'g', kcal: 312, proteinG: 5, fatG: 0.6, carbG: 74.2 },
    { name: '卵', amount: 1, unit: '個', kcal: 76, proteinG: 6.2, fatG: 5.2, carbG: 0.2 },
    { name: '納豆', amount: 1, unit: 'P', kcal: 90, proteinG: 7.4, fatG: 4.5, carbG: 5.4 },
    { name: '鶏もも肉（皮なし・低温調理）', amount: 190, unit: 'g', kcal: 215, proteinG: 36.1, fatG: 9.5, carbG: 0 },
  ].map((m, i) => ({
    ...m,
    id: 'seed' + i,
    saltG: 0.5,
    eatenAt: new Date(wake.getTime() + 30 * 60000).toISOString(),
    logDate: today,
    kind: 'meal',
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
      weights,
      bench: [{ logDate: today, weightKg: 100, reps: 7 }],
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
