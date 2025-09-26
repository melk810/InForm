
---

# InForm – Google Apps Script Staff Portal

A lightweight, scalable staff portal for schools, built on Google Apps Script (GAS), Google Sheets, and Google Forms.
InForm focuses on secure, simple workflows for logging and viewing incidents, attendance, and related staff tasks.

---

## TL;DR (quick start)

* **Deploy the web app** from Apps Script → **Deploy** → **New deployment** → type **Web app**.
* Set **Execute as**: Me. Set **Who has access**: Your org or Anyone (as required by your rollout plan).
* Copy the **Web app URL** (this is your `scriptUrl`).
* Open **Code.gs** → set or confirm per-school config (names, colors, logos, form links, sheet URL).
  → ⚠️ Best practice: move these into **Script Properties** or a **Config sheet** so they are not hard-coded.
* Open **Home.html**, **Incidents.html**, **Login.html** and confirm links use `ctx.scriptUrl` and preserve `ctx.selectedSchoolKey`.
* Test pages via `?page=home&school=<your-key>` and `?page=incidents&school=<your-key>`.

---

## InForm – GAS project (raw file index)

> Share these RAW links with LLMs or for quick diffing. They point straight to the latest contents of each file in this **GitHub repository**.

### .md files

**README.md**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/README.md](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/README.md)

### .gs files

**Code.gs**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Code.gs](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Code.gs)

**Helpers.gs**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Helpers.gs](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Helpers.gs)

**Tests.gs**
[https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Tests.gs](https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Tests.gs)

### .html files

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

---

#### Notes

* These filenames are **case-sensitive**. Keep them exactly as shown.
* If an assistant still “ignores” links, create a single “bundle” file (e.g. `AllFiles.md`) that inlines each file with headings and fenced code blocks.

---

## Table of contents

1. [Project goals](#project-goals)
2. [Architecture overview](#architecture-overview)
3. [File map](#file-map)
4. [Pages & routes](#pages--routes)
5. [Global context (`ctx`) & config](#global-context-ctx--config)
6. [Golden rules for navigation & safety](#golden-rules-for-navigation--safety)
7. [Testing checklist (smoke test)](#testing-checklist-smoke-test)
8. [Security model](#security-model)
9. [Data model & Google Sheets](#data-model--google-sheets)
10. [Deployments & environments](#deployments--environments)
11. [Development workflow (GAS + clasp + Git)](#development-workflow-gas--clasp--git)
12. [Coding standards & patterns](#coding-standards--patterns)
13. [AutoSMS – SMS South Africa (current implementation)](#autosms--sms-south-africa-current-implementation) ← **new**

    * [Script Properties](#script-properties)
    * [Toggles](#toggles)
    * [How it works (flow)](#how-it-works-flow)
    * [Install the form submit trigger](#install-the-form-submit-trigger)
    * [Manual resend for today](#manual-resend-for-today)
    * [Parent portal links & masking](#parent-portal-links--masking)
    * [Troubleshooting SMS](#troubleshooting-sms)
14. [Troubleshooting (general)](#troubleshooting-general)
15. [Scalability & multi-tenant guidance](#scalability--multi-tenant-guidance)
16. [Contributing](#contributing)
17. [AI collaborators: how to help](#ai-collaborators-how-to-help)
18. [Glossary](#glossary)
19. [Roadmap](#roadmap)
20. [License](#license)

---

## Project goals

* **Practical**: Give staff a clean, fast portal to log and view incidents and attendance.
* **Safe by default**: Navigation that never "drops" context (e.g., school key), link-building that avoids broken routes, and templates that resist JS hoisting pitfalls.
* **Scalable**: Onboard additional schools (multi-tenant) without rewriting core code.
* **Sellable**: Clear separation of configuration vs. product logic, so this can be packaged for other institutions.

---

## Architecture overview

* **Frontend**: HTML templates rendered by GAS `HtmlService`:

  * `Home.html` – welcome & role-based actions
  * `Incidents.html` – filters, list, CSV/PDF export
  * `Login.html` – school selection & sign-in
  * `Parents.html` – parent portal (ack page + learner incidents)

* **Backend**: `Code.gs` (routing via `doGet`, one-true `ctx`, SMS), `Helpers.gs` (utilities), `Tests.gs` (validation helpers).

* **Data**: Google Sheets workbooks (per school) + Google Forms for responses.

* **Routing**: `GET` with `page` param (`home`, `incidents`, `login`, `parent`, `ack`, `csv`, `report`).
  Preserve state with `school=<key>` and other filters.

---

## File map

* **Code.gs** – routing (`doGet`), context assembly (`getUserContext_`, `ensurePrimaryWorkbookInCtx_`, `resolveSelectedSchoolKey_`), renderers (`renderPage_`, report builders), **SMS stack** (auth, send, handlers), parent portal, triggers.
* **Helpers.gs** – utilities, logging, header matching, token/URL helpers, etc.
* **Tests.gs** – template/route validator (`validateProject`) and small smoke checks.
* **Templates** – `Home.html`, `Incidents.html`, `Login.html`, `Logout.html`, `Parents.html`, `Styles.html`, `Footer.html`.

---

## Pages & routes

* `?page=home` → **Home**
* `?page=incidents` → **Incidents**
* `?page=login` → **Login**
* `?page=logout` → **Logout → Login**
* `?page=parent&tok=...` → **Parent Portal**
* `?page=ack&tok=...&row=<row>` → Parent acknowledgement
* `?page=report` → Build **PDF**, serve download page
* `?page=csv` → Build **CSV**, serve download page
* `?page=echo` / `?page=debug` → Diagnostics

**Common query params**

* `school` → selected school key (must be preserved)
* `days`, `grade`, `subject`, `teacher`, `learner`, `nature`, `limit` → Incidents filters
* `authuser` → used for incognito/Sites flows
* `clearCache=true` → bypass cached ctx

---

## Global context (`ctx`) & config

**One True `ctx`** is built once per request (inside `doGet` using `getUserContext_`) and passed to templates.
It includes: user identity, role, branding, absolute `scriptUrl`, `selectedSchoolKey`, form links, `dataSheetUrl`.

Key helpers in **Code.gs** you already use:

* `ensurePrimaryWorkbookInCtx_(ctx)` – resolves primary **Data Sheet** via **CONFIG ▸ Schools**
* `ensureScriptUrlOnCtx_(ctx)` – guarantees clean absolute base URL
* `resolveSelectedSchoolKey_(ctx, e)` – respects `?school=`, remembers last selection per user

**Config best practice**: put values in **Script Properties** or a **Config sheet** (you already do this via `CONFIG_SHEET_URL` and the **Schools** tab).

---

## Golden rules for navigation & safety

1. Always link with `ctx.scriptUrl` (absolute) **and** include `&school=...`.
2. Clear / Back buttons must **preserve** the school key.
3. Hoist-safe templates: do **not** `var`-redeclare server-injected globals.
4. Escape iframes/site containers with `<base target="_top">`.
5. Encode query params (`encodeURIComponent`).
6. Use `Logger.log` for server logs (you already do; SMS logs mask tokens/URLs).

---

## Testing checklist (smoke test)

* `?page=home&school=TEST` renders branding (logo/color) and correct links.
* `?page=incidents&school=TEST` shows rows and respects filters.

  * **Clear** & **Back** keep `&school=TEST`.
* `?page=logout` renders Login (no blank page).
* `?page=parent&tok=...` renders learner incidents (masked in logs).
* PDF/CSV export pages redirect to Drive file and show **Back Home** & **Back to Incidents** buttons.

---

## Security model

* **Least privilege** access to Sheets and Drive.
* Parent links use random tokens (length = `TOKEN_LENGTH`).
* Logs mask tokens and portal URLs (via `maskToken_`, `maskUrlToken_`).
* Parent acknowledgement writes only to the school’s **Data Sheet** where the token was found.
* Avoid sandboxing combinations that re-enable XSS in iframes; templates are kept simple and server-rendered.

---

## Data model & Google Sheets

* **CONFIG_SHEET_URL** – central “Schools” config (branding, Data Sheet URL, form links, active flag, domains).
* **Data Sheet (per school)** – tabs:

  * **Form Responses 1** – incident logs (your default via `RESPONSES_SHEET_NAME`)
  * **Learner Contacts** – tokens + parent contact details
  * **Staff** – staff roster, role, display names
* Server-side filtering and batching via `getValues()`.

---

## Deployments & environments

* Keep **staging** and **production** web app deployments.
* `getWebAppUrl_()` and `getBaseScriptUrl_()` normalize to current deployment; `ensureScriptUrlOnCtx_()` makes all links absolute.
* Build stamp: `BUILD` (visible in logs/HTML when surfaced).

---

## Development workflow (GAS + clasp + Git)

* Use [clasp](https://github.com/google/clasp) to sync with GitHub.
* Branch → edit → test → PR → deploy.
* Tag semver releases to align Script deployments with Git commits.

---

## Coding standards & patterns

* Templates are “dumb”; logic lives in `.gs`.
* Preserve `school` across navigation.
* Use absolute URLs; never hardcode `/exec` in templates—use `ctx.scriptUrl`.
* Centralize helpers and keep functions small and composable.
* Add validators (`validateProject`) to catch template route mismatches.

---

## AutoSMS – SMS South Africa (current implementation)

Your code already contains a **complete, production-ready** path for **immediate SMS sending** on each incident submission, plus a **manual resend** tool for unsent entries. This section documents the exact behavior that your current repository implements.

### Script Properties

Set these in **Apps Script → Project Settings → Script Properties**:

```
SMS_SA_USERNAME            = <your-username>
SMS_SA_PASSWORD            = <your-password>
SMS_SA_AUTH_URL            = https://<provider-auth-endpoint>   // from your SMS SA account
SMS_SA_SEND_SMS_URL        = https://<provider-send-endpoint>   // from your SMS SA account
SMS_SA_DEFAULT_SENDER_ID   = InForm                             // or your approved sender ID
```

> These map 1:1 to `getSmsConfig_()` and are consumed by `getSmsSouthAfricaAuthToken()` and `sendSmsViaSmsSouthAfrica()`.

### Toggles

Defined near the top of **Code.gs**:

```js
const AUTO_SMS_ENABLED = true;           // master switch
const DRY_RUN = true;                    // true = simulate (no real SMS); set false for live
const MAX_SMS_LEN = 159;                 // cap & smart-trim for nature line
const PARENT_LINKS_USE_SHORTENER = true; // use TinyURL/is.gd fallback helper
const SMS_STATUS_COLUMN = 'Sent to Parent'; // status column in Form Responses
```

Other relevant constants:

```js
const RESPONSES_SHEET_NAME = 'Form Responses 1';
const CONTACT_SHEET_NAME   = 'Learner Contacts';
const COMBINED_LEARNER_COLUMN = 'Combined Learner';
const STATUS_SENT = 'SMS Sent';
const STATUS_FAILED_PREFIX = 'Failed - ';
```

### How it works (flow)

1. **Teacher submits incident** (Google Form response lands in **Form Responses 1**).
2. Installable **on form submit trigger** (see below) calls:

   * `onIncidentFormSubmit(e)`
3. Handler logic (as implemented):

   * Reads the new row, dedupes if `"Sent to Parent"` already says “sent”
   * Looks up **parent phone** & **portal token** in **Learner Contacts** using `getParentPortalLinkAndPhoneForLearner_(learner, contactsBookUrl)`

     * Ensures token exists (creates if blank)
     * Builds a **parent portal link** → optional short link if `PARENT_LINKS_USE_SHORTENER`
     * Normalizes ZA phone numbers (e.g., `082…` → `+2782…`)
   * Builds SMS body via `buildIncidentSmsMessage_()`

     * Header: `DHS Incident - <SURNAME INITIAL> <YYYY-MM-DD>`
     * Optional `T:` teacher initial
     * Optional `N:` nature (auto-trimmed to fit `MAX_SMS_LEN`)
     * Includes “More Detail” + portal URL when available (`SEND_ACK_LINK` respected)
   * Sends via `sendSmsViaSmsSouthAfrica(to, message, senderId)`

     * Fetches a **bearer token** using `getSmsSouthAfricaAuthToken()` (Basic auth → token)
     * Posts to **SMS_SA_SEND_SMS_URL** with JSON payload
   * Updates **Sent to Parent** to:

     * `SMS Sent` on success
     * `Failed - <reason>` on failure

> All logs **mask** tokens and URLs using your masking helpers.

### Install the form submit trigger

Run this once from the Script Editor (or put behind an admin action):

```js
installIncidentSubmitTrigger_();
```

What it does:

* Locates the correct **Data Sheet** (using your `getUserContext_()` and `ctx.dataSheetUrl`)
* Removes any existing `onIncidentFormSubmit` triggers for safety
* Creates a new **installable onFormSubmit trigger** bound to that spreadsheet

### Manual resend for today

Use your built-in tool when some rows are left **unsent** (e.g., transient provider outage):

```js
sendUnsentSMSToday();
```

Behavior:

* Scans **Form Responses 1** for **today’s** timestamp
* Skips rows where **Sent to Parent** already contains “sent”
* Repeats the same lookup/message/send flow as the submit handler
* Updates status per-row and shows a summary alert (`X sent, Y failed`)

### Parent portal links & masking

* `getParentPortalLinkAndPhoneForLearner_`:

  * Ensures a **random token** exists in **Learner Contacts** for the learner row
  * Constructs the **parent portal** URL: `https://.../exec?page=parent&tok=<TOKEN>`
  * Shortens link if configured; returns both long/short for flexibility
* Logging:

  * Tokens are masked with `maskToken_()`
  * URLs are masked with `maskUrlToken_()` so logs never leak `tok=...`

### Troubleshooting SMS

Check server logs for these markers:

* **`onIncidentFormSubmit triggered`** – the handler ran.
* **`Parent portal link info: {"ok":true, "phone":"(present)", "urlMasked":"..."}`** – lookup worked.
* **`SMS send code=200/201/202`** – provider accepted the message.
* **`SMS send failed body: ...`** – inspect error payload (token invalid, senderId mismatch, etc.).
* **`Failed - No valid phone`** – phone number missing or invalid (must start with `+`).
* Ensure Script Properties keys are correct and URLs (`SMS_SA_AUTH_URL`, `SMS_SA_SEND_SMS_URL`) match your provider settings.

---

## Troubleshooting (general)

* **Logout renders a blank page** → your code renders Login **directly** on `?page=logout`; confirm `renderPage_('login', ...)` is reachable.
* **Incidents empty** → verify the tab is named exactly `"Form Responses 1"` (or your fallback logic finds a `Timestamp` column).
* **Clear/Back drops school** → ensure links carry `&school=<?= encodeURIComponent(ctx.selectedSchoolKey||'') ?>`.
* **Parent link 403** → check Drive/Sheets sharing and token validity; tokens are per-row in **Learner Contacts**.
* **Exec URL wrong** → set `WEB_APP_URL` / `WEB_APP_BASE` in Script Properties or redeploy and re-run `getWebAppUrl_()` helpers.

---

## Scalability & multi-tenant guidance

* Tenant = `selectedSchoolKey`.
* **CONFIG ▸ Schools** tab drives branding, primary **Data Sheet**, and form links per school.
* `getUserContext_()` already handles:

  * explicit `?school=`
  * fallback by email domain
  * staff verification inside the tenant **Data Sheet**
* If you later need **per-school SMS credentials** (instead of global Script Properties), add keyed properties such as:

  * `SMS_SA_SCHOOL_<KEY>_TOKEN`, `SMS_SA_SCHOOL_<KEY>_SENDER_ID`
    …and pick them inside `getSmsConfig_()` based on `ctx.selectedSchoolKey`. (This is an optional future enhancement; current code uses **global** credentials.)

---

## Contributing

* Branch → commit → PR.
* Use descriptive commit messages: `feat(sms): log masked URL`, `fix(nav): preserve school on back`.

---

## AI collaborators: how to help

* **Do not** hardcode `/exec` in templates—always use `ctx.scriptUrl`.
* Keep “One True `ctx`” sacred: build once in `doGet`, never reconstruct in HTML.
* When adjusting **Incidents** or **Parents** pages, verify Clear/Back keep `&school=`.
* Any SMS edits must keep:

  * token/URL masking in logs
  * status updates in **Form Responses 1**
  * Script Properties-based configuration

---

## Glossary

* **Tenant** – a school using the app.
* **Data Sheet** – the primary per-school spreadsheet containing “Form Responses 1”, “Learner Contacts”, “Staff”.
* **CONFIG** – central spreadsheet referenced by `CONFIG_SHEET_URL` (brand, URLs, active flags).

---

## Roadmap

* Optional **per-school SMS credentials** (overrides of global props).
* Admin UI for script/tenant configuration.
* Additional unit tests around header matching and parent token issuance.
* Server-side pagination for very large incident logs.

---

## License

MIT (or institution-specific) — update as required.

---

