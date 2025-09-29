
---

# InForm – Google Apps Script Staff Portal

A lightweight, scalable staff portal for schools, built on Google Apps Script (GAS), Google Sheets, and Google Forms.
InForm focuses on secure, simple workflows for logging and viewing incidents, attendance, and related staff tasks.

---

## TL;DR (quick start)

* **Deploy the web app**: Apps Script → **Deploy** → **New deployment** → type **Web app**.

  * **Execute as**: Me
  * **Who has access**: Your org or Anyone (per rollout)
* Copy the **Web app URL** (your `scriptUrl`).
* In **Script Properties**, set:

  * `INF_CONFIG_SHEET_URL` → your Config spreadsheet URL (optional; falls back to `CONFIG_SHEET_URL` constant).
  * Optional SMS props (see **SMS configuration** below).
* Confirm **Code.gs** globals (names, colors, sheet & form links).
  **Best practice:** keep these in **Script Properties** or a **Config** sheet (not hard-coded).
* Confirm all templates use **`ctx.scriptUrl`** and preserve **`ctx.selectedSchoolKey`** in links.
* Test with `?page=home&school=<KEY>` and `?page=incidents&school=<KEY>`.

---

## Raw file index (shareable links for AI/code reviews)

**README.md**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/README.md](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/README.md)

**Code.gs**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Code.gs](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Code.gs)

**Helpers.gs**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Helpers.gs](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Helpers.gs)

**Tests.gs**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Tests.gs](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Tests.gs)

**Footer.html**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Footer.html](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Footer.html)

**Home.html**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Home.html](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Home.html)

**Incidents.html**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Incidents.html](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Incidents.html)

**Login.html**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Login.html](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Login.html)

**Logout.html**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Logout.html](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Logout.html)

**Parents.html**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Parents.html](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Parents.html)

**Styles.html**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Styles.html](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Styles.html)

**AutoSms.gs**
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/AutoSmsSa.gs
(https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/AutoSmsSa.gs)

**Guard_Sa.gs**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Guard_Sa.gs]
(https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Guard_Sa.gs)

> Filenames are **case-sensitive** in Apps Script.

---

## Table of contents

1. [Project goals](#project-goals)
2. [Architecture overview](#architecture-overview)
3. [File map](#file-map)
4. [Pages & routes](#pages--routes)
5. [Global context (`ctx`) & config](#global-context-ctx--config)
6. [SMS configuration](#sms-configuration)
7. [Auto-SMS: triggers & multi-tenant design](#auto-sms-triggers--multi-tenant-design)
8. [Golden rules for navigation & safety](#golden-rules-for-navigation--safety)
9. [Testing checklist (smoke test)](#testing-checklist-smoke-test)
10. [Security model](#security-model)
11. [Data model & Google Sheets](#data-model--google-sheets)
12. [Deployments & environments](#deployments--environments)
13. [Development workflow (GAS + clasp + Git)](#development-workflow-gas--clasp--git)
14. [Coding standards & patterns](#coding-standards--patterns)
15. [Troubleshooting & lessons learned](#troubleshooting--lessons-learned)
16. [Scalability & multi-tenant guidance](#scalability--multi-tenant-guidance)
17. [Contributing](#contributing)
18. [AI collaborators: how to help](#ai-collaborators-how-to-help)
19. [Glossary](#glossary)
20. [Roadmap](#roadmap)
21. [License](#license)

---

## Project goals

* **Practical**: clean, fast portal for incidents/attendance.
* **Safe by default**: navigation preserves school context; templates avoid hoisting pitfalls.
* **Scalable**: add schools without code rewrites.
* **Sellable**: configuration is separated from product logic.

---

## Architecture overview

* **Frontend** (`HtmlService`):

  * `Home.html` – landing & role actions
  * `Incidents.html` – filters, list, CSV/PDF
  * `Login.html` – school selection & sign-in
  * `Parents.html` – parent portal
* **Backend**:

  * `Code.gs` – routing (`doGet`), rendering (`renderPage_`), reports, SMS
  * `Helpers.gs` – utilities (params, logs, sheets, URL building)
* **Data**: Google Sheets (source of truth) + Forms for input
* **Routing**: `?page=home`, `?page=incidents`, etc.; preserve `school=<KEY>`

---

## File map

* `Code.gs` – main entry, ctx builder, parent portal, reports, SMS, triggers
* `Helpers.gs` – header indexers, URL helpers, safe loggers, etc.
* `Tests.gs` – diagnostics & validation helpers
* `Home.html`, `Incidents.html`, `Login.html`, `Parents.html` – UI
* `Styles.html`, `Footer.html` – shared styling/branding

---

## Pages & routes

* `?page=home` → Home
* `?page=incidents` → Incidents
* `?page=login` → Login
* `?page=logout` → Logout → Login
* `?page=report` → PDF
* `?page=csv` → CSV
* `?page=parent&tok=...` → Parent portal

Common params: `school`, `days`, `grade`, `subject`, `teacher`, `learner`, `nature`, `limit`, `clearCache=true`

---

## Global context (`ctx`) & config

Every template receives a single `ctx` object, assembled once in `doGet` (One True Ctx):

```js
{
  userDisplayName: "Kroukamp E",
  role: "manager",
  schoolName: "Doornpoort High School",
  schoolColor: "#1a4c8a",
  schoolLogo: "https://.../logo.png",
  dataSheetUrl: "https://docs.google.com/spreadsheets/…",
  incidentFormUrl: "https://forms.gle/…",
  attendanceFormUrl: "https://forms.gle/…",
  scriptUrl: "https://script.google.com/macros/s/XXXXX/exec",
  selectedSchoolKey: "DOORNPOORT",
  authenticated: true
}
```

**Config best practice:** keep per-school values in `Script Properties` or a `Config` spreadsheet (tab **Schools**). Code already prefers `INF_CONFIG_SHEET_URL` property and falls back to `CONFIG_SHEET_URL`.

---

## SMS configuration

**Provider:** SMS South Africa (already integrated).

### Script Properties (recommended)

Set these in **Extensions → Apps Script → Project Settings → Script properties**:

* `SMS_SA_USERNAME`
* `SMS_SA_PASSWORD`
* `SMS_SA_AUTH_URL` (e.g., `https://rest.smsportal.com/v1/Authentication`)
* `SMS_SA_SEND_SMS_URL` (e.g., `https://rest.smsportal.com/v1/BulkMessages/Send`)
* `SMS_SA_DEFAULT_SENDER_ID` (your sender ID)
* `WEB_APP_URL` (optional: canonical /exec URL)
* `WEB_APP_BASE` (optional: returns /dev in test deployments)
* `INF_CONFIG_SHEET_URL` (optional: overrides `CONFIG_SHEET_URL`)

### Safety toggles

In `Code.gs`:

```js
const AUTO_SMS_ENABLED = true; // master kill-switch for all automated sending paths

// DRY-RUN: true = NO real SMS (logs only), false = live sends via UrlFetchApp
const DRY_RUN = true;
```

**Enforcement details (already in code):**

* `sendSmsViaSmsSouthAfrica` returns early with `[DRY_RUN]` log—no HTTP call.
* `getSmsSouthAfricaAuthToken` returns a fake token on `[DRY_RUN]`—no auth call.
* Batch sender marks rows as `SMS Sent` in DRY-RUN so flows can be tested end-to-end without cost.

> If you ever see live SMS while `DRY_RUN=true`, there is almost certainly an **old trigger in another project** still firing. See **Troubleshooting & lessons learned**.

---

## Auto-SMS: triggers & multi-tenant design

### 1) Form-submit triggers (recommended primary path)

**One stand-alone project** can own **many schools**. Each school’s **Primary spreadsheet** gets **its own installable “From spreadsheet → On form submit” trigger** targeting your handler:

```js
// handler name must be exactly this:
function onIncidentFormSubmit(e) { /* ...existing code... */ }
```

Use these utilities (already in `Code.gs`) to **create/verify** a trigger **per school**:

```js
// Ensure one trigger for one spreadsheet ID
function ensureIncidentSubmitTriggerFor_(ssId) { /* … */ }

// Scan CONFIG ▸ Schools and install/sync triggers for all active schools
function installIncidentSubmitTriggersForAllSchools_() { /* … */ }
```

**Run once**: `installIncidentSubmitTriggersForAllSchools_()`
It reads `CONFIG_SHEET_URL → Schools` and ensures **exactly one** trigger per `Data Sheet URL`.

Why this pattern?

* Near-real-time sending (fires on each submission)
* No double-sends (handler checks & writes “Sent to Parent”)
* Central project, many spreadsheets

### 2) Optional queue runner (time-based, multi-tenant)

If you want a catch-up queue (e.g., every 5 minutes), use **one** time-based trigger (single cron) that iterates all active schools and calls the same batch logic per sheet:

```js
function autosmsdespatch_() { /* multi-tenant loop over Schools */ }
function sendUnsentSMSTodayForSheet_(sheetUrl) { /* batch sender for one sheet */ }
```

* Honors `DRY_RUN` and `AUTO_SMS_ENABLED`.
* Processes **today’s** unsent rows, marking `SMS Sent` on success.
* Avoids creating a separate cron per school.

> You can run **both**: form-submit triggers for instant sends **and** the queue to catch anything missed.

---

## Golden rules for navigation & safety

1. **Always** link with `ctx.scriptUrl` and include `&school=...`.
2. **Clear** and **Back** buttons must preserve the `school` param.
3. Use **hoist-safe** defaults in templates; don’t redeclare with `var`.
4. Every HTML includes `<base target="_top">` to break out of Sites/iframes when needed.
5. Always `encodeURIComponent` query params when building URLs.
6. Server logs: `Logger.log` for everything important (ctx, routes, tokens are **masked**).

---

## Testing checklist (smoke test)

1. Open `?page=home&school=TEST` → branding loads.
2. `?page=incidents&school=TEST` shows incidents.

   * Filters keep `school`.
   * **Clear** keeps `school`.
   * **Back to Home** keeps `school`.
3. **Parent portal**: generate a token for a learner, visit `?page=parent&tok=…`.
4. **Reports**: `?page=report` (PDF) and `?page=csv` (CSV).
5. **SMS DRY-RUN**:

   * Set `DRY_RUN=true`.
   * Submit a test incident.
   * Expect `[DRY_RUN] Would send SMS…` in logs; **no live SMS**.
   * “Sent to Parent” becomes `SMS Sent` (so the flow is testable end-to-end).
6. **Install triggers for all schools**: run `installIncidentSubmitTriggersForAllSchools_()` and verify under **Triggers** that each school’s spreadsheet ID has exactly one `onIncidentFormSubmit`.

---

## Security model

* **Least privilege** access to Sheets & Drive.
* Avoid dangerous iframe combinations (no `allow-scripts + allow-same-origin` together).
* Escape template variables in HTML `<?= ?>`.
* Parent tokens are opaque; logs mask token query parameters.

---

## Data model & Google Sheets

* **Incidents** tab: typical columns
  `Timestamp, StaffEmail, Combined Learner, Grade, Subject, Teacher, Nature1, Nature2, Sent to Parent, …`
* **Contacts** tab: `Learner Contacts` with a `Token` column (auto-generated on demand).
* **Staff** tab: `Email, Display Name, Role, (School Key optional)`

Searches are resilient to header variations using flexible indexers.

---

## Deployments & environments

* Keep **staging** and **production** deployments.
* Use `WEB_APP_URL` and `WEB_APP_BASE` properties to normalize links.
* Version and tag releases so everything maps cleanly to Apps Script deployments.

---

## Development workflow (GAS + clasp + Git)

* [Clasp](https://github.com/google/clasp) to sync code with GitHub.
* Branch → edit → PR → deploy.
* Tag deployments (`v1.2.3`) for traceability.

---

## Coding standards & patterns

* Templates are “dumb”; `.gs` holds logic.
* Preserve the `school` query param across all navigation.
* One True `ctx` object built once per request.
* Centralize helpers (headers, URLs, logging).
* Small, focused unit tests in `Tests.gs`.

---

## Troubleshooting & lessons learned

### Live SMS while `DRY_RUN=true`?

**Root cause** 99% of the time: **another Apps Script project** still has an **installable trigger** on the same spreadsheet.
**Fix:**

1. In the spreadsheet: **Extensions → Apps Script → Triggers** → remove all **other** projects’ `onFormSubmit` triggers.
2. In *this* project: run `installIncidentSubmitTriggersForAllSchools_()` again (self-heals).
3. Re-test a submission; logs should show `[DRY_RUN] Would send…`.

### Queue didn’t run / “not queued”?

* Ensure you created **one** time-based trigger on `autosmsdespatch_` (if you actually want the queue).
* The queue only processes **today’s** unsent rows.
* Check logs for `[Queue]` lines and per-sheet results.

### “This sheet is still using the old project”

A spreadsheet “listens” to whichever project has an **installable trigger** for it. If you’ve had multiple copies during development:

* Remove triggers in the **old** projects.
* Run `installIncidentSubmitTriggersForAllSchools_()` in the **current** project.

### `AUTO_SMS_ENABLED` vs `DRY_RUN`

* `AUTO_SMS_ENABLED=false` → **no** automated sending/marking at all.
* `DRY_RUN=true` → **no real SMS**, but flows run and the row is marked `SMS Sent` for end-to-end testing.

### Owners & guardrails

If you have a helper like `__ownerGuardOrExit_()` that ensures only the “owner” executes time-based tasks, keep it at the **top of entry points** (`autosmsdespatch_`, etc.) so stray triggers never do work.

---

## Scalability & multi-tenant guidance

* Tenant key: `selectedSchoolKey`.
* Config per school in **CONFIG ▸ Schools** (Active, Data Sheet URL, forms, branding).
* **Triggers:**

  * **One form-submit trigger per school spreadsheet** (created by `installIncidentSubmitTriggersForAllSchools_()`).
  * **Optional single queue trigger** (`autosmsdespatch_`) that loops through all active schools.
* Parent links/tokenization are per tenant and look up the **same workbook** where the token is stored (no cross-school leakage).

---

## Contributing

* Branch, commit, PR.
* Commit style: `feat(incidents): add pagination`, `fix(sms): respect DRY_RUN in batch path`, etc.

---

## AI collaborators: how to help

* Return **full files** for HTML/templates when editing.
* Never hardcode URLs—use `ctx.scriptUrl`, keep `school` param.
* Keep `DRY_RUN` and `AUTO_SMS_ENABLED` behavior intact.
* Validate **both** Clear & Back buttons.
* Add meaningful `Logger.log` breadcrumbs.

---

## Glossary

* **Installable trigger**: a project-owned trigger attached to a spreadsheet (or time-based).
* **Form-submit trigger**: fires when a linked Form submits a new row to a spreadsheet.
* **Queue**: a time-based runner that batch-processes unsent rows.

---

## Roadmap

* Admin UI for **Schools** config (branding, forms, primary sheet).
* Structured logging helper with correlation IDs.
* Server-side pagination for large incident lists.
* Finer role-based access checks.
* More unit tests around tokenization and DRY-RUN enforcement.

---

## License

MIT (or institution-specific) — update as required.

---

## Appendix – trigger utilities (for reference)

> These functions are already included in **Code.gs**. They’re listed here so operators know what to run.

```js
// A) Install/sync per-school form-submit triggers (recommended)
function installIncidentSubmitTriggersForAllSchools_() { /* scans CONFIG.Schools and ensures a trigger per Data Sheet URL */ }

// B) Optional: multi-tenant queue runner (single cron)
function autosmsdespatch_() { /* iterates active schools and calls sendUnsentSMSTodayForSheet_ */ }

// C) Parameterized batch sender for one sheet (used by queue)
function sendUnsentSMSTodayForSheet_(sheetUrl) { /* sends today’s unsent rows; honors DRY_RUN & AUTO_SMS_ENABLED */ }
```

**Run order (first setup):**

1. Set Script Properties (CONFIG & SMS).
2. Deploy web app.
3. Run `installIncidentSubmitTriggersForAllSchools_()` once.
4. (Optional) Add one time-based trigger for `autosmsdespatch_` (e.g., every 5 minutes).
5. Test with `DRY_RUN=true` until happy; then set `DRY_RUN=false` for live sending.

---

