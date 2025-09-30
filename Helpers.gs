function maskToken_(tok) {
  var s = String(tok || '');
  if (!s) return '';
  if (s.length <= 8) return '•'.repeat(s.length);
  return s.slice(0, 4) + '…' + s.slice(-4);
}

function logHelper(message) {
  Logger.log('[App] ' + message);
}

function handleError_(error, context) {
  var message = error && error.message ? error.message : error;
  logHelper(context + ' error: ' + message);
  return message;
}

// Add near your helpers (top-level)
function finalizeCtx_(ctx, scriptUrl) {
  try {
    // keep absolute URL for all templates/buttons
    ctx.scriptUrl = scriptUrl || getBaseUrl_();
    // keep build visible in templates
    ctx.build = (typeof BUILD !== 'undefined' ? BUILD : String(new Date()));
    // make sure dataSheetUrl points to a real primary workbook
    ensurePrimaryWorkbookInCtx_(ctx);
    // always a string; avoids 'undefined' creeping in
    ctx.selectedSchoolKey = String(ctx.selectedSchoolKey || '');
  } catch (e) {
    handleError_(e, 'finalizeCtx_');
  }
  return ctx;
}

/** Extract spreadsheet ID from a Google Sheets URL. */
function parseSpreadsheetId_(url) {
  if (!url) return '';
  try {
    url = String(url).trim();
    var m1 = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (m1 && m1[1]) return m1[1];
    var m2 = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (m2 && m2[1]) return m2[1];
    var q = url.split('?')[1] || '';
    if (q) {
      var params = {};
      q.split('&').forEach(function (kv) {
        var p = kv.split('=');
        params[decodeURIComponent(p[0]||'')] = decodeURIComponent(p[1]||'');
      });
      if (params.id) return params.id;
    }
  } catch (_) {}
  return '';
}

/** Try to identify the schoolKey for the responses sheet that fired the event.
 *  Priority:
 *   1) Script Properties: SMS_SA_DEFAULT_SCHOOL_KEY (simple global default)
 *   2) Schools tab mapping (by Spreadsheet ID)
 *   3) Fallback: '' (let queue store empty; dispatcher will mark ERROR)
 */
function resolveSchoolKeyForResponses_(sheet) {
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    if (props['SMS_SA_DEFAULT_SCHOOL_KEY']) {
      return String(props['SMS_SA_DEFAULT_SCHOOL_KEY']).trim();
    }

    // Try mapping by Spreadsheet ID from “Schools” tab (optional but recommended)
    var ss = sheet.getParent();
    var ssId = ss && ss.getId ? ss.getId() : '';
    var mapped = lookupSchoolKeyByResponsesSheetId_(ssId);
    if (mapped) return mapped;
  } catch (e) {
    Logger.log('resolveSchoolKeyForResponses_ error: ' + (e && e.message || e));
  }
  return '';
}

/** Look up a schoolKey by the responses spreadsheetId.
 *  Priority: Config (headers: "School Key", "Data Sheet URL") → legacy "Schools" sheet.
 */
function lookupSchoolKeyByResponsesSheetId_(responsesSheetId) {
  if (!responsesSheetId) return '';
  try {
    var ssCfg = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);

    // ---------- Try the modern Config sheet ----------
    var shConfig = ssCfg.getSheetByName('Config'); // exact sheet name
    if (shConfig) {
      var valuesC = shConfig.getDataRange().getValues();
      if (valuesC.length) {
        var headC = valuesC[0];
        var idxC = {};
        headC.forEach(function (h, i) { idxC[h] = i; });

        var idxKeyC = idxC['School Key'];      // EXACT header
        var idxUrlC = idxC['Data Sheet URL'];  // EXACT header

        if (idxKeyC != null && idxUrlC != null) {
          for (var r = 1; r < valuesC.length; r++) {
            var row = valuesC[r];
            var key = String(row[idxKeyC] || '').trim();
            if (!key) continue;

            var url = String(row[idxUrlC] || '').trim();
            var idFromUrl = parseSpreadsheetId_(url);

            // ✅ Your debug line (safe to keep while testing)
            Logger.log('[lookup][Config] compare idFromUrl=%s ?= active=%s for key=%s',
                       idFromUrl, responsesSheetId, key);

            if (idFromUrl && idFromUrl === responsesSheetId) {
              return key; // ✅ found in Config
            }
          }
        }
      }
    }

    // ---------- Fallback to legacy "Schools" sheet ----------
    var shLegacy = ssCfg.getSheetByName('Schools');
    if (shLegacy) {
      var values = shLegacy.getDataRange().getValues();
      if (values.length) {
        var head = values[0];
        var idx = {};
        head.forEach(function (h, i) { idx[h] = i; });

        var idxKey = idx['SchoolKey'];
        var idxRespId = idx['ResponsesSheetId'];
        var idxRespUrl = idx['ResponsesSheetUrl'];

        for (var r2 = 1; r2 < values.length; r2++) {
          var row2 = values[r2];
          var key2 = String(row2[idxKey] || '').trim();
          if (!key2) continue;

          if (idxRespId != null && String(row2[idxRespId] || '') === responsesSheetId) {
            return key2;
          }
          if (idxRespUrl != null) {
            var url2 = String(row2[idxRespUrl] || '').trim();
            var id2 = parseSpreadsheetId_(url2);
            if (id2 && id2 === responsesSheetId) {
              return key2;
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log('lookupSchoolKeyByResponsesSheetId_ error: ' + (e && e.message || e));
  }
  return '';
}

/**
 * Single-source-of-truth resolver for the school key.
 * 1) Prefer ctx/selected key already known.
 * 2) Else map by Spreadsheet ID from Config.
 * 3) Else throw loudly.
 */
function resolveSchoolKey_(maybeCtx, maybeSelectedKey, ss /* Spreadsheet */) {
  // 1) Prefer already-known key
  var k = (maybeSelectedKey || (maybeCtx && maybeCtx.selectedSchoolKey) || '').trim();
  if (k) return k;

  // 2) Map by Spreadsheet ID from Config
  try {
    var ssId = ss && ss.getId ? ss.getId() : '';
    if (ssId) {
      var map = readSchoolsMapFromConfig_(); // { DOORN1: { ssId: '...', ... }, ... }
      for (var key in map) {
        if (map[key] && map[key].ssId === ssId) return key;
      }
    }
  } catch (err) {
    Logger.log('[SchoolResolve] Config lookup failed: ' + err);
  }

  // 3) Fail loudly
  var ssName = (ss && ss.getName ? ss.getName() : '');
  throw new Error('Missing schoolKey (no prior key; no Config match for ssId=' + (ss && ss.getId ? ss.getId() : '') + ' name=' + ssName + ')');
}

function lookupKeyBySsId_(ssId) {
  if (!ssId) return '';
  var map = readSchoolsMapFromConfig_(); // { KEY: { ssId: '...', ... }, ... }
  for (var k in map) if (map[k] && map[k].ssId === ssId) return k;
  return '';
}

/** Decide the effective mode.
 * Priority:
 * 1) Responses column 'Delivery Mode' (IMMEDIATE/QUEUED)
 * 2) Config/Schools 'SMS Mode' for this school (IMMEDIATE/QUEUED)
 * 3) AUTOSMS_DEFAULT_MODE
 */
function resolveSmsModeForRowOrSchool_Sa_(schoolKey, headerMap, rowValues) {
  // 1) Per-row override
  var rowMode = '';
  var dmColIdx = headerMap['delivery mode']; // case-insensitive map uses lower-cased key
  if (dmColIdx) {
    rowMode = String(rowValues[dmColIdx - 1] || '').trim().toUpperCase();
  }
  if (rowMode === 'IMMEDIATE' || rowMode === 'QUEUED') return rowMode;

  // 2) Per-school (Config → Schools, column "SMS Mode")
  var schoolMode = lookupSchoolSmsMode_Sa_(schoolKey);
  if (schoolMode) return schoolMode;

  // 3) Project default
  return (String(AUTOSMS_DEFAULT_MODE || '').toUpperCase() === 'IMMEDIATE') ? 'IMMEDIATE' : 'QUEUED';
}

/** Read 'SMS Mode' from CONFIG.Schools for a given key. */
function lookupSchoolSmsMode_Sa_(schoolKey) {
  if (!schoolKey) return '';
  try {
    var cfgUrl = (typeof CONFIG_SHEET_URL !== 'undefined' && CONFIG_SHEET_URL) ? CONFIG_SHEET_URL : getConfigSheetUrl_();
    var ss = SpreadsheetApp.openByUrl(cfgUrl);
    var sh = ss.getSheetByName('Schools');
    if (!sh) return '';
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return '';

    var H = values[0].map(function(h){ return String(h || '').trim().toLowerCase(); });
    var iKey  = H.indexOf('school key');
    var iMode = H.indexOf('sms mode'); // EXACT header text "SMS Mode"

    if (iKey === -1 || iMode === -1) return '';

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var k = String(row[iKey] || '').trim();
      if (k !== schoolKey) continue;
      var m = String(row[iMode] || '').trim().toUpperCase();
      if (m === 'IMMEDIATE' || m === 'QUEUED') return m;
      break;
    }
  } catch (e) {
    handleError_(e, 'lookupSchoolSmsMode_Sa_');
  }
  return '';
}

/** Append with explicit status + providerMessageId (audit for IMMEDIATE or error cases). */
function enqueueOutboxWithStatus_Sa_(status, providerMessageId, schoolKey, to, body, metaObj) {
  var cfgUrl = (typeof CONFIG_SHEET_URL !== 'undefined' && CONFIG_SHEET_URL) ? CONFIG_SHEET_URL : getConfigSheetUrl_();
  var ss = SpreadsheetApp.openByUrl(cfgUrl);
  var outName = (typeof AUTOSMS_OUTBOX_NAME !== 'undefined' && AUTOSMS_OUTBOX_NAME) ? AUTOSMS_OUTBOX_NAME : 'Outbox';
  var sh = ss.getSheetByName(outName);
  if (!sh) {
    sh = ss.insertSheet(outName);
    sh.appendRow(['timestamp','schoolKey','to','body','status','providerMessageId','metaJson']);
  }
  sh.appendRow([
    new Date(),
    String(schoolKey || ''),
    String(to || ''),
    String(body || ''),
    String(status || ''),
    String(providerMessageId || ''),
    JSON.stringify(metaObj || {})
  ]);
}

// Minimal header-map shim used by runGuardsOnSubmitSa_.
// Scans row 1 and lets you ask for a column by header name (case-insensitive).
function getHeaderMap_Sa_(sheet, requiredHeaders) {
  if (!sheet) throw new Error('No sheet provided to getHeaderMap_Sa_.');
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  var map = {}; // normalized header -> 1-based col index
  for (var c = 0; c < headers.length; c++) {
    var raw  = String(headers[c] || '').trim();
    var norm = raw.toLowerCase();
    if (norm && !(norm in map)) map[norm] = c + 1; // first wins
  }

  // Optional: verify required headers exist
  if (requiredHeaders && requiredHeaders.length) {
    var missing = [];
    for (var i = 0; i < requiredHeaders.length; i++) {
      var want = String(requiredHeaders[i] || '').trim().toLowerCase();
      if (!map[want]) missing.push(requiredHeaders[i]);
    }
    if (missing.length) throw new Error('Missing headers: ' + missing.join(', '));
  }

  return {
    col: function(name) {
      var idx = map[String(name || '').trim().toLowerCase()];
      if (!idx) throw new Error('Header not found: ' + name + ' (sheet=' + sheet.getName() + ')');
      return idx; // 1-based
    },
    raw: map
  };
}

// Fallback admin guard used by the adminSms route.
// Works even if ctx.school is missing by reading the Schools map directly.
function enforceAdminGuardLite_(ctx) {
  // 0) If your role already indicates elevated access, allow fast.
  var role = (ctx && ctx.role) ? String(ctx.role).toLowerCase().trim() : '';
  if (role === 'admin' || role === 'manager' || role === 'owner') return;

  // 1) Current user email
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();

  // 2) Get the school record:
  //    Prefer ctx.school if present; otherwise read from Config→Schools via readSchoolsMapFromConfig_()
  var schoolObj = null;
  if (ctx && ctx.school) {
    schoolObj = ctx.school; // your ctx contains the full row
  } else {
    if (typeof readSchoolsMapFromConfig_ !== 'function') {
      throw new Error('Admin guard: readSchoolsMapFromConfig_ missing');
    }
    var key = (ctx && ctx.selectedSchoolKey) ? String(ctx.selectedSchoolKey).trim() : '';
    if (!key) {
      // optional fallback to Script Property DEFAULT_SCHOOL_KEY
      var dkey = PropertiesService.getScriptProperties().getProperty('DEFAULT_SCHOOL_KEY');
      if (dkey) key = String(dkey).trim();
    }
    if (!key) throw new Error('Admin guard: no school key resolved');
    var map = readSchoolsMapFromConfig_(); // Map<key, object>
    schoolObj = map && map.get ? map.get(key) : null;
  }
  if (!schoolObj) throw new Error('Admin guard: school row not found');

  // 3) Read both headers robustly (support header variants)
  var adminField  = String(schoolObj['adminEmail']   || schoolObj['Admin Email']   || '').toLowerCase();
  var domainField = String(schoolObj['Email Domain'] || schoolObj['emailDomain'] || '').toLowerCase();

  // Note: "Email Domain" must be like "gmail.com", not a full email.
  // If you put an email there, it won't match; adminEmail still works.

  var adminList = adminField.split(/[;,]/).map(function(s){ return s.trim(); }).filter(Boolean);
  var domainOk = (domainField && !/@/.test(domainField)) ? email.endsWith('@' + domainField) : false;

  var allowed = (adminList.length && adminList.indexOf(email) !== -1) || domainOk;
  if (!allowed) {
    throw new Error('Not authorized. Add your email to "adminEmail" on the DOORN1 row (Config → Schools) or set "Email Domain" to a domain like "gmail.com".');
  }
}
