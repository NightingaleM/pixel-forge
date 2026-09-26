// src/components/LicensePanel.tsx
// 会员浮窗(链式方案,spec 2026-09-26):双入口按状态切换——非会员=激活(未兑换码),
// 会员=续费(补充包)+到期/次数展示+刷新链接。纯视图+本地判定,状态变化经 onChanged
// 上交 App2D(触发重渲,批量横幅/会员钮即时刷新)。
// 用户只持有兑换码原文;隐藏凭证由 verify.ts 自动存取,无备份功能(设备绑定,备份无意义)。
// v1 无邮箱托底(后端 v2 recover 就绪后再加,见后端需求文档)。
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import {
  activateCode, renewCode, refreshCredential, getLicenseStatus,
  loadStoredCredential, loadLicenseCount, type LicenseFailReason,
} from '../lib/license/verify'
import { remainingToday, FREE_DAILY_NO_WATERMARK } from '../lib/license/quota'

// v1 冷启动:面包多商品页;上线前替换为实际链接(收款三阶段见 spec)
const PURCHASE_URL = 'https://mianbaoduo.com/'

const ERR_KEY: Record<LicenseFailReason, string> = {
  format: 'errFormat', signature: 'errSignature', expired: 'errExpired',
  used: 'errUsed', identity_conflict: 'errIdentityConflict',
  device_exhausted: 'errDeviceExhausted', network: 'errNetwork', rate_limited: 'errRateLimit',
}

const fmtDate = (expAt: number) => new Date(expAt * 1000).toLocaleString(undefined, {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

interface LicensePanelProps {
  onClose: () => void
  /** 激活/续费/状态变化通知(App2D 触发重渲) */
  onChanged: () => void
}

function LicensePanel({ onClose, onChanged }: LicensePanelProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>( null)
  const { ref, pos, onHeaderMouseDown } = useDraggable(
    { x: Math.max(20, window.innerWidth - 340), y: 120 },
    'pixel-forge.panelPos.license',
  )
  const status = getLicenseStatus()
  // 过期判定:无活跃会员但存过凭证 = 曾激活过(过期/换设备),提示重新激活
  const expired = !status.active && loadStoredCredential() !== null
  const count = loadLicenseCount()

  const run = async (fn: () => Promise<{ ok: true; expAt: number } | { ok: false; reason: LicenseFailReason }>,
    okText: (expAt: number) => string) => {
    if (busy) return   // 禁用态由按钮控制;此处兜底防重入
    setBusy(true)
    setMsg(null)
    try {
      const r = await fn()
      if (r.ok) {
        setMsg({ kind: 'ok', text: okText(r.expAt) })
        setInput('')
        onChanged()
      } else {
        setMsg({ kind: 'err', text: t(`license.${ERR_KEY[r.reason]}`) })
      }
    } finally {
      setBusy(false)
    }
  }

  // 激活入口(非会员):未兑换码——新码建链成身份码,或身份码迁移/刷新本机
  const handleActivate = () => run(() => activateCode(input), () => t('license.activated'))
  // 续费入口(会员):未使用码消耗为补充包,链 exp 延长、次数 +1
  const handleRenew = () => run(() => renewCode(input), (expAt) => t('license.renewed', { date: fmtDate(expAt) }))
  // 刷新(免输码):同步其他设备续费后的链当前 exp
  const handleRefresh = async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await refreshCredential()
      setMsg(r.ok
        ? { kind: 'ok', text: t('license.refreshed') }
        : { kind: 'err', text: t(`license.${ERR_KEY[r.reason]}`) })
      if (r.ok) onChanged()
    } finally {
      setBusy(false)
    }
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
            <div>{t('license.memberUntil', { date: fmtDate(status.expAt ?? 0) })}</div>
            {count !== null && <div className="license-count">{t('license.devicesLeft', { count })}</div>}
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
            placeholder={status.active ? t('license.renewPlaceholder') : t('license.placeholder')}
            spellCheck={false}
            disabled={busy}
          />
          <button
            className="action-btn action-btn--primary"
            onClick={status.active ? handleRenew : handleActivate}
            disabled={busy || !input.trim()}
          >
            {busy
              ? (status.active ? t('license.renewing') : t('license.activating'))
              : (status.active ? t('license.renew') : t('license.activate'))}
          </button>
        </div>
        {status.active && (
          <button className="license-link-btn" onClick={handleRefresh} disabled={busy}>
            {t('license.refresh')}
          </button>
        )}
        {msg && <div className={`license-msg license-msg--${msg.kind}`}>{msg.text}</div>}
        <a className="license-link-btn" href={PURCHASE_URL} target="_blank" rel="noreferrer">{t('license.purchase')} ↗</a>
      </div>
    </div>
  )
}

export default LicensePanel
