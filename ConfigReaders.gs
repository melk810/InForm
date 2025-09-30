/**
 * ConfigReaders.gs
 * Shared readers & helpers for InForm (multi-tenant schools).
 * Safe to use from Code.gs, SmsQuota.gs, Tests.gs, etc.
 *
 * This file:
 *  - Finds the Config spreadsheet URL (ScriptProperty → ctx → Active)
 *  - Reads the "Schools" sheet into a map keyed by School Key
 *  - Preserves ORIGINAL header keys and also adds camelCase aliases
 *  - Resolves spreadsheetId for each school from ssId or Data Sheet URL
 *  - Provides a tolerant "Active" flag (Y/YES/TRUE/1)
 */

/** ------- Global accessors ------- **/

/**
 * Returns the Config spreadsheet URL.
 * Priority:
 *   1) Script Properties -> CONFIG_SHEET_URL
 *   2) ctx.configSheetUrl (if your ctx-shim populates it)
 *   3) null => caller may fallback to active spreadsheet
 */
function getConfigSheetUrl_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = props && props.getProperty('CONFIG_SHEET_URL');
    if (url) return url;
  } catch (e) {
    // ignore
  }

  // If your project sets a global ctx via loadCtx_(), try it.
  try {
    if (typeof this.ctx === 'object' && this.ctx && this.ctx.configSheetUrl) {
      return String(this.ctx.configSheetUrl);
    }
  } catch (e2) {
    // ignore
  }

  // Last resort: let callers open SpreadsheetApp.getActive()
  return null;
}

/** ------- Core reader ------- **/

/**
 * readSchoolsMapFromConfig_ (tolerant, full-field)
 * - Opens the Config spreadsheet and reads the "Schools" sheet.
 * - Builds an object keyed by School Key.
 * - Each value contains BOTH:
 *     a) Original header keys EXACTLY as in the sheet
 *     b) CamelCase aliases for convenience (e.g. "Data Sheet URL" -> dataSheetUrl)
 * - Does NOT drop columns like Active or ssId.
 *
 * The "Active" column is NOT filtered here; that’s the caller’s choice.
 */
function readSchoolsMapFromConfig_() {
  var configUrl = getConfigSheetUrl_();
  var ss = configUrl ? SpreadsheetApp.openByUrl(configUrl) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Config spreadsheet could not be opened.");
  var sh = ss.getSheetByName("Schools");
  if (!sh) throw new Error('Config spreadsheet has no "Schools" sheet');

  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) throw new Error("Schools sheet has no data rows.");

  var headers = (data[0] || []).map(function(h){ return (h || "").toString(); });
  var map = {};

  // Camel-converter for headers
  var toCamel = function(s){
    s = String(s || "").trim().toLowerCase();
    return s
      .replace(/\u200B/g, "")        // zero-width
      .replace(/\u00A0/g, " ")       // nbsp
      .replace(/[^a-z0-9]+([a-z0-9])/g, function(m, g1){ return g1.toUpperCase(); })
      .replace(/^[^a-zA-Z]*/, "");
  };

  for (var r = 1; r < data.length; r++) {
    var rowVals = data[r];
    if (!rowVals || rowVals.join("") === "") continue;

    // 1) Keep the ORIGINAL headers verbatim
    var original = {};
    for (var c = 0; c < headers.length; c++) {
      original[headers[c]] = rowVals[c];
    }

    // 2) Add camelCase aliases
    var camel = {};
    headers.forEach(function(h, idx){
      camel[toCamel(h)] = rowVals[idx];
    });

    // 3) Compose final object: originals first, then camel (camel does NOT overwrite originals)
    var rowObj = Object.assign({}, original);
    Object.keys(camel).forEach(function(k){
      if (!(k in rowObj)) rowObj[k] = camel[k];
    });

    // 4) Key resolution: prefer explicit "School Key" → then camel alias "schoolKey" → then a normalized lookup
    var key = rowObj["School Key"] || rowObj["schoolKey"] || rowObj["school key"];
    if (!key) continue;

    map[String(key).trim()] = rowObj;
  }

  return map;
}

/** ------- SMS / Spreadsheet helpers ------- **/

/** Flexible truthiness for 'Active' etc. Accepts: Y, YES, TRUE, 1 (case-insensitive). */
function isTruthyFlexible_(v) {
  if (v == null) return false;
  var s = String(v).trim().toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

/** Extract /d/<ID>/ from a Google Sheets URL */
function extractSpreadsheetId_(url) {
  if (!url) return null;
  var m = String(url).match(/\/d\/([a-zA-Z0-9-_]{10,})/);
  return m ? m[1] : null;
}

/**
 * Resolve spreadsheetId from a Schools row.
 * Works with BOTH:
 *   - Original headers: "ssId", "Data Sheet URL", "Data Sheet URLS"
 *   - CamelCase: ssId, dataSheetUrl, dataSheetUrls
 */
function resolveSpreadsheetIdFromSchoolRow_(row) {
  if (!row) return null;

  // Prefer explicit ssId
  var ssId = row.ssId || row["ssId"] || row["SSId"] || row["SSID"] || row["ss id"];
  if (ssId) return String(ssId).trim();

  // Else derive from URL variants
  var url = row.dataSheetUrl || row.dataSheetUrls || row["Data Sheet URL"] || row["Data Sheet URLS"];
  var id = extractSpreadsheetId_(url);
  return id || null;
}

/**
 * Open the school data spreadsheet for a given row (used by SMS Quota code).
 * Throws a friendly, specific error if not resolvable/openable.
 */
/**
 * Open the school data spreadsheet.
 * Accepts EITHER:
 *   - a Schools row object (with headers/camelCase), OR
 *   - a ctx object { selectedSchoolKey, school, sheetUrl?, spreadsheetId? }
 */
function openSchoolSpreadsheet_(rowOrCtx) {
  if (!rowOrCtx) {
    throw new Error('[SMS Quota] No input provided to openSchoolSpreadsheet_.');
  }

  // 1) If this looks like a ctx, try direct fields and ctx.school first
  var maybeCtx = (rowOrCtx && typeof rowOrCtx === 'object' && (rowOrCtx.selectedSchoolKey || rowOrCtx.school)) ? rowOrCtx : null;
  if (maybeCtx) {
    // direct ctx overrides if present
    if (maybeCtx.sheetUrl)       try { return SpreadsheetApp.openByUrl(maybeCtx.sheetUrl); } catch (e) {}
    if (maybeCtx.spreadsheetId)  try { return SpreadsheetApp.openById(maybeCtx.spreadsheetId); } catch (e) {}

    // school row inside ctx
    if (maybeCtx.school) {
      var idFromRow = resolveSpreadsheetIdFromSchoolRow_(maybeCtx.school);
      if (idFromRow) return SpreadsheetApp.openById(idFromRow);
    }

    // Try to fetch the row from Config via selectedSchoolKey
    if (maybeCtx.selectedSchoolKey) {
      var schoolsMap = readSchoolsMapFromConfig_();
      var row = (schoolsMap instanceof Map)
        ? schoolsMap.get(maybeCtx.selectedSchoolKey)
        : (schoolsMap && schoolsMap[maybeCtx.selectedSchoolKey]);
      if (row) {
        var idFromLookup = resolveSpreadsheetIdFromSchoolRow_(row);
        if (idFromLookup) return SpreadsheetApp.openById(idFromLookup);
      }
    }
  }

  // 2) Treat the input as a Schools row
  var id = resolveSpreadsheetIdFromSchoolRow_(rowOrCtx);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }

  // 3) Nothing worked → clear, actionable error
  var keyHint = (maybeCtx && (maybeCtx.selectedSchoolKey || (maybeCtx.school && (maybeCtx.school['School Key'] || maybeCtx.school.schoolKey)))) || '';
  throw new Error('[SMS Quota] Could not locate school spreadsheet (need "Data Sheet URL" or "ssId" in Schools config' +
                  (keyHint ? (', key="'+ keyHint + '"') : '') + ').');
}

/** ------- Simple tester you can run from the editor ------- **/

function testReadSchoolsMap_() {
  var configUrl = getConfigSheetUrl_();
  Logger.log("[TEST] Config URL: %s", configUrl || "(null → using active spreadsheet)");

  var schools = readSchoolsMapFromConfig_();
  Logger.log("[TEST] Keys: %s", Object.keys(schools));

  var key = "DOORN1"; // adjust if needed
  var row = schools[key];
  if (!row) throw new Error('School key "' + key + '" not found.');

  Logger.log("[TEST] RAW row keys: %s", Object.keys(row));
  Logger.log("[TEST] Active? %s", isTruthyFlexible_(row.active || row["Active"]));

  var ssid = resolveSpreadsheetIdFromSchoolRow_(row);
  Logger.log("[TEST] Resolved spreadsheetId: %s", ssid || "(null)");

  var ss = openSchoolSpreadsheet_(row);
  Logger.log("[TEST] Opened: %s (%s)", ss.getName(), ss.getId());
}
