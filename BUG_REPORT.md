# Bug Report — Community Advisor
_Generated: 2026-07-15 14:02_

---

## 🔴 Critical

### 1. Live API credentials committed to the repository
**File:** `config/watsonx.json` line 4  
**Issue:** A real IBM Cloud `apiKey` and `projectId` are checked into source control. The `watsonx.json.example` file exists precisely to avoid this. Anyone with read access to the repo can use these credentials to run up costs on the associated IBM Cloud account.

**Action required:**
1. Rotate the `apiKey` in IBM Cloud IAM immediately.
2. Add `config/watsonx.json` to `.gitignore`.
3. Remove the file from git history (`git rm --cached config/watsonx.json`).

---

## 🟠 Bugs (broken behaviour at runtime)

### 2. `showConfirmModal` — second confirm button detaches from the DOM after first use
**File:** `client/app.js` line 702  
**Issue:** `btnConfirm2` is obtained once via `getElementById` at line 682 and later used to call `.replaceWith(newConfirm2)` at line 702. On the **second invocation** of the modal, `btnConfirm2` still references the node from the first call — which was already detached from the DOM by the first `replaceWith`. Calling `.replaceWith()` on a detached node is a no-op, so `newConfirm2` never gets inserted into the page. The "Move to Unanswered" / second-confirm button stops working after the first modal use.

**Fix:** Re-query `btnConfirm2` from the live DOM immediately before replacing it, the same way `btnConfirm` and `btnCancel` are handled:
```js
// Move this line to just before the replaceWith call on line 702
const btnConfirm2 = document.getElementById('ca-modal-confirm2');
```

---

### 3. `renderSources` appends the sources panel into the wrong container
**File:** `client/app.js` lines 240 and 397  
**Issue:** In both `generateZeroDraft` and `generateDraft`, the call is:
```js
renderSources(data.sources || [], statusEl.parentElement);
```
`statusEl` is a `<div class="draft-status-N">` / `<div class="zero-draft-status-N">` whose parent is `.ca-draft-box__actions` (the button row), **not** `.ca-draft-box`. The sources panel is therefore appended inside the actions row, next to the buttons, rather than at the bottom of the draft box.

**Fix:** Use `statusEl.closest('.ca-draft-box')` instead of `statusEl.parentElement`.

---

### 4. Operator precedence bug in `heuristicClassify`
**File:** `server/classifier.js` line 107  
**Issue:** The condition:
```js
} else if (quality === 'incomplete' || CLARIFICATION_HINTS.some(s => text.includes(s)) && !hasBody) {
```
`&&` binds tighter than `||`, so this evaluates as:
```js
quality === 'incomplete'  ||  (CLARIFICATION_HINTS.some(...) && !hasBody)
```
Any thread already flagged as `incomplete` unconditionally receives `needs-clarification`, bypassing the OOS check above it. The `!hasBody` guard also only applies to the clarification-hints half of the condition.

**Fix:** Add explicit parentheses:
```js
} else if ((quality === 'incomplete' || CLARIFICATION_HINTS.some(s => text.includes(s))) && !hasBody) {
```

---

## 🟡 Logic / Quality Issues

### 5. Filter input does not update the tab badge count
**File:** `client/app.js` line 267  
**Issue:** The `filterInput` event handler calls `renderZeroReplies(filtered)` and `renderThreads(filtered)` with the filtered subset, but never updates `tabCount`. The "Unanswered Threads (N)" badge on the tab continues to show the total thread count rather than the filtered count, which is misleading.

**Fix:** Add `tabCount.textContent = filtered.length;` inside the filter handler.

---

### 6. `AbortSignal.timeout` requires Node ≥ 17.3 — no version guard
**File:** `server/scraper.js` line 167  
**Issue:** `AbortSignal.timeout(15000)` was introduced in Node 17.3. The `package.json` declares no `engines` field. On Node 16 (still common in enterprise environments) this throws `TypeError: AbortSignal.timeout is not a function`, causing every `fetchThreadBody` call to silently return `''` — all draft replies will be generated from the thread title alone with no body context.

**Fix:** Either add `"engines": { "node": ">=17.3" }` to `package.json`, or replace with a compatible alternative:
```js
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);
const res = await fetch(threadUrl, { ..., signal: controller.signal });
clearTimeout(timer);
```

---

_Report covers: `client/app.js`, `server/classifier.js`, `server/scraper.js`, `config/watsonx.json`_
