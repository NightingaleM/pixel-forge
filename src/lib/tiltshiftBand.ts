// src/lib/tiltshiftBand.ts
// 移轴微缩(tiltshift)智能焦带估计——纯函数,输入缩略图像素数据(约定短边 64px,
// 保持纵横比;64px 比 01 票草案的 32px 抗投影量化噪声,实验室实测)。
// 算法(票 04 锁定): 灰度梯度能量 × 彩色度加权 -> 倾角候选投影 -> 3bin 平滑 ->
// 梯形滑窗(中心先验) -> 置信守门。置信不足回退默认带,由调用方决定。
// 先例与布局仿 brightPoint.ts;调用方负责缩略图绘制与跨域 try/catch
// (App2D 首载 / runBatch 逐图,同一管线口径)。

export interface FocusBand {
  /** 焦带中心(uv.y,0..1,向上增大——已从缩略图行序翻转,与 uBandY 语义一致) */
  y: number
  /** 倾角(度,符号已转 shader 约定:正值=uv 系右侧上抬;不确信为 0) */
  tilt: number
  /** 估计带宽(短边比例;票 04 修订:产品不采纳,仅评分内部使用) */
  width: number
  /** 置信(带内能量占比 >= 0.55);false 时调用方应回退默认带 */
  confident: boolean
  /** 带内能量占比(0..1,诊断用) */
  ratio: number
}

/**
 * 估计「细节最密集的水平带」作为焦带候选。
 * 数据为 RGBA 缩略图(行序自上而下);返回 y/tilt 已转 shader 坐标系
 * (uv.y 向上: y = 1 - 行位置;tilt 符号因 y 翻转而取反)。
 */
export function estimateFocusBand(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): FocusBand {
  const FALLBACK: FocusBand = { y: 0.5, tilt: 0, width: 0.02, confident: false, ratio: 0 }
  if (w < 4 || h < 4) return FALLBACK

  // 1) 灰度 + 彩色度(chroma = max-min): 主体(人群/车流/彩棚)高饱和,
  //    纯梯度能量会偏向远端建筑纹理,彩色度加权把票拉回主体带
  const L = new Float32Array(w * h)
  const C = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const r = data[p * 4]
    const g = data[p * 4 + 1]
    const b = data[p * 4 + 2]
    L[p] = 0.299 * r + 0.587 * g + 0.114 * b
    C[p] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
  }

  // 2) 前向差分梯度能量 × 彩色度权重(0.4 + 0.6·chroma)
  const G = new Float32Array(w * h)
  let gsum = 0
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const g = Math.abs(L[j * w + i + 1] - L[j * w + i]) + Math.abs(L[(j + 1) * w + i] - L[j * w + i])
      const wgt = 0.4 + 0.6 * ((C[j * w + i] + C[j * w + i + 1] + C[(j + 1) * w + i]) / 3)
      G[j * w + i] = g * wgt
      gsum += g * wgt
    }
  }
  // 平坦图守门(纯天空/低对比夜景):全图平均梯度(0-255 尺度)不足直接不猜
  if (gsum / (w * h) < 3.0) return FALLBACK

  // 3) 倾角候选投影: θ ∈ {0,±8,±16}(移轴倾角惯例 <20°),沿法线投影累加为
  //    1D 剖面。sAxis 一律以「画面高度 h 为单位」(实验室版曾把剖面轴乘 1.4
  //    而窗位不除回,窗位系统性偏移 0.4h——本处修正),直方图区间 [-1.2,1.2]
  //    覆盖斜带外逸;3bin 盒平滑抗量化噪声
  const cx = (w - 1) / 2
  const asp = w / h
  const WIDTHS = [0.08, 0.12, 0.18, 0.24]
  const NB = 64
  const OFF = 1.2
  const SPAN = 2.4
  const bestByDeg: Record<number, { w: number; cc: number; score: number; ratio: number }> = {}
  for (const deg of [0, 8, -8, 16, -16]) {
    const t = (deg * Math.PI) / 180
    const st = Math.sin(t) * asp
    const ct = Math.cos(t)
    let prof = new Float64Array(NB)
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const sAxis = ((i - cx) * st + j * ct) / h
        const bi = Math.min(NB - 1, Math.max(0, Math.round(((sAxis + OFF) / SPAN) * NB)))
        prof[bi] += G[j * w + i]
      }
    }
    const sm = new Float64Array(NB)
    for (let b = 0; b < NB; b++) {
      sm[b] = (prof[Math.max(0, b - 1)] + prof[b] + prof[Math.min(NB - 1, b + 1)]) / 3
    }
    prof = sm
    let total = 0
    for (let b = 0; b < NB; b++) total += prof[b]

    // 4) 梯形滑窗: 窗外能量按窗宽惩罚(防贴边/防全图平均) + 中心先验
    //    (主体带惯例 0.45-0.60,压制远端纹理带抢票)。pos/cc/wd 同为 h 单位
    let best: { w: number; cc: number; score: number; ratio: number } | null = null
    for (const wd of WIDTHS) {
      for (let cc = 0.15; cc <= 0.8501; cc += 0.02) {
        let inE = 0
        for (let b = 0; b < NB; b++) {
          const pos = ((b + 0.5) / NB) * SPAN - OFF
          const trap = Math.max(0, Math.min(1, (wd / 2 + 0.04 - Math.abs(pos - cc)) / 0.04 + 1e-9))
          inE += prof[b] * trap
        }
        const score = inE - 0.7 * (total - inE) * wd - 1.0 * total * (cc - 0.5) * (cc - 0.5)
        if (!best || score > best.score) best = { w: wd, cc, score, ratio: inE / total }
      }
    }
    bestByDeg[deg] = best!
  }

  // 5) 倾角保守化: 非零倾角须比 0° 高 25% 分才采纳(防噪声斜带)
  let bestDeg = 0
  for (const deg of [8, -8, 16, -16]) {
    if (bestByDeg[deg].score > bestByDeg[0].score * 1.25) bestDeg = deg
  }
  const b = bestByDeg[bestDeg]
  return {
    y: +(1 - b.cc).toFixed(2), // 行序(向下) -> uv(向上)翻转
    tilt: bestDeg === 0 ? 0 : -bestDeg, // y 轴翻转 => 倾角符号取反(防 -0)
    width: b.w,
    confident: b.ratio >= 0.55,
    ratio: +b.ratio.toFixed(3),
  }
}
