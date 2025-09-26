
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

> Share these RAW links with Grok/LLMs. They point straight to the latest contents of each file in this **GitHub repository**.

### .md files

**README.md**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/README.md

### .gs files

**Code.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Code.gs  

**Helpers.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Helpers.gs  

**Tests.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Tests.gs  

### .html files

**Footer.html**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Footer.html  

**Home.html**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Home.html  

**Incidents.html**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Incidents.html  

**Login.html**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Login.html  

**Logout.html**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Logout.html  

**Parents.html**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Parents.html  

**Styles.html**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Styles.html  

---

#### Notes

* These filenames are **case-sensitive**. Keep them exactly as shown.
* If Grok still ignores links, create a single “bundle” file (e.g. `AllFiles.md`) that inlines each file with headings and fenced code blocks.

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
13. [Troubleshooting](#troubleshooting)  
14. [Scalability & multi-tenant guidance](#scalability--multi-tenant-guidance)  
15. [Contributing](#contributing)  
16. [AI collaborators: how to help](#ai-collaborators-how-to-help)  
17. [Glossary](#glossary)  
18. [Roadmap](#roadmap)  
19. [License](#license)  

---

## Project goals

* **Practical**: Give staff a clean, fast portal to log and view incidents and attendance.  
* **Safe by default**: Navigation that never "drops" context (e.g., school key), link-building that avoids broken routes, and templates that resist JS hoisting pitfalls.  
* **Scalable**: Easily onboard additional schools (multi-tenant) without rewriting code.  
* **Sellable**: Clear separation of configuration vs. product logic, so this can be packaged for other institutions.

---

## Architecture overview

* **Frontend**: HTML templates rendered by GAS `HtmlService`:
  * `Home.html` – welcome & role-based actions.  
  * `Incidents.html` – filters, list, CSV/Report download.  
  * `Login.html` – school selection & sign-in.  

* **Backend**: `Code.gs` (routing via `doGet`), `Helpers.gs` (utility functions).  

* **Data**: Google Sheets (source of truth) + Google Forms (data entry for incidents & attendance).  

* **Routing**: `GET` with `page` param, e.g. `?page=home`, `?page=incidents`.  
  Extra query params preserve state (e.g., `school=<key>`).

---

## File map

* **Code.gs** – main entry (`doGet`), page rendering (`renderPage_`), URL builders (`buildUrl_`), context assembly.  
* **Helpers.gs** – utilities: parameter parsing, logging, error handling, Sheets helpers.  
* **Tests.gs** – automated checks (filters, URL building, headers).  
* **Home.html** – landing page with branding and role-based links.  
* **Incidents.html** – filters, list, CSV export, Clear & Back buttons.  
* **Login.html** – school picker + login flow.  
* **Logout.html** – renders Login directly.  
* **Styles.html** – shared CSS.  
* **Footer.html** – optional footer/branding block.

---

## Pages & routes

* `?page=home` → **Home**  
* `?page=incidents` → **Incidents**  
* `?page=login` → **Login**  
* `?page=logout` → **Logout → Login**  
* `?page=report` → **CSV/Report**  

**Common query params**  

* `school` → selected school key (must be preserved)  
* `days`, `grade`, `staff`, `type` → filters for incidents  
* `clearCache=true` → bypass caches  

---

## Global context (`ctx`) & config

Each template receives a `ctx` object like:

```js
{
  userDisplayName: "Kroukamp E",
  role: "manager",
  schoolName: "Doornpoort High School",
  schoolColor: "#1a4c8a",
  schoolLogo: "https://.../logo.png",
  dataSheetUrl: "https://docs.google.com/spreadsheets/...",
  incidentFormUrl: "https://forms.gle/...",
  attendanceFormUrl: "https://forms.gle/...",
  scriptUrl: "https://script.google.com/macros/s/XXXXX/exec",
  selectedSchoolKey: "DOORNPOORT"
}
````

### Config best practice

Store per-school values in **Script Properties** or a **Config sheet**, not hard-coded in `Code.gs`.

---

## Golden rules for navigation & safety

1. Always link with `ctx.scriptUrl` (absolute) **and** include `&school=...`.
2. Clear and Back buttons must **preserve the school**.
3. Use **hoist-safe defaults** in templates (don’t `var`-redeclare).
4. Escape iframes with `<base target="_top">`.
5. Encode URL params with `encodeURIComponent`.
6. Use `Logger.log` server-side; avoid `console.log`.

---

## Testing checklist (smoke test)

After deployment, test:

* `?page=home&school=TEST` → branding loads.
* `?page=incidents&school=TEST` → incidents visible.

  * Apply filters → keeps school.
  * Clear → resets but keeps school.
  * Back to Home → returns with same school.
* `?page=logout` → renders Login (not blank).

---

## Security model

* **Least privilege** with Sheets access.
* Avoid `iframe[sandbox]` with both `allow-scripts` and `allow-same-origin`.
* Always escape template vars (`<?= ?>`).
* Use `encodeURIComponent` in links.

---

## Data model & Google Sheets

* **Incidents sheet**: columns like Timestamp, StaffEmail, StudentName, Grade, IncidentType, Severity, Notes, SchoolKey.
* **Attendance sheet**: similar structure.
* Filter server-side for performance.
* Use `getValues()` batch reads.

---

## Deployments & environments

* Keep **staging** and **production** deployments.
* Use versioned releases.
* Confirm `ctx.scriptUrl` points to correct deployment.

---

## Development workflow (GAS + clasp + Git)

* Use [clasp](https://github.com/google/clasp) for syncing with GitHub.
* Workflow: clone → branch → edit → push → PR → deploy.
* Tag deployments (`v1.2.3`) to map Git + Apps Script.

---

## Coding standards & patterns

* Templates are dumb; logic in `.gs`.
* Preserve school key across navigation.
* Always use absolute URLs.
* Centralize helpers in `Helpers.gs`.
* Write simple unit tests in `Tests.gs`.

---

## Troubleshooting

* **White page logout** → ensure `renderLoginDirect_` renders Login.
* **Incidents empty** → check for `var` redeclarations in template.
* **Clear drops school** → fix link to include `&school=...`.

---

## Scalability & multi-tenant guidance

* Tenant = `selectedSchoolKey`.
* Config per school in Properties/Sheet.
* Large datasets → paginate or derive CSV exports.
* Branding per school via config.

---

## Contributing

* Branch → commit → PR.
* Use descriptive commits: `feat(incidents): add pagination`.

---

## AI collaborators: how to help

* Always return **full files** for HTML/templates.
* Keep `ctx` intact (don’t hardcode URLs).
* Apply hoist-safe defaults.
* Fix both Clear + Back when editing navigation.
* Add one useful `Logger.log` per page boot.

---

## Glossary

* **Clone** – copy repo locally.
* **Branch** – separate line of development.
* **Fork** – copy under your GitHub account.
* **PR** – request to merge changes.

---

## Roadmap

* Add structured logging helpers.
* Server-side pagination.
* Role-based access checks.
* More unit tests.
* Admin UI for config.

---

## License

MIT (or institution-specific) — update as required.

---
