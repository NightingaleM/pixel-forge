# ============================================================
# Dockerfile - Pixel Forge (3D 像素创作平台)
# ============================================================
# React + TypeScript + Vite 前端应用
# 多阶段构建 (multi-stage build) 减小最终镜像体积：
#   - 第一阶段 (build): 安装依赖并构建生产版本
#   - 第二阶段 (serve): 仅保留构建产物，用 nginx 提供静态文件服务
# ============================================================

# ==================== 第一阶段：构建 ====================
FROM node:22-alpine AS build

# chromium 供构建期预渲染使用（scripts/prerender.mjs，SEO：为不执行 JS 的爬虫输出静态 HTML）
RUN apk add --no-cache chromium

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
