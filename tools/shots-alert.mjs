/** ★赤い警告（1食目のPが薄い・塩分超過）が実際に出るかを実機幅で目視する */
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2]
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--font-render-hinting=none'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto('http://localhost:8231/', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1200))

await page.evaluate(() => {
  const now = new Date()
  const wake = new Date(now.getTime() - 3 * 3600 * 1000)
  const d = new Date(now.getTime())
  if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // ★1食目がご飯と卵だけ（P10.3）＝ 45g を大きく下回る。加えて塩分を9.4gまで盛る
  const meals = [
    { name: '白米（炊飯後）', foodId: 'rice', amount: 170, unit: 'g', kcal: 265, proteinG: 4.3, fatG: 0.5, carbG: 62.9, saltG: 0 },
    { name: '卵', foodId: 'egg', amount: 1, unit: '個', kcal: 76, proteinG: 6, fatG: 5.2, carbG: 0.2, saltG: 0.2 },
    { name: '茎わかめ醤油漬', foodId: 'kuki', amount: 100, unit: 'g', kcal: 49, proteinG: 1.7, fatG: 0.3, carbG: 11.8, saltG: 4.1 },
    { name: 'タコキムチ', foodId: 'takokim', amount: 100, unit: 'g', kcal: 70, proteinG: 10, fatG: 0.5, carbG: 6, saltG: 5.1 },
  ].map((m, i) => ({
    ...m,
    id: 'a' + i,
    groupId: 'g1',
    eatenAt: new Date(wake.getTime() + 30 * 60000).toISOString(),
    logDate: today,
    kind: 'meal',
  }))

  const raw = JSON.parse(localStorage.getItem('keiryo.v1') || '{}')
  localStorage.setItem('keiryo.v1', JSON.stringify({
    ...raw,
    meals,
    water: [{ id: 'w1', logDate: today, amountMl: 500, loggedAt: new Date().toISOString() }],
    days: { [today]: { wakeAt: wake.toISOString(), trained: true } },
  }))
})
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: OUT })
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
