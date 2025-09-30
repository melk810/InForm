/**
 * DebugSmsQuota.gs
 * Safe, read-only diagnostics to find why SmsQuota openSchoolSpreadsheet_ fails.
 * Does not mutate sheets. Logs every step.
 *
 * HOW TO USE:
 * 1) Add this file to your Apps Script project.
 * 2) Run debugSmsQuotaConfig() from the editor.
 * 3) Check Executions → Logs for a detailed trace.
 *
 * Assumes your project already defines:
 *   - getConfigSheetUrl_()
 *   - readSchoolsMapFromConfig_()
 * If not, this file will fallback to minimal inline readers.
 */

/** Entry point */
function debugSmsQuotaConfig() {
  try {
    Logger.log("[DBG] --- SmsQuota Config Debug START ---");

    // 1) Which Config spreadsheet is the code actually using?
    var configUrl = safeCall_("getConfigSheetUrl_", []);
    Logger.log("[DBG] Config URL from getConfigSheetUrl_(): %s", configUrl || "(null)");
    if (!configUrl) {
      Logger.log("[DBG] No config URL from getConfigSheetUrl_(). If you keep config inline, that’s fine; we’ll continue.");
    }

    // 2) Read Schools map using your project’s own reader if present
    var schoolsMap = safeCall_("readSchoolsMapFromConfig_", []);
    if (!schoolsMap) {
      Logger.log("[DBG] readSchoolsMapFromConfig_() not found or returned null; falling back to minimal inline reader.");
      schoolsMap = fallbackReadSchoolsMap_(configUrl);
    }

    if (!schoolsMap || typeof schoolsMap !== "object") {
      throw new Error("Failed to load Schools map (null/invalid). Check your config reader.");
    }

    var keys = Object.keys(schoolsMap);
    Logger.log("[DBG] Schools found: %s", JSON.stringify(keys));

    var schoolKey = "DOORN1"; // <-- adjust if needed
    var row = schoolsMap[schoolKey];
    if (!row) {
      throw new Error('School key "' + schoolKey + '" not found in Schools map. Keys present: ' + keys.join(", "));
    }

    // 3) Show RAW row and a NORMALIZED view
    Logger.log("[DBG] RAW row for %s: %s", schoolKey, JSON.stringify(row));
    var normalized = normalizeSchoolRow_(row);
    Logger.log("[DBG] Normalized row for %s: %s", schoolKey, JSON.stringify(normalized));

    // 4) Active logic: accept Y/YES/TRUE/1 (case-insensitive) as active
    var isActive = isTruthy_(normalized.active);
    Logger.log("[DBG] Active? raw=%s → %s", JSON.stringify(row["Active"]), isActive);
    if (!isActive) {
      Logger.log('[DBG] WARNING: "%s" is not Active (value=%s). Some flows skip inactive schools.', schoolKey, JSON.stringify(row["Active"]));
    }

    // 5) Resolve spreadsheetId
    var spreadsheetId = pickSpreadsheetIdForSchool_(normalized);
    Logger.log("[DBG] Computed spreadsheetId: %s", spreadsheetId || "(null)");

    if (!spreadsheetId) {
      throw new Error('Could not resolve spreadsheetId from either "Data Sheet URL" or "ssId"');
    }

    // 6) Try opening the sheet
    try {
      var ss = SpreadsheetApp.openById(spreadsheetId);
      Logger.log("[DBG] SUCCESS: Opened spreadsheet: %s (name=%s)", spreadsheetId, ss.getName());
      var url = ss.getUrl();
      Logger.log("[DBG] Spreadsheet URL: %s", url);
    } catch (openErr) {
      Logger.log("[DBG] ERROR opening spreadsheet by id=%s → %s", spreadsheetId, openErr && openErr.message);
      Logger.log("[DBG] If this is a permission issue, ensure the script owner has access to the target spreadsheet.");
      throw openErr;
    }

    Logger.log("[DBG] --- SmsQuota Config Debug END (OK) ---");
  } catch (err) {
    Logger.log("[DBG] --- SmsQuota Config Debug END (ERROR) ---");
    Logger.log("[DBG] %s", err && err.message);
    throw err; // surface in the execution pane
  }
}

/** Utility: call a function if it exists */
function safeCall_(fnName, args) {
  if (typeof this[fnName] === "function") {
    try {
      return this[fnName].apply(null, args || []);
    } catch (e) {
      Logger.log("[DBG] %s() threw: %s", fnName, e && e.message);
      return null;
    }
  }
  Logger.log("[DBG] %s() not defined in this project.", fnName);
  return null;
}

/**
 * Minimal fallback config reader in case your project helpers aren’t available in this context.
 * Expects a sheet named "Schools" in the config spreadsheet referenced by configUrl.
 */
function fallbackReadSchoolsMap_(configUrl) {
  try {
    var ss = configUrl ? SpreadsheetApp.openByUrl(configUrl) : SpreadsheetApp.getActiveSpreadsheet();
    Logger.log("[DBG] Fallback reader opening config: %s (name=%s)", ss.getUrl(), ss.getName());
    var sh = ss.getSheetByName("Schools");
    if (!sh) throw new Error('Config spreadsheet has no "Schools" sheet');

    var rng = sh.getDataRange();
    var values = rng.getValues();
    if (!values || values.length < 2) throw new Error("Schools sheet has no data rows.");

    var headers = (values[0] || []).map(function(h) { return (h || "").toString(); });

    Logger.log("[DBG] RAW headers: %s", JSON.stringify(headers));
    var map = {};
    for (var r = 1; r < values.length; r++) {
      var rowVals = values[r];
      if (!rowVals || rowVals.join("") === "") continue;

      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        obj[headers[c]] = rowVals[c];
      }

      // Prefer header "School Key" (case/space tolerant)
      var key = (obj["School Key"] != null ? obj["School Key"] : obj["school key"]);
      if (key == null) {
        // try normalized find
        var n = normalizeObjectKeys_(obj);
        key = n["school key"];
      }

      if (key != null && key !== "") {
        map[key] = obj;
      }
    }
    return map;
  } catch (e) {
    Logger.log("[DBG] fallbackReadSchoolsMap_ ERROR: %s", e && e.message);
    return null;
  }
}

/** Normalize the row: trim, collapse spaces in headers, lowercase keys for easier access */
function normalizeSchoolRow_(raw) {
  var out = {};
  var n = normalizeObjectKeys_(raw);

  // Map variants to canonical names
  out.schoolKey     = pickFirst_(n, ["school key"]);
  out.schoolName    = pickFirst_(n, ["school name"]);
  out.emailDomain   = pickFirst_(n, ["email domain"]);
  out.color         = pickFirst_(n, ["color", "colour"]);
  out.logoUrl       = pickFirst_(n, ["logo url"]);
  out.dataSheetUrl  = pickFirst_(n, ["data sheet url", "data sheet urls"]);
  out.incidentForm  = pickFirst_(n, ["incident form url"]);
  out.attForm       = pickFirst_(n, ["attendance form url"]);
  out.smsUsername   = pickFirst_(n, ["sms username"]);
  out.smsPassword   = pickFirst_(n, ["sms password"]);
  out.smsAuthUrl    = pickFirst_(n, ["sms auth url"]);
  out.smsSendUrl    = pickFirst_(n, ["sms send url"]);
  out.smsSenderId   = pickFirst_(n, ["sms sender id"]);
  out.active        = pickFirst_(n, ["active"]);
  out.ssId          = pickFirst_(n, ["ssid", "ss id"]);
  out.smsTemplate   = pickFirst_(n, ["smstemplate", "sms template"]);
  out.adminEmail    = pickFirst_(n, ["adminemail", "admin email"]);

  // Trim strings
  Object.keys(out).forEach(function(k){
    if (typeof out[k] === "string") out[k] = out[k].trim();
  });

  return out;
}

/** Decide spreadsheet id from either ssId or dataSheetUrl */
function pickSpreadsheetIdForSchool_(norm) {
  if (norm.ssId) return norm.ssId;
  if (norm.dataSheetUrl) {
    var id = extractSpreadsheetId_(norm.dataSheetUrl);
    return id || null;
  }
  return null;
}

/** True if “truthy” in our sense: Y/YES/TRUE/1 (case-insensitive) */
function isTruthy_(val) {
  if (val == null) return false;
  var s = String(val).trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

/** Extract /d/<ID>/ from typical Google Sheets URL */
function extractSpreadsheetId_(url) {
  if (!url) return null;
  try {
    var m = String(url).match(/\/d\/([a-zA-Z0-9-_]{10,})/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

/** Lowercase, trim keys, collapse internal spaces to one space */
function normalizeObjectKeys_(obj) {
  var out = {};
  Object.keys(obj || {}).forEach(function(k){
    var nk = String(k == null ? "" : k)
      .replace(/\u200B/g, "")         // zero-width
      .replace(/\u00A0/g, " ")        // nbsp
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    out[nk] = obj[k];
  });
  return out;
}

/** Pick first present key in normalized object */
function pickFirst_(nObj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (Object.prototype.hasOwnProperty.call(nObj, k)) {
      return nObj[k];
    }
  }
  return null;
}
