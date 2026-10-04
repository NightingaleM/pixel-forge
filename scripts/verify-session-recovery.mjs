// scripts/verify-session-recovery.mjs — 会话恢复(方案B IndexedDB)端到端验证
// 依赖 vite dev 已启动;Edge headless。场景:
//   S1 基本恢复:375px 上传 3 张 → reload → 确认弹窗(3 张 · X 分钟前)→ 恢复
//   S2 批量断点(全 done):3 张跑完 → reload → 恢复 → 结果 tab 3 个 done cell
//   S3 处理中断点:起跑后立即 reload → 恢复 → 无 processing 卡死、开始钮可再跑
//   S4 正常关闭:确认退出 → reload 无弹窗(记录已删)
//   S5 IDB 降级:indexedDB 抛错 → console.warn、无 pageerror、UI 无感
//   S6 桌面生效:1280px 上传 2 张 → reload → 恢复 + 参数面板在
// 用法:node scripts/verify-session-recovery.mjs [baseURL](默认 http://localhost:5173)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'artifacts/session-verify')
const PIC = (name) => resolve(ROOT, 'public/local_test_pic', name)
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check'],
})

// 强制中文(i18next detector 读 navigator.language,断言统一中文文案)
const forceZh = `Object.defineProperty(navigator,'language',{get:()=>'zh-CN'});
Object.defineProperty(navigator,'languages',{get:()=>['zh-CN']})`

async function newMobilePage() {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(forceZh)
  await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  page.on('pageerror', (err) => { failures++; console.error('[pageerror]', err.message) })
  await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
  return page
}

async function upload(page, pics) {
  const input = await page.$('input[type=file]')
  if (!input) throw new Error('未找到上传 input[type=file]')
  await input.uploadFile(...pics.map(PIC))
  await sleep(1800) // 读图 + 首帧 + 防抖 500ms 落盘
}

// 轮询 IDB 记录直到谓词为真(blob put 的 commit 可达秒级,reload 必须等落盘——
// in-flight 事务随页面卸载 abort,提前 reload 会把写入杀掉)
async function pollIdb(page, pred, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ok = await page.evaluate(`new Promise((resolve) => {
      const req = indexedDB.open('pixel-forge-session')
      req.onsuccess = () => {
        try {
          const get = req.result.transaction('sessions', 'readonly').objectStore('sessions').get('2d-current')
          get.onsuccess = () => { const r = get.result; resolve(!!r && (${pred})) }
          get.onerror = () => resolve(false)
        } catch (e) { resolve(false) }
      }
      req.onerror = () => resolve(false)
    })`)
    if (ok) return
    await sleep(400)
  }
  throw new Error(`pollIdb 超时: ${pred}`)
}

const restorePromptText = () =>
  Array.from(document.querySelectorAll('.dialog-message'))
    .find((e) => e.textContent?.includes('检测到上次未完成的会话'))?.textContent ?? ''

async function waitRestorePrompt(page, timeout = 8000) {
  // polling 定时轮询:非激活页 rAF 冻结会卡死默认的 raf 轮询
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.dialog-message')).some((e) => e.textContent?.includes('检测到上次未完成的会话')),
    { timeout, polling: 500 },
  )
  return page.evaluate(restorePromptText)
}

async function waitRestored(page, n) {
  await page.waitForFunction(
    (count) => {
      const thumbs = document.querySelectorAll('.image-strip-thumb:not(.image-strip-thumb--test)').length
      const restoring = Array.from(document.querySelectorAll('.dialog-message')).some((e) => e.textContent?.includes('正在恢复会话'))
      return thumbs === count && !restoring && !document.querySelector('.upload-zone')
    },
    { timeout: 15000, polling: 500 },
    n,
  )
}

async function closeSession(page) {
  await page.click('.close-btn')
  await page.waitForSelector('.dialog-overlay')
  await page.click('.dialog-overlay .dialog-btn--primary')
  await page.waitForSelector('.upload-zone', { timeout: 8000 })
  await sleep(600) // 删记录的 IDB 事务落定
}

// 场景间清场:批量面板全屏盖住 close-btn 时 UI 关闭路径不可达,改走「重挂载 →
// 恢复弹窗 → 丢弃」(顺带覆盖丢弃分支);无记录则直接完
async function discardSession(page) {
  await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
  try {
    await waitRestorePrompt(page, 4000)
    await page.click('.dialog-overlay .dialog-btn--secondary') // 丢弃
    await sleep(600)
  } catch { /* 无残留记录 */ }
}

try {
  // ---------- S1 基本恢复(移动端) ----------
  {
    const page = await newMobilePage()
    await upload(page, ['car.jpg', 'car2.jpg', 'cake.jpg'])
    await pollIdb(page, 'r.rows.length === 3')
    check('S1a0 上传后防抖落盘生效(IDB 3 行)', true)
    await page.reload({ waitUntil: 'networkidle0' })
    const text = await waitRestorePrompt(page)
    check('S1a 重载后弹恢复确认', text.includes('3 张'), text)
    await page.screenshot({ path: `${OUT}/s1-prompt.png` })
    await page.click('.dialog-overlay .dialog-btn--primary')
    await waitRestored(page, 3)
    check('S1b 恢复后 3 行回来(上传页消失)', true)
    await sleep(1200) // 首帧渲染
    await page.screenshot({ path: `${OUT}/s1-restored.png` })
    await discardSession(page)
    await page.close()
  }

  // ---------- S2 批量断点:全 done 行带结果恢复 ----------
  {
    const page = await newMobilePage()
    await upload(page, ['car.jpg', 'car2.jpg', 'cake.jpg'])
    await page.waitForSelector('.batch-panel--mobile', { timeout: 8000 })
    await page.screenshot({ path: `${OUT}/s2-batch-start.png` })
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.batch-panel--mobile .batch-btn--primary'))
        .find((b) => b.textContent?.includes('开始处理'))
      btn?.click()
    })
    // 起跑即自动切结果 tab:等 3 个 done cell(动作钮组仅 done 行渲染)
    await page.waitForFunction(
      () => document.querySelectorAll('.batch-panel--mobile .batch-cell-actions').length === 3,
      { timeout: 30000, polling: 500 },
    )
    await sleep(800)
    await pollIdb(page, 'r.rows.every(x => x.status === "done")') // done 即写全部 commit
    await page.reload({ waitUntil: 'networkidle0' })
    const text = await waitRestorePrompt(page)
    check('S2a 跑完后重载弹恢复确认', text.includes('3 张'), text)
    await page.click('.dialog-overlay .dialog-btn--primary')
    await waitRestored(page, 3)
    // 开批量面板 → 切结果 tab → 数 done cell
    const dock = await page.$$('.m-dock .m-dock-btn')
    await dock[3].click()
    await page.waitForSelector('.batch-panel--mobile', { timeout: 8000 })
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.batch-panel--mobile .batch-tab'))
      tabs.find((b) => b.textContent?.includes('结果'))?.click()
    })
    await sleep(600)
    const doneCells = await page.$$eval('.batch-panel--mobile .batch-cell-actions', (els) => els.length)
    check('S2b 恢复后 3 个 done 行带结果(下载钮组在)', doneCells === 3, `done cells=${doneCells}`)
    await page.screenshot({ path: `${OUT}/s2-restored-done.png` })
    await discardSession(page)
    await page.close()
  }

  // ---------- S3 处理中断点:processing 归一 pending,可再跑 ----------
  {
    const page = await newMobilePage()
    await upload(page, ['car.jpg', 'car2.jpg', 'cake.jpg'])
    await page.waitForSelector('.batch-panel--mobile', { timeout: 8000 })
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.batch-panel--mobile .batch-btn--primary'))
        .find((b) => b.textContent?.includes('开始处理'))
      btn?.click()
    })
    await sleep(250)
    // 等首张 done 落盘再 reload:记录确定存在(其余行截在 processing,落盘归一
    // pending——校验恢复归一)
    await pollIdb(page, 'r.rows.some(x => x.status === "done")')
    await page.reload({ waitUntil: 'networkidle0' })
    const text = await waitRestorePrompt(page)
    await page.click('.dialog-overlay .dialog-btn--primary')
    await waitRestored(page, 3)
    const dock = await page.$$('.m-dock .m-dock-btn')
    await dock[3].click()
    await page.waitForSelector('.batch-panel--mobile', { timeout: 8000 })
    await sleep(400)
    const startState = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.batch-panel--mobile .batch-btn--primary'))
        .find((b) => b.textContent?.includes('开始处理'))
      return btn ? { disabled: btn.disabled, label: btn.textContent } : null
    })
    check('S3 恢复后无 processing 卡死(开始钮可点)', startState !== null && !startState.disabled,
      startState?.label ?? 'btn missing')
    await page.screenshot({ path: `${OUT}/s3-restored-mid.png` })
    await discardSession(page)
    await page.close()
  }

  // ---------- S4 正常关闭:记录删除,重载无弹窗 ----------
  {
    const page = await newMobilePage()
    await upload(page, ['car.jpg'])
    await closeSession(page) // 单图:UI 确认「确认退出」→ resetSession → 删记录(本场景测的就是该路径)
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(1500)
    const promptGone = await page.evaluate(
      () => !Array.from(document.querySelectorAll('.dialog-message')).some((e) => e.textContent?.includes('检测到上次未完成的会话')),
    )
    const uploaderBack = await page.$('.upload-zone')
    check('S4 正常关闭后重载无恢复弹窗(回上传页)', promptGone && !!uploaderBack)
    await page.screenshot({ path: `${OUT}/s4-clean.png` })
    await page.close()
  }

  // ---------- S5 IDB 降级:静默 warn,UI 无感 ----------
  {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(`${forceZh};
      Object.defineProperty(window, 'indexedDB', { get() { throw new Error('simulated no-idb') } })`)
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const warns = []
    page.on('console', (msg) => { if (msg.text().includes('[session]')) warns.push(msg.text()) })
    page.on('pageerror', (err) => { failures++; console.error('[S5 pageerror]', err.message) })
    await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
    await upload(page, ['car.jpg'])
    await sleep(1500)
    const hasCanvas = await page.$('canvas')
    check('S5 IDB 异常静默降级(warn 且无崩溃)', warns.length > 0 && !!hasCanvas,
      `warns=${warns.length}, canvas=${!!hasCanvas}`)
    await page.screenshot({ path: `${OUT}/s5-degraded.png` })
    await page.close()
  }

  // ---------- S6 桌面同样生效 ----------
  {
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(forceZh)
    await page.setViewport({ width: 1280, height: 800 })
    page.on('pageerror', (err) => { failures++; console.error('[S6 pageerror]', err.message) })
    await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
    await upload(page, ['car.jpg', 'car2.jpg'])
    await pollIdb(page, 'r.rows.length === 2')
    await page.screenshot({ path: `${OUT}/s6-desktop-before.png` })
    await page.reload({ waitUntil: 'networkidle0' })
    const text = await waitRestorePrompt(page)
    check('S6a 桌面重载弹恢复确认', text.includes('2 张'), text)
    await page.click('.dialog-overlay .dialog-btn--primary')
    await waitRestored(page, 2)
    await sleep(1200)
    const paramPanel = await page.$('.param-panel')
    check('S6b 桌面恢复后参数面板在', !!paramPanel)
    await page.screenshot({ path: `${OUT}/s6-desktop-restored.png` })
    await discardSession(page)
    await page.close()
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  await browser.close()
}
