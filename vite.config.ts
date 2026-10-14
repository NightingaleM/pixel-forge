import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ed25519 } from '@noble/curves/ed25519'
import { TEST_PRIVATE_KEY_HEX } from './scripts/read-test-key.mjs'
import { createLicenseObfuscatorPlugin, licenseManualChunks } from './scripts/obfuscateLicense'

// ── license 验签公钥按环境注入(define=构建期文本替换,dev/test/build 均可靠,
//    不经 env 文件——本 vite 8 下 env 注入 dev 的 import.meta.env 不可靠)──
// dev/test:从 testKey.ts(联调钥唯一源)派生公钥,换联调钥只改 testKey.ts 两行;
// production:生产公钥,换钥只改下面一行。⚠️ 当前生产值为考古推断(a7e5a69
// 换入的"后端换钥对"),上线前必须与生产后端配置核对,错则生产码全验不过。
const PROD_LICENSE_PUBKEY = '99fba9f2714f8c84597d97ecef10dbc7d10f9c71b49679de4d957cf5991269ae'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __LICENSE_PUBKEY__: JSON.stringify(
      mode === 'production' ? PROD_LICENSE_PUBKEY
        : Buffer.from(ed25519.getPublicKey(TEST_PRIVATE_KEY_HEX)).toString('hex'),
    ),
  },
  server: {
    port: 5177,
    // /api 同源代理到后端网关(docker compose 宿主 7002):浏览器视为同源请求,
    // 免后端 CORS 白名单配置。mock 回归时以 API_PROXY_TARGET=http://localhost:3999
    // 启动(process.env 在 config 层可靠;import.meta.env 的命令行注入在此 vite 8
    // 下不生效,测试公钥由 scripts/verify-license.mjs 在页面内经 setLicensePublicKey 注入)。
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:7002',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), createLicenseObfuscatorPlugin()],
  // ── license 链路定向混淆(2026-10-14):manualChunks 把 src/lib/license/** 与
  //    @noble/curves 归入独立 license chunk,generateBundle 钩子只对它上高强度
  //    混淆(rc4 字符串加密+控制流扁平化+自防护);其余 chunk 走 esbuild 默认压缩
  //    一字不动。约束与验证锚定在 scripts/obfuscateLicense.test.ts ──
  build: {
    rollupOptions: {
      output: { manualChunks: licenseManualChunks },
    },
  },
}))
