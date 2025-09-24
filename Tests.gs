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