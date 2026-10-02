// scripts/verify-mobile.mjs — 移动端端到端视觉验证(Task 11)
// 依赖 vite dev(5173)已启动;Edge headless 按 375x812 hasTouch isMobile dsf2
// 截图 8 张到 artifacts/mobile-verify/。骨架出自 task-11-brief,选择器按
// MobileShell2D/ImageUploader/App2D 实际 DOM 修正:
//   dock 顺序(有图+shader):[0]下载主键 [1]参数 [2]随机 [3]批量
//   风格 sheet 触发 = 顶栏 .m-style-btn;sheet 遮罩 .m-sheet-mask
//   批量多图上传(3 张一次)→ v3 自动弹全屏卡片流 .batch-panel--mobile
//   微信 UA 需在导航前 setUserAgent;下载主键 → 长按保存灯箱 .batch-lightbox
// 用法:node scripts/verify-mobile.mjs [baseURL](默认 http://localhost:5173)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'artifacts/mobile-verify')
// public/local_test_pic 下的既有测试图(绝对路径喂 uploadFile)
const PIC = (name) => resolve(ROOT, 'public/local_test_pic', name)
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const EDGE =
  process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    // headless 无 GPU 时 WebGL 走 swiftshader 软渲染(shader 风格画布依赖)
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
  ],
})

try {
  // ---------- 常规移动 viewport(非微信)----------
  const page = await browser.newPage()
  await page.setViewport({
    width: 375,
    height: 812,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  page.on('pageerror', (err) => console.error('[pageerror]', err.message))

  // 01 Home:两卡纵排 + 3D 角标
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
  await sleep(400)
  await page.screenshot({ path: `${OUT}/01-home.png` })
  console.log('01-home ok')

  // 02 /2d 空态:上传页
  await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
  await sleep(400)
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))
  console.log('webgl:', webgl)
  await page.screenshot({ path: `${OUT}/02-2d-empty.png` })
  console.log('02-2d-empty ok')

  // 03 载图后:dock / strip / 顶栏
  const input = await page.$('input[type=file]')
  if (!input) throw new Error('02 后未找到上传 input[type=file]')
  await input.uploadFile(PIC('car.jpg'))
  await sleep(1800) // 读图 + 首帧渲染
  await page.screenshot({ path: `${OUT}/03-2d-loaded.png` })
  console.log('03-2d-loaded ok')

  // 04 参数 sheet(dock 第 2 键 = 索引 1,peek 60% 档)
  const dockBtns = await page.$$('.m-dock .m-dock-btn')
  if (dockBtns.length < 4) throw new Error(`dock 键数异常:${dockBtns.length}`)
  await dockBtns[1].click()
  await sleep(700) // sheet 0.22s 过渡 + 首帧
  await page.screenshot({ path: `${OUT}/04-params-sheet.png` })
  console.log('04-params-sheet ok')

  // 关 sheet:点遮罩顶部(裸露区)
  await page.mouse.click(187, 120)
  await sleep(500)

  // 05 风格 sheet:顶栏风格名钮
  await page.click('.m-style-btn')
  await sleep(700)
  await page.screenshot({ path: `${OUT}/05-style-sheet.png` })
  console.log('05-style-sheet ok')
  await page.mouse.click(187, 120)
  await sleep(400)

  // 06 批量:重进 /2d,一次传 3 张 → v3 自动弹全屏卡片流
  await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
  const input2 = await page.$('input[type=file]')
  await input2.uploadFile(PIC('car.jpg'), PIC('car2.jpg'), PIC('cake.jpg'))
  await page.waitForSelector('.batch-panel--mobile', { timeout: 8000 })
  await sleep(1500) // 预览行渲染
  await page.screenshot({ path: `${OUT}/06-batch.png` })
  console.log('06-batch ok')

  // 07 /about 单栏
  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle0' })
  await sleep(400)
  await page.screenshot({ path: `${OUT}/07-info.png` })
  console.log('07-info ok')
  await page.close()

  // ---------- 微信 UA:下载 → 长按保存灯箱 ----------
  const wx = await browser.newPage()
  await wx.setUserAgent(
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49.2600(0x28003135) XWEB/1240',
  )
  await wx.setViewport({
    width: 375,
    height: 812,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  await wx.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })
  const wxInput = await wx.$('input[type=file]')
  await wxInput.uploadFile(PIC('car.jpg'))
  await sleep(1800)
  await wx.click('.m-dock-btn--primary') // 下载主键 → 微信内走灯箱
  await wx.waitForSelector('.batch-lightbox', { timeout: 8000 })
  await sleep(600)
  await wx.screenshot({ path: `${OUT}/08-wechat-save.png` })
  console.log('08-wechat-save ok')
  await wx.close()

  console.log('done:', OUT)
} finally {
  await browser.close()
}
