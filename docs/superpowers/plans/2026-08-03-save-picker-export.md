# Save Picker Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let supported Android/PWA browsers show a file-save picker from the Export button so the user can choose where the JSON backup is saved.

**Architecture:** Enhance the existing export helper with a picker-first path. `exportTrackingData()` will build the same JSON blob and filename, try `window.showSaveFilePicker()` when present, write the blob to the chosen handle, and otherwise fall back to the existing file share/download behavior. User cancellation should not trigger a surprise fallback download.

**Tech Stack:** Plain JavaScript PWA, Preact via global scripts, Node's built-in `node:test` for helper tests.

## Global Constraints

- Exported data shape stays `{ "entries": object, "fields": array }`.
- Filename stays `daily-log-YYYY-MM-DD.json`.
- Save picker is a progressive enhancement; unsupported browsers keep the current share/download fallback.
- User cancellation from the save picker should not save elsewhere automatically.
- No build step or new dependencies.

---

### Task 1: Save Picker Export Path

**Files:**
- Modify: `export-utils.js`
- Modify: `test/export-utils.test.mjs`
- Modify: `app.js`
- Modify: `sw.js`
- Modify: `README.md`

**Interfaces:**
- Updates: `window.IntuitiveTrackerExport.exportTrackingData({ entries, fields, date, navigatorRef, documentRef, urlRef, pickerRef })`.
- Returns: `Promise<{ method: "picker" | "share" | "download", filename: string }>` when export starts or completes.
- Throws: picker `AbortError` when the user cancels choosing a destination.

- [ ] **Step 1: Write failing picker tests**

Add tests that:
- Use `pickerRef.showSaveFilePicker()` when provided, with `suggestedName: "daily-log-YYYY-MM-DD.json"` and JSON accept metadata.
- Write the JSON blob to `handle.createWritable()`, then close it.
- Do not call share or download when picker succeeds.
- Throw `AbortError` without calling share/download when picker is cancelled.

- [ ] **Step 2: Verify tests fail**

Run: `node --test test/export-utils.test.mjs`

Expected: FAIL because the picker path is not implemented.

- [ ] **Step 3: Implement picker-first export**

In `export-utils.js`:
- Add `saveWithPicker(pickerRef, blob, filename)`.
- Call it before file-share fallback in `exportTrackingData()`.
- Use `types: [{ description: "JSON backup", accept: { "application/json": [".json"] } }]`.
- Re-throw `AbortError` so the app does not silently save elsewhere after cancellation.
- Fall back to existing share/download if picker is absent or unavailable for non-cancel errors.
- Show a cancellation-specific toast when the picker is dismissed.

- [ ] **Step 4: Update PWA cache and docs**

Bump the service worker cache version so installed PWAs pick up the changed helper. Update the README export wording to describe save picker, share sheet, and download fallback order.

- [ ] **Step 5: Run verification**

Run:
- `node --test test/export-utils.test.mjs`
- `node --check app.js`
- `node --check export-utils.js`
- `git diff --check`

- [ ] **Step 6: Commit**

```bash
git add export-utils.js test/export-utils.test.mjs sw.js docs/superpowers/plans/2026-08-03-save-picker-export.md
git commit -m "Add save picker export path"
```
