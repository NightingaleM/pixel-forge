// src/lib/holofoilZones.ts
// holofoil 分区档的 CPU 侧引擎(wayfinder/holofoil-card 票01/票03 定稿算法):
// k-means lite(RGB+xy 特征,k-means++ 固定 seed)256² 低清格 + 两遍 union-find
// 连通域 + <0.5% 小区整批并入 → 面积降序区块。掩膜=选中集合白/黑 canvas,
// 走 renderImage 的 uZoneMask 纹理上传(unit 2)。
// k=4 / xyw=0.5 为票05 拍板的产品常量,不入种子码不暴露(保同码跨设备一致)。
export const ZONE_GRID = 256
export const ZONE_K = 4
export const ZONE_XYW = 0.5

export interface ZoneRegion {
  id: number
  area: number
  /** 占比 0..100 */
  pct: number
  mean: [number, number, number]
  luma: number
  /** 质心 0..1 */
  cx: number
  cy: number
}

export interface ZoneAnalysis {
  /** S*S 低清格的区块号(面积降序) */
  regionIds: Uint16Array
  regions: ZoneRegion[]
}

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 分区分析(canvas 壳):低清格取像素后走 analyzeZonesFromPixels 纯函数。
 * 全设备确定(k-means++ mulberry32(42) 固定 seed + 固定轮数上限),同图同参数
 * 跨浏览器结果一致。256² 格 <50ms 桌面 / <150ms 移动(票03 实测)。
 */
export function analyzeZones(
  image: HTMLImageElement | HTMLCanvasElement,
  opts: { k?: number; xyw?: number } = {},
): ZoneAnalysis {
  const S = ZONE_GRID
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image as CanvasImageSource, 0, 0, S, S)
  return analyzeZonesFromPixels(ctx.getImageData(0, 0, S, S).data, opts)
}

/** 分区核心(k-means+连通域+编号):输入 256² RGBA 像素,纯函数可单测。 */
export function analyzeZonesFromPixels(
  d: Uint8ClampedArray | Uint8Array,
  opts: { k?: number; xyw?: number } = {},
): ZoneAnalysis {
  const k = Math.max(2, Math.min(10, opts.k ?? ZONE_K))
  const xyw = opts.xyw ?? ZONE_XYW
  const S = ZONE_GRID
  const N = S * S

  // 特征: [r,g,b, x/S*255*xyw, y/S*255*xyw]
  const feats = new Float32Array(N * 5)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const j = i * 4
      const f = i * 5
      feats[f] = d[j]
      feats[f + 1] = d[j + 1]
      feats[f + 2] = d[j + 2]
      feats[f + 3] = (x / S) * 255 * xyw
      feats[f + 4] = (y / S) * 255 * xyw
    }
  }

  // k-means++ 初始化(固定 seed)
  const rnd = mulberry32(42)
  const cents = new Float32Array(k * 5)
  const dist2 = new Float32Array(N).fill(Infinity)
  let ci = Math.floor(rnd() * N)
  cents.set(feats.subarray(ci * 5, ci * 5 + 5), 0)
  for (let kk = 1; kk < k; kk++) {
    let sum = 0
    for (let i = 0; i < N; i++) {
      const f = i * 5
      let dd = 0
      for (let t = 0; t < 5; t++) {
        const q = feats[f + t] - cents[(kk - 1) * 5 + t]
        dd += q * q
      }
      if (dd < dist2[i]) dist2[i] = dd
      sum += dist2[i]
    }
    let target = rnd() * sum
    for (let i = 0; i < N; i++) {
      target -= dist2[i]
      if (target <= 0) { ci = i; break }
    }
    cents.set(feats.subarray(ci * 5, ci * 5 + 5), kk * 5)
  }

  // Lloyd 迭代(≤10 轮,中心移动 <0.5 提前停;空簇保留旧中心)
  const labels = new Uint8Array(N)
  const acc = new Float64Array(k * 5)
  const cnt = new Float64Array(k)
  for (let iter = 0; iter < 10; iter++) {
    let moved = 0
    acc.fill(0)
    cnt.fill(0)
    for (let i = 0; i < N; i++) {
      const f = i * 5
      let best = 0
      let bd = Infinity
      for (let kk = 0; kk < k; kk++) {
        let dd = 0
        for (let t = 0; t < 5; t++) {
          const q = feats[f + t] - cents[kk * 5 + t]
          dd += q * q
        }
        if (dd < bd) { bd = dd; best = kk }
      }
      labels[i] = best
      cnt[best]++
      for (let t = 0; t < 5; t++) acc[best * 5 + t] += feats[f + t]
    }
    for (let kk = 0; kk < k; kk++) {
      if (cnt[kk] === 0) continue
      for (let t = 0; t < 5; t++) {
        const nv = acc[kk * 5 + t] / cnt[kk]
        moved = Math.max(moved, Math.abs(nv - cents[kk * 5 + t]))
        cents[kk * 5 + t] = nv
      }
    }
    if (moved < 0.5) break
  }

  // 连通域:第一遍 union-find(4 邻接,同 k-means 标签才并)
  const parent = new Int32Array(N)
  for (let i = 0; i < N; i++) parent[i] = i
  const find = (a0: number): number => {
    let a = a0
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      if (x > 0 && labels[i] === labels[i - 1]) union(i, i - 1)
      if (y > 0 && labels[i] === labels[i - S]) union(i, i - S)
    }
  }
  // 第二遍:root 压平 + 组件面积
  const compOf = new Int32Array(N)
  const compArea = new Map<number, number>()
  for (let i = 0; i < N; i++) {
    const r = find(i)
    compOf[i] = r
    compArea.set(r, (compArea.get(r) ?? 0) + 1)
  }

  // <0.5% 小区整批并入最大邻接区(每轮单扫收集全部邻接关系;逐小区迭代在照片上
  // 产生 2000+ 碎片区超 Uint8 上限,票03 教训)
  const MIN_AREA = Math.max(16, Math.floor(N * 0.005))
  for (let round = 0; round < 8; round++) {
    const small = [...compArea.entries()].filter(([, a]) => a < MIN_AREA).map(([r]) => r)
    if (small.length === 0) break
    const touch = new Map<number, Map<number, number>>()
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x
        const r1 = compOf[i]
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue
          const r2 = compOf[ny * S + nx]
          if (r2 === r1) continue
          let m = touch.get(r1)
          if (!m) { m = new Map(); touch.set(r1, m) }
          m.set(r2, (m.get(r2) ?? 0) + 1)
        }
      }
    }
    const mergeInto = new Map<number, number>()
    for (const sr of small.sort((a, b) => (compArea.get(b) ?? 0) - (compArea.get(a) ?? 0))) {
      const m = touch.get(sr)
      if (!m) continue // 孤岛保留
      let best = -1
      let bestA = -1
      for (const [r2] of m) {
        const a = compArea.get(r2) ?? 0
        if (a > bestA) { bestA = a; best = r2 }
      }
      if (best >= 0 && !mergeInto.has(best)) mergeInto.set(sr, best)
    }
    if (mergeInto.size === 0) break
    for (let i = 0; i < N; i++) {
      const t = mergeInto.get(compOf[i])
      if (t !== undefined) compOf[i] = t
    }
    compArea.clear()
    for (let i = 0; i < N; i++) compArea.set(compOf[i], (compArea.get(compOf[i]) ?? 0) + 1)
  }

  // 最终编号:面积降序 0..n-1
  const roots = [...compArea.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])
  const idOf = new Map(roots.map((r, i) => [r, i]))
  const regionIds = new Uint16Array(N)
  for (let i = 0; i < N; i++) regionIds[i] = idOf.get(compOf[i])!

  // 区块元信息(均值色/质心/luma,来自低清格)
  const regions: ZoneRegion[] = roots.map((_, idx) => ({ id: idx, area: 0, pct: 0, mean: [0, 0, 0], luma: 0, cx: 0, cy: 0 }))
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const rg = regions[regionIds[i]]
      const j = i * 4
      rg.area++
      rg.mean[0] += d[j]
      rg.mean[1] += d[j + 1]
      rg.mean[2] += d[j + 2]
      rg.cx += x
      rg.cy += y
    }
  }
  for (const rg of regions) {
    rg.mean[0] /= rg.area
    rg.mean[1] /= rg.area
    rg.mean[2] /= rg.area
    rg.cx = rg.cx / rg.area / S
    rg.cy = rg.cy / rg.area / S
    rg.luma = (0.299 * rg.mean[0] + 0.587 * rg.mean[1] + 0.114 * rg.mean[2]) / 255
    rg.pct = (rg.area / N) * 100
  }
  return { regionIds, regions }
}

/** 掩膜像素:选中集合 → S² 白/黑 RGBA(纯函数)。 */
export function buildZoneMaskData(
  analysis: ZoneAnalysis,
  selected: ReadonlySet<number>,
): Uint8ClampedArray {
  const S = ZONE_GRID
  const px = new Uint8ClampedArray(S * S * 4)
  const { regionIds } = analysis
  for (let i = 0; i < S * S; i++) {
    const on = selected.has(regionIds[i]) ? 255 : 0
    px[i * 4] = on
    px[i * 4 + 1] = on
    px[i * 4 + 2] = on
    px[i * 4 + 3] = 255
  }
  return px
}

/**
 * 掩膜 canvas:选中区块集合 → S² 白/黑。LINEAR 上采样 + shader 内
 * smoothstep(0.35, 0.65) 得到羽化边界。
 */
export function drawZoneMask(
  analysis: ZoneAnalysis,
  selected: ReadonlySet<number>,
  target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const S = ZONE_GRID
  const canvas = target ?? document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(S, S)
  img.data.set(buildZoneMaskData(analysis, selected))
  ctx.putImageData(img, 0, 0)
  return canvas
}

/**
 * 画布 UV → 区块号(点选拾取,O(1) 查表)。3×3 众数抗羽化带误拾
 * (票01 建议,样张粗版直接查表未做;正式版按规格执行)。
 */
export function pickZone(analysis: ZoneAnalysis, u: number, v: number): number {
  const S = ZONE_GRID
  const cx = Math.min(S - 1, Math.max(0, Math.floor(u * S)))
  const cy = Math.min(S - 1, Math.max(0, Math.floor(v * S)))
  const counts = new Map<number, number>()
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= S || y >= S) continue
      const id = analysis.regionIds[y * S + x]
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  let best = analysis.regionIds[cy * S + cx]
  let bestN = -1
  for (const [id, n] of counts) {
    if (n > bestN) { bestN = n; best = id }
  }
  return best
}
