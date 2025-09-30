
---


# InForm – Google Apps Script Staff Portal

A lightweight, scalable staff portal for schools, built on Google Apps Script (GAS), Google Sheets, and Google Forms.  
InForm focuses on secure, simple workflows for logging and viewing incidents, attendance, SMS alerts, and related staff tasks.

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

## Raw file index

**README.md**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/README.md  

**Code.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Code.gs  

**Helpers.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Helpers.gs  

**Tests.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Tests.gs  

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

**AutoSmsSa.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/AutoSmsSa.gs  

**Guard_Sa.gs**  
https://raw.githubusercontent.com/melk810/InForm/refs/heads/main/Guard_Sa.gs  

---

## Table of contents

1. [Project goals](#project-goals)  
2. [Architecture overview](#architecture-overview)  
3. [File map](#file-map)  
4. [Pages & routes](#pages--routes)  
5. [Global context (`ctx`) & config](#global-context-ctx--config)  
6. [SMS configuration](#sms-configuration)  
7. [AdminSms page & quota system](#adminsms-page--quota-system)  
8. [Auto-SMS: triggers & multi-tenant design](#auto-sms-triggers--multi-tenant-design)  
9. [Golden rules for navigation & safety](#golden-rules-for-navigation--safety)  
10. [Testing checklist](#testing-checklist)  
11. [Troubleshooting & lessons learned](#troubleshooting--lessons-learned)  
12. [Scalability & multi-tenant guidance](#scalability--multi-tenant-guidance)  
13. [Roadmap](#roadmap)  
14. [Glossary](#glossary)  
15. [License](#license)

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
  * `AdminSms.html` – admin console for SMS quota usage/backfill  
* **Backend**:  
  * `Code.gs` – routing (`doGet`), rendering (`renderPage_`), reports, SMS  
  * `SmsQuota.gs` – SMS quota + alerts + backfill logic  
  * `AutoSmsSa.gs` – live/DRY-RUN SMS provider integration  
  * `Helpers.gs` – utilities (params, logs, sheets, URL building)  
* **Data**: Google Sheets (source of truth) + Forms for input  
* **Routing**: `?page=home`, `?page=incidents`, `?page=adminsms`, etc.  

---

## SMS configuration

**Provider:** SMS South Africa  

Script Properties:  
* `SMS_SA_USERNAME` / `SMS_SA_PASSWORD`  
* `SMS_SA_AUTH_URL`  
* `SMS_SA_SEND_SMS_URL`  
* `SMS_SA_DEFAULT_SENDER_ID`  
* `WEB_APP_URL` / `WEB_APP_BASE`  
* `INF_CONFIG_SHEET_URL`  

Safety toggles:  
```js
const AUTO_SMS_ENABLED = true;  // master kill-switch
const DRY_RUN = true;           // true = NO live SMS
````

---

## AdminSms page & quota system

The **AdminSms.html** page allows administrators to:

* View monthly SMS usage per school.
* Backfill counts for past months (via `backfillSmsUsageForSchool` and `backfillSmsUsageRangeForSchool`).
* Confirm thresholds:

  * 75% → early warning
  * 90% → high warning
  * 100% → quota exceeded

### Key backend pieces

* `SmsQuota.gs`:

  * `countSmsSentInRange_()` – counts SMS “sent” values within a date range.
  * `isSmsSentCell_()` – case-insensitive, tolerant (`Y, YES, TRUE, 1, SENT, SMS SENT, SMS sent - Mother`).
  * `upsertUsageRow_()` – ensures canonical 8-column schema:

    ```
    MonthKey | Count | Threshold75 | Threshold90 | Threshold100 | OverageCount | OverageCost | LastUpdate
    ```
  * `checkSmsQuotaAndNotify()` – sweeps all schools, sends alerts at thresholds.
  * `getSmsUsageSummaryForSchool()` – string summary for AdminSms page.

### Lessons learned

* **Case sensitivity bug:** originally only matched `"sms sent"` exactly. Fixed by normalizing input and allowing `"SMS Sent - Mother"` etc.
* **Missing function:** `countSmsSentInRange_` was undefined; implemented to scan timestamp + “Sent to Parent” column.
* **Thresholds:** now consistently marked in sheet after alerts are sent.
* **Headers:** must be exact (first row): `MonthKey, Count, Threshold75, Threshold90, Threshold100, OverageCount, OverageCost, LastUpdate`.
* **Testing:** use `DRY_RUN=true` to validate without cost. Rows still marked “SMS Sent” in DRY-RUN so quota/backfill works.

---

## Auto-SMS: triggers & multi-tenant design

1. **Per-school form-submit triggers** → real-time SMS sending
2. **Optional queue trigger** (`autosmsdespatch_`) → catch-up batch processing
3. All flows honor `AUTO_SMS_ENABLED` + `DRY_RUN`
4. Trigger hygiene is critical: old projects with leftover triggers caused unwanted live sends

---

## Golden rules for navigation & safety

1. Always link with `ctx.scriptUrl` and include `school` param
2. Don’t redeclare `var` inside templates (hoist-safe defaults only)
3. Every HTML includes `<base target="_top">`
4. Encode query params properly
5. Use `Logger.log` for Apps Script logs (optional `doClientLog` beacon for client-side)

---

## Testing checklist

* `?page=adminsms&school=TEST` loads and shows quota summary
* Run backfill for a month with known SMS — should update usage sheet correctly
* Submit test incidents with `DRY_RUN=true` → expect `[DRY_RUN] Would send…` log and row marked `SMS Sent`
* Crossing 75/90/100% thresholds sends audit log entry + admin email

---

## Troubleshooting & lessons learned

* **If usage shows 0 when SMS were sent** → check `Sent to Parent` values; ensure matcher recognizes them.
* **If SMS fire with DRY_RUN=true** → check for triggers in old projects. Remove and re-run `installIncidentSubmitTriggersForAllSchools_()`.
* **If AdminSms page shows blank/NaN** → verify `SMS Usage` sheet headers are exactly 8-column schema.
* **School Key resolution:** always provided via config or `DEFAULT_SCHOOL_KEY` in Properties.

---

## Scalability & multi-tenant guidance

* Each school has its own primary spreadsheet
* Config tab `Schools` stores: Active flag, School Key, Data Sheet URL, etc.
* One central project holds all logic, with per-sheet triggers
* AdminSms consolidates usage across schools

---

## Roadmap

* AdminSms: add per-school graphs (Recharts)
* Add SMS quota settings to Config sheet (per-school overrides)
* Expand to email alerts + dashboards

---

## Glossary

* **AdminSms.html** – internal admin console for SMS usage/quota/backfill
* **DRY_RUN** – safe mode: no live SMS, but flows run
* **AUTO_SMS_ENABLED** – master toggle: disable all auto flows
* **Thresholds** – 75/90/100% usage alerts
* **Backfill** – retroactive calculation of usage from “Sent to Parent” column

---

## License

MIT (or institution-specific) — update as required.

```

---

✅ This version now fully documents **AdminSms**, the **SmsQuota system**, the fixes we made, and the lessons learned.  

Do you also want me to include a **“Quick operator guide”** at the bottom (step-by-step for an admin to check usage, backfill, and reset triggers)? That could make the README more practical for day-to-day use.
```
