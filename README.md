# InForm – Google Apps Script Staff Portal

A lightweight, scalable staff portal for schools, built on Google Apps Script (GAS), Google Sheets, and Google Forms. InForm focuses on secure, simple workflows for logging and viewing incidents, attendance, and related staff tasks.

---

## TL;DR (quick start)

* **Deploy the web app** from Apps Script → **Deploy** → **New deployment** → type **Web app**.
* Set **Execute as**: Me. Set **Who has access**: Your org or Anyone (as required by your rollout plan).
* Copy the **Web app URL** (this is your `scriptUrl`).
* Open **Code.gs** → set or confirm per‑school config (names, colors, logos, form links, sheet URL).
* Open **Home.html**, **Incidents.html**, **Login.html** and confirm links use `ctx.scriptUrl` and preserve `ctx.selectedSchoolKey`.
* Test pages via `?page=home` and `?page=incidents&school=<your-key>`.

---

## Table of contents

1. [Project goals](#project-goals)
2. [Architecture overview](#architecture-overview)
3. [File map](#file-map)
4. [Pages & routes](#pages--routes)
5. [Global context (`ctx`) & config](#global-context-ctx--config)
6. [Golden rules for navigation & safety](#golden-rules-for-navigation--safety)
7. [Security model](#security-model)
8. [Data model & Google Sheets](#data-model--google-sheets)
9. [Deployments & environments](#deployments--environments)
10. [Development workflow (GAS + clasp + Git)](#development-workflow-gas--clasp--git)
11. [Coding standards & patterns](#coding-standards--patterns)
12. [Troubleshooting](#troubleshooting)
13. [Scalability & multi‑tenant guidance](#scalability--multi-tenant-guidance)
14. [Contributing](#contributing)
15. [AI collaborators: how to help](#ai-collaborators-how-to-help)
16. [Glossary (clone, branch, fork, etc.)](#glossary-clone-branch-fork-etc)
17. [Roadmap](#roadmap)
18. [License](#license)

---

## Project goals

* **Practical**: Give staff a clean, fast portal to log and view incidents and attendance.
* **Safe by default**: Navigation that never "drops" context (e.g., school key), link‑building that avoids broken routes, and templates that resist JS hoisting pitfalls.
* **Scalable**: Easily onboard additional schools (multi‑tenant) without rewriting code.
* **Sellable**: Clear separation of configuration vs. product logic, so this can be packaged for other institutions.

---

## Architecture overview

* **Frontend**: HTML templates rendered by GAS `HtmlService`:

  * `Home.html` – welcome & role‑based actions.
  * `Incidents.html` – filters, list, CSV/Report download.
  * `Login.html` – school selection & sign‑in.
* **Backend**: `Code.gs` (routing via `doGet`), `Helpers.gs` (utility functions), optional `logHelpers` (structured logging pattern) and other server utilities.
* **Data**: Google Sheets (source of truth) + Google Forms (data entry for incidents & attendance).
* **Routing**: `GET` with `page` param, e.g. `?page=home`, `?page=incidents`. Additional query params preserve state (e.g., `school=<key>`).

---

## File map

> Your repository or Apps Script project will contain these core files.

* **Code.gs** – main entry (e.g., `doGet(e)`), page rendering (`renderPage_`), URL builders (`buildUrl_`), context assembly.
* **Helpers.gs** – shared utilities: parameter parsing, caching, Sheets I/O, formatting.
* **Home.html** – landing page; shows school branding; role‑based links (incident/attendance forms, incidents view).
* **Incidents.html** – filters + list; clear/back buttons; export/download.
* **Login.html** – school selection & sign‑in; used for logout redirects as well.
* **(Optional)** `Styles.html`, `Partials.html` – shared CSS or template fragments via `<?!= include('Styles'); ?>`.

> **Convention**: Templates receive a `ctx` object (context) with all values needed to render and link safely.

---

## Pages & routes

* `?page=home` → **Home**
* `?page=incidents` → **Incidents** (supports filters)
* `?page=login` → **Login/School Picker**
* `?page=logout` → **Logout flow** (renders Login directly)
* `?page=report` → **Export/Report** (respects filters)

**Common query params**

* `school` → *selected school key* (keep this on navigation!)
* `days`, `grade`, `staff`, `type` → optional filters for incidents (actual names configurable; align with your Sheets columns).
* `clearCache=true` → server may bypass caches if implemented.

**Example**

```
https://script.google.com/macros/s/XXXXX/exec?page=incidents&school=DOORNPOORT&days=7
```

---

## Global context (`ctx`) & config

Templates are rendered with a **`ctx` object**. Typical fields:

```js
{
  userDisplayName: "Kroukamp E",
  role: "manager", // e.g., 'staff', 'manager', 'admin'
  schoolName: "Doornpoort High School",
  schoolColor: "#1a4c8a",
  schoolLogo: "https://.../logo.png",
  dataSheetUrl: "https://docs.google.com/spreadsheets/...",
  incidentFormUrl: "https://forms.gle/...",
  attendanceFormUrl: "https://forms.gle/...",
  scriptUrl: "https://script.google.com/macros/s/XXXXX/exec", // absolute
  selectedSchoolKey: "DOORNPOORT" // NEVER drop this in links
}
```

**Where does `ctx` come from?**

* `Code.gs` builds it per request (using the signed‑in user, deployment URL, and selected school), then calls `renderPage_('home', ctx)` etc.

**Branding**

* Use `ctx.schoolName`, `ctx.schoolLogo`, and `ctx.schoolColor` for the header, accent color, and favicon where appropriate.

---

## Golden rules for navigation & safety

1. **Always link with `ctx.scriptUrl` (absolute)** and **preserve `ctx.selectedSchoolKey`**:

   ```html
   <!-- Clear filters but keep school -->
   <a class="btn" href="<?= ctx.scriptUrl ?>?page=incidents&school=<?= encodeURIComponent(ctx.selectedSchoolKey||'') ?>">Clear</a>

   <!-- Back to Home with school -->
   <a class="btn" href="<?= ctx.scriptUrl ?>?page=home&school=<?= encodeURIComponent(ctx.selectedSchoolKey||'') ?>">← Back to Home</a>
   ```
2. **Hoist‑safe defaults (do not redeclare template globals)**:

   ```html
   <? // In templates: read existing globals, reassign WITHOUT `var` ?>
   <? (function(){
     var _schoolName  = (typeof schoolName  !== 'undefined') ? schoolName  : 'School';
     var _schoolLogo  = (typeof schoolLogo  !== 'undefined') ? schoolLogo  : '';
     var _schoolColor = (typeof schoolColor !== 'undefined') ? schoolColor : '#1a4c8a';
     schoolName  = _schoolName;
     schoolLogo  = _schoolLogo;
     schoolColor = _schoolColor;
   })(); ?>
   ```

   *Why?* Re‑declaring with `var` can hoist and overwrite server‑provided values → broken pages or empty lists.
3. **Escape iframes by default**:

   ```html
   <base target="_top">
   ```
4. **Encode user input in URLs**: `encodeURIComponent(...)` for each query value.
5. **Use server logs** instead of `console.log`:

   ```js
   Logger.log('[Incidents boot] %s', JSON.stringify({ page: 'Incidents', hasScriptUrl: !!ctx.scriptUrl, selectedSchoolKey: ctx.selectedSchoolKey }));
   ```

---

## Security model

* **Least privilege**: Scope your spreadsheet access; avoid broad Drive ops.
* **X-Frame-Options**: Some pages use

  ```js
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
  ```

  Only enable when truly needed (e.g., embedded in trusted environments). Prefer `<base target="_top">` so links escape potential hostile iframes.
* **Sanitize**: Never inject unsanitized user input into HTML. For text nodes, use `<?= ?>` (Apps Script auto‑escapes). For URLs, always `encodeURIComponent` parameters.
* **Avoid** `iframe[sandbox]` with **both** `allow-scripts` **and** `allow-same-origin` – this combination can break sandboxing and enable escape vectors.

---

## Data model & Google Sheets

* **Incidents** are stored in a Google Sheet (single tab or one per school). Suggested minimal columns:

  * Timestamp, StaffEmail, StudentName, Grade, IncidentType, Severity, Notes, SchoolKey
* **Attendance** can be a separate tab or sheet with analogous fields.
* **Filters** on `Incidents.html` should match column names (e.g., `days`, `grade`, `staff`, `type`). Implement filtering **server‑side** where possible for performance and consistency.

**Batch reads & writes**

* Prefer `getValues()` once + in‑memory filtering over many `getValue()` calls.
* If sheets grow large, add a **derived tab** (query or pivot) for the most‑frequent views, or introduce pagination.

---

## Deployments & environments

* Use **versioned deployments** (Apps Script → Deploy → Manage deployments).
* Maintain **staging** and **production** deployments (two separate web app URLs). Put both into Script Properties if needed.
* After deployment, verify `ctx.scriptUrl` points at the active deployment URL.

**Logout flow**

* Implement a direct render of Login to avoid blank pages or external redirects:

  ```js
  /** Directly render the Login (school selection) page */
  function renderLoginDirect_(scriptUrl, options) {
    var loginUrl = buildUrl_(scriptUrl || getExecUrl_(), 'login', { clearCache: true, forcePick: 1 });
    return renderPage_('login', {
      signinUrl: loginUrl,
      redirect:  loginUrl,
      safeRedirect: JSON.stringify(loginUrl),
      publicUrl: scriptUrl || getExecUrl_(),
      scriptUrl: scriptUrl || getExecUrl_(),
      forcePick: 1,
      msg: options && options.msg || ''
    }).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  ```

---

## Development workflow (GAS + clasp + Git)

**Recommended**: Use [clasp](https://github.com/google/clasp) to sync Apps Script code with Git.

1. **Enable Apps Script API** in your Google Cloud console.
2. Install clasp: `npm i -g @google/clasp`.
3. `clasp login`
4. `clasp clone <scriptId>` → pulls your Apps Script project locally.
5. Edit files locally; commit with Git; push to GitHub.
6. `clasp push` to upload changes back to Apps Script.
7. Create a new **deployment** in Apps Script for production.

**Git best practices**

* Feature branches (`feat/…`, `fix/…`).
* Pull Requests with a description of the change and screenshots.
* Tag releases (`v1.2.3`) that map to Apps Script deployments.

---

## Coding standards & patterns

* **Keep templates dumb**: all data prepared in `Code.gs`, minimal logic in HTML.
* **No duplicate globals** in templates; follow the **hoist‑safe** pattern.
* **Absolute URLs** via `ctx.scriptUrl`; never rely on `./` or relative links in production.
* **Preserve context**: Always carry `school` across pages.
* **Logging**: use `Logger.log` server‑side; optionally implement a `doClientLog(imgBeacon)` pattern if you need client traces.
* **Performance**: Avoid heavy loops hitting Sheets; batch, cache, and pre‑compute.

---

## Troubleshooting

**White screen on Logout**

* Ensure the logout route renders `Login.html` directly (`renderLoginDirect_`), not a blind redirect.
* Confirm links use `ctx.scriptUrl` and include `?page=login` or `?page=logout` as intended.

**Incidents list shows 0 rows**

* Check for **`var` re‑declarations** in templates that shadow server globals (fix via hoist‑safe defaults).
* Inspect `Logger.log` output in Apps Script → Executions.

**Clear/Back buttons lose school**

* Make sure links keep `&school=<?= encodeURIComponent(ctx.selectedSchoolKey||'') ?>`.

**Wrong base URL**

* Never compute links from `location.href` alone. Prefer server‑provided `ctx.scriptUrl`.

---

## Scalability & multi‑tenant guidance

* **Tenant key**: Treat `selectedSchoolKey` as the tenant ID. Keep it on all routes.
* **Config isolation**: Store per‑school config in Script Properties, a JSON tab, or a config sheet; hydrate into `ctx` per request.
* **Data isolation**: Either one shared sheet with a `SchoolKey` column, or separate sheets per school. The latter scales better for very large datasets.
* **Branding**: Provide `schoolLogo`, `schoolColor` in config to theme pages without code changes.
* **Exports**: For large reports, consider generating a file (CSV) in Drive and serving a link rather than streaming everything live.

---

## Contributing

1. Open an issue describing the change.
2. Fork or branch, implement changes following **Coding standards** above.
3. Add/adjust unitless checks (lint, simple validation functions).
4. Submit a PR with screenshots/GIFs of UI changes.

**Commit style**: `feat(incidents): add pagination`, `fix(login): keep school on redirect`.

---

## AI collaborators: how to help

* **Return full files** when editing HTML pages (not snippets) to prevent drift.
* **Respect `ctx`**: never replace with hardcoded URLs; keep `selectedSchoolKey`.
* **Use hoist‑safe defaults** in templates—do not `var` re‑declare server globals.
* **When modifying navigation**, update **both** Clear and Back to Home buttons.
* **Log usefully**: add one concise `Logger.log` per page boot with page name and key params.
* **Don’t invent data schemas**: align filters and columns with what the sheet actually contains; if unknown, propose optional fields clearly.

---

## Glossary (clone, branch, fork, etc.)

* **Clone**: Download a repository to your computer so you have a local copy.
* **Branch**: A separate line of work within the same repo (safe space to make changes without breaking `main`).
* **Fork**: Your own copy of someone else’s repo under your account; you can freely experiment and send PRs back.
* **Pull Request (PR)**: A proposal to merge your branch/fork changes into another branch (often `main`).

---

## Roadmap

* Extract `logHelpers` for structured logging & telemetry.
* Add server‑side pagination for large incident datasets.
* Introduce role‑based access checks (admin/manager/staff) on the server.
* Add automated tests for URL building and parameter parsing.
* Optional: Move config to a dedicated JSON file or Sheet tab with an admin UI.

---

## License

MIT (or institution‑specific) — update as required.

