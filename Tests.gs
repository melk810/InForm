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