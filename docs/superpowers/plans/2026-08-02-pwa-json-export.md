# PWA JSON Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PWA Export button save the JSON tracking backup locally on phones, with share-sheet support only when file sharing is supported.

**Architecture:** Move browser export branching into a small global helper so it can be tested outside the Preact app. The app remains responsible for building the current backup payload and marking `lastExport`; the helper handles JSON blob creation, `navigator.canShare`, `navigator.share`, anchor download fallback, and object URL cleanup.

**Tech Stack:** Plain JavaScript PWA, Preact via global scripts, IndexedDB/localStorage, Node's built-in `node:test` for helper tests.

## Global Constraints

- No build step or dependency installation.
- Exported data shape stays `{ "entries": object, "fields": array }`.
- Filename stays `daily-log-YYYY-MM-DD.json`.
- If mobile file sharing is not supported or fails, the export must still trigger a local file download.
- PWA cache must include any new runtime script and bump the cache version.

---

### Task 1: Export Helper

**Files:**
- Create: `export-utils.js`
- Create: `test/export-utils.test.mjs`
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `app.js`

**Interfaces:**
- Produces: `window.IntuitiveTrackerExport.exportTrackingData({ entries, fields, date, navigatorRef, documentRef, urlRef })`.
- Returns: `Promise<{ method: "share" | "download", filename: string }>` when export starts.
- Throws: `Error` only when neither share nor anchor download can be attempted.

- [ ] **Step 1: Write the failing test**

```javascript
test("falls back to download when navigator.share exists but cannot share files", async () => {
  const calls = [];
  const result = await helpers.exportTrackingData({
    entries: { "2026-08-02": { weight: "180" } },
    fields: ["sleep hours"],
    date: "2026-08-02",
    navigatorRef: {
      share() {
        calls.push("share");
        throw new Error("share should not be called");
      },
      canShare() {
        return false;
      }
    },
    documentRef: fakeDocument(calls),
    urlRef: fakeUrl(calls)
  });

  assert.equal(result.method, "download");
  assert.equal(result.filename, "daily-log-2026-08-02.json");
  assert.deepEqual(calls, ["createObjectURL", "appendChild", "click", "remove", "revokeObjectURL"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/export-utils.test.mjs`

Expected: FAIL because `export-utils.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `export-utils.js` with:
- `createBackupBlob(entries, fields)` returning an `application/json` blob.
- `canShareFile(navigatorRef, file)` checking both `share` and `canShare({ files: [file] })`.
- `downloadBlob(documentRef, urlRef, blob, filename)` creating a temporary anchor, clicking it, removing it, and revoking the URL.
- `exportTrackingData(options)` trying file share only when supported, then falling back to download on unsupported share or share rejection.

- [ ] **Step 4: Wire the app**

Load `export-utils.js` before `app.js` in `index.html`. Replace the inline export branching in `app.js` with a call to `window.IntuitiveTrackerExport.exportTrackingData(...)`, then show `Export ready` or `Export failed`.

- [ ] **Step 5: Update PWA cache**

Add `./export-utils.js` to `SHELL` and bump `CACHE` from `intuitive-tracker-v1` to `intuitive-tracker-v2`.

- [ ] **Step 6: Run verification**

Run: `node --test test/export-utils.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html sw.js export-utils.js test/export-utils.test.mjs docs/superpowers/plans/2026-08-02-pwa-json-export.md
git commit -m "Fix PWA JSON export fallback"
```
