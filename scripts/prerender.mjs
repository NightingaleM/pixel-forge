// ============================================================
// 构建后预渲染（SEO 方案 B）
// 启动 vite preview，用 puppeteer-core 逐路由抓取 JS 执行完毕后的
// 完整 HTML，写入 dist/<route>/index.html。不执行 JS 的爬虫（百度等）
// 与社交分享抓取器即可拿到带每路由 meta 的静态内容。
//
// 路由清单须与 src/lib/pageMeta.ts 的 PAGE_METAS 保持一致（单测锁定）。
// 浏览器探测：PUPPETEER_EXECUTABLE_PATH > Windows Chrome/Edge > Linux chromium。
// Docker（node:22-alpine）构建时由 Dockerfile apk add chromium 提供。
// ============================================================
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer-core'

const PORT = 4317
const ROUTES = ['/', '/2d', '/3d', '/about', '/privacy', '/terms', '/help']
const DIST = path.resolve(process.cwd(), 'dist')

function findChrome() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
      ]
    : ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  throw new Error(
    '未找到 Chrome/Chromium。请安装或设置 PUPPETEER_EXECUTABLE_PATH 指向浏览器可执行文件。',
  )
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) reject(new Error(`preview 服务器 ${timeoutMs / 1000}s 内未就绪`))
        else setTimeout(tryConnect, 300)
      })
    }
    tryConnect()
  })
}

function startPreviewServer() {
  // 直接 spawn node + vite bin（不经 npx/shell）：Windows 下 shell:true 的
  // kill 无法传递到孙进程，且显式 --host 127.0.0.1 避免 localhost 解析到 ::1
  const viteBin = path.join('node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  child.stdout.on('data', () => {}) // 丢弃，避免与进度输出混杂
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
  return child
}

async function main() {
  if (!existsSync(DIST)) {
    throw new Error('dist/ 不存在——请先运行 npm run build')
  }

  const server = startPreviewServer()
  let browser
  try {
    await waitForPort(PORT, 30_000)
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
      defaultViewport: { width: 1280, height: 800 },
    })

    for (const route of ROUTES) {
      const page = await browser.newPage()
      // 固定中文：languagedetector 按 localStorage > navigator，
      // 全新 profile 的 localStorage 为空，双保险固定 navigator 为 zh-CN
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' })
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' })
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] })
      })
      // WebGL/资源加载的偶发脚本错误不应中断预渲染，仅记录
      page.on('pageerror', (err) => console.warn(`  [${route}] 页面脚本错误（已忽略）: ${err.message}`))

      await page.goto(`http://127.0.0.1:${PORT}${route}`, {
        waitUntil: 'networkidle0',
        timeout: 60_000,
      })
      // lazy 路由 chunk 加载完成、Suspense fallback 消失
      await page.waitForFunction(() => !document.querySelector('.loading'), { timeout: 30_000 })
      await new Promise((resolve) => setTimeout(resolve, 500))

      const rootText = await page.$eval('#root', (el) => el.innerText.trim())
      if (rootText.length < 20) {
        throw new Error(`[${route}] #root 文本仅 ${rootText.length} 字符，预渲染疑似失败`)
      }

      const html = await page.content()
      const file = route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, route, 'index.html')
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, html, 'utf8')
      console.log(`  ${route} -> ${path.relative(process.cwd(), file).replaceAll('\\', '/')}（#root ${rootText.length} 字符）`)
      await page.close()
    }
  } finally {
    await browser?.close()
    server.kill()
  }

  console.log(`预渲染完成：${ROUTES.length} 个路由`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
