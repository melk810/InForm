/** AutoSmsSa.gs — Queue + dispatcher that reuses your existing SMS South Africa setup.
 *  - No UI changes. No button/link changes.
 *  - One project-wide time trigger scans the Outbox and sends per school.
 */

// Flip this ON to use queue + dispatcher. OFF = your current immediate-send.
var AUTO_SMS_USE_QUEUE = true;
// === Settings (reuse what you already have) ===
var AUTOSMS_OUTBOX_NAME = 'Outbox';
var AUTOSMS_MAX_PER_RUN = 100;        // throttle
var AUTOSMS_EVERY_MIN   = 1;          // trigger cadence

// === Public: create/refresh the time-driven trigger (run once) ===
function ensureAutoSmsTrigger() {
  (ScriptApp.getProjectTriggers() || []).forEach(function(tr){
    if (tr.getHandlerFunction && tr.getHandlerFunction() === 'autoSmsDispatchSa_') {
      ScriptApp.deleteTrigger(tr);
    }
  });
  ScriptApp.newTrigger('autoSmsDispatchSa_').timeBased().everyMinutes(AUTOSMS_EVERY_MIN).create();
  Logger.log('[AutoSMS] Dispatcher set to every %s minute(s).', AUTOSMS_EVERY_MIN);
}

// === Public: queue an SMS ===
// Call this from your existing incident flow.
function queueSmsSa_(schoolKey, to, body, meta) {
  var sheet = ensureOutboxSheetSa_();
  sheet.appendRow([
    new Date(),                 // A timestamp
    String(schoolKey || ''),    // B schoolKey
    String(normalizePhoneZa_(to || '')), // C to (reuse your normaliser if present)
    String(body || ''),         // D body
    'QUEUED',                   // E status
    '',                         // F providerMessageId / info
    JSON.stringify(meta || {})  // G meta JSON (optional)
  ]);
  return true;
}

/***** ==================== MINIMAL DISPATCH SANDBOX ====================== *****
 * Purpose: Test the Outbox queue + guards without contacting any provider.
 * Keeps function name `autoSmsDispatchSa_()` so your existing cron trigger works.
 * Safe to keep alongside your “real” sender; it never runs the provider while
 * TEST_MINIMAL_QUEUE = true or DRY_RUN = true.
 *****************************************************************************/

// === Entry point for your time-based trigger
function autoSmsDispatchSa_() {
  // 0) Guards first
  if (!AUTO_SMS_ENABLED) {
    Logger.log('[AutoSMS] Disabled (AUTO_SMS_ENABLED=false). Exit.');
    return;
  }

  var sheet = ensureOutboxSheetSa_();
  var rows  = readOutboxRowsSa_(sheet);

  // 1) Find queued rows
  var pending = rows.filter(function(r){ return r.status === 'QUEUED'; });
  if (!pending.length) {
    Logger.log('[AutoSMS] No queued rows. Exit.');
    return;
  }

  // 2) Respect cap
  if (pending.length > AUTOSMS_MAX_PER_RUN) pending = pending.slice(0, AUTOSMS_MAX_PER_RUN);

  // 3) Optionally enforce active-school guard (skip rows whose schools aren’t active)
  if (REQUIRE_ACTIVE_SCHOOLS) {
    var active = getActiveSchoolSet_(); // returns Set of active keys
    pending = pending.filter(function(r){
      var ok = r.schoolKey && active.has(r.schoolKey);
      if (!ok) {
        markOutboxRowSa_(sheet, r._rowIndex, 'ERROR', 'Inactive or missing schoolKey');
      }
      return ok;
    });
  }

  if (!pending.length) {
    Logger.log('[AutoSMS] Nothing to do after active-school filter. Exit.');
    return;
  }

  // 4) Group by school (kept for future scalability, even in minimal mode)
  var bySchool = {};
  pending.forEach(function(r){ (bySchool[r.schoolKey] || (bySchool[r.schoolKey] = [])).push(r); });

  // 5) Process each batch
  Object.keys(bySchool).forEach(function(schoolKey){
    var batch = bySchool[schoolKey];

    // In minimal mode, we never call the provider.
    if (TEST_MINIMAL_QUEUE) {
      batch.forEach(function(r){
        var info = DRY_RUN ? 'DRY_RUN_MIN' : 'MIN_OK';
        markOutboxRowSa_(sheet, r._rowIndex, 'SENT', info);
      });
      Logger.log('[AutoSMS][MIN] school=%s processed=%s', schoolKey, String(batch.length));
      return;
    }

    // If you flip TEST_MINIMAL_QUEUE to false later, we fall back to your current sender.
    // 1) Load per-school provider config (if you already have it)
    var cfg = safeGetSmsConfigForSchool_(schoolKey);
    if (!cfg || !cfg.sendUrl) {
      batch.forEach(function(r){ markOutboxRowSa_(sheet, r._rowIndex, 'ERROR', 'No SMS config for ' + schoolKey); });
      return;
    }

    // 2) Send each (still respects DRY_RUN)
    batch.forEach(function(r){
      try {
        var res = sendSmsSa_(cfg, r.to, r.body);
        var id  = res && res.messageId ? String(res.messageId) : (DRY_RUN ? 'DRY_RUN' : 'OK');
        markOutboxRowSa_(sheet, r._rowIndex, 'SENT', id);
      } catch (err) {
        markOutboxRowSa_(sheet, r._rowIndex, 'ERROR', String(err && err.message || err));
      }
    });
    Logger.log('[AutoSMS][LIVE] school=%s processed=%s', schoolKey, String(batch.length));
  });
}

// === Optional: resolve set of active school keys from CONFIG.Schools
function getActiveSchoolSet_() {
  var set = new Set();
  try {
    var ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    var sh = ss.getSheetByName('Schools');
    if (!sh) return set;
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return set;

    var H = values[0].map(function(h){ return String(h || '').trim().toLowerCase(); });
    var iActive = H.indexOf('active');
    var iKey    = H.indexOf('school key');

    for (var r=1; r<values.length; r++) {
      var row = values[r];
      var active = String(row[iActive] || '').trim().toUpperCase() === 'Y';
      var key    = String(row[iKey] || '').trim();
      if (active && key) set.add(key);
    }
  } catch (e) {
    Logger.log('[AutoSMS] getActiveSchoolSet_ error: ' + e.message);
  }
  return set;
}

// === Keep these helpers (minimal & provider-agnostic) ===
function ensureOutboxSheetSa_() {
  var ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
  var sh = ss.getSheetByName(AUTOSMS_OUTBOX_NAME);
  if (!sh) {
    sh = ss.insertSheet(AUTOSMS_OUTBOX_NAME);
    sh.appendRow(['timestamp','schoolKey','to','body','status','providerMessageId','metaJson']);
  }
  return sh;
}

function readOutboxRowsSa_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rng = sheet.getRange(2, 1, last-1, 7).getValues();
  var out = [];
  for (var i=0; i<rng.length; i++) {
    var row = rng[i];
    out.push({
      _rowIndex: i+2,
      timestamp: row[0],
      schoolKey: String(row[1] || ''),
      to:        String(row[2] || ''),
      body:      String(row[3] || ''),
      status:    String(row[4] || ''),
      providerMessageId: String(row[5] || ''),
      meta:      safeJson_(row[6]) || {}
    });
  }
  return out;
}

function markOutboxRowSa_(sheet, rowIndex, status, info) {
  sheet.getRange(rowIndex, 5).setValue(String(status || ''));
  sheet.getRange(rowIndex, 6).setValue(String(info || ''));
}

function safeJson_(s) { try { return s ? JSON.parse(String(s)) : null; } catch (_){ return null; } }

// === These two are only used when you later flip TEST_MINIMAL_QUEUE=false ===
function safeGetSmsConfigForSchool_(schoolKey) {
  try {
    var cfg = getSmsConfig_(schoolKey); // your existing per-school SMS config reader
    return cfg || null;
  } catch (e) {
    Logger.log('safeGetSmsConfigForSchool_ error: ' + e.message);
    return null;
  }
}

function sendSmsSa_(cfg, to, body) {
  if (DRY_RUN) {
    Logger.log('[DRY_RUN] SMS to=%s body=%s', to, body);
    return { ok: true, messageId: 'DRY_RUN' };
  }
  // Example inline sender (replace with your real one when you go LIVE)
  var payload = { to: to, message: body, from: cfg.senderId || '' };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Authorization: 'Bearer ' + (cfg.token || cfg.apiKey || cfg.password || '') },
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(cfg.sendUrl, options);
  var code = res.getResponseCode();
  var txt  = res.getContentText();
  if (code >= 200 && code < 300) {
    var data = safeJson_(txt) || {};
    return { ok: true, messageId: String(data.messageId || data.id || '') };
  }
  throw new Error('SMS SA error ' + code + ': ' + txt);
}

/***** ================= END MINIMAL DISPATCH SANDBOX ===================== *****/





// === Cron: send queued messages === Dispatcher function
function autoSmsDispatchSa_BACKUP() {
  var sheet = ensureOutboxSheetSa_();
  var rows  = readOutboxRowsSa_(sheet);
  var pending = rows.filter(function(r){ return r.status === 'QUEUED'; });
  if (!pending.length) return;

  if (pending.length > AUTOSMS_MAX_PER_RUN) pending = pending.slice(0, AUTOSMS_MAX_PER_RUN);

  // group by school
  var groups = {};
  pending.forEach(function(r){ (groups[r.schoolKey] || (groups[r.schoolKey] = [])).push(r); });

  Object.keys(groups).forEach(function(schoolKey){
    var batch = groups[schoolKey];
    if (!schoolKey) {
      batch.forEach(function(r){ markOutboxRowSa_(sheet, r._rowIndex, 'ERROR', 'Missing schoolKey'); });
      return;
    }

    // 1) Load your existing SMS SA config
    var cfg = safeGetSmsConfigForSchool_(schoolKey);
    if (!cfg || !cfg.sendUrl) {
      batch.forEach(function(r){ markOutboxRowSa_(sheet, r._rowIndex, 'ERROR', 'No SMS SA config for ' + schoolKey); });
      return;
    }

    // 2) Send each (respects DRY_RUN)
    batch.forEach(function(r){
      try {
        var res = sendSmsSa_(cfg, r.to, r.body);     // <-- use your current sender inside this
        var id  = res && res.messageId ? String(res.messageId) : 'OK';
        markOutboxRowSa_(sheet, r._rowIndex, 'SENT', id);
      } catch (err) {
        markOutboxRowSa_(sheet, r._rowIndex, 'ERROR', String(err && err.message || err));
      }
    });
  });
}

/** Looks up your SMS SA config for a given school.
 *  If your getSmsConfig_ already reads per-school from a Schools tab or Script Properties,
 *  call it and return the object unchanged.
 */
function safeGetSmsConfigForSchool_BACKUP(schoolKey) {
  // If your current getSmsConfig_() already considers schoolKey, use it:
  try {
    var cfg = getSmsConfig_(schoolKey); // <-- if your helper takes schoolKey; otherwise call without it.
    return cfg || null;
  } catch (e) {
    Logger.log('safeGetSmsConfigForSchool_ error: ' + e.message);
    return null;
  }
}

/** Thin adapter that reuses your existing SMS SA sender.
 *  Replace internals with your actual function. Keep DRY_RUN respected.
 */
function sendSmsSa_BACKUP(cfg, to, body) {
  if (typeof DRY_RUN !== 'undefined' && DRY_RUN) {
    Logger.log('[DRY_RUN] SMS to=%s body=%s', to, body);
    return { ok: true, messageId: 'DRY_RUN' };
  }

  // Example direct call to your existing sender:
  // return sendSmsSouthAfrica_(cfg, to, body);

  // If you don’t have a single entry point, here is a minimal inline fetch
  // that matches typical SMS SA REST flows using your cfg fields.
  var payload = {
    to: to,
    message: body,
    from: cfg.senderId || ''
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Authorization: 'Bearer ' + (cfg.token || cfg.apiKey || cfg.password || '') },
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(cfg.sendUrl, options);
  var code = res.getResponseCode();
  var txt  = res.getContentText();

  if (code >= 200 && code < 300) {
    var data = safeJson_(txt) || {};
    return { ok: true, messageId: String(data.messageId || data.id || '') };
  }
  throw new Error('SMS SA error ' + code + ': ' + txt);
}

// === Sheet helpers (Outbox) ===
function ensureOutboxSheetSa_BACKUP() {
  var ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
  var sh = ss.getSheetByName(AUTOSMS_OUTBOX_NAME);
  if (!sh) {
    sh = ss.insertSheet(AUTOSMS_OUTBOX_NAME);
    sh.appendRow(['timestamp','schoolKey','to','body','status','providerMessageId','metaJson']);
  }
  return sh;
}

function readOutboxRowsSa_BACKUP(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rng = sheet.getRange(2, 1, last-1, 7).getValues();
  var out = [];
  for (var i=0; i<rng.length; i++) {
    var row = rng[i];
    out.push({
      _rowIndex: i+2,
      timestamp: row[0],
      schoolKey: String(row[1] || ''),
      to:        String(row[2] || ''),
      body:      String(row[3] || ''),
      status:    String(row[4] || ''),
      providerMessageId: String(row[5] || ''),
      meta:      safeJson_(row[6]) || {}
    });
  }
  return out;
}
function markOutboxRowSa_BACKUP(sheet, rowIndex, status, info) {
  sheet.getRange(rowIndex, 5).setValue(String(status || ''));
  sheet.getRange(rowIndex, 6).setValue(String(info || ''));
}

// === Tiny JSON helper (reuse yours if present) ===
function safeJson_(s) { try { return s ? JSON.parse(String(s)) : null; } catch (_){ return null; } }

/**
 * Ensure exactly one "From spreadsheet → On form submit" trigger exists
 * for the given spreadsheet ID, targeting onIncidentFormSubmit.
 */
function ensureIncidentSubmitTriggerFor_(ssId) {
  if (!ssId) return;
  const all = ScriptApp.getProjectTriggers();
  let has = false;
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    try {
      if (t.getHandlerFunction() !== 'onIncidentFormSubmit') continue;
      if (t.getEventType && t.getEventType() !== ScriptApp.EventType.FORM_SUBMIT) continue;
      if (t.getTriggerSourceId && t.getTriggerSourceId() === ssId) { has = true; break; }
    } catch (_) {}
  }
  if (!has) {
    ScriptApp.newTrigger('onIncidentFormSubmit')
      .forSpreadsheet(ssId)
      .onFormSubmit()
      .create();
    Logger.log('[Triggers] + Installed onFormSubmit for ssId=' + ssId);
  } else {
    Logger.log('[Triggers] ✓ Exists onFormSubmit for ssId=' + ssId);
  }
}

/**
 * Scan CONFIG "Schools" and install/sync triggers for ALL Active schools.
 * Run this once after adding schools, or anytime you update CONFIG.
 */
function installIncidentSubmitTriggersForAllSchools() {
  const ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
  const sh = ss.getSheetByName('Schools');
  if (!sh) throw new Error('CONFIG.Schools not found');

  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) { Logger.log('[Triggers] No school rows'); return; }

  const H = values[0].map(h => String(h || '').trim().toLowerCase());
  const idx = (name) => H.indexOf(name.toLowerCase());

  const iActive = idx('active');
  const iData   = idx('data sheet url');
  const iKey    = idx('school key');

  let made = 0, kept = 0, skipped = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const active = String(row[iActive] || '').trim().toUpperCase() === 'Y';
    const dataUrl = String(row[iData] || '').trim();
    const key = String(row[iKey] || '').trim();
    if (!active || !dataUrl) { skipped++; continue; }

    const ssId = parseSpreadsheetId_(dataUrl);
    if (!ssId) { Logger.log('[Triggers] Skipping (bad Data Sheet URL) key=' + key); skipped++; continue; }

    const before = getProjectTriggerCountFor_(ssId, 'onIncidentFormSubmit');
    ensureIncidentSubmitTriggerFor_(ssId);
    const after  = getProjectTriggerCountFor_(ssId, 'onIncidentFormSubmit');
    if (after > before) made++; else kept++;
  }

  Logger.log('[Triggers] Done. made=' + made + ' kept=' + kept + ' skipped=' + skipped);
}

/** Internal helper: count triggers for a specific ssId + handler */
function getProjectTriggerCountFor_(ssId, handler) {
  let n = 0;
  const all = ScriptApp.getProjectTriggers();
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    try {
      if (t.getHandlerFunction() !== handler) continue;
      if (t.getEventType && t.getEventType() !== ScriptApp.EventType.FORM_SUBMIT) continue;
      if (t.getTriggerSourceId && t.getTriggerSourceId() === ssId) n++;
    } catch (_) {}
  }
  return n;
}

