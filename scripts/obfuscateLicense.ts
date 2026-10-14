// scripts/obfuscateLicense.ts
// license 链路定向混淆(2026-10-14 设计定稿):只混淆会员判定/门槛/水印链路,其余
// chunk 走 esbuild 默认压缩一字不动。⚠️ 诚实边界:混淆把「5 分钟 patch 掉
// getLicenseStatus」变成「数天逆向」,不能根除客户端破解——纯前端产品的物理上限。
// 变更约束(配套单测锚定,scripts/obfuscateLicense.test.ts):
//   - renameGlobals 必须 false:跨 chunk 导出名(getLicenseStatus 等)不能动
//   - debugProtection/disableConsoleOutput 关:不误伤开 DevTools 的正常用户
//   - domainLock 空:不锁域(preview/自部署/本地文件均可用)
//   - 混淆失败必须炸构建,不得静默裸奔上线
import JavaScriptObfuscator from 'javascript-obfuscator'
import type { ObfuscatorOptions } from 'javascript-obfuscator'
import type { Plugin } from 'vite'

/** license chunk 名(产物为 assets/license-<hash>.js) */
export const LICENSE_CHUNK_NAME = 'license'

/** manualChunks 分组:license 目录 + @noble/curves(验签依赖)归 license chunk,其余交 Rollup 默认分配。 */
export function licenseManualChunks(id: string): string | undefined {
  const norm = id.replace(/\\/g, '/')
  return (norm.includes('/src/lib/license/') || norm.includes('/node_modules/@noble/curves/'))
    ? LICENSE_CHUNK_NAME
    : undefined
}

// 高强度档(2026-10-14 调参定稿):原始 chunk 47KB,全强度(含死代码注入)实测膨胀
// 8.4 倍到 396KB/gzip 143KB——死代码注入性价比最差(只防静态阅读,扁平化+rc4 才是
// 核心防护),砍掉。license chunk 由 App2D 懒加载携带,不阻塞首屏。
export const OBFUSCATOR_OPTIONS: ObfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  sourceMap: false,
  domainLock: [] as string[],
}

/** 混淆一段 JS(须为合法 ESM chunk 文本);语法错误等混淆失败直接抛。 */
export function obfuscateLicenseChunk(code: string): string {
  return JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS).getObfuscatedCode()
}

/**
 * build 专用插件:generateBundle(所有 renderChunk/压缩已完成之后)只改写 license
 * chunk 内容,产物文件集合与文件名不变。dev/test 不实例化逻辑(apply:'build')。
 */
export function createLicenseObfuscatorPlugin(): Plugin {
  return {
    name: 'pixel-forge:license-obfuscator',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue
        if (!file.fileName.startsWith(`assets/${LICENSE_CHUNK_NAME}-`)) continue
        try {
          file.code = obfuscateLicenseChunk(file.code)
        } catch (err) {
          throw new Error(`license chunk 混淆失败(${file.fileName}),构建中止: ${err}`)
        }
      }
    },
  }
}
