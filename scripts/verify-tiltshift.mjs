// scripts/verify-tiltshift.mjs — tiltshift 风格三端端到端验证(票 05)
// 依赖 vite dev(5173)已启动;Edge headless + swiftshader 软渲染。
// 覆盖:桌面(上传→选风格→智能焦带→渲染质量断言→13 滑杆→骰子→风格往返→竖幅)
// + H5(375×812 上传→风格 sheet→渲染)。批量路径的估计覆盖由单测覆盖,此处不重跑。
// 用法:node scripts/verify-tiltshift.mjs [baseURL]
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5175'
const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'artifacts/tiltshift-verify')
const IMG = (n) => resolve(ROOT, 'wayfinder/tiltshift-miniature/assets/testimg', n)
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''))
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check'],
})

/** 页内: dataURL -> 指定行窗的边缘能量(平均梯度幅值) */
async function edgeOf(page, url, y0, y1) {
  return page.evaluate((u, a, b) => new Promise((res) => {
    const im = new Image()
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height
      const x = c.getContext('2d'); x.drawImage(im, 0, 0)
      const w = im.width, h = Math.max(3, Math.floor(im.height * (b - a))), oy = Math.floor(im.height * a)
      const d = x.getImageData(0, oy, w, h).data
      const L = new Float32Array(w * h)
      for (let p = 0; p < w * h; p++) L[p] = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2]
      let e = 0, n = 0
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        e += Math.abs(L[j * w + i + 1] - L[j * w + i - 1]) + Math.abs(L[(j + 1) * w + i] - L[(j - 1) * w + i]); n++
      }
      res(n ? e / n : 0)
    }
    im.src = u
  }), url, y0, y1)
}

async function newPage(viewport) {
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.__errs = errs
  if (viewport) await page.setViewport(viewport)
  return page
}

try {
  // ---------- 桌面 ----------
  const page = await newPage({ width: 1440, height: 900 })
  await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
  // IDB 清理(上批教训:桌面批量会话污染)
  await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.deleteDatabase('pixel-forge-session')
    req.onsuccess = req.onerror = req.onblocked = () => res()
  }))
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(400)

  const nycB64 = readFileSync(IMG('image.png')).toString('base64')
  const input = await page.waitForSelector('input[type=file]', { timeout: 15000 })
  await input.uploadFile(IMG('image.png'))
  await sleep(2000)

  // 风格列表:末位 = 移轴微缩
  const items = await page.$$('.style-item')
  const lastLabel = items.length ? await items[items.length - 1].evaluate((el) => el.textContent) : ''
  check('桌面: 风格列表末位含移轴微缩', /移轴微缩/.test(lastLabel || ''), String(items.length) + ' 项')

  // 原图参照(页面内直绘 dataURL,不经风格处理)
  const origEdgeTop = await edgeOf(page, 'data:image/png;base64,' + nycB64, 0.02, 0.10)
  const origEdgeBand = await edgeOf(page, 'data:image/png;base64,' + nycB64, 0.42, 0.58)

  // 选 tiltshift → 渲染
  await items[items.length - 1].click()
  await sleep(1500)
  const canvas = await page.$('canvas')
  const shot = await page.evaluate(() => {
    const c = document.querySelector('.compare-container canvas') || document.querySelector('canvas')
    return c ? c.toDataURL('image/png') : ''
  })
  check('桌面: tiltshift 画布直出非空', shot.length > 100000, String(shot.length))
  await page.screenshot({ path: `${OUT}/01-desktop-nyc.png` })
  // 视觉回归基准: 终判默认参数的生产直出(对照 lab out/nyc__A.png 同参数)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`${OUT}/canvas-nyc-default.png`, Buffer.from(shot.slice(shot.indexOf(',') + 1), 'base64'))

  const topEdge = await edgeOf(page, shot, 0.02, 0.10)
  const bandEdge = await edgeOf(page, shot, 0.42, 0.58)
  check('桌面: 顶区细节融开(边缘能量降>40%)', topEdge < origEdgeTop * 0.6, `orig ${origEdgeTop.toFixed(2)} → ${topEdge.toFixed(2)}`)
  check('桌面: 焦带细节保留', bandEdge > origEdgeBand * 0.4, `orig ${origEdgeBand.toFixed(2)} → ${bandEdge.toFixed(2)}`)

  // 参数面板: 13 个滑杆 + 焦带位置滑杆在值域内(按行标签定位行内 range)
  const readBandY = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('.param-row')].find((r) => (r.querySelector('.param-label')?.textContent || '').startsWith('焦带位置'))
    return row ? row.querySelector('input[type=range]')?.value ?? null : null
  })
  const sliders = await page.$$('.param-row input[type=range], input[type=range]')
  const bandYVal = await readBandY()
  check('桌面: 13 个数值滑杆', sliders.length === 13, String(sliders.length))
  check('桌面: 智能焦带滑杆存在且在值域', bandYVal !== null && +bandYVal >= 0 && +bandYVal <= 1, 'bandY=' + bandYVal)

  // 骰子 → 画布变化(按文字定位,--secondary 类命中多个按钮)
  const shotBefore = shot
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /随机|Random/.test(b.textContent || ''))
    if (!btn) return false
    btn.click()
    return true
  })
  if (clicked) {
    await sleep(1200)
    const shotAfter = await page.evaluate(() => {
      const c = document.querySelector('.compare-container canvas') || document.querySelector('canvas')
      return c ? c.toDataURL('image/png') : ''
    })
    check('桌面: 骰子随机重渲', shotAfter.length > 100000 && shotAfter !== shotBefore, shotAfter.length + ' vs ' + shotBefore.length)
    await page.screenshot({ path: `${OUT}/02-desktop-random.png` })
    const v2 = await readBandY()
    check('桌面: 随机后焦带值仍合法', v2 !== null && +v2 >= 0 && +v2 <= 1, 'bandY=' + v2)
  } else {
    check('桌面: 骰子按钮存在', false, 'not found')
  }

  // 风格往返: halftone → tiltshift 无错
  await items[0].click()
  await sleep(800)
  const items2 = await page.$$('.style-item')
  await items2[items2.length - 1].click()
  await sleep(1200)
  const shotBack = await page.evaluate(() => {
    const c = document.querySelector('.compare-container canvas') || document.querySelector('canvas')
    return c ? c.toDataURL('image/png') : ''
  })
  check('桌面: 风格往返渲染正常', shotBack.length > 100000, String(shotBack.length))
  check('桌面: 全程无页面错误', page.__errs.length === 0, page.__errs.join(' | ').slice(0, 200))

  // 竖幅(印度集市)
  const input2 = await page.$('input[type=file]')
  await input2.uploadFile(IMG('image-2.png'))
  await sleep(2000)
  const shotPortrait = await page.evaluate(() => {
    const c = document.querySelector('.compare-container canvas') || document.querySelector('canvas')
    return c ? c.toDataURL('image/png') : ''
  })
  check('桌面: 竖幅渲染非空', shotPortrait.length > 80000, String(shotPortrait.length))
  await page.screenshot({ path: `${OUT}/03-desktop-portrait.png` })
  check('桌面: 竖幅无页面错误', page.__errs.length === 0, page.__errs.join(' | ').slice(0, 200))

  // ---------- H5(375×812 触屏) ----------
  const m = await newPage({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  await m.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
  await sleep(400)
  let minput = await m.waitForSelector('input[type=file]', { timeout: 12000 }).catch(() => null)
  if (!minput) {
    // 偶发加载竞态:重载一次再等
    await m.reload({ waitUntil: 'networkidle0' })
    await sleep(600)
    minput = await m.waitForSelector('input[type=file]', { timeout: 12000 })
  }
  await minput.uploadFile(IMG('image.png'))
  await sleep(2000)
  const styleBtn = await m.$('.m-style-btn')
  if (styleBtn) {
    // sheet 打开在触屏 headless 下坐标点击不稳: 恒走 DOM click,4s 无行再点一次
    const openSheet = async () => {
      await m.evaluate(() => document.querySelector('.m-style-btn')?.click())
      try { await m.waitForSelector('.m-style-row', { timeout: 4000 }); return true } catch { return false }
    }
    let opened = await openSheet()
    if (!opened) opened = await openSheet()
    check('H5: 风格 sheet 打开', opened, '')
    if (opened) {
      await sleep(600)
      // 末位行滚入后 DOM click(实测 puppeteer 真实坐标点击在触屏 sheet 上不触发)
      const hit = await m.evaluate(() => {
        const rows = [...document.querySelectorAll('.m-style-row')]
        const row = rows.find((r) => /移轴微缩|Tilt-Shift/.test(r.textContent || ''))
        if (!row) return false
        row.scrollIntoView({ block: 'center' })
        row.click()
        return true
      })
      await sleep(1200)
      const btnText = await m.evaluate(() => document.querySelector('.m-style-btn')?.textContent || '')
      check('H5: 风格 sheet 点选移轴微缩', hit && /移轴微缩|Tilt-Shift/.test(btnText), 'styleBtn=' + btnText)
      await sleep(800)
      const mshot = await m.evaluate(() => {
        const c = document.querySelector('canvas')
        return c ? c.toDataURL('image/png') : ''
      })
      check('H5: 画布直出非空', mshot.length > 100000, String(mshot.length))
      await m.screenshot({ path: `${OUT}/04-h5-nyc.png` })
    }
  } else {
    check('H5: 风格按钮存在', false, '.m-style-btn not found')
  }
  check('H5: 无页面错误', m.__errs.length === 0, m.__errs.join(' | ').slice(0, 200))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
}
