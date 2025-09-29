/** Guards_Sa.gs
 * Minimal, non-breaking guards for onSubmit flow.
 * - No refactor of your logic.
 * - Writes clear status messages into the response row instead of throwing.
 *
 * Assumes these globals already exist in your project:
 *   RESPONSES_SHEET_NAME (e.g. 'Form Responses 1')
 *   CONTACT_SHEET_NAME   (e.g. 'Learner Contacts')          // not used in v1 guard, kept for future
 *   SMS_STATUS_COLUMN    (e.g. 'Sent to Parent')
 *   AUTO_SMS_ENABLED     (true/false)
 *   DRY_RUN              (true/false)
 *
 * Also assumes you have (or added) a header map helper:
 *   getHeaderMap_Sa_(sheet, requiredHeaders?)  → { col(name), raw, original }
 */

/** Entry: run all light-weight guards for a single submission row. */
/** Guard v2: derive schoolKey from Config by ssId (no need for "School Key" on responses). */
function runGuardsOnSubmitSa_(responsesSheet, rowIndex) {
  var result = { blocked: false, reason: '', details: {} };

  // 0) Basics
  if (!responsesSheet) return _block('[CONFIG] responsesSheet not provided', result);
  if (!rowIndex || rowIndex < 2) return _block('[RANGE] Invalid rowIndex (' + rowIndex + ') – must be ≥ 2', result);

  // 1) Status header on the responses sheet (only hard requirement here)
  var statusHeader = (typeof SMS_STATUS_COLUMN === 'string' && SMS_STATUS_COLUMN) ? SMS_STATUS_COLUMN : 'Sent to Parent';
  var hmResp;
  try {
    hmResp = getHeaderMap_Sa_(responsesSheet, [statusHeader]);
  } catch (errHM) {
    return _block('[HEADERS] ' + errHM.message, result);
  }
  var colStatus = hmResp.col(statusHeader);

  // 2) Resolve school via Config by spreadsheet id (ssId)
  var ssId = '';
  try { ssId = responsesSheet.getParent().getId(); } catch (_){}
  if (!ssId) {
    _markStatus(responsesSheet, rowIndex, colStatus, '[BLOCKED] Could not resolve ssId of this workbook');
    return _block('[CONFIG] Could not resolve ssId of this workbook', result);
  }

  var school;
  try {
    school = _resolveSchoolBySsIdSa_(ssId); // { key, activeY, rowIndex }
  } catch (e) {
    _markStatus(responsesSheet, rowIndex, colStatus, '[BLOCKED] ' + e.message);
    return _block('[CONFIG] ' + e.message, result);
  }

  if (!school || !school.key) {
    _markStatus(responsesSheet, rowIndex, colStatus, '[BLOCKED] ssId not found in Config');
    return _block('[CONFIG] ssId not found in Config', result);
  }

  if (String(school.activeY || '').toUpperCase() !== 'Y') {
    _markStatus(responsesSheet, rowIndex, colStatus, '[BLOCKED] School not Active (Y) in Config');
    return _block('[CONFIG] School not Active (Y) in Config', result);
  }

  // 3) Duplicate check on the response row (anything containing 'sent')
  var lastCol = responsesSheet.getLastColumn();
  var rowVals = responsesSheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  var statusNow = String(rowVals[colStatus - 1] || '').trim().toLowerCase();
  if (statusNow && statusNow.indexOf('sent') !== -1) {
    return _block('[DUP] Row already marked as sent → ' + statusNow, result);
  }

  // 4) Master switch
  if (typeof AUTO_SMS_ENABLED === 'boolean' && !AUTO_SMS_ENABLED) {
    _markStatus(responsesSheet, rowIndex, colStatus, '[BLOCKED] AUTO_SMS_ENABLED=false');
    return _block('[SWITCH] AUTO_SMS_ENABLED=false', result);
  }

  // 5) PASS — provide details for downstream logging if you want them
  result.details = {
    schoolKey: school.key,
    configRow: school.rowIndex,
    ssId: ssId,
    dryRun: (typeof DRY_RUN === 'boolean' ? DRY_RUN : null)
  };
  return result;
}

/** Find the school row in Config by ssId and return key + Active flag. */
function _resolveSchoolBySsIdSa_(ssId) {
  var cfgUrl = (typeof getConfigSheetUrl_ === 'function') ? getConfigSheetUrl_() : (typeof CONFIG_SHEET_URL === 'string' ? CONFIG_SHEET_URL : '');
  if (!cfgUrl) throw new Error('Config URL not set.');
  var cfg = SpreadsheetApp.openByUrl(cfgUrl);
  var sh = cfg.getSheetByName('Schools') || cfg.getSheets()[0];

  var hm = getHeaderMap_Sa_(sh, ['ssId', 'School Key', 'Active']); // case-insensitive
  var cSsId = hm.col('ssId'), cKey = hm.col('School Key'), cActive = hm.col('Active');

  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) throw new Error('Config is empty.');
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var val = String(row[cSsId - 1] || '').trim();
    if (val === ssId) {
      return {
        key: String(row[cKey - 1] || '').trim(),
        activeY: String(row[cActive - 1] || '').trim(),
        rowIndex: i + 2
      };
    }
  }
  throw new Error('No school with matching ssId in Config.');
}

/** Helpers used by the guard (unchanged from earlier) */
function _cellString(v) { return String(v == null ? '' : v).trim(); }
function _markStatus(sheet, rowIndex, colStatus, msg) {
  try {
    var stamp = new Date();
    var val = msg + ' @ ' + Utilities.formatDate(stamp, Session.getScriptTimeZone() || 'Africa/Johannesburg', 'yyyy-MM-dd HH:mm:ss');
    sheet.getRange(rowIndex, colStatus).setValue(val);
  } catch (e) {
    Logger.log('[StatusWriteFail] row=%s col=%s msg=%s err=%s', rowIndex, colStatus, msg, e && e.message);
  }
}
function _block(reason, r) {
  r = r || {};
  r.blocked = true;
  r.reason = reason || 'blocked';
  Logger.log('[GUARD] ' + r.reason);
  return r;
}
