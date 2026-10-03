# Larine feedback widget: configuration and validation

## Review fix: build-time widget inclusion

The shared head in `nuxt.config.ts` now includes the widget once when `LARINE_WIDGET_TOKEN` is nonempty during the frontend build. The published widget was successfully fetched during review and its supported `data-token` attribute verified. The script uses `crossorigin=anonymous`, `defer`, `data-enabled=always`, `data-shortcut=mod+shift+f`, and `data-source=HomeBox - Test 1`, without domain restrictions.

Provision `LARINE_WIDGET_TOKEN` through the approved build configuration channel, then rebuild the frontend, copy `.output/public` into the backend's embedded static directory, rebuild the backend and restart the preview (the component's setup/run commands perform these steps). Setting the variable only when the backend starts does not affect generated HTML. The value is browser-visible; use only the product's public widget token, never a privileged server credential. Do not commit its value.

Unset, empty or whitespace-only values intentionally omit the widget rather than generating a broken installation. No token was available in the review sandbox, so the current preview still needs token provisioning and rebuilding. Unit tests cover configured and unconfigured shared heads; real widget activation/submission remains unverified.

Review checks: ESLint passed for the changed configuration and test file; Vitest passed 20 tests across 3 files; the frontend build passed both without a token and with a synthetic, test-only token. Parsing generated `index.html`, `home/index.html`, `200.html` and `404.html` verified exactly one widget and all requested attributes in the configured build. The synthetic build was deleted and the unconfigured build restored; no synthetic token was deployed. These checks do not prove live widget submission.

The sections below are historical implementation/validation notes from the original pass; their blocked-installation status is superseded by the conditional inclusion above.

## COEP compatibility review fix

HomeBox retains `Cross-Origin-Embedder-Policy: require-corp`. The widget response permits CORS with `Access-Control-Allow-Origin: *` but does not provide CORP; the previous classic script tag fetched in no-CORS mode and was blocked. `crossorigin=anonymous` switches only the widget request to CORS mode without cross-origin cookies, using the server's existing permission rather than relaxing HomeBox's security headers.

Verified against the reported preview in a browser: the deployed script lacked `crossorigin`; replacing that script in the diagnostic browser with the same attributes plus `crossorigin=anonymous` produced a successful load event. This was a temporary browser-only check, not a deployment. ESLint and all 20 unit/baseline tests passed. A synthetic-token build verified one widget with `crossorigin=anonymous` in the root, home and fallback HTML; the synthetic output was deleted and the prior output restored. The live browser regression test now requires the attribute. Rebuild/restart the preview with the provisioned build-time token to deploy this fix. Real feedback submission has not been tested.

## Next environment API routing review fix

The widget now has `data-api-url=https://api-stage.larine.dev`, matching its `next.larine.dev` script and staging product token. The hostname is `larine`, not `lairne`. The published widget reads this attribute as its API base and appends `/api/feedback/ingest`; without the override it defaulted to the production API. The existing token configuration and anonymous CORS script loading remain unchanged.

ESLint and 20 unit/baseline tests passed. A synthetic-token frontend build verified the staging API attribute and anonymous CORS in root, home and both fallback HTML files. Synthetic output was deleted and the prior output restored. No real feedback was submitted and authentication success is not claimed. Rebuild/restart the preview with the staging product's browser-visible token to apply the API override, then verify a real feedback submission.

## Original pass prerequisite

Original status: story 1 was **not implemented**. No widget script, placeholder token, or guessed token attribute had been added.

## Verified frontend integration point

- `nuxt.config.ts` sets `ssr: false`. This is a client-only Nuxt application, not the server-rendered frontend assumed in the original planning notes.
- `package.json` builds with `nuxt generate`; deployment serves generated static HTML.
- `app.head.script` in `nuxt.config.ts` already includes `/set-theme.js` and is the shared HTML script entry. A verified widget integration belongs here rather than in individual pages or layouts.
- `app.vue` wraps `NuxtPage` in the shared layout. Page navigation should not reinstall the widget.
- No Vite replacement syntax is needed. Static generation means any build-provisioned script attributes must be supplied when generating the frontend, not merely when starting the backend.

## Required before changing the shared script entry

1. Supply the actual HomeBox - Test 1 product widget API token through the approved secure delivery channel. Do not paste it into chat, review notes, test fixtures, or tracked documentation. The widget requires a browser-visible token; it must not be a privileged server API credential.
2. Supply the authoritative integration contract or restore access to the published widget script so the supported token attribute can be verified. Requests to `https://next.larine.dev/larine-feedback.js`, both normally and with a browser user agent, returned `HTTP 403 Forbidden` in this sandbox.

The sandbox environment contained no variable names matching `LARINE`, `WIDGET`, or `TOKEN`. Repository inspection found no existing Larine widget integration. A token cannot be fabricated from the product ID.

Once provisioned, include the verified script once through Nuxt's shared head with:

- `src`: `https://next.larine.dev/larine-feedback.js`
- the verified token attribute containing the actual provisioned product widget token
- `data-enabled`: `always`
- `data-shortcut`: `mod+shift+f`
- `data-source`: `HomeBox - Test 1`
- no domain restriction

The association bootstrap is now implemented by story 2 at the Go HTML-serving boundary, ahead of every head script. The widget itself remains uninstalled pending the prerequisites above.

## Verification performed in this attempt

- Queue branch fetch and merge: already up to date; no conflicts.
- Initial focused Vitest attempt failed with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "vitest" not found` because dependencies were absent.
- `cd frontend && pnpm install --frozen-lockfile`: passed, including `nuxt prepare`; existing duplicate-component warnings were emitted.
- `cd frontend && pnpm exec vitest --run --config ./test/vitest.config.ts lib/passwords/index.test.ts lib/datelib/dateOnly.test.ts`: passed, 2 files / 16 tests. These are baseline tests, not widget verification.
- No application code changed, so a widget build and browser acceptance walk are not claimed. Widget loading, Cmd/Ctrl+Shift+F activation, and actual feedback submission remain unverified pending the prerequisites above.

## Story 2: independent runtime associations

`backend/app/api/larine_context.go` reads the unprefixed server environment at router creation:

- `LARINE_ACTIVE_WORK_ITEM_ID` → `window.__LARINE_ACTIVE_WORK_ITEM_ID__`
- `LARINE_STATEMENT_ID` → `window.__LARINE_STATEMENT_ID__`

Set either, both, or neither before starting the Go backend; restart it to change context. The Work Item value must be the **canonical Work Item projection ID** supplied by delivery configuration. HomeBox cannot resolve Larine identities and does not convert native Enhancement IDs, derive context from a Statement, or read legacy Enhancement variables. These IDs are browser-visible deployment-wide context, not per-user HomeBox records.

`staticPageHandler` in `backend/app/api/routes.go` injects a synchronous inline script as the first child of the generated HTML head, for directly served HTML and SPA route fallbacks. Blank/whitespace-only or unset values produce no assignment; with neither present, the HTML is unchanged. Go `json.Marshal` string serialization preserves values while escaping HTML metacharacters (including script termination), quotes, control characters and JS line separators. No Vite placeholders or new widget/token implementation are introduced.

HTML responses use `Cache-Control: no-store`. Nuxt PWA configuration excludes HTML from precaching and removes the cached navigation fallback to prevent stale launch context; offline app-shell navigation is no longer supported. Existing installed service workers need to update before this behavior takes effect. Serving `.output/public` directly (including Nuxt dev/static preview) bypasses Go runtime injection and is not a context-enabled deployment.

Focused Go regression tests cover independent combinations, empty/unset values, hostile serialization, initialization order, direct HTML, SPA fallback and untouched JS assets. Submission/persisted associations are **not yet verified**, because the widget script is absent (see story 1 prerequisites).

### Story 2 verification

- `cd frontend && pnpm run build`: passed; existing duplicate-component, circular-chunk and chunk-size warnings emitted. Generated service worker has no HTML precache entries or navigation fallback.
- `cd frontend && pnpm exec eslint nuxt.config.ts`: passed.
- `cd frontend && pnpm exec vitest --run --config ./test/vitest.config.ts lib/passwords/index.test.ts lib/datelib/dateOnly.test.ts`: passed, 2 files / 16 baseline tests (not association tests).
- `cd backend && go test ./app/api -run 'Test(LarineContext|StaticPageLarineContext)' -count=1`: could not run, `/bin/sh: 1: go: not found` (exit 127).
- `cd backend && go build ./app/api`: could not run, `/bin/sh: 1: go: not found` (exit 127).
- Go toolchain download attempts from go.dev and proxy.golang.org returned HTTP 403. `apt-get update && apt-get install -y golang-go` also failed with HTTP 403 for Debian repositories. Go tests/build must be run in a Go 1.26-enabled environment; no backend success is claimed.
- `git diff --check`: passed.

## Story 3: regression checks and live validation handoff

**Partial implementation; live acceptance is NOT passed.** The preceding story added only runtime context; the widget remains absent. This story does not guess the token attribute, install a fake widget, or substitute a mock submission for Larine evidence.

### Added checks

- `backend/app/api/larine_context_test.go`: extends empty/whitespace and partially unset environment coverage; verifies all four association combinations through direct HTML and SPA fallback routes, unchanged requested script attributes and bootstrap ordering using an explicitly widget-shaped fixture, no domain filter/legacy bridge/placeholders, untouched headless assets, and adversarial script-closing content including semicolons. Fixture preservation is not proof of the deployed widget attributes or submission associations.
- `test/e2e/larine-feedback.browser.spec.ts`: opt-in Playwright checks the **real deployed** script's presence, exact requested non-token attributes, successful HTTP response, independent window globals, and DOM bootstrap order. Separately checks Control and Meta shortcuts with a selector obtained from the actual widget UI. Traces/video/screenshots are disabled to avoid recording token-bearing DOM. It does not automate submission against an unknown UI/API contract.

### Required controlled browser walk (still outstanding)

First securely provision the product widget token and authoritative attribute contract and finish story 1. Never supply a privileged server credential, dummy token, or token in test command arguments. Use a Go 1.26-enabled environment; build the frontend and serve it through Go, not Nuxt preview/static hosting. Use designated canonical Work Item projection and Statement test records that the product can associate; restart the Go server for each launch configuration. Use a new browser context each time to avoid stale globals/service workers.

| Launch server environment | Expected submitted associations |
| --- | --- |
| Both generic variables unset; repeat with both empty | No Work Item, no Statement |
| `LARINE_ACTIVE_WORK_ITEM_ID` only | Exactly that canonical Work Item; no Statement |
| `LARINE_STATEMENT_ID` only | Exactly that Statement; **no Work Item or Enhancement** |
| Both variables populated | Both supplied records independently |

For each configuration:

1. Open `/` and a representative shared frontend route. Confirm one widget script, requested attributes, successful script response and no console initialization error. Do not capture token attributes, full DOM, HARs, authorization headers or raw network bodies in review artifacts.
2. Run the opt-in contract check from `frontend` using `E2E_LARINE_VALIDATE=1 E2E_BASE_URL=<Go-served test URL> pnpm exec playwright test --config test/playwright.config.ts larine-feedback.browser.spec.ts --project chromium --retries 0 --reporter line`. Set `E2E_LARINE_WORK_ITEM_ID` and/or `E2E_LARINE_STATEMENT_ID` to the expected test IDs (unset when unavailable). Set `E2E_LARINE_DIALOG_SELECTOR` to an inspected live dialog selector. Without it, shortcut checks are **skipped**, not passed.
3. Activate Cmd+Shift+F on macOS and Ctrl+Shift+F elsewhere, fill the real widget form, and submit clearly marked feedback such as `Larine integration validation - <case> - <unique run marker>`. Confirm a visible successful submission, not merely an open dialog.
4. In Larine, find the created feedback by marker. Record its feedback ID and independently verify persisted canonical Work Item and Statement links against the table. If using authoritative submission evidence instead, redact credentials and retain only returned feedback ID and association fields. A script snapshot or intercepted mock request is insufficient. Explicitly check Statement-only and neither have no Work Item/Enhancement association. Clean up test feedback according to test-environment policy.

### Actual story 3 commands/results (2026-10-02)

- Required `git fetch origin queue/larine-feedback-widget-installation-590116 && git merge --no-edit origin/queue/larine-feedback-widget-installation-590116`: passed, `Already up to date.`
- `cd backend && go test ./app/api -run 'Test(LarineContext|StaticPageLarineContext)' -count=1` and `cd backend && go build ./app/api`: both exit 127, `/bin/sh: 1: go: not found`. New Go tests have not run.
- `cd frontend && pnpm exec eslint --fix test/e2e/larine-feedback.browser.spec.ts` followed by `pnpm exec eslint test/e2e/larine-feedback.browser.spec.ts --max-warnings 0`: passed. Initial standalone Prettier invocation used defaults inconsistent with ESLint; ESLint fixed those formatting warnings.
- `cd frontend && pnpm exec vitest --run --config ./test/vitest.config.ts lib/passwords/index.test.ts lib/datelib/dateOnly.test.ts`: passed, 2 files / 16 tests; baseline only, not widget acceptance.
- `cd frontend && pnpm run build`: passed; existing duplicate-component, sourcemap, circular-chunk and chunk-size warnings.
- `cd frontend && pnpm exec playwright test --config test/playwright.config.ts larine-feedback.browser.spec.ts --project chromium --list`: discovered 3 checks successfully.
- Served the generated output diagnostically with `python3 -m http.server 3100 --bind 127.0.0.1 --directory .output/public`. This is **not** a runtime-context deployment. `E2E_LARINE_VALIDATE=1 E2E_BASE_URL=http://127.0.0.1:3100 pnpm exec playwright test --config test/playwright.config.ts larine-feedback.browser.spec.ts --project chromium --retries 0 --reporter line`: 3 launch failures, `browserType.launch: Executable doesn't exist at /tmp/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`. No checks reached the app. `pnpm exec playwright install chromium` then failed with HTTP 403 from cdn.playwright.dev.
- `agent-browser --session larine-story3 open https://next.larine.dev/larine-feedback.js` and `snapshot`: browser displayed `403 Forbidden`. `curl -I` independently returned HTTP 403.
- `agent-browser --session larine-story3 open http://127.0.0.1:3100`, restricted `eval` and `press Control+Shift+f`: diagnostic result `widgetScripts: 0`, both globals absent; no widget appeared. This confirms absence, not successful activation/submission. No feedback was submitted; no persisted association evidence exists for any case.

**Remaining prerequisites:** secure token provisioning and verified widget contract, completed widget inclusion, Go 1.26 toolchain, compatible Playwright browser and access to Larine plus designated test records. Shortcut, successful no-context submission, and all submitted association combinations remain unverified. Do not sign off story 3 from baseline test/build success.
