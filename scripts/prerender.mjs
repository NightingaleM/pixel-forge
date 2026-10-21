// ============================================================
// 构建后预渲染（SEO 方案 B，多语言版）
// 启动 vite preview，用 puppeteer-core 按 LANGS × ROUTES 双循环抓取
// JS 执行完毕后的完整 HTML，写入 dist/{lang}/{route}/index.html。
// 语言由 URL 前缀驱动（规格 D8），无需 navigator 伪装。
// 另产出：根分发 stub（dist/index.html，零依赖语言协商跳转，规格 D2）
// 与 dist/sitemap.xml（scripts/sitemap.mjs 生成，规格 D6）。
//
// 路由/语言清单须与 src/lib/pageMeta.ts 的 PAGE_METAS、src/i18n/langs.ts
// 的 LANGS 保持一致（pageMeta.test.ts 单测锁定）。
// 浏览器探测：PUPPETEER_EXECUTABLE_PATH > Windows Chrome/Edge > Linux chromium。
// Docker（node:22-bookworm-slim）构建时由 Dockerfile 安装 chrome-headless-shell。
// ============================================================
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer-core'
import { buildSitemap } from './sitemap.mjs'

const PORT = 4317
const SITE_URL = 'https://pixelforge.oylz.site'

/** 与 src/i18n/langs.ts 的 LANGS 保持一致（单测锁定） */
export const LANGS = ['zh', 'en', 'ja', 'es', 'pt']

/** 与 src/lib/pageMeta.ts 的 PAGE_METAS 路径集保持一致（单测锁定） */
export const ROUTES = ['/', '/2d', '/3d', '/about', '/privacy', '/terms', '/help', '/license']

/** 根 stub 的语言展示名；键集须 == LANGS（单测锁定）。与 LANG_META 同步 */
export const LANG_LABELS = { zh: '中文', en: 'English', ja: '日本語', es: 'Español', pt: 'Português' }

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

function langUrlPath(lang, route) {
  return route === '/' ? `/${lang}/` : `/${lang}${route}`
}

/** 根分发 stub（规格 D2）：noindex + 零依赖协商跳转 + noscript 语言链接 */
function buildRootStub() {
  const links = LANGS.map((l) => `<a href="/${l}/">${LANG_LABELS[l]}</a>`).join(' · ')
  const langsJson = JSON.stringify(LANGS)
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>PixelForge</title>
<meta name="robots" content="noindex" />
</head>
<body>
<noscript>
  <p>PixelForge: ${links}</p>
</noscript>
<script>
(function () {
  var langs = ${langsJson};
  var pick = null;
  try {
    var saved = (localStorage.getItem("i18nextLng") || "").split("-")[0];
    if (langs.indexOf(saved) >= 0) pick = saved;
  } catch (e) {}
  if (!pick) {
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < list.length; i++) {
      var base = (list[i] || "").split("-")[0];
      if (langs.indexOf(base) >= 0) { pick = base; break; }
    }
  }
  location.replace("/" + (pick || "zh") + "/");
})();
</script>
</body>
</html>
`
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

    let done = 0
    for (const lang of LANGS) {
      for (const route of ROUTES) {
        const page = await browser.newPage()
        // WebGL/资源加载的偶发脚本错误不应中断预渲染，仅记录
        page.on('pageerror', (err) => console.warn(`  [${lang}${route}] 页面脚本错误（已忽略）: ${err.message}`))

        await page.goto(`http://127.0.0.1:${PORT}${langUrlPath(lang, route)}`, {
          waitUntil: 'networkidle0',
          timeout: 60_000,
        })
        // lazy 路由 chunk 加载完成、Suspense fallback 消失
        await page.waitForFunction(() => !document.querySelector('.loading'), { timeout: 30_000 })
        await new Promise((resolve) => setTimeout(resolve, 500))

        // 语言与 meta 断言：html lang / title / canonical 均由 URL 前缀驱动
        const htmlLang = await page.evaluate(() => document.documentElement.lang)
        if (htmlLang !== lang) {
          throw new Error(`[${lang}${route}] <html lang> 为 "${htmlLang}"，期望 "${lang}"`)
        }
        const title = await page.title()
        if (!title) throw new Error(`[${lang}${route}] title 为空`)
        const canonical = await page.evaluate(
          () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
        )
        const expectedCanonical = SITE_URL + langUrlPath(lang, route)
        if (canonical !== expectedCanonical) {
          throw new Error(`[${lang}${route}] canonical 为 "${canonical}"，期望 "${expectedCanonical}"`)
        }

        const rootText = await page.$eval('#root', (el) => el.innerText.trim())
        if (rootText.length < 20) {
          throw new Error(`[${lang}${route}] #root 文本仅 ${rootText.length} 字符，预渲染疑似失败`)
        }

        const html = await page.content()
        const rel = route === '/' ? `/${lang}/index.html` : `/${lang}${route}/index.html`
        const file = path.join(DIST, rel)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, html, 'utf8')
        done += 1
        console.log(`  ${rel}（#root ${rootText.length} 字符）`)
        await page.close()
      }
    }

    // 根分发 stub + 多语言 sitemap
    await writeFile(path.join(DIST, 'index.html'), buildRootStub(), 'utf8')
    await writeFile(
      path.join(DIST, 'sitemap.xml'),
      buildSitemap({ siteUrl: SITE_URL, langs: LANGS, routes: ROUTES }),
      'utf8',
    )
    console.log(`  index.html（根分发 stub）+ sitemap.xml（${LANGS.length * ROUTES.length} URL）`)
    console.log(`预渲染完成：${done} 个语言页面 + 根 stub + sitemap`)
  } finally {
    await browser?.close()
    server.kill()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
