// scripts/obfuscateLicense.test.ts
// license 定向混淆的单测:manualChunks 分组 / ESM 混淆兼容性 / generateBundle 只动
// license chunk / 混淆失败必须炸构建 / 安全开关锁定。build 冒烟(真实产物)另走
// 浏览器实测,见 scripts/smoke-obfuscated.mjs。
import { describe, it, expect } from 'vitest'
import { rm, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import obfuscatorPkg from 'javascript-obfuscator/package.json'
import {
  LICENSE_CHUNK_NAME,
  licenseManualChunks,
  createLicenseObfuscatorPlugin,
  obfuscateLicenseChunk,
  OBFUSCATOR_OPTIONS,
} from './obfuscateLicense'

// ── 1. manualChunks 分组:license 目录与 @noble 归 license chunk,其余不动 ──
describe('licenseManualChunks', () => {
  it('license 目录模块归入 license chunk', () => {
    expect(licenseManualChunks('/proj/src/lib/license/verify.ts')).toBe(LICENSE_CHUNK_NAME)
    expect(licenseManualChunks('/proj/src/lib/license/watermark.ts')).toBe(LICENSE_CHUNK_NAME)
  })
  it('@noble/curves(验签依赖)归入 license chunk', () => {
    expect(licenseManualChunks('/proj/node_modules/@noble/curves/ed25519.js')).toBe(LICENSE_CHUNK_NAME)
  })
  it('Windows 反斜杠路径同样命中', () => {
    expect(licenseManualChunks('C:\\proj\\src\\lib\\license\\quota.ts')).toBe(LICENSE_CHUNK_NAME)
  })
  it('其余模块不分组(交由 Rollup 默认分配)', () => {
    expect(licenseManualChunks('/proj/src/lib/renderImage.ts')).toBeUndefined()
    expect(licenseManualChunks('/proj/src/components/App2D.tsx')).toBeUndefined()
    expect(licenseManualChunks('/proj/node_modules/react/index.js')).toBeUndefined()
  })
})

// ── 2. ESM 兼容:混淆产物必须仍是合法 ESM(import/export 不坏)且行为不变、明文消失 ──
describe('obfuscateLicenseChunk ESM 兼容', () => {
  it('混淆后可被真实动态 import,导出行为不变,敏感明文消失', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pf-obf-'))
    try {
      // 依赖 chunk 的替身:验签库的邻居依赖(license chunk 会 import 别的 chunk)
      const depFile = path.join(dir, 'dep.mjs')
      await writeFile(depFile, "export const MAGIC = 'DEP_MAGIC_7'\n")

      // 模拟 license chunk:含跨 chunk import、内部常量、导出函数、敏感明文
      const source = [
        "import { MAGIC } from './dep.mjs'",
        "const STORAGE = 'pixel-forge.license.v2'",
        "const HEAD = 'PF1'",
        'export function probe(a, b) {',
        '  return a + b + MAGIC.length + STORAGE.length + HEAD.length',
        '}',
      ].join('\n')
      const obfuscated = obfuscateLicenseChunk(source)

      expect(obfuscated).not.toContain('pixel-forge.license.v2')   // 存储键去明文
      expect(obfuscated).not.toContain('PF1')                        // 码头去明文
      expect(obfuscated).toMatch(/import|from/)                      // 依赖 import 未被拆掉

      // 真实 ESM 执行:写盘后动态 import,导出可用且行为正确
      const mainFile = path.join(dir, 'main.mjs')
      await writeFile(mainFile, obfuscated)
      const m = await import(`file://${mainFile.replace(/\\/g, '/')}`)
      // 3 + 4 + 11(DEP_MAGIC_7) + 22(存储键) + 3(PF1) = 43
      expect(m.probe(3, 4)).toBe(43)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('坏语法必须抛错(安全功能失败不得静默裸奔)', () => {
    expect(() => obfuscateLicenseChunk('function {{{')).toThrow()
  })
})

// ── 3. generateBundle 插件:只改写 license chunk,其余产物一字不动 ──
describe('createLicenseObfuscatorPlugin generateBundle', () => {
  const makeBundle = () => {
    const licenseCode = "const A='pixel-forge.license.v2';export function f(){return A.length}"
    const indexCode = 'console.log("app code stays readable minified")'
    return {
      'assets/index-abc123.js': { type: 'chunk', fileName: 'assets/index-abc123.js', code: indexCode },
      [`assets/${LICENSE_CHUNK_NAME}-def456.js`]: {
        type: 'chunk', fileName: `assets/${LICENSE_CHUNK_NAME}-def456.js`, code: licenseCode,
      },
      // 命名巧合:其他文件名含 "license" 字样但不是 license chunk —— 不应被动
      'assets/licenseHelp-ghi789.js': {
        type: 'chunk', fileName: 'assets/licenseHelp-ghi789.js', code: 'export const x = 1',
      },
      'assets/style-aaa.css': { type: 'asset', fileName: 'assets/style-aaa.css', source: 'body{}' },
    } as Record<string, { type: string; fileName?: string; code?: string; source?: string }>
  }

  it('license chunk 被混淆,其余文件原样,文件集合不变', () => {
    const bundle = makeBundle()
    const plugin = createLicenseObfuscatorPlugin()
    const hook = (plugin as { generateBundle: (o: unknown, b: unknown) => void }).generateBundle
    expect(typeof hook).toBe('function')
    hook.call(plugin, undefined, bundle)

    const license = bundle[`assets/${LICENSE_CHUNK_NAME}-def456.js`]
    expect(license.code).not.toContain('pixel-forge.license.v2')
    expect(license.code).not.toMatch(/return\s*A\.length/)       // 逻辑被混淆

    expect(bundle['assets/index-abc123.js'].code)
      .toBe('console.log("app code stays readable minified")')
    expect(bundle['assets/licenseHelp-ghi789.js'].code).toBe('export const x = 1')
    expect(bundle['assets/style-aaa.css'].source).toBe('body{}')
    expect(Object.keys(bundle).sort()).toEqual([
      'assets/index-abc123.js',
      'assets/license-def456.js',
      'assets/licenseHelp-ghi789.js',
      'assets/style-aaa.css',
    ].sort())
  })

  it('bundle 里没有 license chunk 时静默跳过(如 tree-shake 掉全部 license 代码)', () => {
    const bundle = makeBundle()
    delete bundle[`assets/${LICENSE_CHUNK_NAME}-def456.js`]
    const plugin = createLicenseObfuscatorPlugin()
    const hook = (plugin as { generateBundle: (o: unknown, b: unknown) => void }).generateBundle
    expect(() => hook.call(plugin, undefined, bundle)).not.toThrow()
  })

  it('license chunk 混淆失败必须抛错(炸构建而非裸奔)', () => {
    const bundle = makeBundle()
    bundle[`assets/${LICENSE_CHUNK_NAME}-def456.js`].code = 'function {{{'
    const plugin = createLicenseObfuscatorPlugin()
    const hook = (plugin as { generateBundle: (o: unknown, b: unknown) => void }).generateBundle
    expect(() => hook.call(plugin, undefined, bundle)).toThrow(/license/)
  })
})

// ── 4. 安全开关锁定:防未来手滑改坏安全语义(改这些前必须想清楚) ──
describe('OBFUSCATOR_OPTIONS 安全开关', () => {
  it('关键开关符合设计', () => {
    expect(OBFUSCATOR_OPTIONS.renameGlobals).toBe(false)            // 跨 chunk 导出名不能动
    expect(OBFUSCATOR_OPTIONS.debugProtection).toBe(false)          // 不误伤开 DevTools 的用户
    expect(OBFUSCATOR_OPTIONS.disableConsoleOutput).toBe(false)
    expect(OBFUSCATOR_OPTIONS.selfDefending).toBe(true)             // 防格式化回改
    expect(OBFUSCATOR_OPTIONS.stringArray).toBe(true)
    expect(OBFUSCATOR_OPTIONS.stringArrayEncoding).toContain('rc4') // 全量字符串加密
    expect(OBFUSCATOR_OPTIONS.stringArrayThreshold).toBe(1)
    expect(OBFUSCATOR_OPTIONS.controlFlowFlattening).toBe(true)
    expect(OBFUSCATOR_OPTIONS.sourceMap).toBe(false)                // 不出 map
    expect(OBFUSCATOR_OPTIONS.domainLock ?? []).toHaveLength(0)     // 不锁域(preview/自部署)
  })
})

// ── 5. javascript-obfuscator 版本漂移守卫:5.x 行为契约被单测锚定,大版本升级须重验 ──
describe('javascript-obfuscator 依赖', () => {
  it('版本为 5.x(升 6+ 需重跑全部混淆验证)', () => {
    expect(obfuscatorPkg.version.startsWith('5.')).toBe(true)
  })
})
