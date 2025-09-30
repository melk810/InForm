/******************************
 * InForm – SMS Quota + Alerts
 * File: SmsQuota.gs  (with Form Responses scanner)
 *
 * Dependencies expected from ConfigReaders.gs (single source of truth):
 *   - readSchoolsMapFromConfig_()
 *   - isTruthyFlexible_(v)
 *   - openSchoolSpreadsheet_(rowOrCtxOrKey)  // should accept either the row, or the key
 *
 * Other project dependencies expected:
 *   - loadCtx_(params) → { selectedSchoolKey, school, scriptUrl, ... }
 *   - DRY_RUN (boolean), AUTO_SMS_ENABLED (boolean) globals
 *   - (Optional) sendSmsSa_(to, text, options) – your provider
 ******************************/

// ---------- Global constants (tweak as needed) ----------
var SMS_MONTHLY_QUOTA = 1000;     // “free” bundle per school per month
var SMS_COST_OVERAGE  = 0.50;     // cost per SMS beyond free bundle
var SMS_USAGE_SHEET   = 'SMS Usage';
var SMS_ALERTS_SHEET  = 'SMS Alerts';
var SA_TZ             = 'Africa/Johannesburg';

var TIMESTAMP_COLUMN  = 'Timestamp';          // date/time header

// Personalisation template default (overridable via config column "SmsTemplate" or ctx.school.smsTemplate)
var DEFAULT_SMS_TEMPLATE = '{{MESSAGE}} — {{SCHOOL_NAME}}';

/* Constants alias – makes both names work without redeclaring */
(function (g) {
  g.RESPONSES_SHEET_NAME = g.RESPONSES_SHEET_NAME || 'Form Responses 1';
  g.SMS_STATUS_COLUMN    = g.SMS_STATUS_COLUMN    || 'Sent to Parent';

  // Canonicalize the usage sheet name:
  var resolvedUsage = g.SMS_USAGE_SHEET || g.USAGE_SHEET_NAME || 'SMS Usage';
  g.SMS_USAGE_SHEET  = resolvedUsage;
  g.USAGE_SHEET_NAME = resolvedUsage;

  // Sent markers (only set if missing)
  g.SENT_VALUES = g.SENT_VALUES || ['Y', 'YES', 'TRUE', 'SENT', 'SMS SENT'];
})(this);

/** Returns YYYY-MM (month key), in Africa/Johannesburg by default. */
function getMonthKey_(dateOpt, tzOpt) {
  var tz = tzOpt || SA_TZ;
  var d  = dateOpt ? new Date(dateOpt) : new Date();
  return Utilities.formatDate(d, tz, 'yyyy-MM');
}

/** Ensure a sheet exists with headers (won’t reorder existing data). Returns Sheet. */
function getOrCreateSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  } else {
    var firstRow = sh.getRange(1,1,1,Math.max(headers.length, sh.getLastColumn())).getValues()[0];
    var changed = false;
    headers.forEach(function(h, i){
      if (!firstRow[i]) { firstRow[i] = h; changed = true; }
    });
    if (changed) sh.getRange(1,1,1,firstRow.length).setValues([firstRow]);
  }
  return sh;
}

/**
 * Returns [rowIndex, rowObj] for month, creating if missing.
 * Row schema:
 * MonthKey | Count | Threshold75 | Threshold90 | Threshold100 | OverageCount | OverageCost | LastUpdate
 */
function getOrInitUsageRow_(usageSheet, monthKey) {
  var hdr = usageSheet.getRange(1,1,1,usageSheet.getLastColumn()).getValues()[0];
  var col = {};
  hdr.forEach(function(h, i){ col[String(h)] = i+1; });

  function ensureCol(name) {
    if (!col[name]) {
      var lastCol = usageSheet.getLastColumn();
      usageSheet.getRange(1, lastCol+1).setValue(name);
      col[name] = lastCol + 1;
    }
  }

  ['MonthKey','Count','Threshold75','Threshold90','Threshold100','OverageCount','OverageCost','LastUpdate']
    .forEach(function(h){ ensureCol(h); });

  var lastRow = usageSheet.getLastRow();
  if (lastRow < 2) {
    usageSheet.appendRow([monthKey, 0, false, false, false, 0, 0, new Date()]);
    return [2, {
      MonthKey: monthKey, Count: 0,
      Threshold75: false, Threshold90: false, Threshold100: false,
      OverageCount: 0, OverageCost: 0, LastUpdate: new Date()
    }];
  }

  var data = usageSheet.getRange(2,1,lastRow-1, usageSheet.getLastColumn()).getValues();
  for (var i=0;i<data.length;i++){
    var row = data[i];
    var key = row[col['MonthKey']-1];
    if (key === monthKey) {
      return [i+2, {
        MonthKey: key,
        Count: Number(row[col['Count']-1] || 0),
        Threshold75: Boolean(row[col['Threshold75']-1]),
        Threshold90: Boolean(row[col['Threshold90']-1]),
        Threshold100: Boolean(row[col['Threshold100']-1]),
        OverageCount: Number(row[col['OverageCount']-1] || 0),
        OverageCost: Number(row[col['OverageCost']-1] || 0),
        LastUpdate: row[col['LastUpdate']-1] || ''
      } ];
    }
  }

  usageSheet.appendRow([monthKey, 0, false, false, false, 0, 0, new Date()]);
  var newRow = usageSheet.getLastRow();
  return [newRow, {
    MonthKey: monthKey, Count: 0,
    Threshold75: false, Threshold90: false, Threshold100: false,
    OverageCount: 0, OverageCost: 0, LastUpdate: new Date()
  }];
}

/* =======================
 * RESPONSES SCANNER
 * ======================= */

function isSmsSentCell_(v) {
  if (v == null) return false;

  // Normalize: lowercase, trim, collapse spaces, strip trailing punctuation
  var s = String(v)
    .toLowerCase()
    .trim()
    .replace(/[.\u00A0]/g, ' ')         // turn periods & NBSP into space
    .replace(/\s+/g, ' ');              // collapse spaces

  if (!s) return false;

  // Accept common truthy tokens
  if (s === '1' || s === 'true' || s === 'y' || s === 'yes') return true;

  // Base accepted phrases
  var accepted = ['sent', 'sms sent', 'sms-sent', 'sms_sent'];

  // Also respect any globals provided (e.g., ['Y','YES','TRUE','SENT','SMS SENT'])
  var extra = (typeof SENT_VALUES !== 'undefined' && Array.isArray(SENT_VALUES))
    ? SENT_VALUES.map(function(x){
        return String(x).toLowerCase().trim().replace(/\s+/g, ' ');
      })
    : [];

  // If exact match to any accepted/extra token → true
  if (accepted.indexOf(s) !== -1 || extra.indexOf(s) !== -1) return true;

  // Fuzzy: starts with 'sms sent' or 'sent' (handles 'sms sent - 2025-07-14', etc.)
  if (s.indexOf('sms sent') === 0 || s.indexOf('sent') === 0) return true;

  // Final fallback: a clean word-boundary match for whole word "sent"
  if (/\bsent\b/.test(s)) return true;

  return false;
}

function getHeaderMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1,1,1,lastCol).getValues()[0] || [];
  var map = {};
  headers.forEach(function(h, i){
    var key = String(h || '').trim();
    if (key) map[key] = i+1;
  });
  return map;
}

/**
 * Count SMS "sent" rows for a given monthKey by scanning the school's Form Responses sheet.
 * - A row counts if:
 *   (1) TIMESTAMP's yyyy-MM equals monthKey, and
 *   (2) SMS_STATUS_COLUMN cell isSmsSentCell_(…)
 */
function countSmsFromResponses_(ss, monthKey) {
  var sh = ss.getSheetByName(RESPONSES_SHEET_NAME);
  if (!sh) return 0;

  var hdr = getHeaderMap_(sh);
  var tsCol = hdr[TIMESTAMP_COLUMN];
  var stCol = hdr[SMS_STATUS_COLUMN];
  if (!tsCol || !stCol) return 0;

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  var rng = sh.getRange(2, 1, lastRow-1, Math.max(tsCol, stCol));
  var values = rng.getValues();
  var tz = SA_TZ;

  var count = 0;
  for (var i=0;i<values.length;i++){
    var row = values[i];
    var ts = row[tsCol-1];
    var status = row[stCol-1];

    var d = ts instanceof Date ? ts : (ts ? new Date(ts) : null);
    if (!d || isNaN(d.getTime())) continue;

    var mk = Utilities.formatDate(d, tz, 'yyyy-MM');
    if (mk !== monthKey) continue;

    if (isSmsSentCell_(status)) count++;
  }

  return count;
}

/** Initialize/refresh current month’s usage row from Form Responses if Count==0. */
function ensureUsageInitFromResponses_(ss, usageSheet, monthKey) {
  var pair = getOrInitUsageRow_(usageSheet, monthKey);
  var rowIndex = pair[0], rowObj = pair[1];

  if (rowObj.Count > 0) return rowObj;

  var counted = countSmsFromResponses_(ss, monthKey);
  if (counted <= 0) return rowObj;

  rowObj.Count = counted;
  rowObj.OverageCount = Math.max(0, rowObj.Count - SMS_MONTHLY_QUOTA);
  rowObj.OverageCost  = rowObj.OverageCount * SMS_COST_OVERAGE;
  rowObj.LastUpdate   = new Date();

  var hdr = usageSheet.getRange(1,1,1,usageSheet.getLastColumn()).getValues()[0];
  var col = {}; hdr.forEach(function(h,i){ col[h] = i+1; });

  usageSheet.getRange(rowIndex, col['Count']).setValue(rowObj.Count);
  usageSheet.getRange(rowIndex, col['OverageCount']).setValue(rowObj.OverageCount);
  usageSheet.getRange(rowIndex, col['OverageCost']).setValue(rowObj.OverageCost);
  usageSheet.getRange(rowIndex, col['LastUpdate']).setValue(rowObj.LastUpdate);

  return rowObj;
}

/* =======================
 * NEW: RANGE COUNTER used by backfill + summary
 * ======================= */

/** NEW: helper – inclusive start, exclusive end. */
function isDateInRange_(d, start, end) { // NEW
  return d && d >= start && d < end;
}

/**
 * NEW: Count SMS "sent" in an arbitrary [start, end) window using a provided
 * responses sheet and its header map. This is what callers expected.
 *
 * @param {Sheet} responses
 * @param {Object} headers header->1based index map
 * @param {Date} start inclusive
 * @param {Date} end exclusive
 * @return {number}
 */
function countSmsSentInRange_(responses, headers, start, end) { // NEW
  if (!responses) return 0;
  headers = headers || readHeaderMap_(responses);

  var tsCol = headers[TIMESTAMP_COLUMN];
  var stCol = headers[SMS_STATUS_COLUMN];
  if (!tsCol || !stCol) return 0;

  var lastRow = responses.getLastRow();
  if (lastRow < 2) return 0;

  var width = Math.max(tsCol, stCol);
  var values = responses.getRange(2, 1, lastRow - 1, width).getValues();

  var count = 0;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var ts  = row[tsCol - 1];
    var st  = row[stCol - 1];

    var d = (ts instanceof Date) ? ts : (ts ? new Date(ts) : null);
    if (!d || isNaN(d.getTime())) continue;

    if (!isDateInRange_(d, start, end)) continue;
    if (isSmsSentCell_(st)) count++;
  }
  return count;
}

/* =======================
 * CORE QUOTA LOGIC
 * ======================= */

/** Increments usage for the current month by n (default 1). Returns updated rowObj. */
function incrementSmsUsageForSchool_(ctx, nOpt) {
  var n = nOpt || 1;
  var ss = openSchoolSpreadsheet_(ctx); // ConfigReaders should accept row/ctx/key
  var usage = getOrCreateSheet_(ss, SMS_USAGE_SHEET, [
    'MonthKey','Count','Threshold75','Threshold90','Threshold100','OverageCount','OverageCost','LastUpdate'
  ]);
  var monthKey = getMonthKey_();
  var pair = getOrInitUsageRow_(usage, monthKey);
  var rowIndex = pair[0], rowObj = pair[1];

  rowObj.Count += n;
  var overage = Math.max(0, rowObj.Count - SMS_MONTHLY_QUOTA);
  rowObj.OverageCount = overage;
  rowObj.OverageCost  = overage * SMS_COST_OVERAGE;
  rowObj.LastUpdate   = new Date();

  var hdr = usage.getRange(1,1,1,usage.getLastColumn()).getValues()[0];
  var col = {}; hdr.forEach(function(h,i){ col[h] = i+1; });
  function set(name, val){ usage.getRange(rowIndex, col[name]).setValue(val); }

  set('Count', rowObj.Count);
  set('OverageCount', rowObj.OverageCount);
  set('OverageCost', rowObj.OverageCost);
  set('LastUpdate', rowObj.LastUpdate);

  return rowObj;
}

/** School SMS template */
function getSchoolSmsTemplate_(ctx) {
  var norm = normalizeSchoolConfig_((ctx && ctx.school) || {});
  var t = norm.smsTemplate || DEFAULT_SMS_TEMPLATE;
  return (typeof t === 'string' && t.trim()) ? t : DEFAULT_SMS_TEMPLATE;
}

function formatPersonalisedSms_(ctx, message) {
  var norm = normalizeSchoolConfig_((ctx && ctx.school) || {});
  var schoolName = norm.name || 'Your school';
  var key        = (ctx && (ctx.selectedSchoolKey || (ctx.school && (ctx.school['School Key'] || ctx.school.schoolKey || ctx.school.key)))) || norm.schoolKey || '';
  var tpl        = getSchoolSmsTemplate_(ctx);
  return tpl
    .replace('{{MESSAGE}}', String(message))
    .replace('{{SCHOOL_NAME}}', String(schoolName))
    .replace('{{SCHOOL_KEY}}', String(key));
}

/** Sender wrapper */
function sendSchoolSMS_(ctx, msisdn, message, options) {
  var finalMsg = formatPersonalisedSms_(ctx, message);
  var state = incrementSmsUsageForSchool_(ctx, 1);

  if (typeof DRY_RUN !== 'undefined' && DRY_RUN) {
    Logger.log('[DRY_RUN] Would send SMS to %s: "%s"', msisdn, finalMsg);
    return { ok: true, dryRun: true, message: finalMsg, usage: state };
  }

  if (typeof sendSmsSa_ === 'function') {
    var res = sendSmsSa_(msisdn, finalMsg, options || {});
    return { ok: true, dryRun: false, providerResponse: res, message: finalMsg, usage: state };
  }

  Logger.log('[WARN] sendSmsSa_ not found. SMS not actually sent. Intended to %s: "%s"', msisdn, finalMsg);
  return { ok: false, dryRun: false, message: finalMsg, usage: state, error: 'sendSmsSa_ not found' };
}

/** Compute threshold statuses given count and last row flags. */
function computeThresholds_(count, rowObj) {
  var pct = (count / SMS_MONTHLY_QUOTA) * 100;
  return {
    hit75: (pct >= 75) && !rowObj.Threshold75,
    hit90: (pct >= 90) && !rowObj.Threshold90,
    hit100: (pct >= 100) && !rowObj.Threshold100,
    pct: pct
  };
}

/** Writes threshold flags after alerting. */
function markThresholdNotified_(usageSheet, rowIndex, flags) {
  var hdr = usageSheet.getRange(1,1,1,usageSheet.getLastColumn()).getValues()[0];
  var col = {}; hdr.forEach(function(h,i){ col[h]=i+1; });
  if (flags.hit75)  usageSheet.getRange(rowIndex, col['Threshold75']).setValue(true);
  if (flags.hit90)  usageSheet.getRange(rowIndex, col['Threshold90']).setValue(true);
  if (flags.hit100) usageSheet.getRange(rowIndex, col['Threshold100']).setValue(true);
}

/** Append a row into "SMS Alerts" for audit trail. */
function logAlert_(ss, schoolKey, schoolName, monthKey, level, count, pct, overageCount, overageCost) {
  var sh = getOrCreateSheet_(ss, SMS_ALERTS_SHEET, [
    'Timestamp','SchoolKey','SchoolName','MonthKey','Level','Count','Pct','OverageCount','OverageCost'
  ]);
  sh.appendRow([new Date(), schoolKey, schoolName, monthKey, level, count, pct, overageCount, overageCost]);
}

/** Send alert to the admin email (from school config). */
function notifyAdmin_(ctx, level, usageState, pct) {
  var norm = normalizeSchoolConfig_((ctx && ctx.school) || {});
  var schoolName = norm.name || (ctx && ctx.selectedSchoolKey) || 'School';
  var adminEmail = norm.adminEmail || Session.getActiveUser().getEmail();
  var monthKey   = usageState.MonthKey;

  var subject = Utilities.formatString('[InForm] %s – SMS usage %s alert (%s)', schoolName, level, monthKey);
  var body    = [
    'Hi,',
    '',
    Utilities.formatString('School: %s (%s)', schoolName, norm.schoolKey || (ctx && ctx.selectedSchoolKey) || ''),
    Utilities.formatString('Month: %s', monthKey),
    Utilities.formatString('Usage: %s of %s (%.1f%%)', usageState.Count, SMS_MONTHLY_QUOTA, pct),
    Utilities.formatString('Overage: %s @ R%.2f each → R%.2f', usageState.OverageCount, SMS_COST_OVERAGE, usageState.OverageCost),
    '',
    'This is an automated notice from InForm.',
    ''
  ].join('\n');

  try {
    MailApp.sendEmail(adminEmail, subject, body);
  } catch (e) {
    Logger.log('[SMS Quota] Could not send email to %s: %s', adminEmail, e && e.message);
  }
}

/** Sweep all active schools → check usage for this month → alert at 75%, 90%, 100%. */
function checkSmsQuotaAndNotify() {
  var schoolsMap = readSchoolsMapFromConfig_(); // from ConfigReaders.gs
  var monthKey   = getMonthKey_();

  var pairs;
  if (schoolsMap && typeof schoolsMap.forEach === 'function' && (schoolsMap instanceof Map)) {
    pairs = Array.from(schoolsMap.entries());
  } else if (Array.isArray(schoolsMap)) {
    pairs = schoolsMap.map(function(cfg) {
      var k = cfg['School Key'] || cfg.schoolKey || cfg.key || cfg.Code || 'UNKNOWN';
      return [k, cfg];
    });
  } else if (schoolsMap && typeof schoolsMap === 'object') {
    pairs = Object.keys(schoolsMap).map(function(k){ return [k, schoolsMap[k]]; });
  } else {
    Logger.log('[SMS Quota] Unexpected schoolsMap type: ' + (typeof schoolsMap));
    return;
  }

  pairs.forEach(function(entry){
    var schoolKey    = entry[0];
    var schoolConfig = entry[1];

    var norm = normalizeSchoolConfig_(schoolConfig);
    if (!norm.active) return;

    var ss;
    try {
      ss = openSchoolSpreadsheet_(schoolConfig); // pass the row directly
    } catch (e) {
      Logger.log('[SMS Quota] Skip %s – cannot open spreadsheet: %s', schoolKey, e && e.message);
      return;
    }

    var usageSheet = getOrCreateSheet_(ss, SMS_USAGE_SHEET, [
      'MonthKey','Count','Threshold75','Threshold90','Threshold100','OverageCount','OverageCost','LastUpdate'
    ]);
    ensureUsageInitFromResponses_(ss, usageSheet, monthKey);

    var pair = getOrInitUsageRow_(usageSheet, monthKey);
    var rowIndex = pair[0], rowObj = pair[1];

    var th = computeThresholds_(rowObj.Count, rowObj);
    if (!(th.hit75 || th.hit90 || th.hit100)) return;

    var schoolName = norm.name || schoolKey;
    if (th.hit75) {
      logAlert_(ss, schoolKey, schoolName, monthKey, '75%', rowObj.Count, th.pct, rowObj.OverageCount, rowObj.OverageCost);
      notifyAdmin_({ selectedSchoolKey: schoolKey, school: schoolConfig }, '75%', rowObj, th.pct);
    }
    if (th.hit90) {
      logAlert_(ss, schoolKey, schoolName, monthKey, '90%', rowObj.Count, th.pct, rowObj.OverageCount, rowObj.OverageCost);
      notifyAdmin_({ selectedSchoolKey: schoolKey, school: schoolConfig }, '90%', rowObj, th.pct);
    }
    if (th.hit100) {
      logAlert_(ss, schoolKey, schoolName, monthKey, '100%', rowObj.Count, th.pct, rowObj.OverageCount, rowObj.OverageCost);
      notifyAdmin_({ selectedSchoolKey: schoolKey, school: schoolConfig }, '100%', rowObj, th.pct);
    }
    markThresholdNotified_(usageSheet, rowIndex, th);
  });
}

/* =======================
 * BACKFILL + SUMMARY (UI)
 * ======================= */

/**
 * Public: Backfill for one month. ym = 'YYYY-MM'. If omitted, uses current month.
 * RETURNS: number (count for that month) ← important so other helpers can use it.
 */
function backfillSmsUsageForSchool(schoolKey, ym) {
  var pkg = openSchoolSheets_(schoolKey);
  var ss        = pkg.ss;
  var responses = pkg.responses;
  var headers   = pkg.headers;

  if (!ym) {
    ym = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  }
  var monthDates = monthToDateRange_(ym);
  var count = countSmsSentInRange_(responses, headers, monthDates.start, monthDates.end);

  var usageSheet = ensureUsageSheet_(ss); // now aligned to 8-column schema
  upsertUsageRow_(usageSheet, schoolKey, ym, count);

  return count; // ← return NUMBER (not a string)
}

/**
 * Public: Backfill for a range inclusive, e.g. 2025-06 → 2025-09.
 * Returns a human string.
 */
function backfillSmsUsageRangeForSchool(schoolKey, fromYm, toYm) {
  if (!fromYm && !toYm) throw new Error('Provide at least fromYm or toYm in YYYY-MM');
  if (!fromYm) fromYm = toYm;
  if (!toYm) toYm = fromYm;

  var months = expandYmRange_(fromYm, toYm);
  var pkg = openSchoolSheets_(schoolKey);
  var ss        = pkg.ss;
  var responses = pkg.responses;
  var headers   = pkg.headers;

  var usageSheet = ensureUsageSheet_(ss);

  var total = 0;
  months.forEach(function(ym){
    var r = monthToDateRange_(ym);
    var count = countSmsSentInRange_(responses, headers, r.start, r.end);
    upsertUsageRow_(usageSheet, schoolKey, ym, count);
    total += count;
  });

  return '[Backfill Range] ' + schoolKey + ' @ ' + fromYm + '..' + toYm + ' → ' + total +
         ' total SMS across ' + months.length + ' month(s). Saved in "' + USAGE_SHEET_NAME + '".';
}

/**
 * Internal (renamed): returns a JSON summary object (kept for programmatic use).
 * We renamed this from the earlier duplicate public name to avoid collisions.
 */
function getSmsUsageSummaryForSchoolObj_(schoolKey) {
  var now = new Date();
  var ym = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  var pkg = openSchoolSheets_(schoolKey);
  var ss  = pkg.ss;

  var usage = ensureUsageSheet_(ss);
  upsertUsageRow_(usage, schoolKey, ym,
    countSmsSentInRange_(pkg.responses, pkg.headers, monthToDateRange_(ym).start, monthToDateRange_(ym).end));

  var pair = getOrInitUsageRow_(usage, ym);
  var rowObj = pair[1];

  var remaining = Math.max(0, SMS_MONTHLY_QUOTA - rowObj.Count);
  var pct = (rowObj.Count / SMS_MONTHLY_QUOTA) * 100;

  return {
    schoolKey: schoolKey,
    monthKey: ym,
    count: rowObj.Count,
    remaining: remaining,
    pct: Math.round(pct*10)/10,
    quota: SMS_MONTHLY_QUOTA,
    overageCount: rowObj.OverageCount,
    overageCost: rowObj.OverageCost,
    lastUpdate: rowObj.LastUpdate
  };
}

/**
 * Public: Quick human-readable summary for current month (used by AdminSms).
 * Returns a string message (so your UI shows it nicely).
 */
function getSmsUsageSummaryForSchool(schoolKey) {
  var s = getSmsUsageSummaryForSchoolObj_(schoolKey);
  return '[Summary] ' + s.schoolKey + ' @ ' + s.monthKey + ' → ' + s.count +
         ' SMS (quota ' + s.quota + ', ' + s.pct + '% used, ' +
         'overage ' + s.overageCount + ' @ R' + SMS_COST_OVERAGE.toFixed(2) +
         ' = R' + (s.overageCost || 0) + ').';
}

/* =======================
 * UTIL – CONFIG & SHEETS
 * ======================= */

/**
 * Resolve the school workbook and sheets from the Schools config.
 * Requires either "Data Sheet URL" or "ssId" in the Schools sheet for that key.
 */
function openSchoolSheets_(schoolKey) {
  if (typeof readSchoolsMapFromConfig_ !== 'function') throw new Error('readSchoolsMapFromConfig_ missing');

  var schools = readSchoolsMapFromConfig_();  // Map | Object | Array

  // Fallback for testing if no key provided
  if (!schoolKey) {
    var propDefault = PropertiesService.getScriptProperties().getProperty('DEFAULT_SCHOOL_KEY');
    if (propDefault) schoolKey = String(propDefault).trim();
  }
  if (!schoolKey) throw new Error('Provide a school key, e.g. backfillSmsUsageForSchool("DOORN1")');

  var s = _getSchoolFromConfig_(schools, schoolKey);
  if (!s) throw new Error('School "' + schoolKey + '" not found in Schools config.');

  if (!_isActiveSchool_(s)) {
    Logger.log('[SMS Quota] Warning: school "%s" is not marked Active; continuing anyway.', schoolKey);
  }

  // Prefer ssId, else Data Sheet URL
  var byUrl = String(s['Data Sheet URL'] || '').trim();
  var byId  = String(s['ssId'] || s['Spreadsheet Id'] || '').trim();

  var ss = null;
  if (byId) {
    ss = SpreadsheetApp.openById(byId);
  } else if (byUrl) {
    ss = SpreadsheetApp.openByUrl(byUrl);
  } else {
    throw new Error('[SMS Quota] Could not locate school spreadsheet (need "Data Sheet URL" or "ssId" in Schools config for ' + schoolKey + ').');
  }

  var responses = ss.getSheetByName(RESPONSES_SHEET_NAME);
  if (!responses) throw new Error('Sheet "' + RESPONSES_SHEET_NAME + '" not found in ' + ss.getName());

  var headers = readHeaderMap_(responses);
  return { ss: ss, responses: responses, headers: headers };
}

/** Create or return the SMS Usage sheet with the 8-column header (canonical). */
function ensureUsageSheet_(ss) {
  var HEADERS = ['MonthKey','Count','Threshold75','Threshold90','Threshold100','OverageCount','OverageCost','LastUpdate'];
  var sh = ss.getSheetByName(USAGE_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(USAGE_SHEET_NAME);
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  } else {
    var h = sh.getRange(1,1,1,HEADERS.length).getValues()[0];
    var need = false;
    for (var i=0;i<HEADERS.length;i++){
      if (String(h[i]||'') !== HEADERS[i]) { need = true; break; }
    }
    if (need) sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

/** Build a header->index map (1-based). */
function readHeaderMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1,1,1,lastCol).getValues()[0];
  var map = {};
  headers.forEach(function(h, i) { map[String(h).trim()] = i+1; });
  return map;
}

/** Convert 'YYYY-MM' → start (1st 00:00) and end (1st of next month 00:00) in script timezone. */
function monthToDateRange_(ym) {
  var m = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('Invalid month format "' + ym + '". Use YYYY-MM');
  var parts = m.split('-');
  var y = Number(parts[0]), mm = Number(parts[1]);
  var start = new Date(y, mm-1, 1, 0, 0, 0);
  var end   = new Date(y, mm,   1, 0, 0, 0);
  return { start: start, end: end };
}

/** Expand inclusive range: 2025-06..2025-09 → ['2025-06','2025-07','2025-08','2025-09'] */
function expandYmRange_(fromYm, toYm) {
  var a = monthToDateRange_(fromYm).start;
  var b = monthToDateRange_(toYm).start;
  if (a > b) throw new Error('fromYm must be <= toYm');
  var out = [];
  var cur = new Date(a.getTime());
  while (cur <= b) {
    out.push(Utilities.formatDate(cur, Session.getScriptTimeZone(), 'yyyy-MM'));
    cur.setMonth(cur.getMonth()+1);
  }
  return out;
}

/* =======================
 * TEST / ADMIN HELPERS (optional)
 * ======================= */

function test_quota_checkNow() { checkSmsQuotaAndNotify(); }

function sendSmsSa_(msisdn, text, options) {
  if (typeof sendSmsViaSmsSouthAfrica === 'function') {
    return sendSmsViaSmsSouthAfrica(msisdn, text);
  }
  throw new Error('sendSmsViaSmsSouthAfrica not found');
}

/* =======================
 * CONFIG NORMALISERS
 * ======================= */

function normalizeSchoolConfig_(schoolConfig) {
  var sc = schoolConfig || {};

  var sheetUrl =
      sc['Data Sheet URL'] || sc.dataSheetUrl || sc.sheetUrl || '';
  var spreadsheetId =
      sc.ssId || sc['ssId'] || sc.spreadsheetId || '';

  var schoolName =
      sc['School Name'] || sc.schoolName || sc.name || sc.displayName || '';

  var schoolKey =
      sc['School Key'] || sc.schoolKey || sc.key || '';

  var template =
      sc.SmsTemplate || sc['SmsTemplate'] || sc.smsTemplate || '';

  var adminEmail =
      sc.adminEmail || sc['adminEmail'] || sc.AdminEmail || sc['Admin Email'] || '';

  var activeVal = (sc.Active != null ? sc.Active : (sc.active != null ? sc.active : sc['Active']));
  var isActive  = isTruthyFlexible_(activeVal);

  return {
    schoolKey: schoolKey,
    name: schoolName,
    sheetUrl: sheetUrl,
    spreadsheetId: spreadsheetId,
    smsTemplate: template,
    adminEmail: adminEmail,
    active: isActive,
    _raw: sc
  };
}

function getDefaultSchoolKey_() {
  try {
    var p = PropertiesService.getScriptProperties();
    var k = p && p.getProperty('DEFAULT_SCHOOL_KEY');
    return (k && k.trim()) || null;
  } catch (e) {
    return null;
  }
}

/** Return the school record for a key from whatever readSchoolsMapFromConfig_ returns. */
function _getSchoolFromConfig_(schoolsAny, key) {
  if (!schoolsAny) return null;

  if (typeof schoolsAny.get === 'function') {
    return schoolsAny.get(key) || null; // Map
  }

  if (Object.prototype.toString.call(schoolsAny) === '[object Object]') {
    if (schoolsAny[key]) return schoolsAny[key];
    var lower = key.toLowerCase();
    if (schoolsAny[lower]) return schoolsAny[lower];
    return null;
  }

  if (Array.isArray(schoolsAny)) {
    for (var i = 0; i < schoolsAny.length; i++) {
      var row = schoolsAny[i] || {};
      var k = (row['School Key'] || row['schoolKey'] || row['Key'] || '').toString().trim();
      if (k === key) return row;
    }
    return null;
  }

  return null;
}

/** Coerce a truthy Active flag from various styles: Y/YES/TRUE/1 */
function _isActiveSchool_(row) {
  var raw = (row && row['Active'] != null ? String(row['Active']) : '').trim().toUpperCase();
  return raw === 'Y' || raw === 'YES' || raw === 'TRUE' || raw === '1';
}

/* =======================
 * ORDERED WRITERS (canonical 8-col schema)
 * ======================= */

/**
 * Insert or update the YYYY-MM row in "SMS Usage" (per-school sheet).
 * Columns (exact order):
 * MonthKey | Count | Threshold75 | Threshold90 | Threshold100 | OverageCount | OverageCost | LastUpdate
 */
function upsertUsageRow_(sh, schoolKey, ym, count, extras) {
  var HEADERS = ['MonthKey','Count','Threshold75','Threshold90','Threshold100','OverageCount','OverageCost','LastUpdate'];
  ensureSmsUsageHeaders_(sh, HEADERS);

  // Find row by MonthKey (col A)
  var last = sh.getLastRow();
  var data = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  var rowIdx = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(ym)) {
      rowIdx = i + 2;
      break;
    }
  }

  extras = extras || {};
  var payload = {
    MonthKey: ym,
    Count: Number(count) || 0,
    Threshold75: (extras.Threshold75 != null ? extras.Threshold75 : ''),
    Threshold90: (extras.Threshold90 != null ? extras.Threshold90 : ''),
    Threshold100: (extras.Threshold100 != null ? extras.Threshold100 : ''),
    OverageCount: (extras.OverageCount != null ? extras.OverageCount : 0),
    OverageCost: (extras.OverageCost != null ? extras.OverageCost : 0),
    LastUpdate: null
  };

  if (rowIdx > -1) {
    saveSmsUsageRowOrdered_(sh, rowIdx, payload, HEADERS);
  } else {
    rowIdx = last + 1;
    saveSmsUsageRowOrdered_(sh, rowIdx, payload, HEADERS);
  }
}

/** Write a row in the exact header order (HEADERS optional; will default to canonical). */
function saveSmsUsageRowOrdered_(sheet, rowIndex, data, HEADERS_OPT) {
  var HEADERS = HEADERS_OPT || ['MonthKey','Count','Threshold75','Threshold90','Threshold100','OverageCount','OverageCost','LastUpdate'];
  if (!data.LastUpdate) {
    data.LastUpdate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  var rowValues = HEADERS.map(function(h){
    return (data[h] === undefined || data[h] === null) ? '' : data[h];
  });
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowValues]);
}

function ensureSmsUsageHeaders_(sheet, HEADERS) {
  var need = false;
  var firstRow = sheet.getRange(1,1,1,HEADERS.length).getValues()[0];
  for (var i=0;i<HEADERS.length;i++){
    if (String(firstRow[i]||'') !== HEADERS[i]) { need = true; break; }
  }
  if (need) {
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  }
}

/* =======================
 * SHIMS FOR ADMIN PAGE
 * ======================= */

/**
 * Backfill ONE month for AdminSms. Uses the numeric return contract.
 * Returns { total, months: 1 }.
 */
function backfillSmsUsageForMonthForSchool_(schoolKey, ym) {
  if (!schoolKey) throw new Error('schoolKey required');
  if (!/^\d{4}-\d{2}$/.test(ym || '')) throw new Error('ym must be YYYY-MM');

  var total = backfillSmsUsageForSchool(schoolKey, ym) || 0; // returns number now
  // Ensure sheet exists & row is updated (already done in the call above)
  return { total: total, months: 1 };
}

/**
 * Return the "SMS Usage" sheet for a given school (ensure/create headers).
 */
function getSmsUsageSheetForSchool_(schoolKey) {
  if (!schoolKey) throw new Error('schoolKey required');
  var ss = openSchoolSheets_(schoolKey).ss; // reuse resolver
  return ensureUsageSheet_(ss);
}
