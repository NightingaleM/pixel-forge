# ProgressDialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline sampling progress text with a modal ProgressDialog that blocks interaction, shows a progress bar, and supports cancellation.

**Architecture:** Add cancellation support to ParticleEngine (worker tracking + terminate), create a new ProgressDialog React component reusing existing dialog CSS, and integrate it into App3D. The ActionBar3D inline indicator is kept for non-sampling loading states only.

**Tech Stack:** React 19, TypeScript, existing CSS classes (`.dialog-overlay`, `.dialog-box`)

**i18n note:** Reuses existing `app3d.sampling` key ("Volumetric sampling...") as the dialog title — no new i18n key needed since the text is identical.

---

### Task 1: Add cancellation support to ParticleEngine

**Files:**
- Modify: `src/lib/ParticleEngine.ts`

- [ ] **Step 1: Add `_activeWorker` field and `cancelSampling()` method**

In `ParticleEngine` class, add a private field to track the active worker and a public method to cancel:

```typescript
// Add field near other private fields (~line 40)
private _activeWorker: Worker | null = null
private _samplingReject: ((reason: unknown) => void) | null = null
```

Add `cancelSampling()` method after `volumetricSampleAsync` (~after line 886):

```typescript
cancelSampling(): void {
  if (this._activeWorker) {
    this._activeWorker.terminate()
    this._activeWorker = null
  }
  if (this._samplingReject) {
    this._samplingReject(new DOMException('Aborted', 'AbortError'))
    this._samplingReject = null
  }
}
```

- [ ] **Step 2: Wire worker tracking into `volumetricSampleAsync`**

In `volumetricSampleAsync` (starting at line 776), add tracking after worker creation and resolve/reject cleanup:

After `const worker = new Worker(...)` (line 791):
```typescript
this._activeWorker = worker
```

At the top of the promise executor, add reject capture:
```typescript
// Inside the promise executor, after the reject parameter
this._samplingReject = reject
```

In the `complete` handler, right after `worker.terminate()` (line 807):
```typescript
this._activeWorker = null
this._samplingReject = null
```

In the `onerror` handler (line 873), after `worker.terminate()`:
```typescript
this._activeWorker = null
this._samplingReject = null
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ParticleEngine.ts
git commit -m "feat(engine): add cancelSampling() to terminate active volumetric worker"
```

---

### Task 2: Create ProgressDialog component

**Files:**
- Create: `src/components/ProgressDialog.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Create ProgressDialog.tsx**

```tsx
import { useTranslation } from 'react-i18next'

interface ProgressDialogProps {
  progress: number // 0-100, -1 for indeterminate
  onCancel: () => void
}

export default function ProgressDialog({ progress, onCancel }: ProgressDialogProps) {
  const { t } = useTranslation()

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <p className="dialog-message">{t('app3d.sampling')}</p>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: progress >= 0 ? `${progress}%` : '0%' }}
          />
        </div>
        <p className="progress-bar-text">
          {progress >= 0 ? `${progress}%` : ''}
        </p>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn--secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add progress bar CSS styles**

Append after `.dialog-btn--secondary:hover` block (after line 701) in `src/styles/global.css`:

```css
/* --- Progress Bar --- */

.progress-bar-track {
  border: 2px solid #000;
  height: 16px;
  margin-bottom: 4px;
}

.progress-bar-fill {
  height: 100%;
  background: #000;
  transition: width 0.15s ease;
}

.progress-bar-text {
  margin: 0 0 16px;
  font-size: 12px;
  color: #666;
  text-align: right;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ProgressDialog.tsx src/styles/global.css
git commit -m "feat: add ProgressDialog component with progress bar"
```

---

### Task 3: Integrate ProgressDialog into App3D

**Files:**
- Modify: `src/components/App3D.tsx`

- [ ] **Step 1: Add import and handle cancel logic**

Add import at the top of App3D.tsx:
```tsx
import ProgressDialog from './ProgressDialog'
```

Add a cancel handler (near other handlers, after `handleBaseParamChange` ~line 358):
```tsx
const handleCancelSampling = useCallback(() => {
  engineRef.current?.cancelSampling()
  setIsLoading(false)
  setSamplingProgress(-1)
}, [])
```

- [ ] **Step 2: Render ProgressDialog in JSX**

Just before the closing `</div>` of the root element (before line 587), add:

```tsx
{isLoading && samplingProgress >= 0 && (
  <ProgressDialog progress={samplingProgress} onCancel={handleCancelSampling} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/App3D.tsx
git commit -m "feat: integrate ProgressDialog into App3D with cancel support"
```

---

### Task 4: Handle cancellation error in initEffect

**Files:**
- Modify: `src/components/App3D.tsx`

- [ ] **Step 1: Handle AbortError gracefully**

In the `initEffect` async function (around line 336), update the catch block to silently handle cancellation:

```tsx
} catch (err) {
  if (err instanceof DOMException && err.name === 'AbortError') return
  console.error('Failed to initialize model:', err)
  setError(t('app3d.loadFailed'))
} finally {
```

- [ ] **Step 2: Commit**

```bash
git add src/components/App3D.tsx
git commit -m "fix: gracefully handle sampling cancellation in initEffect"
```

---

### Task 5: Clean up ActionBar3D inline progress display

**Files:**
- Modify: `src/components/ActionBar3D.tsx`

- [ ] **Step 1: Remove sampling progress from inline indicator**

In ActionBar3D.tsx, change the loading indicator (lines 141-147) to only show for non-sampling loading:

Replace:
```tsx
{isLoading && (
  <div className="loading-indicator">
    {samplingProgress >= 0
      ? `${t('app3d.sampling')} ${samplingProgress}%`
      : t('app3d.processing')}
  </div>
)}
```

With:
```tsx
{isLoading && samplingProgress < 0 && (
  <div className="loading-indicator">
    {t('app3d.processing')}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ActionBar3D.tsx
git commit -m "refactor: remove sampling progress from ActionBar3D inline indicator"
```
