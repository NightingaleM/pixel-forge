/**
 * 视频导出能力矩阵取证:在本机 Chrome/Edge(可注入 flags)跑 c:/tmp/video-probe.html,
 * 输出 isConfigSupported(avc High/Baseline × hw 偏好)与 mediabunny canEncodeVideo 真链路结果。
 * 用法: node scripts/verify-video-support.mjs
 */
import puppeteer from 'puppeteer-core'
import { access, constants } from 'node:fs/promises'

const PAGE = 'file:///C:/tmp/video-probe.html'

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((c) => Boolean(c))

async function findBrowser() {
  for (const c of candidates) {
    try {
      await access(c, constants.X_OK)
      return c
    } catch {
      // 试下一个
    }
  }
  throw new Error('未找到 Chrome/Edge')
}

async function run(label, extraArgs) {
  const browser = await puppeteer.launch({
    executablePath: await findBrowser(),
    headless: true,
    args: ['--allow-file-access-from-files', ...extraArgs],
  })
  try {
    const page = await browser.newPage()
    await page.goto(PAGE, { waitUntil: 'load' })
    const res = await page.waitForFunction('window.__RESULT', { timeout: 30_000 }).then((h) => h.jsonValue())
    console.log(`\n===== ${label} =====`)
    console.log(JSON.stringify(res, null, 2))
  } finally {
    await browser.close()
  }
}

const exe = await findBrowser()
console.log('browser:', exe)
await run('headless 默认(无渲染 flags)', [])
await run('headless swiftshader(对齐动图浏览器测试)', ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'])

// 场景 3:局域网 IP + http(非安全上下文)——复现用户报告的环境
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import os from 'node:os'

const lanIp = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address)[0]
if (lanIp) {
  const MB_PATH = 'C:/Users/Night/Desktop/dev/web_pic_design_ai/node_modules/mediabunny/dist/bundles/mediabunny.mjs'
  const srv = createServer(async (req, res) => {
    try {
      if (req.url === '/mediabunny.mjs') {
        res.setHeader('content-type', 'text/javascript')
        res.end(await readFile(MB_PATH))
      } else {
        res.setHeader('content-type', 'text/html')
        res.end(await readFile('C:/tmp/video-probe-http.html'))
      }
    } catch {
      res.statusCode = 500
      res.end()
    }
  })
  await new Promise((r) => srv.listen(5190, '0.0.0.0', r))
  const browser = await puppeteer.launch({ executablePath: exe, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`http://${lanIp}:5190/`, { waitUntil: 'load' })
    const res = await page.waitForFunction('window.__RESULT', { timeout: 30_000 }).then((h) => h.jsonValue())
    console.log(`\n===== http://${lanIp}:5190 非安全上下文 =====`)
    console.log(JSON.stringify(res, null, 2))
  } finally {
    await browser.close()
    srv.close()
  }
} else {
  console.log('\n(未发现局域网 IPv4,跳过非安全上下文场景)')
}
