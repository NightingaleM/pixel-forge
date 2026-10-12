// scripts/verify-card-tilt.mjs — 转卡交互三修端到端验证(2026-10-12 调整)
// 依赖 vite dev 已启动;Edge headless。场景:
//   C0 普通模式无回归:canvas 盒=wrapper 全区(object-fit contain 旧行为不变)
//   C1 白边修复:3:2 图开转卡,canvas 盒比例==图片比例(letterbox 消失)
//   C2 75% 居中:开转卡显示尺寸=内容区×0.75,中心与 wrapper 中心对齐
//   C3 透视生效:inline transform 含 perspective(1100px);对角倾角互反
//      (右上 +rx/+ry vs 左下 -rx/-ry,±amp≈12° 阻尼收敛后)
//   C4 关档复位:scaler transform 回 translate(0px, 0px) scale(1)
// 用法:node scripts/verify-card-tilt.mjs [baseURL](默认 http://localhost:5173)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'artifacts/card-tilt-verify')
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

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
page.on('pageerror', (err) => { failures++; console.error('[pageerror]', err.message) })
await page.goto(`${BASE}/2d`, { waitUntil: 'networkidle0' })

const input = await page.$('input[type=file]')
if (!input) throw new Error('未找到上传 input[type=file]')
await input.uploadFile(PIC('car.jpg')) // 6960×4640 = 3:2 横图(非方,letterbox 可见场景)
await sleep(2000)

// 选 holofoil(全息箔)
const holofoilItem = await page.evaluateHandle(() =>
  Array.from(document.querySelectorAll('.style-item')).find((e) => e.textContent?.includes('全息箔')))
if (!(await holofoilItem.asElement())) throw new Error('未找到全息箔风格项')
await holofoilItem.asElement().click()
await sleep(2000)

const measure = () => page.evaluate(() => {
  const wrapper = document.querySelector('.canvas-wrapper')
  const canvas = document.querySelector('.card-tilt canvas')
  const tilt = document.querySelector('.card-tilt')
  const scaler = document.querySelector('.canvas-scaler')
  const wr = wrapper.getBoundingClientRect()
  const cr = canvas.getBoundingClientRect()
  return {
    wr: { w: wr.width, h: wr.height },
    cr: { w: cr.width, h: cr.height, x: cr.x, y: cr.y },
    cx: cr.x + cr.width / 2, cy: cr.y + cr.height / 2,
    wcx: wr.x + wr.width / 2, wcy: wr.y + wr.height / 2,
    tiltTransform: tilt?.style.transform ?? '',
    scalerTransform: scaler?.style.transform ?? '',
  }
})

// --- C0 普通模式:canvas 盒=wrapper 全区(旧行为无回归) ---
const m0 = await measure()
check('C0 普通模式 canvas 盒=wrapper 全区',
  Math.abs(m0.cr.w - m0.wr.w) < 2 && Math.abs(m0.cr.h - m0.wr.h) < 2,
  `canvas ${m0.cr.w.toFixed(0)}×${m0.cr.h.toFixed(0)} vs wrapper ${m0.wr.w.toFixed(0)}×${m0.wr.h.toFixed(0)}`)

// --- 开转卡 ---
// 先把参数浮窗(param-panel,fixed 可拖拽)拖到右上空白区:默认位置盖住画布
// 中部,hover 左下卡角会命中面板 → pointerleave 回正,干扰转卡测量
const panelHeader = await page.$('.param-panel-header')
if (panelHeader) {
  const hr = await panelHeader.boundingBox()
  if (hr) {
    await page.mouse.move(hr.x + hr.width / 2, hr.y + 10)
    await page.mouse.down()
    await page.mouse.move(1150, 500, { steps: 8 })
    await page.mouse.up()
    await sleep(300)
  }
}
const cardBtn = await page.evaluateHandle(() =>
  Array.from(document.querySelectorAll('button')).find((e) => e.textContent?.includes('转卡')))
if (!(await cardBtn.asElement())) throw new Error('未找到转卡按钮')
await cardBtn.asElement().click()
// C5a 开档渐变:100ms 时 inline scale 应在起点(1=未启动)与终点(0.75=瞬变)
// 之间(无 CSS transition 参与,inline 即实时值);headless rAF 冻结时复测一次
await sleep(100)
let animOpen = await page.evaluate(() => {
  const m = /scale\(([\d.]+)\)/.exec(document.querySelector('.canvas-scaler').style.transform)
  return m ? +m[1] : null
})
if (animOpen === 1 || animOpen === 0.75) {
  await sleep(300)
  animOpen = await page.evaluate(() => {
    const m = /scale\(([\d.]+)\)/.exec(document.querySelector('.canvas-scaler').style.transform)
    return m ? +m[1] : null
  })
}
check('C5a 开档缩放有渐变(中途态,非瞬变)',
  animOpen !== null && animOpen > 0.75 && animOpen < 1, `scale=${animOpen}`)

// 静止态:鼠标移到画布中心(倾角目标≈0 且刷新 lastPointer),等阻尼收敛——
// 开档即自摆/残余倾角会让 boundingRect 虚胖,几何测量必须静止态做
const wrect = await page.evaluate(() => {
  const r = document.querySelector('.canvas-wrapper').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
await page.mouse.move(wrect.x + wrect.w / 2, wrect.y + wrect.h / 2)
await sleep(1400)

// --- C1 白边修复:canvas 盒比例==图片比例(3:2) ---
const m1 = await measure()
const ar = m1.cr.w / m1.cr.h
check('C1 转卡 canvas 盒比例=图片 3:2(letterbox 消失)',
  Math.abs(ar - 1.5) < 0.02, `实测比例 ${ar.toFixed(3)}`)

// --- C2 75% 居中 ---
const contentW = Math.min(m1.wr.w, m1.wr.h * 1.5)
const expW = contentW * 0.75
check('C2a 转卡显示宽=内容区×0.75',
  Math.abs(m1.cr.w - expW) < 3, `实测 ${m1.cr.w.toFixed(1)} 预期 ${expW.toFixed(1)}`)
check('C2b 卡中心=wrapper 中心',
  Math.abs(m1.cx - m1.wcx) < 3 && Math.abs(m1.cy - m1.wcy) < 3,
  `Δx=${(m1.cx - m1.wcx).toFixed(1)} Δy=${(m1.cy - m1.wcy).toFixed(1)}`)

// --- C3 透视 + 对角手感 ---
const readTilt = (t) => {
  const m = /perspective\(1100px\) rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\)/.exec(t)
  return m ? { rx: +m[1], ry: +m[2] } : null
}
check('C3a inline transform 含 perspective(1100px)', m1.tiltTransform.includes('perspective(1100px)'), m1.tiltTransform)

const readStableTilt = async (nx, ny) => {
  // 取点=卡角内侧,若命中浮层(param-panel 等 fixed 浮窗盖画布)则向卡中心
  // 内移重试——hover 落到画布外元素会 pointerleave 回正。预埋 leave 探针诊断
  await page.evaluate(() => {
    window.__leaveAt = []
    window.__evts = []
    for (const t of ['pointermove', 'pointerleave', 'pointerout', 'pointerdown', 'pointercancel']) {
      window.addEventListener(t, (e) => {
        if (window.__evts.length < 40) window.__evts.push(t + ' tgt=' + ((e.target.className || '').toString().slice(0, 24) || e.target.tagName) + ' @' + Math.round(e.clientX) + ',' + Math.round(e.clientY))
      }, true)
    }
    document.querySelector('.canvas-wrapper').addEventListener('pointerleave', () => window.__leaveAt.push(Date.now()))
  })
  let px = 0, py = 0
  for (const shrink of [0.47, 0.40, 0.32, 0.24]) {
    px = m1.cr.x + m1.cr.w * (0.5 + nx * shrink)
    py = m1.cr.y + m1.cr.h * (0.5 + ny * shrink)
    const inCanvas = await page.evaluate(
      (x, y) => document.querySelector('.canvas-wrapper').contains(document.elementFromPoint(x, y)), px, py)
    if (inCanvas) break
  }
  await page.mouse.move(px, py)
  await sleep(1400)
  const leaveAt = await page.evaluate(() => window.__leaveAt)
  if (leaveAt.length) (await page.evaluate(() => window.__evts)).forEach((e) => console.log(`  [evts] ${e}`))
  const t = readTilt((await measure()).tiltTransform)
  return { t, leaveCount: leaveAt.length, at: `(${Math.round(px)},${Math.round(py)})` }
}
const tr = await readStableTilt(1, -1)   // 右上角
const bl = await readStableTilt(-1, 1)   // 左下角
if (tr.leaveCount || bl.leaveCount) console.log(`  [diag] pointerleave: 右上轮 ${tr.leaveCount} 次,左下轮 ${bl.leaveCount} 次`)
// 取点可能因浮窗遮挡内移(shrink),幅值随内移缩水——断言符号正确 + 幅值下限,
// 方向差异(用户诉求本质)由 C3d 互反保证
check('C3b 右上角 rx/ry 同为正(卡朝指针倾)',
  tr.t && tr.t.rx > 3 && tr.t.ry > 3, JSON.stringify(tr.t))
check('C3c 左下角 rx/ry 同为负(对角互反)',
  bl.t && bl.t.rx < -3 && bl.t.ry < -3, JSON.stringify(bl.t))
check('C3d 对角符号互反(手感方向不同)',
  tr.t && bl.t && Math.sign(tr.t.rx) !== Math.sign(bl.t.rx) && Math.sign(tr.t.ry) !== Math.sign(bl.t.ry), '')

// 视觉留档:右上/左下两个稳态的卡面放大截图(取点同 readStableTilt 的探测逻辑)
const shotAt = async (nx, ny, file) => {
  let px = 0, py = 0
  for (const shrink of [0.47, 0.40, 0.32, 0.24]) {
    px = m1.cr.x + m1.cr.w * (0.5 + nx * shrink)
    py = m1.cr.y + m1.cr.h * (0.5 + ny * shrink)
    const inCanvas = await page.evaluate(
      (x, y) => document.querySelector('.canvas-wrapper').contains(document.elementFromPoint(x, y)), px, py)
    if (inCanvas) break
  }
  await page.mouse.move(px, py)
  await sleep(1400)
  await (await page.$('.card-tilt')).screenshot({ path: resolve(OUT, file) })
}
await shotAt(1, -1, 'tilt-topright.png')
await shotAt(-1, 1, 'tilt-bottomleft.png')

// --- C4 关档复位(带渐变) ---
const beforeClose = await page.evaluate(() => ({
  computed: getComputedStyle(document.querySelector('.canvas-scaler')).transform.slice(0, 44),
  cls: document.querySelector('.canvas-scaler').className,
}))
console.log(`  [diag C4-before] cls="${beforeClose.cls}" computed=${beforeClose.computed}`)
await cardBtn.asElement().click()
// C5b 关档渐变:headless 对无活跃动画的页面会冻结 rAF(实测首段 7ms/帧后停
// 529ms,真实前台浏览器无此现象)——时间点断言不可靠,改为「非瞬变」判定:
// 200ms 时既未停在起点(0.750=未启动)也未到终点(≥0.999=瞬变);极端冻结
// 时复测一次
await sleep(200)
let animClose = await page.evaluate(() => {
  const m = /scale\(([\d.]+)\)/.exec(document.querySelector('.canvas-scaler').style.transform)
  return m ? +m[1] : null
})
if (animClose === 0.75 || (animClose !== null && animClose >= 0.999)) {
  await sleep(300)
  animClose = await page.evaluate(() => {
    const m = /scale\(([\d.]+)\)/.exec(document.querySelector('.canvas-scaler').style.transform)
    return m ? +m[1] : null
  })
}
check('C5b 关档缩放有渐变(中途态,非瞬变)',
  animClose !== null && animClose > 0.75 && animClose < 0.999, `scale=${animClose}`)
// C4 终态:轮询等动画自然收尾(结束帧写精确终点;轮询 evaluate 兼可唤醒被
// headless 冻结的 rAF)
const tEnd = Date.now()
for (;;) {
  const done = await page.evaluate(() => document.querySelector('.canvas-scaler').style.transform === 'translate(0px, 0px) scale(1)')
  if (done || Date.now() - tEnd > 3000) break
  await sleep(60)
}
const m4 = await measure()
check('C4 关转卡 scaler 复位 translate(0px, 0px) scale(1)',
  m4.scalerTransform.includes('translate(0px, 0px)') && m4.scalerTransform.includes('scale(1)'),
  m4.scalerTransform)

await page.screenshot({ path: resolve(OUT, 'final-page.png') })
await browser.close()
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
