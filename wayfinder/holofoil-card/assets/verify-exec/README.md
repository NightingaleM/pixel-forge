# 票07 执行期浏览器验证归档(2026-10-12)

生成方式:vite dev(5177)+ Edge headless;WebGL 画布 canvas.toDataURL 直出(playbook)。

- `app-car-edge-t50-w2.png` — app 渲染边缘档(样张 car.png,t0.50 w2)。
  与样张 `../sampler-static/car__s1-2-edge-t50-w2.png` 对照:**上下翻转后逐像素等价**
  (meanDiff 1.12/255,浮点级;样张页未设 FLIP_Y 是翻转的,app 方向正确)。
  彩虹像素统计:app 8.78% = GPU 直渲样张 FS 8.78% = 样张产物 8.78%(三向一致)。
- `app-cartoon-edge-t50-w2.png` — 卡通(边缘模式主场)边缘档:rainbow 8.50%
  vs 样张同款 8.19%(纹理/画布尺寸差的合理带宽;效果与用户认可定稿一致)。
- `app-cardtilt-max.png` — 转卡模式 2x 满幅截图(amp=20,hover 边角)。
  3D/光效层证据(视觉上小倾角+箔面纹理难辨,以 DOM 数值为准):
  transform rotateX(6.04°) rotateY(-5.34°) / gloss backgroundPosition 63.6% /
  vignette opacity 0.32 / boxShadow 随倾角偏移。

e2e 断言 30/30 PASS(桌面 18/H5 6/导出模板运行时 6),详见关票 Resolution。
