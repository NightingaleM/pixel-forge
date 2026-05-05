# ProgressDialog for 3D Density Simulation

## Problem

The 3D density simulation (volumetric sampling) runs in a Web Worker and can take several seconds. Currently, progress is shown as small inline text in the ActionBar3D (`"Volumetric sampling... 65%"`). The user wants:

1. A modal dialog with overlay mask that blocks all other interactions during processing
2. A progress bar with percentage display inside the dialog
3. A cancel button that terminates the computation immediately

## Design

### ProgressDialog Component

New component: `src/components/ProgressDialog.tsx`

**Props:**

```tsx
interface ProgressDialogProps {
  progress: number      // 0-100, or -1 for indeterminate
  onCancel: () => void
}
```

**UI Structure:**

- Overlay: reuse `.dialog-overlay` CSS class (fixed, `rgba(0,0,0,0.4)`, blocks clicks)
- Dialog box: reuse `.dialog-box` CSS class (centered, white background, 2px black border)
- Content: title text, horizontal progress bar with percentage, cancel button
- No Escape key support (must use cancel button explicitly)
- Progress bar style: consistent with project's hard-edged aesthetic (2px black border, no rounded corners)

### Cancellation Mechanism

Add `cancelSampling()` method to `ParticleEngine`:

- Store active worker reference in `this._activeWorker`
- `cancelSampling()` calls `this._activeWorker?.terminate()` and rejects the pending promise
- `volumetricSampleAsync` already has `worker.terminate()` on complete/error paths; add tracking for the cancel path

### Integration in App3D

- Render `ProgressDialog` when `isLoading && samplingProgress >= 0`
- `onCancel` calls `engineRef.current.cancelSampling()`, then resets loading/progress state
- Remove inline progress display from `ActionBar3D` (the `loading-indicator` div for sampling progress)

### i18n

Add key `app3d.samplingTitle` for the dialog title (e.g., "Volumetric sampling..."). Reuse existing `app3d.sampling` and `common.cancel` keys.

## Scope

- Only affects the volumetric sampling (density effect) progress display
- Other loading states (model loading, material application) continue using the existing inline indicator
