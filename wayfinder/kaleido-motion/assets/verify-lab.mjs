// 万花筒动效 lab 冒烟验证(puppeteer-core + Edge headless, file:// 直开)
// 用法: node wayfinder/kaleido-motion/assets/verify-lab.mjs
import { access, constants } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const labUrl = 'file:///' + path.resolve(here, 'motion-lab.html').replace(/\\/g, '/')

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter((c) => Boolean(c))

async function findBrowser() {
  for (const c of chromeCandidates) {
    try { await access(c, constants.X_OK); return c } catch { /* next */ }
  }
  throw new Error('找不到 Edge/Chrome')
}

// 在页面内统计画布像素(避开 toDataURL 大字符串):mean + 非黑占比
async function canvasStats(page, sel) {
  return page.evaluate((sel) => {
    const cv = document.querySelector(sel)
    const off = document.createElement('canvas')
    off.width = 64; off.height = 64
    const c2 = off.getContext('2d')
    c2.drawImage(cv, 0, 0, 64, 64)
    const d = c2.getImageData(0, 0, 64, 64).data
    let sum = 0, lit = 0
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3
      sum += v
      if (v > 12) lit++
    }
    return { mean: +(sum / (d.length / 4)).toFixed(1), litRatio: +(lit / (d.length / 4)).toFixed(3) }
  }, sel)
}

const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  // 注:勿加 --use-gl=swiftshader 等软件 GL 参数——本机实测会 CONTEXT_LOST_WEBGL;
  // headless + 默认硬件 ANGLE 实测正常(mean>100, litRatio=1)。
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1180, height: 980, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message); process.exitCode = 1 })
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()) })

  await page.goto(labUrl)
  await page.waitForFunction(() => window.__labReady === true, { timeout: 8000 })

  // 等默认照片纹理就绪:画布出现非黑内容(判定逻辑须内联,回调在页面内执行)
  await page.waitForFunction(() => {
    const cv = document.querySelector('#gl')
    const off = document.createElement('canvas')
    off.width = 32; off.height = 32
    const c2 = off.getContext('2d')
    c2.drawImage(cv, 0, 0, 32, 32)
    const d = c2.getImageData(0, 0, 32, 32).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 12) lit++
    }
    return lit / (d.length / 4) > 0.35
  }, { timeout: 8000, polling: 400 })
  const s0 = await canvasStats(page, '#gl')
  console.log('[1] 静态渲染', JSON.stringify(s0))

  // 开启动效 → 循环播放,phase 应前进、画面应变化
  await page.click('#motionOn')
  await sleep(350)
  const ph1 = await page.evaluate(() => window.__lab.phase)
  await sleep(350)
  const ph2 = await page.evaluate(() => window.__lab.phase)
  const sMotion = await canvasStats(page, '#gl')
  console.log('[2] 动效循环 phase', ph1.toFixed(3), '->', ph2.toFixed(3), JSON.stringify(sMotion))
  if (ph1 === ph2) { console.error('FAIL: phase 未前进'); process.exitCode = 1 }

  // 类型切换:X 切到单向漂移 → 位置积分前进 + 对齐提示出现
  await page.select('#pt-cx', 'drift')
  await sleep(400)
  const p1 = await page.evaluate(() => window.__lab.pos.cx)
  await sleep(400)
  const p2 = await page.evaluate(() => window.__lab.pos.cx)
  const alignTxt = await page.evaluate(() => document.querySelector('#alignNote').textContent)
  console.log('[3] 漂移 pos', p1.toFixed(4), '->', p2.toFixed(4), '| 对齐提示:', alignTxt.slice(0, 60))
  if (p1 === p2) { console.error('FAIL: 漂移位置未前进'); process.exitCode = 1 }
  if (!alignTxt.includes('GIF')) { console.error('FAIL: 对齐提示缺失'); process.exitCode = 1 }

  // 256 色模拟开关
  await page.click('#fxSim')
  await sleep(200)
  const disp = await page.evaluate(() => ({
    gl: getComputedStyle(document.querySelector('#gl')).display,
    fx: getComputedStyle(document.querySelector('#fx')).display,
  }))
  console.log('[4] 256色模拟显示切换', JSON.stringify(disp))
  await page.screenshot({ path: path.join(here, 'lab-shot-overview.png') })
  await page.evaluate(() => { document.querySelector('#fxSim').click() })

  // 导出演示:开始 → 进度推进 → 取消
  await page.click('#goBtn')
  await sleep(300)
  const progTxt = await page.evaluate(() => document.querySelector('#progTxt').textContent)
  await page.click('#cancelBtn')
  await sleep(80)
  const afterCancel = await page.evaluate(() => document.querySelector('#goLabel').textContent)
  console.log('[5] 导出进度:', progTxt, '| 取消后按钮:', afterCancel)

  // 局部放大截图(画布中心 40%,取证 banding/镜像细节)
  const box = await page.evaluate(() => {
    const r = document.querySelector('#gl').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  await page.screenshot({
    path: path.join(here, 'lab-shot-zoom.png'),
    clip: { x: box.x + box.w * 0.3, y: box.y + box.h * 0.3, width: box.w * 0.4, height: box.h * 0.4 },
  })
  console.log('[6] 截图: lab-shot-overview.png / lab-shot-zoom.png')
  console.log('SMOKE', process.exitCode ? 'FAIL' : 'PASS')
} finally {
  await browser.close()
}
