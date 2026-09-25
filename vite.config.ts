import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
  plugins: [react()],
})
