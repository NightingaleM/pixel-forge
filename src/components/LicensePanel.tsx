// src/components/LicensePanel.tsx
// 会员浮窗:状态卡(免费剩余/会员到期)+激活+备份+购买链接。纯视图+本地激活,
// 状态变化经 onChanged 上交 App2D(触发重渲,批量横幅/会员钮即时刷新)。
// v1 无邮箱托底(后端 v2 recover 就绪后再加,见后端需求文档)。
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { activateCode, getLicenseStatus, loadStoredCode, type ActivateResult } from '../lib/license/verify'
import { remainingToday, FREE_DAILY_NO_WATERMARK } from '../lib/license/quota'

// v1 冷启动:面包多商品页;上线前替换为实际链接(收款三阶段见 spec 第 7 节)
const PURCHASE_URL = 'https://mianbaoduo.com/'

interface LicensePanelProps {
  onClose: () => void
  /** 激活/状态变化通知(App2D 触发重渲) */
  onChanged: () => void
}

function LicensePanel({ onClose, onChanged }: LicensePanelProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const { ref, pos, onHeaderMouseDown } = useDraggable(
    { x: Math.max(20, window.innerWidth - 340), y: 120 },
    'pixel-forge.panelPos.license',
  )
  const status = getLicenseStatus()
  // 过期判定:无活跃会员但存过码 = 曾经激活过(过期/损坏),提示续费而非全新激活
  const expired = !status.active && loadStoredCode() !== null
  const storedCode = loadStoredCode()

  const handleActivate = async () => {
    if (busy) return
    setBusy(true)
    try {
      // 未兑换码会走 redeem(联网);已兑换码离线直达——激活中禁点防重复兑换
      const r: ActivateResult = await activateCode(input)
      if (r.ok) {
        setMsg({ kind: 'ok', text: t('license.activated') })
        setInput('')
        onChanged()
      } else {
        const key = {
          format: 'errFormat', signature: 'errSignature', expired: 'errExpired',
          network: 'errNetwork', device_limit: 'errDeviceLimit', rate_limited: 'errRateLimit',
        }[r.reason]
        setMsg({ kind: 'err', text: t(`license.${key}`) })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    const code = storedCode
    if (!code) return
    // clipboard API 仅 secure context(https/localhost)存在:局域网 IP 明文访问下
    // navigator.clipboard 为 undefined,静默跳过=既没复制也无反馈。降级 execCommand。
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
        ok = true
      }
    } catch { /* 权限拒绝/焦点丢失:走降级 */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea')
        ta.value = code
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        ta.remove()
      } catch { ok = false }
    }
    setMsg({ kind: ok ? 'ok' : 'err', text: t(ok ? 'license.copied' : 'license.copyFailed') })
  }

  return (
    <div className="preset-panel license-panel" ref={ref} style={{ left: pos.x, top: pos.y }}>
      <div className="param-panel-header" onMouseDown={onHeaderMouseDown}>
        <div className="param-panel-title-row">
          <div className="param-panel-title">{t('license.panelTitle')}</div>
          <div className="param-panel-actions">
            <button className="param-panel-close" onClick={onClose}>x</button>
          </div>
        </div>
      </div>
      <div className="license-body">
        {status.active ? (
          <div className="license-card license-card--member">
            <div className="license-card-title">{t('license.memberTitle')}</div>
            <div>{t('license.memberUntil', {
              date: new Date((status.expAt ?? 0) * 1000).toLocaleString(undefined, {
                year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
              }),
            })}</div>
          </div>
        ) : (
          <div className="license-card">
            <div className="license-card-title">
              {t('license.freeTitle')}
              {expired ? ` · ${t('license.expiredTag')}` : ''}
            </div>
            <div>{t('license.freeRemaining', { count: remainingToday() })} / {FREE_DAILY_NO_WATERMARK}</div>
          </div>
        )}
        <div className="license-activate">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('license.placeholder')}
            spellCheck={false}
            disabled={busy}
          />
          <button
            className="action-btn action-btn--primary"
            onClick={handleActivate}
            disabled={busy || !input.trim()}
          >{busy ? t('license.activating') : t('license.activate')}</button>
        </div>
        {msg && <div className={`license-msg license-msg--${msg.kind}`}>{msg.text}</div>}
        {storedCode && (
          <button className="license-link-btn" onClick={handleCopy}>
            {t('license.backup')}
          </button>
        )}
        <a className="license-link-btn" href={PURCHASE_URL} target="_blank" rel="noreferrer">{t('license.purchase')} ↗</a>
      </div>
    </div>
  )
}

export default LicensePanel
