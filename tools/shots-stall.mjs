/**
 * ★2週連続で停滞した状態を作って、「打てる手」カードが出るかを実機幅で目視する。
 *
 *   node tools/shots-stall.mjs out.png [baseUrl]
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:8231/'
mkdirSync(dirname(OUT), { recursive: true })

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

await page.goto(BASE, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1200))

await page.evaluate(() => {
  const pad = (n) => (n < 10 ? '0' : '') + n
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  const boundary = 4
  const t = new Date(now.getTime())
  if (t.getHours() < boundary) t.setDate(t.getDate() - 1)
  const today = fmt(t)

  // 今日が属する週の月曜
  const monday = new Date(t.getTime())
  const dow = monday.getDay()
  monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow))

  // 3週ぶん。3週前 81.6 → 2週前 81.0 → 前週 81.0 → 今週 81.0
  // 前週も今週も動いていない＝★2週連続の停滞
  const weights = []
  const plan = [
    { offset: -21, kg: 81.6 },
    { offset: -14, kg: 81.0 },
    { offset: -7, kg: 81.0 },
    { offset: 0, kg: 81.0 },
  ]
  for (const wk of plan) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getTime())
      d.setDate(d.getDate() + wk.offset + i)
      if (d > t) break
      weights.push({
        logDate: fmt(d),
        measuredAt: new Date(d.getTime() + 8.5 * 3600 * 1000).toISOString(),
        // 日々は少しバラつかせる（一定だと移動平均線が一直線になり読めない）
        weightKg: Math.round((wk.kg + ((i % 3) - 1) * 0.2) * 10) / 10,
        isReference: false,
      })
    }
  }

  const raw = JSON.parse(localStorage.getItem('keiryo.v1') || '{}')
  localStorage.setItem('keiryo.v1', JSON.stringify({
    ...raw,
    weights,
    adjustments: [],
    // ★直近3回のうち最後が不調（寝不足で 100kg×3回）。判定が動かないことを見る
    bench: [
      { logDate: fmt(new Date(t.getTime() - 14 * 86400000)), weightKg: 115, reps: 2 },
      { logDate: fmt(new Date(t.getTime() - 7 * 86400000)), weightKg: 125, reps: 1 },
      { logDate: today, weightKg: 100, reps: 3 },
    ],
    // ★空腹が続いている状態（直近7日のうち4日が「やたら減る」）
    days: (() => {
      const out = {}
      const appetites = ['high', 'high', 'normal', 'high', 'high', 'normal', 'normal']
      appetites.forEach((a, i) => {
        const d = fmt(new Date(t.getTime() - i * 86400000))
        out[d] = { appetite: a, sleepHours: i === 0 ? 4.5 : 7 }
      })
      out[today] = {
        ...out[today],
        wakeAt: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(),
        trained: true,
      }
      return out
    })(),
  }))
})
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1500))

// 「からだ」タブへ
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.tabs button')].find((x) => x.textContent.includes('からだ'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 1200))

// 「打てる手」カードまで送る
await page.evaluate(() => {
  const v = document.querySelector('.view')
  const t = [...document.querySelectorAll('.card-h .t')].find((e) => e.textContent.includes('打てる手'))
  if (t && v) v.scrollTop = t.closest('.card').offsetTop - 24
})
await new Promise((r) => setTimeout(r, 700))
await page.screenshot({ path: OUT })

// -100kcal を押したあとも撮る
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button.primary')].find((x) => x.textContent.includes('kcal にする'))
  if (!b) return false
  b.click()
  return true
})
if (clicked) {
  await new Promise((r) => setTimeout(r, 900))
  await page.evaluate(() => {
    const v = document.querySelector('.view')
    const t = [...document.querySelectorAll('.card-h .t')].find((e) => e.textContent.includes('打った手の履歴'))
    if (t && v) v.scrollTop = t.closest('.card').offsetTop - 24
  })
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: OUT.replace(/\.png$/, '-after.png') })
}
// ベンチ（直近3回・最後が不調）と 今日の調子 も撮る
async function shotCard(tab, card, file) {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('.tabs button')].find((x) => x.textContent.includes(t))
    b?.click()
  }, tab)
  await new Promise((r) => setTimeout(r, 900))
  await page.evaluate((c) => {
    const v = document.querySelector('.view')
    const t = [...document.querySelectorAll('.card-h .t')].find((e) => e.textContent.includes(c))
    if (t && v) v.scrollTop = t.closest('.card').offsetTop - 24
  }, card)
  await new Promise((r) => setTimeout(r, 700))
  await page.screenshot({ path: OUT.replace(/\.png$/, file) })
}
await shotCard('からだ', 'ベンチプレス', '-bench.png')
await shotCard('今日', '今日の調子', '-condition.png')

console.log(clicked ? 'clicked -100kcal' : 'button not found')
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
