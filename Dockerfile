# ============================================================
# Dockerfile - Pixel Forge (3D 像素创作平台)
# ============================================================
# React + TypeScript + Vite 前端应用
# 多阶段构建 (multi-stage build) 减小最终镜像体积：
#   - 第一阶段 (build): 安装依赖并构建生产版本
#   - 第二阶段 (serve): 仅保留构建产物，用 nginx 提供静态文件服务
# ============================================================

# ==================== 第一阶段：构建 ====================
FROM node:22-bookworm-slim AS build

# chrome-headless-shell 供构建期预渲染使用（scripts/prerender.mjs，SEO：为不执行 JS 的爬虫输出静态 HTML）
# - 不用 alpine：apk 的 chromium 不含 SwiftShader（无 GPU 容器里 /3d 路由 WebGL 必失败），
#   而官方 chrome-headless-shell 二进制需要 glibc（musl 上起不来）→ 用 Debian slim
# - chrome-headless-shell 自带 SwiftShader，无 GPU 容器也能软渲染 WebGL
# - 下载走 npmmirror 镜像（直连 storage.googleapis.com 不可靠），软链到 /usr/bin/chromium 供脚本探测
# - apt 换阿里云源加速
ENV PUPPETEER_DOWNLOAD_BASE_URL=https://registry.npmmirror.com/-/binary/chrome-for-testing
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates unzip \
     libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
     libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
     libgbm1 libasound2 libpango-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/* \
  && npx -y puppeteer browsers install chrome-headless-shell --path /opt/browsers \
  && ln -s /opt/browsers/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell /usr/bin/chromium

WORKDIR /app

# 先复制依赖配置文件，利用 Docker 层缓存加速重复构建
COPY package.json package-lock.json* ./

RUN npm install --ignore-scripts

# 复制所有源码和配置文件
COPY . .

# 限制 Node.js 堆内存为 512MB，防止构建时吃满服务器内存
ENV NODE_OPTIONS="--max-old-space-size=512"

# 分步构建：先 tsc 类型检查，再 vite 打包
# 避免 tsc 和 vite 同时占用内存（原 build 脚本是 tsc -b && vite build）
RUN npx tsc -b
RUN npx vite build

# 预渲染 7 个路由为静态 HTML（独立分步，chrome 与 vite 不同时占用内存）
RUN node scripts/prerender.mjs

# ==================== 第二阶段：运行 ====================
FROM nginx:alpine

# 自定义 nginx 配置（处理 SPA 路由刷新 + 低内存优化）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制产物到 nginx 静态文件目录
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
