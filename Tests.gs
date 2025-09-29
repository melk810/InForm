function testMask() {
  Logger.log(maskToken_('secret123'));
}

function testLogHelper() {
  logHelper('Testing log helper');
}

function testEnsurePrimary() {
  var ctx = { dataSheetUrl: '' }; // Fake context
  ensurePrimaryWorkbookInCtx_(ctx);
}

function testDoGetLog() {
  var params = { page: 'home', school: 'testSchool' }; // Fake params
  logHelper('START params=' + JSON.stringify(params));
}

function testDoGetVersionLog() {
  logHelper('doGet triggered – Code version: v5');
}

function testDoGetScriptUrlLog() {
  var scriptUrl = 'https://script.google.com/macros/s/abc123/exec'; // Fake URL
  logHelper('Script URL (absolute): ' + scriptUrl);
}

function testDoGetScriptIdLog() {
  logHelper('Project Script ID: ' + (typeof ScriptApp !== 'undefined' && ScriptApp.getScriptId ? ScriptApp.getScriptId() : 'n/a'));
}

function testDoGetParamsLog() {
  var page = 'home';
  var params = { clearCache: 'true', forcePick: '1', authuser: 'test@example.com' };
  logHelper(`page="${page}" clearCache="${params.clearCache}" forcePick="${params.forcePick}" authuser="${params.authuser || ''}"`);
}

function testDoGetTokenLog() {
  var tok = 'abc123xyz789';
  logHelper('Parent token (masked): ' + maskToken_(tok));
}

function testEnsurePrimaryErrorLog() {
  var e = { message: 'Test error' }; // Fake error
  logHelper('ensurePrimaryWorkbookInCtx_ error: ' + (e && e.message ? e.message : e));
}

function testPrimaryResolveErrorLog() {
  var e = { message: 'Test resolve error' }; // Fake error
  logHelper('Schools resolve failed: ' + (e && e.message ? e.message : e));
}

function testVerifySmsSecretsLog() {
  var usingProps = true; // Fake value
  logHelper('Using Script properties? ' + (usingProps ? 'YES' : 'FALLBACK'));
}

function testVerifySmsSecretsDetailsLog() {
  var cfg = { authUrl: 'http://test.auth', sendUrl: 'http://test.send', senderId: 'TEST', username: 'user123' };
  logHelper('AuthURL=' + cfg.authUrl + ' SendURL=' + cfg.sendUrl + ' SenderID=' + cfg.senderId + ' Username=' + maskToken_(cfg.username));
}

function testEchoLog() {
  logHelper('Echo route triggered');
}

function testDebugLog() {
  logHelper('Debug route triggered');
}

function testLoginLog() {
  logHelper('Rendering LOGIN page');
}

function testLogoutLog() {
  logHelper('Logout direct-render v1');
}

function testLogoutCacheLog() {
  var em = 'test@example.com'; // Fake email
  logHelper('Logout Cache cleared for: ' + (em || 'unknown'));
}

function testAuthGuardLog() {
  var page = 'home';
  logHelper('Not authenticated → rendering LOGIN instead of ' + page.toUpperCase());
}

function testIncidentsFiltersLog() {
  var opts = { days: 30, limit: 100 };
  logHelper('Incidents filters=' + JSON.stringify(opts));
}

function testIncidentsFallbackLog() {
  var errInc = { message: 'Test incidents error' };
  logHelper('Incidents Fallback Error: ' + (errInc && errInc.message ? errInc.message : errInc));
}

function testParentPageLog() {
  var rawPage = 'home';
  logHelper('Page parameter (raw): ' + rawPage);
}

function testContextLog() {
  var page = 'home';
  logHelper('Page parameter (resolved): ' + page);
}

function testContextFetchLog() {
  logHelper('Fetching user context…');
}

function testFreshCtxLog() {
  var ctx = { schoolName: 'TestSchool' };
  logHelper('ctx (fresh)=' + JSON.stringify(ctx));
}

function testScriptUrlErrorLog() {
  var eUrl = { message: 'Test URL error' };
  logHelper('scriptUrl resolution error: ' + (eUrl && eUrl.message ? eUrl.message : eUrl));
}

function testIncidentsScriptUrlLog() {
  var ctx = { scriptUrl: 'https://script.google.com/macros/s/abc123/exec' };
  logHelper('ctx.scriptUrl=' + (ctx.scriptUrl || '(blank)'));
}

function testSchoolsNotFoundLog() {
  logHelper('CONFIG.Schools not found.');
}

function testDomainMatchLog() {
  var url = 'https://docs.google.com/spreadsheets/d/123';
  logHelper('Using domain-matched primary: ' + url);
}

function testLoginSchoolLog() {
  var e = { parameter: { school: 'TestSchool' } };
  logHelper('Login captured school=' + e.parameter.school);
}

function testIncognitoLog() {
  logHelper('Incognito mode detected: trusting URL params for authentication.');
}

function testTrustedAuthuserLog() {
  var params = { authuser: 'test@example.com' };
  logHelper('Trusted authuser: ' + params.authuser);
}

function testLogoutCacheErrorLog() {
  var e1 = { message: 'Test cache error' };
  logHelper('Logout Cache clear error: ' + (e1 && e1.message ? e1.message : e1));
}

function testFinalScriptUrlLog() {
  var ctx = { scriptUrl: 'https://script.google.com/macros/s/abc123/exec' };
  logHelper('final scriptUrl=' + ctx.scriptUrl);
}

function testErrorHandler() {
  var e = { message: 'Test resolve error' };
  handleError_(e, 'Schools resolve failed');
}

function testEnsurePrimaryErrorHandler() {
  var e = { message: 'Test primary error' };
  handleError_(e, 'ensurePrimaryWorkbookInCtx_');
}

function testLogoutCacheErrorHandler() {
  var e1 = { message: 'Test cache error' };
  handleError_(e1, 'Logout Cache clear');
}

function testIncidentsFallbackErrorHandler() {
  var errInc = { message: 'Test incidents error' };
  handleError_(errInc, 'Incidents Fallback');
}

function testScriptUrlErrorHandler() {
  var eUrl = { message: 'Test URL error' };
  handleError_(eUrl, 'scriptUrl resolution');
}

function testWebAppBaseErrorHandler() {
  var e = { message: 'Test base error' };
  handleError_(e, 'getWebAppBase');
}

function testLoginSelfErrorHandler() {
  var e = { message: 'Test login self error' };
  handleError_(e, 'Login self-resolution');
}

function testSchoolCaptureErrorHandler() {
  var e = { message: 'Test school capture error' };
  handleError_(e, 'Login school capture');
}

function probe_ConfigCtxPlumbing() {
  const has_loadCtx = (typeof loadCtx_ === 'function');
  const has_buildUrl = (typeof buildUrl_ === 'function');
  const has_getExecUrl = (typeof getExecUrl_ === 'function');
  const has_readSchools = (typeof readSchoolsMapFromConfig_ === 'function');
  const has_ensurePrimary = (typeof ensurePrimaryWorkbookInCtx_ === 'function');
  const has_getConfigSheetUrl = (typeof getConfigSheetUrl_ === 'function');

  Logger.log(JSON.stringify({
    has_loadCtx,
    has_buildUrl,
    has_getExecUrl,
    has_readSchools,
    has_ensurePrimary,
    has_getConfigSheetUrl
  }, null, 2));
}

function probe_loadCtxBehavior() {
  if (typeof loadCtx_ !== 'function') {
    Logger.log('loadCtx_ not defined here.'); 
    return;
  }
  const cases = [
    { label: 'no school', params: {} },
    { label: 'with school=doornpoort', params: { school: 'doornpoort' } },
  ];
  cases.forEach(c => {
    try {
      const ctx = loadCtx_(c.params);
      Logger.log('CASE %s: %s', c.label, JSON.stringify({
        needsPick: !!ctx.needsPick,
        selectedSchoolKey: ctx.selectedSchoolKey,
        scriptUrl: ctx.scriptUrl,
        schoolName: ctx.schoolName,
        dataSheetUrl: ctx.dataSheetUrl
      }, null, 2));
    } catch (e) {
      Logger.log('CASE %s threw: %s', c.label, e);
    }
  });
}

/** Utility: safe substring search */
function __containsAny(html, needles) {
  html = String(html || '').toLowerCase();
  return needles.some(n => html.indexOf(String(n).toLowerCase()) >= 0);
}

/** Build a fake e.parameter object */
function __params(obj) {
  return { parameter: obj || {} };
}

/** Run me: probe_doGetWiring_ */
function probe_doGetWiring() {
  if (typeof doGet !== 'function') {
    Logger.log('doGet is not defined.');
    return;
  }

  const tests = [
    {
      label: 'A) incidents WITHOUT school → should render Login/picker',
      params: { page: 'incidents' },
      expectAny: ['login', 'pick a school', 'select school', 'school picker'] // loose match
    },
    {
      label: 'B) home WITH school=doornpoort → should render Home',
      params: { page: 'home', school: 'doornpoort' },
      expectAny: ['inform – staff portal', 'open incidents', 'welcome', 'home']
    },
    {
      label: 'C) incidents WITH school=doornpoort → should render Incidents',
      params: { page: 'incidents', school: 'doornpoort' },
      expectAny: ['incidents – inform', 'incidents', 'apply filters', 'download']
    }
  ];

  tests.forEach(t => {
    try {
      const e = __params(t.params);
      const out = doGet(e);
      // Support HtmlOutput or TextOutput
      const html = (typeof out.getContent === 'function') ? out.getContent() :
                   (typeof out.getBlob === 'function') ? out.getBlob().getDataAsString() :
                   String(out);

      const ok = __containsAny(html, t.expectAny);
      Logger.log('--- %s', t.label);
      Logger.log('Match? %s', ok ? 'YES ✅' : 'NO ❌');
      Logger.log('First 200 chars:\n%s', String(html).slice(0, 200).replace(/\s+/g, ' '));
    } catch (e) {
      Logger.log('--- %s threw: %s', t.label, e && e.message || e);
    }
  });
}

function listActiveSchoolKeys() {
  if (typeof readSchoolsMapFromConfig_ !== 'function') { Logger.log('Missing readSchoolsMapFromConfig_'); return; }
  const map = readSchoolsMapFromConfig_();
  const keys = Object.keys(map);
  Logger.log('Active schools (%s): %s', keys.length, JSON.stringify(keys));
  keys.forEach(k => Logger.log(' - %s → %s', k, map[k].schoolName));
}

function probe_doGet_with_DOORN1() {
  // Home with active key (may still gate to Login if your auth requires it)
  var home = doGet({ parameter: { page: 'home', school: 'DOORN1' } });
  Logger.log('HOME first 200:\n%s', (home.getContent?.()||home).toString().slice(0,200));

  // Incidents with active key + authuser triggers your “incognito mode”
  var inc = doGet({ parameter: { page: 'incidents', school: 'DOORN1', authuser: '1' } });
  Logger.log('INCIDENTS first 200:\n%s', (inc.getContent?.()||inc).toString().slice(0,200));
}

/**
 * Helper: try to obtain the Responses spreadsheet for a given school key.
 * Order: Config map → Script Properties override → Active spreadsheet (best-effort).
 */
function getResponsesSpreadsheetForKey(schoolKey) {
  schoolKey = String(schoolKey || '').trim();
  if (!schoolKey) throw new Error('getResponsesSpreadsheetForKey_: missing schoolKey');

  // 1) Config map (preferred)
  try {
    var map = readSchoolsMapFromConfig_(); // expected: { KEY: { ssId: '...', ... }, ... }
    if (map && map[schoolKey] && map[schoolKey].ssId) {
      return SpreadsheetApp.openById(map[schoolKey].ssId);
    }
  } catch (e) {
    Logger.log('[simulate] Config lookup failed: ' + e);
  }

  // 2) Script Properties override (easy testing)
  var props = PropertiesService.getScriptProperties();
  var overrideKey = 'TEST_SSID_' + schoolKey.toUpperCase();
  var testSsId = props.getProperty(overrideKey);
  if (testSsId) {
    try {
      return SpreadsheetApp.openById(testSsId);
    } catch (e2) {
      throw new Error('Script property ' + overrideKey + ' exists but openById failed. Check the ID.');
    }
  }

  // 3) As a last resort: if the active spreadsheet looks like the school & has the responses sheet
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getName && active.getName().toUpperCase().indexOf(schoolKey.toUpperCase()) !== -1) {
      if (active.getSheetByName(RESPONSES_SHEET_NAME)) {
        Logger.log('[simulate] Using active spreadsheet as fallback for key "%s".', schoolKey);
        return active;
      }
    }
  } catch (e3) {
    // ignore
  }

  // 4) Fail loudly with guidance
  throw new Error('simulate: No spreadsheet found for key "' + schoolKey + '". ' +
                  'Fix Config (map[KEY].ssId) OR set Script Property TEST_SSID_' +
                  schoolKey.toUpperCase() + ' to the Responses spreadsheet ID.');
}

/**
 * Diagnostic: log what your Config returns for each school key.
 */
function simulateDumpConfigSchoolMap() {
  var map = {};
  try { map = readSchoolsMapFromConfig_() || {}; } catch (e) {
    Logger.log('[diagnostic] readSchoolsMapFromConfig_ failed: ' + e);
    map = {};
  }
  var keys = Object.keys(map);
  if (!keys.length) {
    Logger.log('[diagnostic] Config map is empty. Ensure your Config sheet URL/permissions are correct.');
    return;
  }
  Logger.log('[diagnostic] Schools in Config: ' + keys.join(', '));
  keys.forEach(function (k) {
    var row = map[k] || {};
    Logger.log('[diagnostic] %s -> ssId=%s name=%s active=%s',
      k, row.ssId || '(missing)', row.name || '(n/a)', String(row.active || ''));
  });
}

/**
 * Convenience: set a Script Property TEST_SSID_<KEY> to your Responses spreadsheet ID.
 * Example: setTestResponsesSsIdForKey_('DOORN1', '1Re8lmRGbZhclQrBprVndJZOdIUiFY48X-uMqIVkyuDI');
 */
function setTestResponsesSsIdForKey_(schoolKey, ssId) {
  schoolKey = String(schoolKey || '').trim();
  if (!schoolKey || !ssId) throw new Error('Usage: setTestResponsesSsIdForKey_(key, ssId)');
  PropertiesService.getScriptProperties()
    .setProperty('TEST_SSID_' + schoolKey.toUpperCase(), ssId);
  Logger.log('Set TEST_SSID_%s to %s', schoolKey.toUpperCase(), ssId);
}

/**
 * Simulate a creation of an incident for learner "MAKWANE, Mmape"
 * and invoke the normal onIncidentFormSubmit(e) flow with a fake event.
 */
function simulateCreateIncidentForLearner_Makwane() {
  var TEST_SCHOOL_KEY = 'DOORN1';         // 🔑 adjust if needed
  var TEST_LEARNER    = 'MAKWANE, Mmape'; // 🧒 must match your contacts sheet
  var TEST_TEACHER    = 'KROUKAMP, E.';   // 👩‍🏫 format used in your sheet
  var TEST_NATURE_1   = 'Class Disruption';
  var TEST_NATURE_2   = 'Talking out of turn';

  // 0) Optional: dump what Config says (helps when debugging)
  // simulateDumpConfigSchoolMap_();

  // A) Get Responses spreadsheet for the key (robust fallback)
  var ss = getResponsesSpreadsheetForKey_(TEST_SCHOOL_KEY);
  var sheet = ss.getSheetByName(RESPONSES_SHEET_NAME);
  if (!sheet) throw new Error('simulate: Sheet "' + RESPONSES_SHEET_NAME + '" not found in ssId=' + ss.getId());

  // B) Read headers and prep a new row
  var lastCol  = sheet.getLastColumn();
  var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var newRow   = new Array(lastCol).fill('');

  // C) Column indices your pipeline uses
  var iTs      = findHeaderIndex_(headers, ['Timestamp']);
  var iLearner = findHeaderIndex_(headers, [COMBINED_LEARNER_COLUMN, 'Combined Learner']);
  var iTeacher = findHeaderIndex_(headers, ['Teacher Surname, Name', 'Teacher', 'Teacher Name']);
  var iNature1 = findHeaderIndex_(headers, ['Nature of Learner Misconduct', 'Nature of misconduct', 'Nature']);
  var iNature2 = findHeaderIndex_(headers, ['Other misconduct', 'Description of incident', 'Other / description']);
  var iSmsCol  = findHeaderIndex_(headers, [SMS_STATUS_COLUMN]);

  // D) Populate minimal fields
  if (iTs      >= 0) newRow[iTs]      = new Date();
  if (iLearner >= 0) newRow[iLearner] = TEST_LEARNER;
  if (iTeacher >= 0) newRow[iTeacher] = TEST_TEACHER;
  if (iNature1 >= 0) newRow[iNature1] = TEST_NATURE_1;
  if (iNature2 >= 0) newRow[iNature2] = TEST_NATURE_2;

  // E) Append row
  sheet.appendRow(newRow);
  var lastRow = sheet.getLastRow();

  // F) Ensure the handler can see the school context (no re-resolve later)
  try { if (typeof ctx === 'undefined') { ctx = {}; } ctx.selectedSchoolKey = TEST_SCHOOL_KEY; } catch (_) {}
  try { selectedSchoolKey = TEST_SCHOOL_KEY; } catch (_) {}

  // G) Build minimal fake event object your handler expects
  var fakeEvent = {
    range: {
      getSheet: function () { return sheet; },
      getRow:   function () { return lastRow; }
    },
    source: ss
  };

  Logger.log('[simulate] Appended test row %s on "%s" for key "%s". Now invoking onIncidentFormSubmit…',
             lastRow, RESPONSES_SHEET_NAME, TEST_SCHOOL_KEY);

  // H) Invoke your existing pipeline
  onIncidentFormSubmit(fakeEvent);

  // I) Report status after processing
  if (iSmsCol >= 0) {
    var status = sheet.getRange(lastRow, iSmsCol + 1).getDisplayValue();
    Logger.log('[simulate] Post-submit SMS status (row %s, col "%s"): %s',
               lastRow, SMS_STATUS_COLUMN, status || '(blank)');
  }
}

function debugWhichConfigSheet() {
  var cfgSs = SpreadsheetApp.openByUrl(getConfigSheetUrl_());
  var sh = cfgSs.getSheetByName('Config') || cfgSs.getSheets()[0];
  Logger.log('Config spreadsheet URL: ' + cfgSs.getUrl());
  Logger.log('Config sheet tab being read: ' + sh.getName());
  Logger.log('Headers: ' + sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].join(', '));
}

function _seedTestQueuedOutboxRow() {
  var sh = ensureOutboxSheetSa_();
  var now = new Date();
  sh.appendRow([
    now,
    'DOORN1',                 // schoolKey (use a real key from CONFIG.Schools)
    '+27721234567',           // to
    'Test incident SMS body', // body
    'QUEUED',                 // status
    '',                       // providerMessageId
    JSON.stringify({source:'unit-test'})
  ]);
  Logger.log('[Seed] Added QUEUED row.');
}
