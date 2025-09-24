// ========================================
// 🛠 GLOBAL CONFIGURATION
// ========================================
const INCIDENT_FORM_URL = 'https://forms.gle/M28ak7GxNJfVjbdT9';
const ATTENDANCE_FORM_URL = 'https://forms.gle/fNNBpW4m2T8oLCGf9';
const CONFIG_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Qw9ldT_Exn3CEGwe2O_G4qc2sCXkqHxARx4qnZKcVtk/edit';

// Logos (UI only)
const INFORM_LOGO_URL = 'https://drive.google.com/thumbnail?authuser=0&sz=w300&id=1djm8Sj95JkgxTh6fgGjjqnBD9q-bNdnc';

const COMBINED_LEARNER_COLUMN = 'Combined Learner';
const SMS_STATUS_COLUMN = 'Sent to Parent';
const RESPONSES_SHEET_NAME = 'Form Responses 1';
const CONTACT_SHEET_NAME = 'Learner Contacts';
const STATUS_SENT = 'SMS Sent';
const STATUS_FAILED_PREFIX = 'Failed - ';
const AUTO_SMS_ENABLED = true;
const SEND_ACK_LINK = true;
// Toggle: avoid shorteners for parent links (some SMS apps strip query params)
const PARENT_LINKS_USE_SHORTENER = true;
const MAX_SMS_LEN = 159;

// ===============================
// 👥 Per-school staff/roles
// ===============================
const STAFF_SHEET_NAME = 'Staff'; // tab name in each school's primary data spreadsheet

// ========================================
// 🧪 SMS TESTING TOGGLE (set to false for live sends)
// ========================================
const DRY_RUN = false; // true = no real SMS; logs only.  false = real SMS via UrlFetchApp.

// ===============================
// 🔖 Build stamp (surfaced in logs + HTML)
// ===============================
const BUILD = 'Incidents.v9-2025-09-19T08:55';

// --- Helper: pick the primary workbook URL from CONFIG 'Schools' sheet.
// Columns expected (case-insensitive header match):
//   School Name | Primary Spreadsheet URL | Domain (optional) | Active (Y/N)
// Strategy:
//   1) If a row has Active=Y -> return its Primary Spreadsheet URL.
//   2) Else, if your email domain matches 'Domain' -> return that row's URL.
//   3) Else, first non-empty Primary Spreadsheet URL.
function getPrimaryFromConfigSchools_() {
  try {
    const ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    const sh = ss.getSheetByName('Schools');
    if (!sh) {
      Logger.log('[PrimaryResolve] CONFIG.Schools not found.');
      return '';
    }
    const values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return '';
    const h = values[0];
    const idx = (names) => findHeaderIndex_(h, names);
    const iName    = idx(['School Name','School']);
    const iUrl     = idx(['Primary Spreadsheet URL','Primary Spreadsheet','Data Sheet URL']);
    const iDomain  = idx(['Domain','Email Domain']);
    const iActive  = idx(['Active','Enabled']);

    const myEmail  = (Session.getActiveUser().getEmail() || '').toLowerCase();
    const myDomain = myEmail.includes('@') ? myEmail.split('@')[1] : '';

    let firstNonEmpty = '';
    // pass 1: active = yes
    for (let r=1;r<values.length;r++){
      const url = iUrl>=0 ? String(values[r][iUrl]||'').trim() : '';
      if (!url) continue;
      if (!firstNonEmpty) firstNonEmpty = url;
      const active = iActive>=0 ? String(values[r][iActive]||'').toLowerCase() : '';
      if (active.startsWith('y') || active==='true') {
        Logger.log('[PrimaryResolve] Using Active=Y row for primary: ' + url);
        return url;
      }
    }
    // pass 2: match by domain
    if (myDomain) {
      for (let r=1;r<values.length;r++){
        const url = iUrl>=0 ? String(values[r][iUrl]||'').trim() : '';
        if (!url) continue;
        const dom = iDomain>=0 ? String(values[r][iDomain]||'').toLowerCase() : '';
        if (dom && dom===myDomain) {
          Logger.log('[PrimaryResolve] Using domain-matched primary: ' + url);
          return url;
        }
      }
    }
    // pass 3: first non-empty
    if (firstNonEmpty) {
      Logger.log('[PrimaryResolve] Using first non-empty primary: ' + firstNonEmpty);
      return firstNonEmpty;
    }
  } catch (e) {
    Logger.log('[PrimaryResolve] Schools resolve failed: ' + (e && e.message ? e.message : e));
  }
  return '';
}

/** Enables <?!= include('Styles'); ?> / <?!= include('Footer'); ?> in HTML */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- Safe setter: if ctx.dataSheetUrl still looks like CONFIG or is empty, override it.
function ensurePrimaryWorkbookInCtx_(ctx) {
  try {
    const looksLikeConfig = (ctx.dataSheetUrl||'') === CONFIG_SHEET_URL;
    const isMissing = !ctx.dataSheetUrl || !/\/spreadsheets\/d\//.test(ctx.dataSheetUrl);
    if (looksLikeConfig || isMissing) {
      const fromSchools = getPrimaryFromConfigSchools_();
      if (fromSchools) {
        ctx.dataSheetUrl = fromSchools;
        logHelper('Primary workbook in ctx: ' + ctx.dataSheetUrl);
      } else {
        Logger.log('[PrimaryResolve] Could not resolve primary from CONFIG.Schools');
      }
    } else {
      Logger.log('[PrimaryResolve] Primary workbook in ctx (pre-set): ' + ctx.dataSheetUrl);
    }
  } catch (e) {
    Logger.log('[PrimaryResolve] ensurePrimaryWorkbookInCtx_ error: ' + (e && e.message ? e.message : e));
  }
}

// ========================================
// 🔧 Small Utilities
function parseSpreadsheetId_(url) {
  if (!url) return '';
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(url).trim();
}

function removeTriggersByHandler_(handlerName) {
  const all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction && all[i].getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(all[i]);
    }
  }
}

function _toInt(val, def) {
  const n = parseInt(val, 10);
  return isNaN(n) ? def : n;
}

function _decode(s) {
  try { return decodeURIComponent(String(s || '')); } catch (e) { return String(s || ''); }
}

// Mask tok= query parameter inside URLs
function maskUrlToken_(url) {
  try {
    const s = String(url || '');
    if (!s) return '';
    return s.replace(/([?&]tok=)([^&#]+)/ig, (_, p1) => p1 + maskToken_(s.match(/(?:[?&]tok=)([^&#]+)/i)?.[1] || ''));
  } catch (_) { return ''; }
}

// Quick check: are we reading from Script properties?
function __verifySmsSecrets() {
  var cfg = getSmsConfig_(); // uses your existing helper
  var usingProps = (
    cfg.username !== (typeof SMS_SA_USERNAME === 'undefined' ? '' : SMS_SA_USERNAME) ||
    cfg.password !== (typeof SMS_SA_PASSWORD === 'undefined' ? '' : SMS_SA_PASSWORD) ||
    cfg.authUrl !== (typeof SMS_SA_AUTH_URL === 'undefined' ? '' : SMS_SA_AUTH_URL) ||
    cfg.sendUrl !== (typeof SMS_SA_SEND_SMS_URL === 'undefined' ? '' : SMS_SA_SEND_SMS_URL) ||
    cfg.senderId !== (typeof SMS_SA_DEFAULT_SENDER_ID === 'undefined' ? '' : SMS_SA_DEFAULT_SENDER_ID)
  );
  Logger.log('Using Script properties? ' + (usingProps ? 'YES' : 'FALLBACK'));
  Logger.log('AuthURL=%s  SendURL=%s  SenderID=%s  Username=%s',
    cfg.authUrl, cfg.sendUrl, cfg.senderId, maskToken_(cfg.username));
  return usingProps;
}

// ========================================
// ✅ USER DISPLAY NAME
function getUsername() {
  const email = (Session.getActiveUser().getEmail() || '');
  const namePart = email.split('@')[0];
  const parts = namePart.split('.');
  const toRemove = ['za', 'co', 'admin', 'staff', 'user'];
  const filtered = parts.filter(p => !toRemove.includes((p || '').toLowerCase()));
  const pretty = filtered.map(p => p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '').join(' ').trim();
  return pretty || 'User';
}

// ========================================
// 🔍 Case/space-insensitive header lookup
function findHeaderIndex_(headers, candidates) {
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const map = {};
  headers.forEach((h, i) => map[norm(h)] = i);
  for (const c of candidates) {
    const key = norm(c);
    if (map.hasOwnProperty(key)) return map[key];
  }
  return -1;
}

// ========================================
// Filters from URL params
function getFiltersFromParams_(e) {
  const p = e && e.parameter ? e.parameter : {};
  return {
    days: _toInt(p.days, 30),
    limit: _toInt(p.limit, 100),
    grade: _decode(p.grade),
    subject: _decode(p.subject),
    teacher: _decode(p.teacher),
    learner: _decode(p.learner),
    nature: _decode(p.nature),
  };
}

// ========================================
// 🌐 doGet – routing (echo first, then parent-force, with logs)
// ========================================
function doGet(e) {
    // 1) normalize incoming params
  var params = (e && e.parameter) ? e.parameter : {};
  var page   = String(params.page || 'home').toLowerCase();
  var school = params.school ? String(params.school) : '';
  var au     = params.authuser ? String(params.authuser) : '';

  // 2) initial ctx (if you do this early, that's fine)
  var ctx = (typeof getUserContext_ === 'function') ? getUserContext_() : {};

  // 3) TRUST URL FIRST on the initial ctx (harmless, keeps things consistent)
  if (school) ctx.selectedSchoolKey = school;
  if (au)     ctx.authuser          = au;

  // 4) capture trusted values from CURRENT request (not from ctx)
  var _trustedSchool = (params.school)   ? String(params.school)   : '';
  var _trustedAu     = (params.authuser) ? String(params.authuser) : '';

  // 5) rebuild ctx from your data stores
  ctx = getUserContext_(e);

  // 6) re-apply trusted URL values so they are not lost
  if (_trustedSchool) ctx.selectedSchoolKey = _trustedSchool;
  if (_trustedAu)     ctx.authuser          = _trustedAu;

  // (optional but typical) ensure scriptUrl for absolute links
  if (typeof ensureScriptUrlOnCtx_ === 'function') {
    ctx = ensureScriptUrlOnCtx_(ctx);
  }

  try {
        // 0) Params + early logs (reuse already-read params/page)
Logger.log('[doGet] START params=%s', JSON.stringify(params));

// Safe extract of optional token to avoid ReferenceError (declare ONCE)
var tok = params.tok ? String(params.tok) : '';
var rawPage = params.page ? String(params.page) : page;
page = (rawPage ? rawPage.toLowerCase().trim().replace(/\.$/, '') : page);

    // ──────────────────────────────────────────────────────────────
    // 1) Resolve URLs ONCE
    //    - baseUrl keeps your prior “relative-links” behavior (empty string)
    //    - scriptUrl is an absolute /exec for redirects (logout, etc.)
    // ──────────────────────────────────────────────────────────────
    var baseUrl = ''; // keep relative links default
    var scriptUrl = '';
    try {
      if (typeof getWebAppUrl_ === 'function') {
        scriptUrl = getWebAppUrl_();  // normalized to /exec in your helper
      } else if (ScriptApp && ScriptApp.getService) {
        scriptUrl = ScriptApp.getService().getUrl() || '';
      }
    } catch (eUrl) {
      Logger.log('[doGet] scriptUrl resolution error: ' + (eUrl && eUrl.message ? eUrl.message : eUrl));
    }
    Logger.log('doGet triggered – Code version: v5');
    Logger.log('Project Script ID: ' + (typeof ScriptApp !== 'undefined' && ScriptApp.getScriptId ? ScriptApp.getScriptId() : 'n/a'));
    Logger.log('Script URL (absolute): ' + scriptUrl);
    Logger.log(`[doGet] page="${page}" clearCache="${params.clearCache}" forcePick="${params.forcePick}" authuser="${params.authuser || ''}"`);
    if (tok) Logger.log('[doGet] Parent token (masked): ' + maskToken_(tok));

    // ──────────────────────────────────────────────────────────────
    // 2) HARD DIAGNOSTICS (return early)
    // ──────────────────────────────────────────────────────────────
    if (params.__ping === '1') {
      return HtmlService.createHtmlOutput('<pre>pong ' + new Date() + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (params.__home_min === '1') {
      var p = params || {};
      var htmlMin =
        '<!doctype html><html><head><meta charset="utf-8"/>' +
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
        '<title>Home MIN</title>' +
        '<style>body{font-family:Arial;padding:20px;background:#f6f8fb;color:#222}</style>' +
        '</head><body>' +
        '<h2>Home Minimal OK</h2>' +
        '<h3>Params</h3><pre>' + JSON.stringify(p, null, 2).replace(/</g,'&lt;') + '</pre>' +
        '</body></html>';
      return HtmlService.createHtmlOutput(htmlMin)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // ──────────────────────────────────────────────────────────────
    // 3) Routes that do NOT need ctx → return early
    //    (echo/debug/login/logout)
    // ──────────────────────────────────────────────────────────────
    if (page === 'echo') {
      Logger.log('[Echo] route triggered');
      return echoContextJson_(e);
    }

    if (page === 'debug') {
      Logger.log('Debug route triggered');
      const body = '<h3>Request parameters</h3><pre style="white-space:pre-wrap;">'
        + JSON.stringify(params, null, 2) + '</pre>';
      return HtmlService.createHtmlOutput(body)
        .setTitle('InForm – Echo')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

   // ===== A) LOGIN PAGE (SWAPPED TO renderPage_) =================
if (page === 'login') {
  Logger.log('Rendering LOGIN page');
  const authuserQS = (e && e.parameter && e.parameter.authuser)
    ? `&authuser=${encodeURIComponent(e.parameter.authuser)}`
    : '';

  const signinUrl = 'https://accounts.google.com/AccountChooser?continue=' +
    encodeURIComponent(scriptUrl + '?page=login&clearCache=true&forcePick=1' + authuserQS);

  let canonicalBase = '';
  try { canonicalBase = getWebAppBase(); } catch (_) {}

  // ✅ NEW (Patch C): if a school is explicitly provided, remember it immediately
  try {
    if (e && e.parameter && e.parameter.school) {
      var em = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';
      if (em) {
        PropertiesService.getUserProperties()
          .setProperty('lastSchoolKey:' + em, String(e.parameter.school).trim());
        Logger.log('[Login] captured school=' + e.parameter.school);
      }
    }
  } catch (_) {}

  // ✅ Give Login.html the same variables Logout.html receives
  const redirect = signinUrl;
  const safeRedirect = JSON.stringify(redirect);

  // 🔁 renderPage_ with the added fields (unchanged)
  return renderPage_('login', {
    signinUrl:    signinUrl,
    redirect:     redirect,      // ✅
    safeRedirect: safeRedirect,  // ✅
    baseUrl:      canonicalBase || baseUrl,
    publicUrl:    scriptUrl
  });
}

// ===== LOGOUT (direct render: clear cache → render login page) =====
if (page === 'logout') {
  Logger.log('[Logout] direct-render v1');

  // 1) Clear any server-side user context (safe if no email)
  try {
    const cache = CacheService.getScriptCache();
    const em = (Session.getActiveUser().getEmail() || '').toLowerCase();
    if (em) cache.remove('userCtx:' + em);
    cache.remove('userCtx:unknown');
    Logger.log('[Logout] Cache cleared for: ' + (em || 'unknown'));
  } catch (e1) {
    Logger.log('[Logout] Cache clear error: ' + (e1 && e1.message ? e1.message : e1));
  }

  // 2) Use the exact deployment URL already resolved earlier in doGet
  //    (you have `scriptUrl` defined above this block in your doGet)
  var loginSelf = (scriptUrl || '');
  try { loginSelf = (loginSelf.split('?')[0] || '') + '?page=login&clearCache=true&forcePick=1'; } catch (_) {}

  Logger.log('[Logout] rendering login directly (no redirect). loginSelf=' + loginSelf);

  // 3) Render the Login page immediately (same values your login route provides)
  return renderPage_('login', {
    signinUrl:     loginSelf,                 // if your template uses it
    redirect:      loginSelf,                 // if your template uses it
    safeRedirect:  JSON.stringify(loginSelf), // if your template uses it
    baseUrl:       (typeof getWebAppBase === 'function' ? (getWebAppBase() || '') : '') || '', 
    publicUrl:     scriptUrl,
    scriptUrl:     scriptUrl,
    forcePick:     1
  }).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

    // ──────────────────────────────────────────────────────────────
    // 4) Parent “forced” page fallback BEFORE ctx
    // ──────────────────────────────────────────────────────────────
    if (!page && tok) page = 'parent';
    if (!page) page = 'home';
    Logger.log('Page parameter (raw): ' + rawPage);
    Logger.log('Page parameter (resolved): ' + page);

        // 5) Build ctx ONCE (merge with trusted URL values from CURRENT request)
Logger.log('[doGet] Fetching user context…');
// ✅ FIX: Capture trusted values from CURRENT request parameters, NOT from stale 'ctx'
var _trustedSchool = (params.school) ? String(params.school) : '';
var _trustedAu     = (params.authuser) ? String(params.authuser) : '';
ctx = getUserContext_(e);  // get fresh context from your store
Logger.log('[doGet] ctx (fresh)=' + JSON.stringify(ctx));
// Re-apply trusted URL values so we don't lose them
if (_trustedSchool) ctx.selectedSchoolKey = _trustedSchool;
if (_trustedAu)     ctx.authuser          = _trustedAu;

    ensurePrimaryWorkbookInCtx_(ctx);

    ctx = ensureScriptUrlOnCtx_(ctx);
Logger.log('[doGet] final scriptUrl=' + ctx.scriptUrl);

        // 🔑 Ensure ctx.selectedSchoolKey is always resolved and remembered (without wiping a good value)
var __preKey = ctx && ctx.selectedSchoolKey ? String(ctx.selectedSchoolKey) : '';
ctx = resolveSelectedSchoolKey_(ctx, e);   // keep your existing function/signature
if (!ctx) ctx = {};
if (__preKey && !ctx.selectedSchoolKey) {
  // Resolver didn’t find a key; keep the one we trusted earlier (from URL/auth)
  ctx.selectedSchoolKey = __preKey;
}

    // (Optional) Normalize a boolean to avoid surprises
    if (typeof ctx.authenticated !== 'boolean') {
      ctx.authenticated = !!(ctx && ctx.email);
    }

// ──────────────────────────────────────────────────────────────
// 6) AUTH GUARD (now legal to reference ctx)
// ──────────────────────────────────────────────────────────────
// ✅✅✅ PATCH FOR INCOGNITO MODE: Trust URL params for incidents page
if (page === 'incidents') {
  const hasSchool = !!params.school;
  const hasAuthUser = !!params.authuser;
  // If both school and authuser are in the URL, assume the user is authenticated
  // This is safe because the Home page (which requires full auth) generated the link.
  if (hasSchool && hasAuthUser) {
    Logger.log('Incognito mode detected: trusting URL params for authentication.');
    ctx.authenticated = true;
    // Optional: Log the trusted user for auditing
    Logger.log('Trusted authuser: ' + params.authuser);
  }
}

if ((page === 'home' || page === 'incidents' || page === 'report' || page === 'csv') && !ctx.authenticated) {
  Logger.log('Not authenticated → rendering LOGIN instead of ' + page.toUpperCase());
  const authuserQS = (e && e.parameter && e.parameter.authuser)
    ? `&authuser=${encodeURIComponent(e.parameter.authuser)}`
    : '';
  const signinUrl = 'https://accounts.google.com/AccountChooser?continue=' +
    encodeURIComponent(scriptUrl + '?page=login&clearCache=true' + authuserQS);
  let canonicalBase2 = '';
  try { canonicalBase2 = getWebAppBase(); } catch (_) {}
  // ✅ Provide what Login.html expects
  const redirect = signinUrl;
  const safeRedirect = JSON.stringify(redirect);
  // ===== B) AUTH GUARD LOGIN (SWAPPED TO renderPage_) =========
  return renderPage_('login', {
    signinUrl:    signinUrl,
    redirect:     redirect,      // ✅
    safeRedirect: safeRedirect,  // ✅
    baseUrl:      canonicalBase2 || baseUrl,
    publicUrl:    scriptUrl
  });
}

// ──────────────────────────────────────────────────────────────
// 7) Staff routes (need ctx)
// ──────────────────────────────────────────────────────────────
if (page === 'incidents') {
  const opts = getFiltersFromParams_(e);
  Logger.log('[Incidents] filters=%s', JSON.stringify(opts));
  Logger.log('[Router] calling showIncidentsPage');

  // ✅ Ensure we pass a clean absolute base to the template (no query)
  ctx.scriptUrl = (ctx && ctx.scriptUrl) || (ScriptApp.getService().getUrl() || '').split('?')[0];
  Logger.log('[Incidents] ctx.scriptUrl=%s', ctx.scriptUrl || '(blank)');

  try {
    // If you have a custom renderer, use it; otherwise the try/catch falls back.
    return showIncidentsPage(ctx.scriptUrl, ctx, opts)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (errInc) {
    Logger.log('[Incidents Fallback] Error: ' + (errInc && errInc.message ? errInc.message : errInc));

    // ✅ Fallback renders your Incidents.html with *exact* names your template needs
const t = HtmlService.createTemplateFromFile('Incidents');

t.schoolName  = ctx.schoolName  || 'School';
t.schoolLogo  = ctx.schoolLogo  || '';
t.schoolColor = ctx.schoolColor || '#1a73e8';
// 🔧 ensure legacy scriptUrl is ALWAYS a clean /exec base (no query) with safe fallback
t.scriptUrl = (
  ctx && ctx.scriptUrl ? String(ctx.scriptUrl) : (ScriptApp.getService().getUrl() || '')
).split('?')[0];

t.filters = {
  days:    _toInt(opts && opts.days, 30),
  limit:   _toInt(opts && opts.limit, 100),
  grade:   (opts && opts.grade)   || '',
  subject: (opts && opts.subject) || '',
  teacher: (opts && opts.teacher) || '',
  learner: (opts && opts.learner) || '',
  nature:  (opts && opts.nature)  || ''
};

t.summary   = {
  days: t.filters.days, totalInWindow: 0, today: 0, last7: 0, ytdTotal: 0,
  topSubjects: [], topLearners: [], topNatures: [], byGrade: []
};

t.incidents = []; // template tolerates empty

// ✅ legacy var so Incidents.html can do <?= selectedSchoolKey ?> without ctx.*
t.selectedSchoolKey = (ctx && ctx.selectedSchoolKey) || '';

//return t.evaluate()
  //.setTitle('Incidents – InForm (Fallback)')
  //.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  
  var out = t.evaluate();
  var m = out.getContent().match(/<title>([^<]*)<\/title>/i);
  out.setTitle(m ? m[1] : 'Incidents – InForm');  // same fallback
  return out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

    if (page === 'report') {
  const opts = getFiltersFromParams_(e);
  const base = (ScriptApp.getService().getUrl() || '').split('?')[0];
  ctx.scriptUrl = base; // keep ctx consistent
  Logger.log('Rendering report page base=' + base);
  return renderReportCreationPage_(base, ctx, opts)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

if (page === 'csv') {
  const opts = getFiltersFromParams_(e);
  const base = (ScriptApp.getService().getUrl() || '').split('?')[0];
  ctx.scriptUrl = base;
  Logger.log('Rendering CSV page base=' + base);
  return renderCsvReportPage_(base, ctx, opts)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

    // ──────────────────────────────────────────────────────────────
    // 8) Parent routes (some need ctx + tok)
    // ──────────────────────────────────────────────────────────────
    if (page === 'ack') {
      const ackTok = params.tok ? String(params.tok) : '';
      const ackRow = (params.row) ? parseInt(params.row, 10) : NaN;

      Logger.log('ACK route: tok=' + maskToken_(ackTok) + ' row=' + ackRow);

      var msg = '';
      try {
        if (!ackTok || !ackRow || !isFinite(ackRow) || ackRow < 2) {
          msg = 'Invalid request';
        } else {
          var res = parentAcknowledgeIncident_(ackTok, ackRow);
          Logger.log('ACK route result: ' + JSON.stringify(res));
          msg = (res && res.ok) ? 'Acknowledged' : ('Failed' + (res && res.reason ? (': ' + res.reason) : ''));
        }
      } catch (errAck) {
        Logger.log('ACK route error: ' + (errAck && errAck.message ? errAck.message : errAck));
        msg = 'Error';
      }

      var backUrl = buildParentPortalUrl_(ackTok);
      var htmlAck = `
        <!DOCTYPE html><html><head><meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>${msg}</title>
        
        <style>body{font-family:Arial;padding:24px;text-align:center;color:#333}</style>
        </head><body>
          <h3>${msg}</h3>
          <p>Returning to the learner page…</p>
          <script>setTimeout(function(){ try{ window.top.location.href=${JSON.stringify(backUrl)}; }catch(_){ location.href=${JSON.stringify(backUrl)}; } }, 800);</script>
          
        </body></html>`;
      Logger.log('Rendering ACK page');
      return HtmlService.createHtmlOutput(htmlAck)
        .setTitle('InForm – Acknowledgement')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (page === 'parent_dl') {
      Logger.log('Parent DL route (stub) started with tok: ' + maskToken_(tok));
      const backUrl = buildParentPortalUrl_(tok || '');
      const htmlDl = `
        <!DOCTYPE html><html><head>
         <meta charset="utf-8"/>
         <meta name="viewport" content="width=device-width, initial-scale=1"/>
         <title>Download not available</title>
         
         <style>
            body{font-family:Arial;padding:24px;text-align:center;color:#333}
            .btn{display:inline-block;margin-top:14px;padding:8px 14px;border:1px solid #bbb;border-radius:8px;text-decoration:none;color:#333}
            .muted{color:#777;margin-top:8px}
         </style>
        </head><body>
          <h2>🛠 Download not available yet</h2>
          <p>This feature is being finalised. You can still view incidents on the portal.</p>
          <p><a class="btn" href="${backUrl}" target="_top">← Back to learner page</a></p>
          <div class="muted">If this link shows a 403, it’s a permissions setting — see notes.</div>
          
        </body></html>
      `;
      return HtmlService.createHtmlOutput(htmlDl)
        .setTitle('InForm – Download')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (page === 'parent') {
      Logger.log('Parent route triggered');
      const pctx = getParentContextByToken_(tok);
      Logger.log('Parent context: ' + JSON.stringify({ ok: pctx.ok, learner: pctx.learner, grade: pctx.grade, sourceUrl: pctx.sourceUrl || '' }));

      const opts = getFiltersFromParams_(e);
      opts.days = _toInt(opts.days, 30);
      Logger.log('Parent page filters: ' + JSON.stringify(opts));

      if (!pctx.ok) {
        Logger.log('Invalid parent token, rendering error page');
        const msg = '<h2>❌ Invalid or expired link</h2><p>Please contact the school to request a new parent portal link.</p>';
        return HtmlService.createHtmlOutput(msg)
          .setTitle('InForm – Parent Portal')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }

      Logger.log('Rendering parent page');
      return renderParentPage_(scriptUrl, ctx, pctx, opts)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // ──────────────────────────────────────────────────────────────
    // 9) Staff HOME (needs ctx)
    // ──────────────────────────────────────────────────────────────
    Logger.log('Rendering staff home page');
    try {
      // Prepare the same values you previously injected
      const schoolColor = ctx.schoolColor || '#1a73e8';
      const schoolLogo  = ctx.schoolLogo  || '';
      const getUsername = function () { return (ctx.email || '').split('@')[0]; };
      const userDisplayName = (ctx && ctx.userDisplayName) ? ctx.userDisplayName : getUsername();

      // ===== C) HOME RENDER (SWAPPED TO renderPage_) ===============
      return renderPage_('home', {
        ctx: ctx,
        baseUrl: baseUrl,
        publicUrl: ctx.scriptUrl,
        scriptUrl: ctx.scriptUrl,     // alias for templates that expect `scriptUrl`
        schoolName: ctx.schoolName,   // alias if Home uses bare `schoolName`
        schoolColor: schoolColor,
        schoolLogo:  schoolLogo,
        getUsername: getUsername,
        userDisplayName: userDisplayName
        // If your Home template expects `publicUrl`, you can add:
        // publicUrl: scriptUrl
      });

    } catch (tplErr) {
      Logger.log('Home template error/fallback: ' + tplErr);
      const htmlFallback = `
        <!DOCTYPE html><html><head><meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>InForm – Home (Fallback)</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;padding:24px;background:#f5f7fb;color:#222}
          .btn{display:inline-block;margin-top:10px;padding:10px 14px;border:1px solid #bbb;border-radius:10px;text-decoration:none;color:#1a73e8}
          .muted{color:#777;margin-top:8px}
          .card{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08);padding:20px}
          code{background:#f6f8fa;padding:2px 6px;border-radius:6px}
        </style>
        </head><body>
          <div class="card">
            <h2>InForm – Staff Home (Fallback)</h2>
            <p>This is a safe fallback. If you see this, <code>Home.html</code> is missing or has a template error.</p>
            <p><a class="btn" href="?page=home&diag=1">Open Home Diagnostic</a></p>
            <p class="muted">Tip: ensure a file named <code>Home</code> exists in your Apps Script project and renders HTML.</p>
          </div>
        </body></html>`;
      return HtmlService.createHtmlOutput(htmlFallback)
        .setTitle('InForm – Home')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

  } catch (err) {
    Logger.log('Error in doGet: ' + (err && err.message ? err.message : err));
    try { console.error('doGet failed:', err); } catch (_) {}
    return HtmlService.createHtmlOutput('<h2>❌ Error loading page</h2><p>' + (err && err.message ? err.message : err) + '</p>')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}
//End of doGet

// ========================================
// Data reads & summaries
function getIncidents_(sheetUrl, opts) {
  try {
    // ──────────────────────────────────────────────────────────────
    // 0) Open workbook + pick sheet (with loud diagnostics)
    // ──────────────────────────────────────────────────────────────
    Logger.log('[Incidents] ➜ Reading from workbook: %s', sheetUrl || '(blank!)');
    const dataSS = SpreadsheetApp.openByUrl(sheetUrl);

    // Prefer the configured tab; fall back to any sheet with a "Timestamp" header
    let logSheet = dataSS.getSheetByName(RESPONSES_SHEET_NAME);
    Logger.log('[Incidents] Configured sheet present? %s', !!logSheet);
    if (!logSheet) {
      const sheets = dataSS.getSheets();
      for (var i = 0; i < sheets.length; i++) {
        const sh = sheets[i];
        const maxCols = Math.max(1, sh.getLastColumn());
        const headers = sh.getRange(1, 1, 1, maxCols).getDisplayValues()[0].map(String);
        if (headers.some(h => String(h || '').trim().toLowerCase() === 'timestamp')) {
          logSheet = sh;
          Logger.log('[Incidents] Using fallback sheet: %s', sh.getName());
          break;
        }
      }
    }
    if (!logSheet) {
      Logger.log('[Incidents] ❌ No sheet found (neither "%s" nor any with a Timestamp header).', RESPONSES_SHEET_NAME);
      return [];
    }
    Logger.log('[Incidents] Using sheet: %s', logSheet.getName());

    // ──────────────────────────────────────────────────────────────
    // 1) Read values + indices (support both Timestamp and Incident Date)
    // ──────────────────────────────────────────────────────────────
    const values = logSheet.getDataRange().getValues();
    if (!values || values.length < 2) {
      Logger.log('[Incidents] Sheet empty (no data rows).');
      return [];
    }

    const h = values[0];
    const idx = (names) => findHeaderIndex_(h, names);
    const iTimestamp   = idx(['Timestamp']);
    const iIncidentDate= idx(['Incident Date','Date','Date/Time','Date Time']);
    Logger.log('[Incidents] Header indices: Timestamp=%s, IncidentDate=%s', iTimestamp, iIncidentDate);
    const iLearner = idx([COMBINED_LEARNER_COLUMN, 'Combined Learner']);
    const iGrade   = idx(['Learner Grade', 'Grade']);
    const iSubject = idx(['Subject']);
    const iTeacher = idx(['Teacher Surname, Name', 'Teacher', 'Teacher Name']);
    const iNature1 = idx(['Nature of Learner Misconduct', 'Nature of learner misconduct', 'Nature of misconduct', 'Nature']);
    const iNature2 = idx(['Other misconduct and/or description of incident', 'Other misconduct', 'Description of incident', 'Other / description']);
    Logger.log('[Incidents] Indices: learner=%s grade=%s subject=%s teacher=%s nature1=%s nature2=%s',
      iLearner, iGrade, iSubject, iTeacher, iNature1, iNature2);

    // ──────────────────────────────────────────────────────────────
    // 2) Cutoff window
    // ──────────────────────────────────────────────────────────────
    const days = parseInt((opts && opts.days), 10) || 30;
    const limit = parseInt((opts && opts.limit), 10) || 100;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    Logger.log('[Incidents] Cutoff=%s (days=%s, limit=%s)', cutoff.toISOString(), days, limit);

    // ──────────────────────────────────────────────────────────────
    // 3) Scan rows → apply date fallback + filters + build rows
    // ──────────────────────────────────────────────────────────────
    const out = [];
    let scanned = 0, kept = 0, skippedOld = 0, skippedBadDate = 0, skippedFilter = 0;

    // helper: simple case-insensitive contains
    const like = (needle, hay) => {
      if (!needle) return true;
      return String(hay || '').toLowerCase().includes(String(needle).toLowerCase());
    };

    for (let r = 1; r < values.length; r++) {
      scanned++;
      const row = values[r];

      // Date fallback: prefer Timestamp; if blank/invalid, try Incident Date
      let ts = null;
      if (iTimestamp >= 0 && row[iTimestamp])     ts = new Date(row[iTimestamp]);
      if ((!ts || isNaN(ts.getTime())) && iIncidentDate >= 0 && row[iIncidentDate]) ts = new Date(row[iIncidentDate]);
      if (!ts || isNaN(ts.getTime())) { if (skippedBadDate < 5) Logger.log('[Incidents] Skip row %s: invalid date. Raw Timestamp="%s" IncidentDate="%s"', r+1, row[iTimestamp], (iIncidentDate>=0?row[iIncidentDate]:'(n/a)')); skippedBadDate++; continue; }
      if (ts < cutoff) { skippedOld++; continue; }

      const learner = iLearner >= 0 ? (row[iLearner] || 'Unknown Learner') : 'Unknown Learner';
      const grade   = iGrade   >= 0 ? (row[iGrade]   || 'N/A')             : 'N/A';
      const subject = iSubject >= 0 ? (row[iSubject] || 'N/A')             : 'N/A';
      const teacher = iTeacher >= 0 ? (row[iTeacher] || 'N/A')             : 'N/A';
      const n1 = iNature1 >= 0 ? String(row[iNature1] || '') : '';
      const n2 = iNature2 >= 0 ? String(row[iNature2] || '') : '';
      const combinedNature = [n1, n2].filter(s => s.trim() !== '').join(' — ').trim();

      // filters
      if (opts && opts.learner && !like(opts.learner, learner)) { skippedFilter++; continue; }
      if (opts && opts.subject && !like(opts.subject, subject)) { skippedFilter++; continue; }
      if (opts && opts.teacher && !like(opts.teacher, teacher)) { skippedFilter++; continue; }
      if (opts && opts.nature  && !like(opts.nature,  combinedNature)) { skippedFilter++; continue; }
      if (opts && opts.grade   && String(grade).toLowerCase() !== String(opts.grade).toLowerCase()) { skippedFilter++; continue; }

      const dateStr = ts.toLocaleDateString('en-ZA');
      out.push([ts, dateStr, learner, grade, subject, teacher, combinedNature || 'N/A']);
      kept++;
      if (kept <= 3) Logger.log('[Incidents] Kept row %s: %s | %s | %s | %s | %s', r+1, dateStr, learner, grade, subject, (combinedNature || 'N/A'));
    }

    Logger.log('[Incidents] scan=%s kept=%s skippedOld=%s skippedBadDate=%s skippedFilter=%s',
      scanned, kept, skippedOld, skippedBadDate, skippedFilter);

    // ──────────────────────────────────────────────────────────────
    // 4) Sort newest→oldest, limit, and drop the raw Date before returning
    // ──────────────────────────────────────────────────────────────
    out.sort((a, b) => b[0] - a[0]);
    return out.slice(0, limit).map(r => r.slice(1)); // [dateStr, learner, grade, subject, teacher, nature]
  } catch (e) {
    Logger.log('getIncidents_ failed: ' + (e && e.message ? e.message : e));
    try { console.error('getIncidents_ failed:', e); } catch (_) {}
    return [];
  }
}

//18Sept2025-2
/** Renders Home.html and provides ctx.* that your Home uses */
/*function renderHome_(e) {
  var t = HtmlService.createTemplateFromFile('Home');

  // TODO: wire these to your existing values (or keep the placeholders for now)
  t.ctx = {
    schoolName:       'Your School',
    schoolLogo:       '',                // optional logo URL
    schoolColor:      '#1a73e8',
    scriptUrl:        ScriptApp.getService().getUrl(), // <-- lets links work in /dev and /exec
    incidentFormUrl:  'https://docs.google.com/forms/d/.../viewform',
    attendanceFormUrl:'https://docs.google.com/forms/d/.../viewform',
    role:             'Manager'          // or 'Teacher' (however you derive the role)
  };

  // Your Home.html also uses this:
  t.userDisplayName = 'Melanie';         // plug your user value here

  return t.evaluate()
           .setTitle('InForm – Staff Portal')
           .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}*/

/** Optional: simple logout page */
/*function renderLogout_(e) {
  var tmp = HtmlService.createTemplate('<html><body style="font-family:Arial;padding:24px;"><h3>Logged out</h3><p>You have been signed out.</p><p><a href="<?= url ?>">Return to Home</a></p></body></html>');
  tmp.url = ScriptApp.getService().getUrl() + '?page=home';
  return tmp.evaluate();
}*/
//end

function getIncidentsSummary_(sheetUrl, opts) {
  const days = _toInt(opts && opts.days, 30);
  const summary = {
    days,
    totalInWindow: 0,
    today: 0,
    last7: 0,
    ytdTotal: 0,
    topSubjects: [],
    topLearners: [],
    topNatures: [],
    byGrade: []
  };

  try {
    const dataSS = SpreadsheetApp.openByUrl(sheetUrl);
    const logSheet = dataSS.getSheetByName(RESPONSES_SHEET_NAME);
    if (!logSheet) return summary;
    const values = logSheet.getDataRange().getValues();
    if (!values || values.length < 2) return summary;
    const h = values[0];
    const iTs = findHeaderIndex_(h, ['Timestamp']);
    const iLearner = findHeaderIndex_(h, [COMBINED_LEARNER_COLUMN, 'Combined Learner']);
    const iGrade = findHeaderIndex_(h, ['Learner Grade', 'Grade']);
    const iSubject = findHeaderIndex_(h, ['Subject']);
    const iNature1 = findHeaderIndex_(h, ['Nature of Learner Misconduct', 'Nature of learner misconduct', 'Nature of misconduct', 'Nature']);
    const iNature2 = findHeaderIndex_(h, ['Other misconduct and/or description of incident', 'Other misconduct', 'Description of incident', 'Other / description']);
    const now = new Date();
    const start = new Date(); start.setDate(now.getDate() - days);
    const start7 = new Date(); start7.setDate(now.getDate() - 7);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const ytdStart = new Date(now.getFullYear(), 0, 1);
    const count = (map, key) => { const k = String(key || 'N/A'); map[k] = (map[k] || 0) + 1; };
    const subjMap = {}, learnerMap = {}, gradeMap = {}, natureMap = {};
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const ts = iTs >= 0 ? new Date(row[iTs]) : null;
      if (!ts || isNaN(ts.getTime())) continue;
      if (ts >= ytdStart) summary.ytdTotal++;
      if (ts < start) continue;

      summary.totalInWindow++;
      const d0 = new Date(ts); d0.setHours(0, 0, 0, 0);
      if (d0.getTime() === today.getTime()) summary.today++;
      if (ts >= start7) summary.last7++;

      const subject = iSubject >= 0 ? (row[iSubject] || 'N/A') : 'N/A';
      const learner = iLearner >= 0 ? (row[iLearner] || 'Unknown Learner') : 'Unknown Learner';
      const grade = iGrade >= 0 ? (row[iGrade] || 'N/A') : 'N/A';

      const n1 = iNature1 >= 0 ? String(row[iNature1] || '') : '';
      const n2 = iNature2 >= 0 ? String(row[iNature2] || '') : '';
      const combinedNature = [n1, n2].filter(s => s.trim() !== '').join(' — ').trim() || 'N/A';

      count(subjMap, subject);
      count(learnerMap, learner);
      count(gradeMap, grade);
      count(natureMap, combinedNature);
    }
    const toPairs = (m) => Object.keys(m).map(k => [k, m[k]]).sort((a, b) => b[1] - a[1]);
    summary.topSubjects = toPairs(subjMap).slice(0, 5);
    summary.topLearners = toPairs(learnerMap).slice(0, 5);
    summary.topNatures = toPairs(natureMap).slice(0, 5);
    summary.byGrade = toPairs(gradeMap).slice(0, 3);
  } catch (e) {
    try { console.error('getIncidentsSummary_ failed:', e); } catch (_) {}
    Logger.log('getIncidentsSummary_ failed: ' + (e && e.message ? e.message : e));
  }
  return summary;
}

// ========================================
// 📄 REPORT (PDF)
function renderReportCreationPage_(baseUrl, ctx, opts) {
  try {
    if (!ctx.dataSheetUrl) {
      return HtmlService.createHtmlOutput('<h2>❌ Access denied</h2><p>No data sheet configured for this user.</p>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Build summary + rows + PDF (unchanged)
    const summary   = getIncidentsSummary_(ctx.dataSheetUrl, opts);
    const incidents = getIncidents_(ctx.dataSheetUrl, opts);
    const pdfFile   = buildIncidentsReportPdf_(ctx, opts, summary, incidents);

    // Direct Drive download URL
    const dl = 'https://drive.google.com/uc?export=download&id=' + pdfFile.getId();

    // Preserve filters for "Back" link
    const q = v => encodeURIComponent(v || '');
    const backQS = `?page=incidents&days=${q(opts.days)}&limit=${q(opts.limit)}&grade=${q(opts.grade)}&subject=${q(opts.subject)}&teacher=${q(opts.teacher)}&learner=${q(opts.learner)}&nature=${q(opts.nature)}`;

    // Build absolute URLs (baseUrl is the clean /exec we passed in)
    const HOME_URL      = baseUrl;
    const INCIDENTS_URL = baseUrl + backQS;

    // 🚀 Hard redirect the TOP window to the file; include graceful fallbacks
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <base target="_top">
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>InForm – Report</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;padding:28px;text-align:center;color:#222;background:#fff}
          .btn{display:inline-block;margin:8px;padding:8px 14px;border:1px solid #bbb;border-radius:8px;background:#fff;text-decoration:none;color:#333}
          .primary{border-color:#1a73e8;color:#1a73e8;font-weight:600}
          .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px}
          .muted{color:#777;margin-top:10px;font-size:13px}
        </style>
        <script>
          (function(){
            try {
              // redirect top frame (escapes iframes/Sites)
              window.top.location.replace(${JSON.stringify(dl)});
            } catch(e) {
              // fallback to same-frame redirect
              window.location.replace(${JSON.stringify(dl)});
            }
          })();
          function go(u){ try{ window.top.location.href = u; }catch(_){ window.location.href = u; } }
        </script>
      </head>
      <body>
        <h2>📄 Preparing your PDF…</h2>
        <p class="muted">If your download doesn’t start automatically, use the button below.</p>
        <p><a class="btn primary" href="${dl}">⬇️ Download PDF</a></p>
        <div class="row">
          <a class="btn" href="${HOME_URL}">← Back Home</a>
          <a class="btn" href="${INCIDENTS_URL}">← Back to Incidents (filters)</a>
        </div>
      </body>
      </html>
    `;
    return HtmlService.createHtmlOutput(html)
      .setTitle('InForm – Report')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (e) {
    try { console.error('renderReportCreationPage_ failed:', e); } catch (_) {}
    return HtmlService.createHtmlOutput('<h3>❌ Could not generate report</h3><p>' + (e && e.message ? e.message : e) + '</p>')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

// --- Build the PDF file for incidents (called above) ---
function buildIncidentsReportPdf_(ctx, opts, summary, incidents) {
  const tz = Session.getScriptTimeZone() || 'Africa/Johannesburg';
  const fmt = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const today = new Date();
  const start = new Date(); start.setDate(today.getDate() - (opts.days || 30));

  // Builds a parent-facing PDF as a Blob (no Drive sharing needed).
  function buildParentPdfBlob_(ctx, learnerName, opts, parentIncidents) {
    const tz = Session.getScriptTimeZone() || 'Africa/Johannesburg';
    const fmt = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    const now = new Date();
    const start = new Date(); start.setDate(now.getDate() - (parseInt(opts.days, 10) || 30));

    const titleBase = `Incident Report for Learner: ${learnerName || 'Unknown'}`;
    const title = `${titleBase} – ${fmt(now)}`;

    const doc = DocumentApp.create(title);
    const body = doc.getBody();

    body.setMarginTop(36).setMarginBottom(36).setMarginLeft(36).setMarginRight(36);
    body.editAsText().setFontFamily('Arial');

    body.appendParagraph(ctx.schoolName || 'School')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setBold(true).setFontSize(12);
    body.appendParagraph('');
    body.appendParagraph(titleBase).setHeading(DocumentApp.ParagraphHeading.HEADING1);

    [
      `Period: ${fmt(start)} to ${fmt(now)}`,
      `Report date: ${fmt(now)}`,
      `Incidents in window: ${parentIncidents.length}`
    ].forEach(line => body.appendParagraph(line).setFontSize(10).setForegroundColor('#666666'));

    body.appendParagraph('');
    body.appendParagraph('Incident Details').setHeading(DocumentApp.ParagraphHeading.HEADING2);

    // Convert objects -> rows your table helper expects
    const rows = parentIncidents.map(it => [
      it.date || '',
      learnerName || '',
      it.grade || 'N/A',
      it.subject || 'N/A',
      it.teacher || 'N/A',
      it.nature || 'N/A'
    ]);

    // Reuse your existing table helper
    appendIncidentsTablePaginated_(body, rows, 28);

    try {
      const footer = doc.addFooter();
      footer.appendParagraph('Report provided by InForm')
        .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
        .setFontSize(9)
        .setForegroundColor('#666666');
    } catch (_) { }

    doc.saveAndClose();

    const docFile = DriveApp.getFileById(doc.getId());
    const safeName = `InForm – ${ctx.schoolName} – ${learnerName} – ${fmt(now)}.pdf`.replace(/[\\\/:*?"<>|]+/g, '_').slice(0, 120);
    const pdfBlob = docFile.getAs(MimeType.PDF).setName(safeName);

    // Clean up the temporary Google Doc
    try { docFile.setTrashed(true); } catch (_) { }

    return pdfBlob;
  }

  // Learner-specific?
  const isLearnerSpecific = !!(opts.learner && String(opts.learner).trim());
  const inferredLearner = (incidents && incidents.length > 0) ? String(incidents[0][1] || '').trim() : '';
  const learnerName = inferredLearner || (opts.learner || '').trim();
  const titleBase = isLearnerSpecific
    ? `Incident Report for Learner: ${learnerName || 'Unknown'}`
    : `InForm Incident Report – ${ctx.schoolName}`;
  const title = `${titleBase} – ${fmt(today)}`;
  const doc = DocumentApp.create(title);
  const body = doc.getBody();

  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(36).setMarginRight(36);
  body.editAsText().setFontFamily('Arial');
  const pSchool = body.appendParagraph(ctx.schoolName || 'School');
  pSchool.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .setBold(true)
    .setFontSize(12);

  body.appendParagraph('');
  body.appendParagraph(titleBase).setHeading(DocumentApp.ParagraphHeading.HEADING1);

  const infoLines = [];
  infoLines.push(`Period: ${fmt(start)} to ${fmt(today)}`);
  infoLines.push(`Report date: ${fmt(today)}`);
  if (isLearnerSpecific) {
    infoLines.push(`Incidents in period: ${incidents.length}`);
  } else {
    infoLines.push(`Total incidents in period (all filters): ${summary.totalInWindow}`);
  }
  const extraFilters = [];
  if (!isLearnerSpecific && opts.learner) extraFilters.push(`Learner~"${opts.learner}"`);
  if (opts.grade) extraFilters.push(`Grade=${opts.grade}`);
  if (opts.subject) extraFilters.push(`Subject~"${opts.subject}"`);
  if (opts.teacher) extraFilters.push(`Teacher~"${opts.teacher}"`);
  if (opts.nature) extraFilters.push(`Nature~"${opts.nature}"`);
  if (extraFilters.length) infoLines.push(`Filters: ${extraFilters.join(' | ')}`);
  infoLines.forEach(line => body.appendParagraph(line).setFontSize(10).setForegroundColor('#666666'));

  if (!isLearnerSpecific) {
    const kpi = body.appendTable([
      ['Today', String(summary.today), 'Last 7 days', String(summary.last7)],
      ['Total in window', String(summary.totalInWindow), 'Year-to-date', String(summary.ytdTotal)]
    ]);
    if (typeof kpi.setBorderWidth === 'function') kpi.setBorderWidth(0);
    for (let r = 0; r < kpi.getNumRows(); r++) {
      for (let c = 0; c < kpi.getRow(r).getNumCells(); c++) {
        const cell = kpi.getRow(r).getCell(c);
        cell.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(8).setPaddingRight(8);
        if (c % 2 === 0) cell.editAsText().setBold(true);
      }
    }
    body.appendParagraph('');
  } else {
    // Learner mini card
    body.appendParagraph('Learner Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    let derivedGrade = 'N/A';
    if (incidents && incidents.length) {
      for (var i = 0; i < incidents.length; i++) {
        if (String(incidents[i][2] || '').trim()) { derivedGrade = String(incidents[i][2]).trim(); break; }
      }
    }
    const card = body.appendTable([
      ['Learner', learnerName || 'Unknown'],
      ['Grade (recent)', derivedGrade],
      ['Window', `${fmt(start)} → ${fmt(today)}`],
      ['Incidents in window', String(incidents.length)]
    ]);
    if (typeof card.setBorderWidth === 'function') card.setBorderWidth(0);
    for (var rr = 0; rr < card.getNumRows(); rr++) {
      card.getRow(rr).getCell(0).editAsText().setBold(true);
      for (var cc = 0; cc < card.getRow(rr).getNumCells(); cc++) {
        const cell = card.getRow(rr).getCell(cc);
        cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      }
    }
    body.appendParagraph('');
  }
  // Incidents table with page breaks
  body.appendParagraph(isLearnerSpecific ? 'Incident Details' : 'Incidents')
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  appendIncidentsTablePaginated_(body, incidents, 28);

  try {
    const footer = doc.addFooter();
    footer.appendParagraph('Report provided by InForm')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(9)
      .setForegroundColor('#666666');
  } catch (e) { }
  doc.saveAndClose();
  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF).setName(title + '.pdf');
  const pdfFile = DriveApp.createFile(pdfBlob);

  Logger.log("Generated file URL: " + pdfFile.getUrl());  // Should log file URL

  // Set sharing permissions
  try {
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Utilities.sleep(1000);
    Logger.log("File with sharing URL: " + pdfFile.getUrl());
  } catch (e) {
    Logger.log("Sharing failed: " + (e && e.message ? e.message : e));
  }

  // Optionally, remove the original doc
  try {
    DriveApp.getFileById(doc.getId()).setTrashed(true);
  } catch (_) { }

  return pdfFile;
}

// Build a table per chunk, with header on each table and page breaks
function appendIncidentsTablePaginated_(body, incidents, perPage) {
  const headers = ['Date', 'Learner', 'Grade', 'Subject', 'Teacher', 'Nature'];
  if (!incidents || !incidents.length) {
    const t = body.appendTable([headers]);
    t.getRow(0).editAsText().setBold(true);
    const row = t.appendTableRow();
    row.appendTableCell('No incidents match your filters.');
    for (let c = 1; c < 6; c++) row.appendTableCell('');
    return;
  }
  let i = 0;
  while (i < incidents.length) {
    const chunk = incidents.slice(i, i + perPage);
    const t = body.appendTable([headers]);
    t.getRow(0).editAsText().setBold(true);
    for (let r = 0; r < chunk.length; r++) {
      const inc = chunk[r];
      const row = t.appendTableRow();
      for (let c = 0; c < 6; c++) {
        const cell = row.appendTableCell(String(inc[c] || ''));
        cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(4).setPaddingRight(4);
      }
      if ((i + r) % 2 === 0) {
        for (let c = 0; c < 6; c++) { row.getCell(c).setBackgroundColor('#f7f9fc'); }
      }
    }
    i += perPage;
    if (i < incidents.length) {
      body.appendPageBreak();
    }
  }
}

// ========================================
// 🧾 REPORT (CSV)
function renderCsvReportPage_(baseUrl, ctx, opts) {
  try {
    if (!ctx.dataSheetUrl) {
      return HtmlService.createHtmlOutput('<h2>❌ Access denied</h2><p>No data sheet configured for this user.</p>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    const incidents = getIncidents_(ctx.dataSheetUrl, opts);
    const csvBlob   = buildIncidentsCsvBlob_(ctx, opts, incidents);
    const file      = DriveApp.createFile(csvBlob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (_) {}

    const dl = 'https://drive.google.com/uc?export=download&id=' + file.getId();

    const q = v => encodeURIComponent(v || '');
    const backQS =
      `?page=incidents` +
      `&school=${q(ctx.selectedSchoolKey)}` +
      `&days=${q(opts.days)}&limit=${q(opts.limit)}` +
      `&grade=${q(opts.grade)}&subject=${q(opts.subject)}` +
      `&teacher=${q(opts.teacher)}&learner=${q(opts.learner)}&nature=${q(opts.nature)}`;

    const cleanBase = (baseUrl || (ScriptApp.getService().getUrl() || '')).split('?')[0];
    const HOME_URL = cleanBase;
    const INCIDENTS_URL = cleanBase + backQS;

    const html = `
      <!doctype html><html><head>
        <base target="_top"><meta charset="utf-8">
        <meta http-equiv="refresh" content="0; url=${dl}">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>InForm – CSV Export</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;padding:28px;text-align:center}
          .btn{display:inline-block;margin:8px;padding:8px 14px;border:1px solid #bbb;border-radius:8px;background:#fff;text-decoration:none;color:#333}
          .primary{border-color:#1a73e8;color:#1a73e8;font-weight:600}
          .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px}
          .muted{color:#777;margin-top:10px;font-size:13px}
        </style>
        <script>
          (function(){
            try{ window.top.location.replace(${JSON.stringify(dl)}); }
            catch(e){ window.location.replace(${JSON.stringify(dl)}); }
          })();
        </script>
      </head><body>
        <h2>🧾 Preparing your CSV…</h2>
        <p class="muted">If your download doesn’t start automatically, use the button below.</p>
        <p><a class="btn primary" href="${dl}">⬇️ Download CSV</a></p>
        <div class="row">
          <a class="btn" href="${HOME_URL}">← Back Home</a>
          <a class="btn" href="${INCIDENTS_URL}">← Back to Incidents (filters)</a>
        </div>
        <noscript><p><a href="${dl}">Download (NoScript)</a></p></noscript>
      </body></html>`;
    return HtmlService.createHtmlOutput(html)
      .setTitle('InForm – CSV Export')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (e) {
    try { console.error('renderCsvReportPage_ failed:', e); } catch (_) {}
    return HtmlService.createHtmlOutput('<h3>❌ Could not generate CSV</h3><p>' + (e && e.message ? e.message : e) + '</p>')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function buildIncidentsCsvBlob_(ctx, opts, incidents) {
  const rows = [
    ['Date', 'Learner', 'Grade', 'Subject', 'Teacher', 'Nature (combined)']
  ];
  for (var i = 0; i < incidents.length; i++) rows.push(incidents[i]);
  const csv = rows.map(r => r.map(csvEscape_).join(',')).join('\r\n');
  const name = `InForm Incidents – ${ctx.schoolName} – ${new Date().toLocaleDateString('en-ZA')}.csv`;
  return Utilities.newBlob(csv, MimeType.CSV, name);
}
function csvEscape_(val) {
  const s = (val == null ? '' : String(val));
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ========================================
// 📱 SMS helpers

// Unified SMS message builder to avoid duplicated logic
function buildIncidentSmsMessage_(learner, dateStr, teacher, nature, parentPortalLink, maxLen) {
  // --- local helpers (no global changes)
  function _pickLearnerName(src) {
    if (!src) return '';
    if (typeof src === 'string') return src;
    // object: try common keys, including header with a space
    return (
      src['Combined Learner'] || src.combinedLearner ||
      src.learnerName || src.learner ||
      src.displayName || src.name || src.fullName || ''
    );
  }
  function _pickTeacherName(src) {
    if (!src) return '';
    if (typeof src === 'string') return src;
    return (src.name || src.displayName || src.fullName || '');
  }
  // Shorten "Surname Initial." with UPPERCASE surname
  function _shortSurnameInitialLocal(name) {
    try {
      if (typeof shortSurnameInitial_ === 'function') {
        return shortSurnameInitial_(name, true); // reuse your global helper if present
      }
      var n = String(name || '').trim().replace(/\s+/g, ' ');
      if (!n) return '';
      var surname = '', given = '';
      if (n.indexOf(',') !== -1) {
        var parts = n.split(',');
        surname = (parts[0] || '').trim();
        given = (parts[1] || '').trim();
      } else {
        var bits = n.split(' ');
        if (bits.length === 1) surname = bits[0];
        else { surname = bits[bits.length - 1]; given = bits.slice(0, -1).join(' '); }
      }
      var m = given.match(/[A-Za-z]/);
      var initial = m ? m[0].toUpperCase() : '';
      surname = String(surname).toUpperCase();
      return initial ? (surname + ' ' + initial + '.') : surname;
    } catch (_) {
      return String(name || '');
    }
  }
  function _int(v, def) {
    var n = (v == null ? NaN : Number(v));
    return isFinite(n) && n > 0 ? Math.floor(n) : def;
  }

  // --- pick + shorten names
  var learnerRaw = _pickLearnerName(learner);
  var teacherRaw = _pickTeacherName(teacher) || (typeof ctx !== 'undefined' && ctx ? (ctx.userDisplayName || ctx.name) : '');

  var learnerShort = _shortSurnameInitialLocal(learnerRaw);   // e.g., "MAKWANE M."
  var teacherShort = _shortSurnameInitialLocal(teacherRaw);   // e.g., "KROUKAMP E."

  // --- compose lines (GSM-7 friendly)
  var headerLine = 'DHS Incident - ' + learnerShort + ' ' + (dateStr || '');
  var tLine = teacherShort ? ('T:' + teacherShort + '.') : '';
  var nLine = nature ? ('N:' + String(nature).trim() + '.') : '';

  // Ack link toggle: respect SEND_ACK_LINK if you use it; otherwise include when link is present
  var includeAck = (typeof SEND_ACK_LINK === 'undefined') ? true : !!SEND_ACK_LINK;
  var ackUrl = String(parentPortalLink || '').trim();
  var ackLine = (includeAck && ackUrl) ? ('\nMore Detail\n' + ackUrl) : '';

  // assemble
  var msg = [headerLine, tLine, nLine].filter(Boolean).join(' ') + ackLine;

  // --- length cap
  var cap = _int(maxLen, (typeof MAX_SMS_LEN === 'number' && MAX_SMS_LEN > 0) ? MAX_SMS_LEN : 160);
  if (msg.length > cap) {
    // Try trimming nature first to preserve header/teacher + link
    if (nLine) {
      var baseLen = (headerLine + (tLine ? ' ' + tLine : '') + ackLine).length;
      // " N:" + "." ≈ 4 chars budget besides the content
      var availForNature = Math.max(0, cap - baseLen - 4);
      if (availForNature <= 0) {
        nLine = '';
      } else {
        var rawNature = String(nature).trim();
        var trimmedNature = rawNature;
        if (rawNature.length > availForNature) {
          trimmedNature = availForNature > 3 ? rawNature.slice(0, availForNature - 3) + '...' : rawNature.slice(0, availForNature);
        }
        nLine = trimmedNature ? ('N:' + trimmedNature + '.') : '';
      }
      msg = [headerLine, tLine, nLine].filter(Boolean).join(' ') + ackLine;
    }
    // If still too long, final hard cap with ellipsis
    if (msg.length > cap) {
      msg = msg.slice(0, Math.max(0, cap - 3)) + '...';
    }
  }

  return msg;
}

function getSmsSouthAfricaAuthToken() {
  var cfg = getSmsConfig_();
  if (!cfg.username || !cfg.password || !cfg.authUrl) return null;

  var basic = Utilities.base64Encode(cfg.username + ':' + cfg.password, Utilities.Charset.UTF_8);
  try {
    var res = UrlFetchApp.fetch(cfg.authUrl, {
      method: 'get',
      headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/json' },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var txt = '';
    try { txt = res.getContentText(); } catch (_) {}
    Logger.log('Auth response code: ' + code);
    if (code === 200) {
      var t = {};
      try { t = JSON.parse(txt || '{}'); } catch (_) {}
      return t.token || t.Token || t.access_token || null;
    } else {
      Logger.log('Auth failed body: ' + (txt ? txt.slice(0, 300) : ''));
      return null;
    }
  } catch (e) {
    Logger.log('Auth error: ' + (e && e.message ? e.message : e));
    return null;
  }
}

// Read SMS config from Script Properties, fallback to hard-coded constants
function getSmsConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    username: props.getProperty('SMS_SA_USERNAME') || (typeof SMS_SA_USERNAME === 'undefined' ? '' : SMS_SA_USERNAME),
    password: props.getProperty('SMS_SA_PASSWORD') || (typeof SMS_SA_PASSWORD === 'undefined' ? '' : SMS_SA_PASSWORD),
    authUrl: props.getProperty('SMS_SA_AUTH_URL') || (typeof SMS_SA_AUTH_URL === 'undefined' ? '' : SMS_SA_AUTH_URL),
    sendUrl: props.getProperty('SMS_SA_SEND_SMS_URL') || (typeof SMS_SA_SEND_SMS_URL === 'undefined' ? '' : SMS_SA_SEND_SMS_URL),
    senderId: props.getProperty('SMS_SA_DEFAULT_SENDER_ID') || (typeof SMS_SA_DEFAULT_SENDER_ID === 'undefined' ? '' : SMS_SA_DEFAULT_SENDER_ID)
  };
}

function sendSmsViaSmsSouthAfrica(to, body, senderId) {
  if (!to || !body) return false;
  if (to.toString().trim().charAt(0) !== '+') return false;

  var cfg = getSmsConfig_();
  var token = getSmsSouthAfricaAuthToken();
  if (!token || !cfg.sendUrl) return false;

  var payload = {
    sendOptions: { allowContentTrimming: true, senderId: senderId || cfg.senderId },
    messages: [{ content: String(body).trim(), destination: String(to).trim() }]
  };

  try {
    var res = UrlFetchApp.fetch(cfg.sendUrl, {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var txt = '';
    try { txt = res.getContentText(); } catch (_) {}
    Logger.log('SMS send code=' + code + ' payload=' + JSON.stringify(payload).slice(0, 200));
    if (code === 200 || code === 201 || code === 202) return true;
    Logger.log('SMS send failed body: ' + (txt ? txt.slice(0, 300) : ''));
    return false;
  } catch (e) {
    Logger.log('SMS send exception: ' + (e && e.message ? e.message : e));
    return false;
  }
}

/**
 * Returns "Surname I." from a name like:
 *  - "MAKWANE, Mmape"      -> "MAKWANE M."
 *  - "Mmape Makwane"       -> "MAKWANE M."
 *  - "Kroukamp E"          -> "KROUKAMP E."
 *  - "Eugene Kroukamp"     -> "KROUKAMP E."
 * If upperSurname=true the surname is UPPERCASED (handy for learners).
 */
function shortSurnameInitial_(name, upperSurname) {
  try {
    var n = String(name || '').trim().replace(/\s+/g, ' ');
    if (!n) return '';

    var surname = '', given = '';
    if (n.indexOf(',') !== -1) {            // "SURNAME, Given Middle"
      var parts = n.split(',');
      surname = (parts[0] || '').trim();
      given   = (parts[1] || '').trim();
    } else {                                 // "Given Middle Surname" or "Surname"
      var bits = n.split(' ');
      if (bits.length === 1) {
        surname = bits[0];
      } else {
        surname = bits[bits.length - 1];
        given   = bits.slice(0, bits.length - 1).join(' ');
      }
    }
    // First A–Z letter from given names becomes the initial
    var m = given.match(/[A-Za-z]/);
    var initial = m ? m[0].toUpperCase() : '';

    if (upperSurname !== false) surname = String(surname).toUpperCase();
    return initial ? (surname + ' ' + initial + '.') : surname;
  } catch (_) {
    return String(name || '');
  }
}

// ========================================
// 👨‍👩‍👧 Parent Portal – helpers
// Collect all candidate Data Sheet URLs from CONFIG (Sheet1)
function getAllCandidateDataSheetUrls_() {
  var out = [];
  try {
    var ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    var sh = ss.getSheetByName('Sheet1');
    if (!sh) return out;
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return out;
    var h = values[0];
    var iData = h.indexOf('Data Sheet URL');
    if (iData < 0) return out;
    var seen = {};
    for (var r = 1; r < values.length; r++) {
      var url = (values[r][iData] || '').toString().trim();
      if (url && !seen[url]) { seen[url] = true; out.push(url); }
    }
  } catch (e) {
    Logger.log('Error in getAllCandidateDataSheetUrls_: ' + e.message);
  }
  return out;
}
function randomToken_(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < (len || 24); i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function getBaseUrl_() {
  // Cache first for speed (5 min)
  var cache = CacheService.getScriptCache();
  var cached = cache.get('exec_url');
  var valid = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

  if (cached && valid.test(cached)) return cached;

  // 1) Prefer Script Properties (so you can change URL without code edits)
  var props = PropertiesService.getScriptProperties();
  var propUrl = props.getProperty('EXEC_URL') || '';
  if (valid.test(propUrl)) {
    cache.put('exec_url', propUrl, 300); // 5 min
    return propUrl;
  }

  // 2) Try Google’s service URL (works for most web app deployments)
  try {
    var svc = ScriptApp.getService().getUrl(); // may be empty in some contexts
    if (valid.test(svc)) {
      cache.put('exec_url', svc, 300);
      return svc;
    }
  } catch (_) {}

  // 3) Hardcoded fallback (keep this in sync once, then rely on Script Property)
  var EXEC_URL_FALLBACK = 'https://script.google.com/macros/s/AKfycbyRQU3695cAbL1TvJQoXmLFGWCFLWeAckt6c5RL-cFtUlUhzDQUtwbpHsjXKxoQ6X9a/exec';
  if (valid.test(EXEC_URL_FALLBACK)) {
    cache.put('exec_url', EXEC_URL_FALLBACK, 300);
    return EXEC_URL_FALLBACK;
  }

  // Last resort (often not publicly reachable)
  return ScriptApp.getService().getUrl() || '';
}

function buildParentPortalUrl_(tok) { return getBaseUrl_() + '?page=parent&tok=' + encodeURIComponent(tok); }
function shortenUrl_(longUrl) {
  try {
    const r1 = UrlFetchApp.fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl), { method: 'get', muteHttpExceptions: true, followRedirects: true });
    const t1 = (r1.getContentText() || '').trim();
    if (r1.getResponseCode() === 200 && /^https?:\/\/\S+$/i.test(t1)) return t1;
  } catch (_) { }
  try {
    const r2 = UrlFetchApp.fetch('https://is.gd/create.php?format=simple&url=' + encodeURIComponent(longUrl), { method: 'get', muteHttpExceptions: true, followRedirects: true });
    const t2 = (r2.getContentText() || '').trim();
    if (r2.getResponseCode() === 200 && /^https?:\/\/\S+$/i.test(t2)) return t2;
  } catch (_) { }
  return longUrl;
}
function normalizePhoneZa_(raw) {
  let s = String(raw || '').replace(/\s+/g, '').replace(/[-().]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s;
  if (s.startsWith('27')) return '+' + s;
  if (s.startsWith('0')) return '+27' + s.slice(1);
  return s;
}
function getParentContactColumnIndices_(headers) {
  const idx = (names) => findHeaderIndex_(headers, names);
  return {
    iLearner: idx([COMBINED_LEARNER_COLUMN, 'Combined Learner', 'Learner', 'Learner Name']),
    iGrade: idx(['Grade', 'Learner Grade']),
    iTok: idx(['Token', 'Parent Token', 'Portal Token']),
    iFName: idx(['Father name', 'Father Name']),
    iFSurname: idx(['Father surname', 'Father Surname']),
    iFEmail: idx(['Father email', 'Father Email']),
    iFCell: idx(['Father Cel#', 'Father Cell', 'Father Cell#', 'Father Mobile']),
    iMName: idx(['Mother name', 'Mother Name']),
    iMSurname: idx(['Mother surname', 'Mother Surname']),
    iMEmail: idx(['Mother email', 'Mother Email']),
    iMCell: idx(['Mother Cel#', 'Mother Cell', 'Mother Cell#', 'Mother Mobile']),
  };
}

// Ensure token exists in row
function ensureParentTokenForRow_(sheet, rowIndex, colIdx) {
  if (colIdx.iTok < 0) throw new Error('Learner Contacts is missing a "Token" column.');
  const rng = sheet.getRange(rowIndex, colIdx.iTok + 1);
  const v = String(rng.getValue() || '').trim();
  if (v) return v;
  const tok = randomToken_(24);
  rng.setValue(tok);
  return tok;
}

function getParentContextByToken_(tok) {
  const out = { ok: false, reason: '', learner: '', grade: '', rowIndex: -1, token: tok, sourceUrl: '' };
  if (!tok) {
    Logger.log('Missing token in getParentContextByToken_');
    out.reason = 'Missing token';
    return out;
  }

  try {
    const ctx = getUserContext_();
    Logger.log('User context for token %s: email=%s, dataSheetUrl=%s',
      maskToken_(tok), ctx.email || 'none', ctx.dataSheetUrl || 'none');
    const tryUrls = [];
    // Search DATA workbook first (where incidents & Learner Contacts live), then CONFIG
    if (ctx.dataSheetUrl) tryUrls.push(ctx.dataSheetUrl);
    tryUrls.push(CONFIG_SHEET_URL);

    for (const u of tryUrls) {
      try {
        Logger.log('Trying spreadsheet URL: %s', u);
        const ss = SpreadsheetApp.openByUrl(u);
        const sh = ss.getSheetByName(CONTACT_SHEET_NAME);
        if (!sh) {
          Logger.log('Sheet %s not found in %s', CONTACT_SHEET_NAME, u);
          continue;
        }

        const values = sh.getDataRange().getValues();
        if (!values || values.length < 2) {
          Logger.log('No data in sheet %s of %s', CONTACT_SHEET_NAME, u);
          continue;
        }

        const h = values[0];
        const col = getParentContactColumnIndices_(h);
        if (col.iTok < 0) {
          Logger.log('Token column not found in %s', u);
          continue;
        }

        const needle = String(tok).trim();
        for (let r = 1; r < values.length; r++) {
          const rowTok = String(values[r][col.iTok] || '').trim();
          if (rowTok === needle) {
            Logger.log('Token match found for learner (masked token): %s',
              maskToken_(needle));
            out.ok = true;
            out.rowIndex = r + 1;
            out.learner = col.iLearner >= 0 ? String(values[r][col.iLearner] || '') : '';
            out.grade = col.iGrade >= 0 ? String(values[r][col.iGrade] || '') : '';
            out.sourceUrl = u; // ✅ critical for downstream usage
            return out;
          }
        }
        Logger.log('No token match in %s', u);
      } catch (e) {
        Logger.log('Error accessing spreadsheet %s: %s', u, e.message);
        /* try next source */
      }
    }

    out.reason = 'Token not found';
    Logger.log('Token %s not found in any spreadsheet', maskToken_(tok));
  } catch (e) {
    out.reason = 'Lookup error';
    Logger.log('Error in getParentContextByToken_ for token %s: %s', maskToken_(tok), e.message);
  }
  return out;
}

function ensureIncidentAckColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let iAck = findHeaderIndex_(headers, ['Parent Acknowledged']);
  let iAckAt = findHeaderIndex_(headers, ['Parent Acknowledged At']);
  let iAckBy = findHeaderIndex_(headers, ['Parent Acknowledged By']);
  const toAdd = [];
  if (iAck < 0) toAdd.push('Parent Acknowledged');
  if (iAckAt < 0) toAdd.push('Parent Acknowledged At');
  if (iAckBy < 0) toAdd.push('Parent Acknowledged By');
  if (toAdd.length) {
    sheet.insertColumnsAfter(lastCol, toAdd.length);
    sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
    const headers2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    iAck = findHeaderIndex_(headers2, ['Parent Acknowledged']);
    iAckAt = findHeaderIndex_(headers2, ['Parent Acknowledged At']);
    iAckBy = findHeaderIndex_(headers2, ['Parent Acknowledged By']);
  }
  return { iAck, iAckAt, iAckBy };
}

function getIncidentsForParent_(sheetUrl, learnerName, days, limit) {
  const out = [];
  try {
    const dataSS = SpreadsheetApp.openByUrl(sheetUrl);
    const sh = dataSS.getSheetByName(RESPONSES_SHEET_NAME);
    if (!sh) return out;

    const values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return out;

    const h = values[0];
    const iTs = findHeaderIndex_(h, ['Timestamp']);
    const iLearner = findHeaderIndex_(h, [COMBINED_LEARNER_COLUMN, 'Combined Learner']);
    const iGrade = findHeaderIndex_(h, ['Learner Grade', 'Grade']);
    const iSubject = findHeaderIndex_(h, ['Subject']);
    const iTeacher = findHeaderIndex_(h, ['Teacher Surname, Name', 'Teacher', 'Teacher Name']);
    const iNature1 = findHeaderIndex_(h, ['Nature of Learner Misconduct', 'Nature of learner misconduct', 'Nature of misconduct', 'Nature']);
    const iNature2 = findHeaderIndex_(h, ['Other misconduct and/or description of incident', 'Other misconduct', 'Description of incident', 'Other / description']);
    const iAck = findHeaderIndex_(h, ['Parent Acknowledged']);
    const iAckAt = findHeaderIndex_(h, ['Parent Acknowledged At']);

    // Normaliser: lower-case, collapse spaces, strip punctuation
    const norm = s => String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, ' ') // keep letters/numbers/spaces
      .replace(/\s+/g, ' ')
      .trim();

    const target = norm(learnerName);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (parseInt(days, 10) || 30));
    let scannedRows = 0, matchedRows = 0;

    for (let r = 1; r < values.length; r++) {
      scannedRows++;
      const row = values[r];

      const ts = iTs >= 0 ? new Date(row[iTs]) : null;
      if (!ts || isNaN(ts.getTime()) || ts < cutoff) {
        Logger.log('Skipping row %s: Invalid timestamp "%s"', r + 1, row[iTs]);
        continue;
      }

      const learnerInRowRaw = iLearner >= 0 ? String(row[iLearner] || '') : '';
      const learnerInRow = norm(learnerInRowRaw);

      // Compare normalised strings
      if (learnerInRow !== target) continue;
      matchedRows++;

      const n1 = iNature1 >= 0 ? String(row[iNature1] || '') : '';
      const n2 = iNature2 >= 0 ? String(row[iNature2] || '') : '';

      out.push({
        rowIndex: r + 1,
        ts: ts, // Add raw Date for sorting
        date: ts.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        grade: iGrade >= 0 ? (row[iGrade] || 'N/A') : 'N/A',
        subject: iSubject >= 0 ? (row[iSubject] || 'N/A') : 'N/A',
        teacher: iTeacher >= 0 ? (row[iTeacher] || 'N/A') : 'N/A',
        nature: [n1, n2].filter(Boolean).join(' — ') || 'N/A',
        acknowledged: iAck >= 0 ? String(row[iAck] || '').toLowerCase().startsWith('y') : false,
        acknowledgedAt: iAckAt >= 0 ? (row[iAckAt] || '') : ''
      });
    }

    // Helpful diagnostics in logs
    Logger.log('Parent incidents scan: scannedRows=' + scannedRows + ' matchedRows=' + matchedRows + ' resultCount=' + out.length);

    out.sort((a, b) => b.ts - a.ts);

    return out.slice(0, parseInt(limit, 10) || 100);
  } catch (e) {
    Logger.log('getIncidentsForParent_ error: ' + (e && e.message));
    try { console.error('getIncidentsForParent_ failed:', e); } catch (_) {}
    return out;
  }
}

// ========================================
// 👀 Render Parent page for portal link
function renderParentPage_(baseUrl, ctx, pctx, opts) {
  try {
    if (!pctx.ok || !pctx.learner) {
      var msg1 = '<h2>❌ Invalid or expired link</h2><p>Please contact the school to request a new parent portal link.</p>';
      return HtmlService.createHtmlOutput(msg1).setTitle('InForm – Parent Portal');
    }

    // Use the workbook where the token was found
    var dataUrlForParent = pctx.sourceUrl || (ctx && ctx.dataSheetUrl) || '';
    if (!dataUrlForParent) {
      var msg2 = '<h2>❌ Access error</h2><p>No data sheet available for this school.</p>';
      return HtmlService.createHtmlOutput(msg2).setTitle('InForm – Parent Portal');
    }

    var incidents = getIncidentsForParent_(dataUrlForParent, pctx.learner, opts.days, opts.limit || 200);

    Logger.log('renderParentPage_: learner="%s" grade="%s" incidents=%s',
      pctx.learner, (pctx.grade || 'N/A'), incidents.length);

    var t = HtmlService.createTemplateFromFile('Parents');
    t.baseUrl = baseUrl;
    t.schoolName = (ctx && ctx.schoolName) || 'School';
    t.schoolColor = (ctx && (ctx.schoolColor || '#1a73e8')) || '#1a73e8';
    t.learner = pctx.learner;
    t.grade = pctx.grade || 'N/A';
    t.token = pctx.token;
    t.days = opts.days;
    t.incidents = incidents;

    t.downloadUrl = baseUrl + '?page=parent_dl&tok=' + encodeURIComponent(pctx.token)
      + '&days=' + encodeURIComponent(opts.days || 30)
      + '&limit=' + encodeURIComponent(opts.limit || 200);

    return t.evaluate()
      .setTitle('InForm – Parent Portal')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    try { console.error('renderParentPage_ failed:', e); } catch (_) {}
    return HtmlService.createHtmlOutput('<h2>❌ Error loading Parent Portal</h2><p>' + (e && e.message ? e.message : e) + '</p>');
  }
}

// ========================================
// ☑️ Parent Acknowledgement
function parentAcknowledgeIncident_(token, rowIndex) {
  var pctx = getParentContextByToken_(token);
  if (!pctx.ok) return { ok: false, reason: 'Invalid token' };

  // Write the acknowledgement back to the SAME workbook as the token
  var dataUrl = pctx.sourceUrl || (getUserContext_() && getUserContext_().dataSheetUrl) || '';
  if (!dataUrl) return { ok: false, reason: 'No data workbook available' };

  var dataSS = SpreadsheetApp.openByUrl(dataUrl);
  var sh = dataSS.getSheetByName(RESPONSES_SHEET_NAME);
  if (!sh) return { ok: false, reason: 'Incidents sheet not found' };

  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iLearner = findHeaderIndex_(h, [COMBINED_LEARNER_COLUMN, 'Combined Learner']);
  if (rowIndex < 2 || rowIndex > sh.getLastRow()) return { ok: false, reason: 'Invalid row' };

  var rowVals = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];
  var learnerInRow = iLearner >= 0 ? String(rowVals[iLearner] || '') : '';
  if (learnerInRow.trim().toLowerCase() !== String(pctx.learner || '').trim().toLowerCase()) {
    return { ok: false, reason: 'Row does not belong to this learner' };
  }

  var ack = ensureIncidentAckColumns_(sh);
  var now = new Date();
  if (ack.iAck >= 0) sh.getRange(rowIndex, ack.iAck + 1).setValue('Yes');
  if (ack.iAckAt >= 0) sh.getRange(rowIndex, ack.iAckAt + 1).setValue(now);
  if (ack.iAckBy >= 0) sh.getRange(rowIndex, ack.iAckBy + 1).setValue('Parent Portal');

  return { ok: true, acknowledgedAt: now };
}

// ========================================
// 📞 Contacts lookup for SMS (uses DATA WORKBOOK first)
function getParentPortalLinkAndPhoneForLearner_(learnerName, contactsBookUrl) {
  if (!learnerName) return { ok: false, reason: 'Missing learner name' };

  // Prefer the same workbook where incidents live (DATA SHEET), fallback to CONFIG if needed.
  const tryUrls = [];
  if (contactsBookUrl) tryUrls.push(contactsBookUrl);
  const ctx = getUserContext_();
  if (ctx.dataSheetUrl) tryUrls.push(ctx.dataSheetUrl);
  tryUrls.push(CONFIG_SHEET_URL);

  for (let u of tryUrls) {
    try {
      const ss = SpreadsheetApp.openByUrl(u);
      const sh = ss.getSheetByName(CONTACT_SHEET_NAME);
      if (!sh) continue; // try next source
      const values = sh.getDataRange().getValues();
      if (!values || values.length < 2) return { ok: false, reason: 'No contacts data' };
      const h = values[0];
      const col = getParentContactColumnIndices_(h);
      if (col.iTok < 0) return { ok: false, reason: 'Add a "Token" column to Learner Contacts' };

      const target = String(learnerName).trim().toLowerCase();
      for (let r = 1; r < values.length; r++) {
        const nameCell = (col.iLearner >= 0 ? String(values[r][col.iLearner] || '') : '').trim().toLowerCase();
        if (nameCell === target) {
          const tok = ensureParentTokenForRow_(sh, r + 1, col);
          const longUrl = buildParentPortalUrl_(tok);
          // Pick which URL to actually send in SMS
          const selectedUrl = PARENT_LINKS_USE_SHORTENER ? shortenUrl_(longUrl) : longUrl;

          const phoneRaw = (col.iFCell >= 0 ? values[r][col.iFCell] : '') || (col.iMCell >= 0 ? values[r][col.iMCell] : '');
          const phone = normalizePhoneZa_(phoneRaw);

          // Keep both for logging/debug; use urlToSend for SMS
          return {
            ok: true,
            token: tok,
            longUrl,
            shortUrl: PARENT_LINKS_USE_SHORTENER ? selectedUrl : '', // blank when we don't shorten
            urlToSend: selectedUrl,                                  // 👈 use this in SMS
            phone,
            sourceUrl: u
          };

        }
      }
    } catch (e) {
      // skip this source and try next
    }
  }
  return { ok: false, reason: 'Learner Contacts sheet not found' };
}

// ========================================
// 🚨 AUTO SMS ON FORM SUBMIT HANDLER & TRIGGER
// IMPORTANT: The handler name must match the trigger!
function onIncidentFormSubmit(e) {
  Logger.log('onIncidentFormSubmit triggered');
  try {
    if (!AUTO_SMS_ENABLED) {
      Logger.log('AUTO_SMS_ENABLED is false, exiting');
      return;
    }

    const sheet = e && e.range ? e.range.getSheet() : null;
    if (!sheet || sheet.getName() !== RESPONSES_SHEET_NAME) {
      Logger.log('Sheet not found or sheet name does not match');
      return;
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowIndex = e.range.getRow();
    const rowVals = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];

    const iTs = findHeaderIndex_(headers, ['Timestamp']);
    const iLearner = findHeaderIndex_(headers, [COMBINED_LEARNER_COLUMN, 'Combined Learner']);
    const iTeacher = findHeaderIndex_(headers, ['Teacher Surname, Name', 'Teacher', 'Teacher Name']);
    const iNature1 = findHeaderIndex_(headers, ['Nature of Learner Misconduct', 'Nature of misconduct', 'Nature']);
    const iNature2 = findHeaderIndex_(headers, ['Other misconduct', 'Description of incident', 'Other / description']);
    const iSmsCol = findHeaderIndex_(headers, [SMS_STATUS_COLUMN]);

    const learner = iLearner >= 0 ? String(rowVals[iLearner] || '').trim() : '';
    if (!learner) {
      Logger.log('No learner found, returning');
      return;
    }

    Logger.log('Learner found: ' + learner);

    // Avoid duplicate sends
    if (iSmsCol >= 0) {
      const current = String(rowVals[iSmsCol] || '').toLowerCase();
      if (current.includes('sent')) {
        Logger.log('SMS already sent, returning');
        return;
      }
    }

    // Prefer the same workbook that fired the event
    const contactsBookUrl = e && e.source && e.source.getUrl ? e.source.getUrl() : '';
    const info = getParentPortalLinkAndPhoneForLearner_(learner, contactsBookUrl);

    // Only log masked URL
    Logger.log('Parent portal link info: ' + JSON.stringify({
      ok: info.ok, phone: info.phone ? '(present)' : '(missing)',
      urlMasked: maskUrlToken_(info.longUrl || info.urlToSend || info.shortUrl || '')
    }));

    if (!info.ok || !info.phone || info.phone.charAt(0) !== '+') {
      Logger.log('Failed to retrieve valid phone or parent portal link');
      if (iSmsCol >= 0) sheet.getRange(rowIndex, iSmsCol + 1)
        .setValue(STATUS_FAILED_PREFIX + (info.reason || 'No valid phone'));
      return;
    }

    const dateStr = iTs >= 0 ? Utilities.formatDate(
      new Date(rowVals[iTs]),
      Session.getScriptTimeZone() || 'Africa/Johannesburg',
      'yyyy-MM-dd'
    ) : '';
    const teacher = iTeacher >= 0 ? String(rowVals[iTeacher] || '').trim() : '';
    const n1 = iNature1 >= 0 ? String(rowVals[iNature1] || '').trim() : '';
    const n2 = iNature2 >= 0 ? String(rowVals[iNature2] || '').trim() : '';
    const nature = [n1, n2].filter(Boolean).join(' — ');

    const parentPortalLink = (info && (info.urlToSend || info.longUrl || info.shortUrl)) || '';

    // Construct SMS message via helper
    const msg = buildIncidentSmsMessage_(learner, dateStr, teacher, nature, parentPortalLink, MAX_SMS_LEN);

    // Log masked URL inside message
    Logger.log('SMS Message: ' + msg.replace(parentPortalLink, maskUrlToken_(parentPortalLink)));

    // Send the SMS
    const ok = sendSmsViaSmsSouthAfrica(info.phone, msg);
    if (ok && iSmsCol >= 0) {
      sheet.getRange(rowIndex, iSmsCol + 1).setValue(STATUS_SENT);
      Logger.log('SMS sent successfully');
    } else if (iSmsCol >= 0) {
      sheet.getRange(rowIndex, iSmsCol + 1).setValue(STATUS_FAILED_PREFIX + 'Gateway error');
      Logger.log('Failed to send SMS');
    }

  } catch (err) {
    Logger.log('Error in onIncidentFormSubmit: ' + (err && err.message ? err.message : err));
    try { console.error('onIncidentFormSubmit failed:', err); } catch (_) {}
  }
}

// ------------------------------------------
// ⚙️ Script Triggers management for deployments
function __ping__() {
  return 'ok';
}

/**
 * Install the onFormSubmit trigger on the **Data Sheet** workbook
 * (the same place where "Form Responses 1" and "Learner Contacts" live).
 */
function installIncidentSubmitTrigger_() {
  const ctx = getUserContext_();
  const sheetUrl = ctx.dataSheetUrl || CONFIG_SHEET_URL; // fallback just in case
  const ssId = parseSpreadsheetId_(sheetUrl);
  if (!ssId) throw new Error('Could not parse spreadsheet id from Data Sheet URL');

  // Make sure we use the correct handler name
  removeTriggersByHandler_('onIncidentFormSubmit');
  ScriptApp.newTrigger('onIncidentFormSubmit')
    .forSpreadsheet(ssId)
    .onFormSubmit()
    .create();

  Logger.log('Installed onFormSubmit trigger for spreadsheet: ' + ssId);
}

function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  // Keep your “scroll to last row” behavior
  const lastRow = sheet.getLastRow();
  sheet.setActiveRange(sheet.getRange(lastRow, 1));
  SpreadsheetApp.flush();

  // Add a small menu for testing
  ss.addMenu('InForm', [
    { name: 'Test Parent Link…', functionName: 'Test_Parent_Link' }
  ]);
}

/**
 * Manually send SMS for unsent incidents logged today.
 * Checks the 'Timestamp' column for today's incidents and 'Sent to Parent' for unsent status.
 */
function sendUnsentSMSToday() {
  try {
    if (!AUTO_SMS_ENABLED) {
      SpreadsheetApp.getUi().alert('Auto SMS is disabled in configuration.');
      return;
    }

    const ctx = getUserContext_();
    const dataSS = ctx.dataSheetUrl ? SpreadsheetApp.openByUrl(ctx.dataSheetUrl) : null;
    if (!dataSS) {
      SpreadsheetApp.getUi().alert('Error: No data sheet configured for this user.');
      return;
    }

    const sheet = dataSS.getSheetByName(RESPONSES_SHEET_NAME);
    if (!sheet) {
      SpreadsheetApp.getUi().alert('Error: "Form Responses 1" sheet not found.');
      return;
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const iTs = findHeaderIndex_(headers, ['Timestamp']);
    const iLearner = findHeaderIndex_(headers, [COMBINED_LEARNER_COLUMN, 'Combined Learner']);
    const iTeacher = findHeaderIndex_(headers, ['Teacher Surname, Name', 'Teacher', 'Teacher Name']);
    const iNature1 = findHeaderIndex_(headers, ['Nature of Learner Misconduct', 'Nature of misconduct', 'Nature']);
    const iNature2 = findHeaderIndex_(headers, ['Other misconduct', 'Description of incident', 'Other / description']);
    const iSmsCol = findHeaderIndex_(headers, [SMS_STATUS_COLUMN]);

    if (iTs < 0 || iLearner < 0 || iSmsCol < 0) {
      SpreadsheetApp.getUi().alert('Error: Required columns (Timestamp, Combined Learner, Sent to Parent) not found.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const values = sheet.getDataRange().getValues();
    let sent = 0, failed = 0;

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const ts = iTs >= 0 ? new Date(row[iTs]) : null;
      if (!ts || isNaN(ts.getTime()) || ts < today || ts >= tomorrow) continue;

      const smsStatus = iSmsCol >= 0 ? String(row[iSmsCol] || '').toLowerCase() : '';
      if (smsStatus.includes('sent')) continue;

      const learner = iLearner >= 0 ? String(row[iLearner] || '').trim() : '';
      if (!learner) {
        if (iSmsCol >= 0) sheet.getRange(r + 1, iSmsCol + 1).setValue(STATUS_FAILED_PREFIX + 'No learner');
        failed++;
        continue;
      }

      const info = getParentPortalLinkAndPhoneForLearner_(learner, dataSS.getUrl());
      if (!info.ok || !info.phone || info.phone.charAt(0) !== '+') {
        if (iSmsCol >= 0) sheet.getRange(r + 1, iSmsCol + 1).setValue(STATUS_FAILED_PREFIX + (info.reason || 'No valid phone'));
        failed++;
        continue;
      }

      const dateStr = Utilities.formatDate(ts, Session.getScriptTimeZone() || 'Africa/Johannesburg', 'yy-MM-dd');
      const teacher = iTeacher >= 0 ? String(row[iTeacher] || '').trim() : '';
      const n1 = iNature1 >= 0 ? String(row[iNature1] || '').trim() : '';
      const n2 = iNature2 >= 0 ? String(row[iNature2] || '').trim() : '';
      const nature = [n1, n2].filter(Boolean).join(' — ');

      const parentPortalLink = (info && (info.urlToSend || info.longUrl || info.shortUrl)) || '';

      const msg = buildIncidentSmsMessage_(learner, dateStr, teacher, nature, parentPortalLink, MAX_SMS_LEN);

      Logger.log(`Sending SMS for row ${r + 1}: ` + msg.replace(parentPortalLink, maskUrlToken_(parentPortalLink)));
      const ok = sendSmsViaSmsSouthAfrica(info.phone, msg);
      if (ok && iSmsCol >= 0) {
        sheet.getRange(r + 1, iSmsCol + 1).setValue(STATUS_SENT);
        sent++;
        Logger.log(`SMS sent successfully for row ${r + 1}`);
      } else if (iSmsCol >= 0) {
        sheet.getRange(r + 1, iSmsCol + 1).setValue(STATUS_FAILED_PREFIX + 'Gateway error');
        failed++;
        Logger.log(`Failed to send SMS for row ${r + 1}`);
      }
    }

    SpreadsheetApp.getUi().alert(`SMS sending complete: ${sent} sent, ${failed} failed.`);
  } catch (err) {
    Logger.log('Error in sendUnsentSMSToday: ' + (err && err.message ? err.message : err));
    try { console.error('sendUnsentSMSToday failed:', err); } catch (_) {}
    SpreadsheetApp.getUi().alert('Error: ' + (err && err.message ? err.message : err));
  }
}

function Test_Parent_Link() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Parent Link Tester',
    'Enter learner full name (exactly as in "' + COMBINED_LEARNER_COLUMN + '"):',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const learner = String(res.getResponseText() || '').trim();
  if (!learner) { ui.alert('No learner entered.'); return; }

  const ctx = getUserContext_();
  const info = getParentPortalLinkAndPhoneForLearner_(learner, (ctx && ctx.dataSheetUrl) || '');
  if (!info.ok) { ui.alert('Lookup failed: ' + (info.reason || 'Unknown')); return; }

  // Show unmasked (by design in this tool)
  const link = (info.longUrl || info.urlToSend || info.shortUrl || '').trim();
  ui.alert('Parent Link for ' + learner, link, ui.ButtonSet.OK);
  Logger.log('TEST LINK (unmasked): ' + link);
}

// Return a clean /edit URL from a Sheets ID
function __sheetUrlFromId_(id) {
  if (!id) return '';
  return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
}

// Try to deduce the school's Primary workbook, preferring the Incident Form response sheet
/*function resolvePrimaryDataSheetUrl_(ctx) {
  try {
    // 1) If ctx.dataSheetUrl is already a Sheets URL (and not just the CONFIG)
    if (ctx && ctx.dataSheetUrl && /https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(ctx.dataSheetUrl)
        && ctx.dataSheetUrl !== CONFIG_SHEET_URL) {
      Logger.log('[PrimaryResolve] Using ctx.dataSheetUrl as primary: ' + ctx.dataSheetUrl);
      return ctx.dataSheetUrl;
    }

    // 2) Try Incident Form → destination spreadsheet
    var formUrl = (ctx && ctx.incidentFormUrl) || INCIDENT_FORM_URL;
    if (formUrl) {
      try {
        var form = FormApp.openByUrl(formUrl);
        var destId = form.getDestinationId && form.getDestinationId();
        if (destId) {
          var u = __sheetUrlFromId_(destId);
          Logger.log('[PrimaryResolve] From Incident Form destination: ' + u);
          return u;
        }
      } catch (e1) {
        Logger.log('[PrimaryResolve] Form resolve failed: ' + (e1 && e1.message ? e1.message : e1));
      }
    }

    // 3) (Optional) fallback: keep whatever is in ctx (may be CONFIG)
    Logger.log('[PrimaryResolve] Fallback to existing ctx.dataSheetUrl: ' + (ctx && ctx.dataSheetUrl));
    return (ctx && ctx.dataSheetUrl) || '';
  } catch (e) {
    Logger.log('[PrimaryResolve] error: ' + (e && e.message ? e.message : e));
    return (ctx && ctx.dataSheetUrl) || '';
  }
}*/

// Find the Staff sheet by exact name, case/space variant, or by Email+Role headers
/*function __findStaffSheet_(ss) {
  var sh = ss.getSheetByName(STAFF_SHEET_NAME);
  if (sh) return sh;

  var wanted = String(STAFF_SHEET_NAME || 'Staff').toLowerCase().trim();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var n = String(all[i].getName() || '').toLowerCase().trim();
    if (n === wanted) return all[i];
    if (n.replace(/\s+/g,'') === wanted.replace(/\s+/g,'')) return all[i];
  }
  for (var j = 0; j < all.length; j++) {
    var s = all[j];
    try {
      var vals = s.getDataRange().getValues();
      if (!vals || vals.length < 1) continue;
      var h = vals[0];
      var iEmail = findHeaderIndex_(h, ['Email','Staff Email','User Email']);
      var iRole  = findHeaderIndex_(h, ['Role','Staff Role','Permission']);
      if (iEmail >= 0 && iRole >= 0) return s;
    } catch (_) {}
  }
  return null;
}*/

// Very safe role normalizer (only used if you don't already have normalizeRole_)
function normalizeRole_(v) {
  var s = String(v || '').toLowerCase().trim();
  if (!s) return 'teacher';
  if (/(admin|manager|principal|head|lead)/.test(s)) return 'manager';
  if (/(teacher|educator|staff)/.test(s)) return 'teacher';
  return s;
}

// ========================================
// 🔎 getUserContext_(e) — honors ?school=, safer Staff checks
// ========================================
function getUserContext_(e) {
  const cache = CacheService.getScriptCache();
  const norm = s => String(s || '').trim();
  const lc   = s => norm(s).toLowerCase();
  const p    = (e && e.parameter) || {};

  // Allow test override via ?email=...; else Session user
  const emailParam = p.email || '';
  //const email = lc(emailParam || Session.getActiveUser().getEmail() || 'unknown');
// ✅ FIX: In Incognito mode, Session.getActiveUser().getEmail() can be empty.
// Use the authuser parameter from the URL as a fallback.
const sessionEmail = Session.getActiveUser().getEmail() || '';
const urlAuthUser = p.authuser ? String(p.authuser).trim() : '';
const email = lc(emailParam || sessionEmail || urlAuthUser || 'unknown');

  const clearCache = (p.clearCache === 'true' || p.page === 'logout');

  // ✅ IMPORTANT: pick up the school from your Login redirect
  let selectedKey = norm(p.school || p.setSchoolKey || p.schoolKey || p.key || '');
  // If no school in the URL, reuse the last school this user used
  if (!selectedKey) {
    const up = PropertiesService.getUserProperties();
    const saved = up.getProperty('lastSchoolKey:' + email);
    if (saved) selectedKey = saved;
  }


  Logger.log('[SchoolResolve] incoming params=%s | selectedKey="%s"', JSON.stringify(p), selectedKey);

  const cacheKey = 'userCtx:' + email;
  if (clearCache) cache.remove(cacheKey);
  const cached = cache.get(cacheKey);
  if (cached && !selectedKey) return JSON.parse(cached);

  // Safe defaults
  let ctx = {
    email: email,
    role: 'teacher',
    userDisplayName: (email.includes('@') ? email.split('@')[0] : 'user'),
    schoolName: 'Contact the Administrator',
    schoolColor: '#1a73e8',
    schoolLogo: '',
    dataSheetUrl: '',
    incidentFormUrl: '',
    attendanceFormUrl: '',
    scriptUrl: '',
    selectedSchoolKey: '',
    authenticated: false,
    resolvedBy: ''
  };

  const log = (msg) => { try { console.log(`[SchoolResolve] ${msg}`); } catch(_) { Logger.log(`[SchoolResolve] ${msg}`); } };
  const val = (row, idx) => (idx >= 0 ? row[idx] : '');

  try {
    // 1) Config ▸ Schools
    const configSS = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    const schools = configSS.getSheetByName('Schools');
    if (!schools) {
      log('Config ▸ Schools sheet not found');
      cache.put(cacheKey, JSON.stringify(ctx), 300);
      return ctx;
    }

    const rows = schools.getDataRange().getValues();
    const header = rows.shift().map(h => String(h).trim());
    const col = n => header.indexOf(n);

    const kIdx      = col('School Key');
    const activeIdx = col('Active');
    const nameIdx   = col('School Name');
    const domainIdx = col('Email Domain');
    const colorIdx  = col('Color');
    const logoIdx   = col('Logo URL');
    const dataIdx   = col('Data Sheet URL');
    const incIdx    = col('Incident Form URL');
    const attIdx    = col('Attendance Form URL');

    // 2) Resolve school row: explicit key OR domain fallback
    let schoolRow = null;
    if (selectedKey) {
      schoolRow = rows.find(r =>
        norm(val(r, kIdx)) === selectedKey &&
        String(val(r, activeIdx)).trim().toUpperCase() === 'Y'
      );
      if (!schoolRow) {
        log(`Selected key "${selectedKey}" not active/not found → contact admin`);
        ctx.selectedSchoolKey = selectedKey;
        cache.put(cacheKey, JSON.stringify(ctx), 300);
        return ctx;
      }
    } else {
      const domain = email.includes('@') ? email.split('@')[1] : '';
      schoolRow = rows.find(r =>
        lc(val(r, domainIdx)) === lc(domain) &&
        String(val(r, activeIdx)).trim().toUpperCase() === 'Y'
      );
      if (!schoolRow) {
        log(`No active school for domain "${domain}" → contact admin`);
        cache.put(cacheKey, JSON.stringify(ctx), 300);
        return ctx;
      }
    }

    // 3) Apply branding
    ctx.schoolName        = norm(val(schoolRow, nameIdx))  || ctx.schoolName;
    ctx.schoolColor       = norm(val(schoolRow, colorIdx)) || ctx.schoolColor;
    ctx.schoolLogo        = norm(val(schoolRow, logoIdx))  || ctx.schoolLogo;
    ctx.dataSheetUrl      = norm(val(schoolRow, dataIdx));
    ctx.incidentFormUrl   = norm(val(schoolRow, incIdx));
    ctx.attendanceFormUrl = norm(val(schoolRow, attIdx));
    ctx.selectedSchoolKey = norm(val(schoolRow, kIdx));

        // 4) Staff lookup in tenant Primary
    if (!ctx.dataSheetUrl) {
      log(`No Data Sheet URL for key "${ctx.selectedSchoolKey}"`);
      cache.put(cacheKey, JSON.stringify(ctx), 300);
      return ctx;
    }
    try {
      const primarySS = SpreadsheetApp.openByUrl(ctx.dataSheetUrl);
      // Try to find the Staff sheet by common names
      const staffSheetNames = ['Staff', 'Users', 'Staff Members', 'Team'];
      let staff = null;
      for (const sheetName of staffSheetNames) {
        staff = primarySS.getSheetByName(sheetName);
        if (staff) {
          log(`Found Staff sheet: "${sheetName}"`);
          break;
        }
      }
      if (!staff) {
        log(`No Staff sheet (tried: ${staffSheetNames.join(', ')}) in Primary for key "${ctx.selectedSchoolKey}"`);
        cache.put(cacheKey, JSON.stringify(ctx), 300);
        return ctx;
      }
      

      const sVals = staff.getDataRange().getValues();
      const sHead = sVals.shift().map(h => String(h).trim());
      const sCol = n => sHead.indexOf(n);

      const eIdx  = sCol('Email');
      const dnIdx = (sCol('Display Name') !== -1) ? sCol('Display Name') : sCol('TeacherName');
      const rIdx  = sCol('Role');
      const skIdx = sCol('School Key'); // may be -1

      const staffRow = sVals.find(r => lc(val(r, eIdx)) === email);
      if (!staffRow) {
        ctx.authenticated = false;
        ctx.resolvedBy = 'selectedKey+no-staff';
        log(`Hard fail: email not found in PRIMARY Staff for selected key "${ctx.selectedSchoolKey}"`);
      } else {
        const rawRole = norm(val(staffRow, rIdx));
        if (rawRole) ctx.role = rawRole.toLowerCase();

        const dn = norm(val(staffRow, dnIdx));
        if (dn) ctx.userDisplayName = dn;

        const staffKey = norm(val(staffRow, skIdx));
        if (skIdx === -1) {
          // ✅ No School Key column → don't enforce
          ctx.authenticated = true;
          ctx.resolvedBy = 'selectedKey+staff(no-sk-col)';
          log(`Staff verified (no School Key column) for ${email}`);
        } else if (staffKey && staffKey === ctx.selectedSchoolKey) {
          ctx.authenticated = true;
          ctx.resolvedBy = 'selectedKey+staff';
          log(`School resolved by selected key "${ctx.selectedSchoolKey}" and Staff verified in PRIMARY for ${email}`);
        } else {
          ctx.authenticated = false;
          ctx.resolvedBy = 'selectedKey+staff-mismatch';
          log(`Hard fail: Staff row key "${staffKey}" does not match selected key "${ctx.selectedSchoolKey}" for ${email}`);
        }
      }
    } catch (errPrimary) {
      log(`Error opening tenant Primary/Data Sheet URL: ${errPrimary}`);
    }
  } catch (err) {
    log(`Fatal in getUserContext_: ${err && err.stack || err}`);
  }

  cache.put(cacheKey, JSON.stringify(ctx), 300);
  return ctx;
}

// ========================================
// 🎨 Branding lookup from CONFIG -> "Schools"
// Matches first by Primary workbook ID, then by School Name
function applyBrandingFromConfig_(ctx) {
  try {
    if (!CONFIG_SHEET_URL) return false;

    var ss   = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    var sh   = ss.getSheetByName('Schools');
    if (!sh) {
      Logger.log('[Branding] Sheet "Schools" not found in config.');
      return false;
    }

    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) {
      Logger.log('[Branding] No rows in "Schools".');
      return false;
    }

    var h = values[0];
    var idx = function(names){ return findHeaderIndex_(h, names); };

    var iName = idx(['School Name','School','Name']);
    var iColor = idx(['Color','Colour','School Color','School Colour']);
    var iLogo  = idx(['Logo URL','Logo','School Logo']);
    var iUrl   = idx(['Data Sheet URL','Primary Spreadsheet URL','Primary URL']);

    var wantId = parseSpreadsheetId_(ctx.dataSheetUrl || '');
    var chosen = null;

    // 1) Prefer match by Primary workbook ID
    if (iUrl >= 0 && wantId) {
      for (var r=1; r<values.length; r++) {
        var rowUrl = String(values[r][iUrl] || '');
        var rowId  = parseSpreadsheetId_(rowUrl);
        if (rowId && rowId === wantId) { chosen = values[r]; break; }
      }
    }

    // 2) Fallback: match by School Name (case-insensitive)
    if (!chosen && iName >= 0 && (ctx.schoolName||'').trim()) {
      var wantName = String(ctx.schoolName).toLowerCase().trim();
      for (var r2=1; r2<values.length; r2++) {
        var nm = String(values[r2][iName] || '').toLowerCase().trim();
        if (nm && nm === wantName) { chosen = values[r2]; break; }
      }
    }

    if (!chosen) {
      Logger.log('[Branding] No matching row in "Schools" (by URL or name).');
      return false;
    }

    // Pull colour + logo
    var color = (iColor >= 0 ? String(chosen[iColor] || '').trim() : '');
    var logo  = (iLogo  >= 0 ? String(chosen[iLogo]  || '').trim() : '');

    // Normalise colour (accepts "#abc", "#aabbcc", or plain hex)
    if (color && !/^#/.test(color)) color = '#' + color;
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      Logger.log('[Branding] Invalid color "' + color + '", keeping default.');
      color = '';
    }

    if (color) ctx.schoolColor = color;
    if (logo)  ctx.schoolLogo  = logo;

    Logger.log('[Branding] Applied: color=' + (ctx.schoolColor||'(none)') + ', logo=' + (ctx.schoolLogo||'(none)'));
    return true;
  } catch (e) {
    Logger.log('[Branding] Error: ' + (e && e.message ? e.message : e));
    return false;
  }
}

// === Admin helpers ===
// Save the current /exec URL to Script Properties (run once from editor)
// Paste at top level (not inside another function)
// Logs client-side breadcrumbs into server logs.
function doClientLog(label, payloadJson) {
  try {
    Logger.log('%s %s', label || '', payloadJson || '');
  } catch (e) {}
}

/**
 * Build Incidents CSV or PDF and return Base64 for the browser to download.
 * No DocumentApp. Uses HtmlService for PDF so no extra scopes are needed.
 * @param {'csv'|'pdf'} kind
 * @param {{school?:string,days?:number|string,limit?:number|string,grade?:string,subject?:string,teacher?:string,learner?:string,nature?:string}} f
 * @return {{ok:boolean,b64?:string,filename?:string,mime?:string,reason?:string}}
 */
function buildIncidentsDownloadBase64(kind, f) {
  try {
    Logger.log('[buildIncidentsDownloadBase64] start kind=%s f=%s', kind, JSON.stringify(f || {}));

    // ---- Resolve context + workbook (same way your Incidents page does) ----
    var ctx = getUserContext_();                       // has selectedSchoolKey, schoolName, etc.
    if (f && f.school) ctx.selectedSchoolKey = String(f.school || '');
    ensurePrimaryWorkbookInCtx_(ctx);                  // populates ctx.dataSheetUrl

    if (!ctx || !ctx.dataSheetUrl) {
      return { ok:false, reason:'No data sheet configured for this user/school.' };
    }

    // ---- Normalize filters to match the Incidents page ----
    var opts = {
      days:    toInt_(f && f.days,   30),
      limit:   toInt_(f && f.limit,  100),
      grade:   (f && f.grade)   || '',
      subject: (f && f.subject) || '',
      teacher: (f && f.teacher) || '',
      learner: (f && f.learner) || '',
      nature:  (f && f.nature)  || ''
    };

    // ---- Fetch rows exactly as used in Incidents (6 columns) ----
    var rows = getIncidents_(ctx.dataSheetUrl, opts);  // [ [Date, Learner, Grade, Subject, Teacher, Nature], ... ]

    // ---- CSV path ----
    if (String(kind) === 'csv') {
      var csv = buildIncidentsCsvText_(rows);
      // BOM helps Excel open UTF-8 correctly
      var blob = Utilities.newBlob('\uFEFF' + csv, 'text/csv',
                  'Incidents_' + new Date().toISOString().slice(0,10) + '.csv');
      return {
        ok: true,
        b64: Utilities.base64Encode(blob.getBytes()),
        filename: blob.getName(),
        mime: blob.getContentType()
      };
    }

    // ---- PDF path (HtmlService → PDF) ----
    var html = buildIncidentsPdfHtml_(rows, opts, ctx);
    var out  = HtmlService.createHtmlOutput(html).setTitle('Incidents Report');
    var pdf  = out.getAs('application/pdf')
                  .setName('Incidents_' + new Date().toISOString().slice(0,10) + '.pdf');

    return {
      ok: true,
      b64: Utilities.base64Encode(pdf.getBytes()),
      filename: pdf.getName(),
      mime: 'application/pdf'
    };

  } catch (e) {
    Logger.log('[buildIncidentsDownloadBase64] ERROR: ' + (e && e.message ? e.message : e));
    return { ok:false, reason: (e && e.message) ? e.message : String(e) };
  }
}

// ---- helpers (local to this module) ----
function toInt_(v, d){ var n = parseInt(v,10); return isFinite(n) ? n : d; }

function csvCell_(v){
  var s = String(v == null ? '' : v);
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}

function buildIncidentsCsvText_(rows){
  var out = [];
  out.push(['Date','Learner','Grade','Subject','Teacher','Nature'].join(','));
  for (var i=0;i<rows.length;i++){
    var r = rows[i] || [];
    out.push([r[0], r[1], r[2], r[3], r[4], r[5]].map(csvCell_).join(','));
  }
  return out.join('\r\n');
}

function htmlEsc_(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
  });
}
function buildIncidentsPdfHtml_(rows, opts, ctx){
  var school = (ctx && ctx.schoolName) ? ctx.schoolName : '';
  var h = [];
  h.push('<!doctype html><html><head><meta charset="utf-8"><style>');
  h.push('body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px;}');
  h.push('h1{font-size:18px;margin:0 0 6px;} .sub{color:#666;font-size:12px;margin:0 0 12px;}');
  h.push('table{width:100%;border-collapse:collapse;font-size:10px;}');
  h.push('th,td{border:1px solid #ccc;padding:4px;text-align:left;} th{background:#f0f0f0;}');
  h.push('@page { size: A4; margin: 16mm; }');
  h.push('</style></head><body>');
  h.push('<h1>Incidents report</h1>');
  h.push('<div class="sub">School: ' + htmlEsc_(school)
      + ' • Last ' + htmlEsc_(opts.days) + ' days'
      + ' • Limit ' + htmlEsc_(opts.limit) + '</div>');
  h.push('<table><thead><tr><th>Date</th><th>Learner</th><th>Grade</th><th>Subject</th><th>Teacher</th><th>Nature</th></tr></thead><tbody>');
  for (var i=0;i<rows.length;i++){
    var r = rows[i] || [];
    h.push('<tr>'
      + '<td>' + htmlEsc_(r[0]) + '</td>'
      + '<td>' + htmlEsc_(r[1]) + '</td>'
      + '<td>' + htmlEsc_(r[2]) + '</td>'
      + '<td>' + htmlEsc_(r[3]) + '</td>'
      + '<td>' + htmlEsc_(r[4]) + '</td>'
      + '<td>' + htmlEsc_(r[5]) + '</td>'
      + '</tr>');
  }
  h.push('</tbody></table></body></html>');
  return h.join('');
}

// Example CSV helper (adjust columns to match your rows)
/*function buildCsv_(rows) {
  var out = [];
  out.push(['Date','Learner','Grade','Subject','Teacher','Nature'].join(','));
  rows.forEach(function(r){
    out.push([r[0], r[1], r[2], r[3], r[4], r[5]].map(csvCell_).join(','));
  });
  return out.join('\r\n');
}
function csvCell_(v) {
  var s = String(v == null ? '' : v);
  return /[,"\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}*/

// =====================
// URL + Render Helpers
// =====================
/** Always return the absolute /exec URL for THIS deployment. */
function getExecUrl_() {
  try {
    // If you already have getWebAppUrl_(), keep using it – but ensure it returns /exec
    var u = (typeof getWebAppUrl_ === 'function' ? getWebAppUrl_() : '') || ScriptApp.getService().getUrl() || '';
    return (u.split('?')[0] || u); // no query
  } catch (e) {
    Logger.log('[getExecUrl_] failed: ' + (e && e.message || e));
    return (ScriptApp.getService().getUrl() || '').split('?')[0];
  }
}

/** Build a server URL to a page with params. */
function buildUrl_(base, page, params) {
  var b = (base || getExecUrl_());
  var q = { page: page };
  if (params) for (var k in params) if (params.hasOwnProperty(k) && params[k] !== undefined) q[k] = params[k];
  var qs = Object.keys(q).map(function(k){
    return encodeURIComponent(k) + '=' + encodeURIComponent(String(q[k]));
  }).join('&');
  return b + '?' + qs;
}

/** Directly render the Login (school selection) page — no external redirects. */
function renderLoginDirect_(scriptUrl, options) {
  var loginUrl = buildUrl_(scriptUrl || getExecUrl_(), 'login', { clearCache: true, forcePick: 1 });
  var baseUrl = '';
  try { baseUrl = (typeof getWebAppBase === 'function' ? (getWebAppBase() || '') : ''); } catch (_) {}

  // 🔑 PATCH: persist an explicitly provided school (if any) for this user
  // No-op unless options.school is truthy. Complements the page===login patch.
  try {
    var chosen = options && options.school ? String(options.school).trim() : '';
    if (chosen) {
      var em = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';
      if (em) {
        PropertiesService.getUserProperties()
          .setProperty('lastSchoolKey:' + em, chosen);
        Logger.log('[LoginDirect] captured school=' + chosen);
      }
    }
  } catch (_) {}

  return renderPage_('login', {
    signinUrl:     loginUrl,                     // if template uses it
    redirect:      loginUrl,                     // if template uses it
    safeRedirect:  JSON.stringify(loginUrl),     // if template uses it
    baseUrl:       baseUrl,
    publicUrl:     scriptUrl || getExecUrl_(),
    scriptUrl:     scriptUrl || getExecUrl_(),
    forcePick:     1,
    // allow caller to pass extras like a message
    msg:           (options && options.msg) || ''
  }).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Always return a clean, absolute base URL for this deployment (no querystring). */
function getBaseScriptUrl_() {
  try {
    // Works reliably for both latest deployment and test deployments
    const url = ScriptApp.getService().getUrl();
    return url ? url.split('?')[0] : '';
  } catch (err) {
    console.error('[getBaseScriptUrl_] failed', err);
    return '';
  }
}

/** Ensure ctx.scriptUrl is always present (and clean). */
function ensureScriptUrlOnCtx_(ctx) {
  const base = getBaseScriptUrl_();
  if (!ctx) ctx = {};
  ctx.scriptUrl = base;        // <- single source of truth, no params
  return ctx;
}

// ========================================
// 🔧 Helper: resolve + remember selected school key
// - Order: URL ?school -> UserProperties -> single-school default -> blank
// - Side effect: persists last selection for the signed-in user
function resolveSelectedSchoolKey_(ctx, e) {
  try {
    ctx = ctx || {};
    var paramSchool = (e && e.parameter && e.parameter.school) ? String(e.parameter.school).trim() : '';
    var userEmail   = (ctx && ctx.email) || ((Session.getActiveUser() && Session.getActiveUser().getEmail()) || '');
    var up          = PropertiesService.getUserProperties();
    var lastKey     = '';
    try { lastKey = up.getProperty('lastSchoolKey:' + (userEmail || '(anon)')) || ''; } catch (_){}

    // 1) Prefer explicit URL param
    var resolvedKey = paramSchool || lastKey;

    // 2) If still blank and there is exactly one school, default to it
    if (!resolvedKey) {
      try {
        // Use an existing list on ctx if present; otherwise try a helper if you have one
        var schools = (ctx && ctx.schoolsList) ? ctx.schoolsList
                    : (typeof getSchoolsList_ === 'function' ? getSchoolsList_() : []);
        if (Array.isArray(schools) && schools.length === 1) {
          // Support both shapes: {key: 'ABC'} or ['ABC', 'School Name', ...]
          resolvedKey = String((schools[0] && (schools[0].key || schools[0][0])) || '').trim();
          if (resolvedKey) Logger.log('[Ctx] Only one school -> default selectedSchoolKey=' + resolvedKey);
        }
      } catch (_) {}
    }

    // 3) Apply to ctx
    ctx.selectedSchoolKey = resolvedKey || '';

    // 4) Persist when known so future pages without ?school reuse it
    if (ctx.selectedSchoolKey && userEmail) {
      try { up.setProperty('lastSchoolKey:' + userEmail, ctx.selectedSchoolKey); } catch (_){}
    }

    Logger.log('[Ctx] selectedSchoolKey=' + (ctx.selectedSchoolKey || '(blank)'));
  } catch (eSel) {
    Logger.log('[Ctx] school resolution error: ' + (eSel && eSel.message ? eSel.message : eSel));
  }
  return ctx;
}

function normalizeExecUrl_(raw) {
  var s = String(raw || '').trim();

  // If user copied the test URL (/dev), convert to /exec
  s = s.replace(/\/dev(\?.*)?$/i, '/exec');

  // Drop querystring or hash if pasted
  s = s.replace(/[?#].*$/, '');

  // Validate and recompose to a clean canonical form
  var m = s.match(/^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/);
  return m ? ('https://script.google.com/macros/s/' + m[1] + '/exec') : '';
}

/************************************************************
 * 🔎 Page Map & Template Validator (non-destructive)
 * - Reads HTML files, checks the top marker comment
 * - Confirms routing map and reports mismatches
 * - Safe to run; does NOT modify any files
 ************************************************************/

/************************************************************
 * 🔎 Page Map & Template Validator (robust)
 ************************************************************/
const ROUTES = {
  login:     'Login',
  home:      'Home',
  incidents: 'Incidents',
  parents:   'Parents',   // remove if you don't use it
  report:    'Report',    // keep only if file exists
  csv:       'Csv',       // keep only if file exists
  logout:    'Logout',
};

function _getHtmlContent_(fileNameWithoutExt) {
  try {
    return HtmlService.createHtmlOutputFromFile(fileNameWithoutExt).getContent() || '';
  } catch (err) {
    return '';
  }
}

function _firstHtmlComment_(html) {
  const m = html.match(/<!--([\s\S]*?)-->/);
  return m ? (m[1] || '').trim() : '';
}

/** NEW: find a PAGE marker anywhere, and report its position */
function _findMarkerAnywhere_(html, expected) {
  const re = /<!--([\s\S]*?)-->/g;
  let idx = 0, match;
  while ((match = re.exec(html)) !== null) {
    const text = (match[1] || '').trim();
    if (text === expected) return { found: true, index: idx, raw: text };
    idx++;
  }
  return { found: false, index: -1, raw: '' };
}

function _expectedMarkerFor_(pageTitle) {
  return `PAGE: ${pageTitle}`;
}

function _listProjectHtmlFiles_() {
  const guesses = ['Login','Home','Incidents','Parents','Report','Csv','Logout','Footer','Header','Shared','Home_Test'];
  const found = [];
  for (const base of guesses) {
    const html = _getHtmlContent_(base);
    if (html) found.push(base + '.html');
  }
  return found;
}

function _sniffForeignContent_(fileBase, html) {
  const signatures = {
    Login:     ['onContinue', 'schoolSelect', 'Enter your email', 'Choose your school'],
    Home:      ['Welcome', 'Dashboard', 'Manager', 'Teacher'],
    Incidents: ['Incident', 'Create Incident', 'Submit Incident', 'Incident List'],
    Report:    ['Create Report', 'Download CSV', 'Filters'],
    Logout:    ['Logging Out', 'redirect'],
  };
  const foreignPairs = Object.entries(signatures).filter(([k]) => k !== fileBase);
  const hits = [];
  for (const [otherBase, sigs] of foreignPairs) {
    for (const s of sigs) {
      if (s && html.includes(s)) hits.push(`${otherBase}:${s}`);
    }
  }
  if (hits.length) {
    Logger.log(`⚠️  ${fileBase}.html seems to contain content usually found in: ${hits.slice(0, 6).join(' | ')}${hits.length > 6 ? ' …' : ''}`);
  }
}

function validateProject() {
  const pages = Object.entries(ROUTES);
  const seenFiles = new Set();

  Logger.log('🔎 Validating templates & routing …');

  for (const [routeKey, fileBase] of pages) {
    const html = _getHtmlContent_(fileBase);
    seenFiles.add(fileBase + '.html');

    if (!html) {
      Logger.log(`❌ Missing or unreadable HTML: ${fileBase}.html (route: "${routeKey}")`);
      continue;
    }

    const expected = _expectedMarkerFor_(fileBase);
    const firstComment = _firstHtmlComment_(html);
    const any = _findMarkerAnywhere_(html, expected);

    if (!firstComment && !any.found) {
      Logger.log(`⚠️  No PAGE marker found anywhere in ${fileBase}.html. Expected: "<!-- ${expected} -->"`);
    } else if (firstComment === expected) {
      Logger.log(`✅ ${fileBase}.html marker OK at top ("${firstComment}")`);
    } else if (any.found) {
      Logger.log(`⚠️  ${fileBase}.html marker present but not first comment (index ${any.index}). Move "<!-- ${expected} -->" to the very top.`);
    } else {
      Logger.log(`❌ ${fileBase}.html first comment is "${firstComment}", expected "<!-- ${expected} -->"`);
    }

    _sniffForeignContent_(fileBase, html);
  }

  const projectFiles = _listProjectHtmlFiles_();
  const orphans = projectFiles.filter(f => !seenFiles.has(f));
  if (orphans.length) {
    Logger.log('ℹ️ Other HTML files in project (not in ROUTES): ' + orphans.join(', '));
  } else {
    Logger.log('ℹ️ No extra HTML files detected.');
  }

  Logger.log('✅ Validation pass complete.');
}
//End of validation

/**
 * Returns the correct Web App URL for this deployment.
 * Priority:
 *   1) Script Property WEB_APP_URL (override)
 *   2) ScriptApp.getService().getUrl() (auto)
 * Normalizes to /exec (never /dev) for links sent to users.
 */
function getWebAppUrl_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const fromProp = (props.getProperty('WEB_APP_URL') || '').trim();
    const url = fromProp || ScriptApp.getService().getUrl() || '';
    // Normalize any /dev to /exec for public links
    return url.replace(/\/dev(\b|\/|\?|$)/, '/exec$1');
  } catch (e) {
    return '';
  }
}

/**
 * Canonical base for this web app.
 * In Test Deployments it returns the /dev URL; in Prod it returns /exec.
 * Optional override via Script Property WEB_APP_BASE.
 * Exposed publicly so Login.html can call google.script.run.getWebAppBase().
 */
function getWebAppBase() {
  try {
    const props = PropertiesService.getScriptProperties();
    const fromProp = (props.getProperty('WEB_APP_BASE') || '').trim(); // optional
    if (fromProp) return fromProp;
    const url = ScriptApp.getService().getUrl(); // /dev in test, /exec in prod
    return url || '';
  } catch (e) {
    Logger.log('[getWebAppBase] ' + (e && e.message ? e.message : e));
    return '';
  }
}

/**
 * Generic page renderer for HtmlService templates.
 * Usage: return renderPage_('login', { baseUrl, publicUrl, ctx });
 *
 * - Resolves 'login' -> 'Login.html', 'home' -> 'Home.html', etc.
 * - Spreads the data object onto the template so your HTML can use it directly.
 * - Keeps consistent title prefix and X-Frame options.
 */
function renderPage_(viewName, data) {
  try {
    // 1) Resolve template filename: 'login' -> 'Login'
    var safe = String(viewName || '').trim();
    if (!safe) safe = 'Login';
    var file = safe.charAt(0).toUpperCase() + safe.slice(1);

    // 2) Create and populate the template
    var t = HtmlService.createTemplateFromFile(file);
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(function (k) { t[k] = data[k]; });
    }
    
    // 3) Evaluate, read the page's <title>, then set it (HTML wins)
    var out  = t.evaluate();
    var html = out.getContent() || '';
    var m    = html.match(/<title>([^<]*)<\/title>/i);
    var title = (m && m[1]) ? m[1] : ('InForm – ' + file);

    return out
      .setTitle(title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // keep embedding behavior
  } catch (err) {
    // Helpful debug output during test deployments
    var msg = (err && err.message) ? err.message : String(err);
    Logger.log('[renderPage_] ' + msg);

    var body = '<h3>Render error</h3>'
      + '<p><b>View:</b> ' + (viewName || '(none)') + '</p>'
      + '<pre style="white-space:pre-wrap;">' + msg + '</pre>';

    return HtmlService.createHtmlOutput(body)
      .setTitle('InForm – Render Error')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

// ==============================
// Code.gs — tiny helpers for Login
// ==============================
// Public API for client (Login.html calls this).
function getContext() {
  // Keep it simple: just delegate to your canonical context provider.
  try {
    return getUserContext_({ parameter: {} }); // safe even if e is missing
  } catch (err) {
    Logger.log('[getContext] error: ' + (err && err.message ? err.message : err));
    return { ok:false, reason: String(err || 'unknown') };
  }
}

// List all Active=Y schools for the dropdown on Login.html
function listActiveSchools() {
  const out = [];
  try {
    const ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    const sh = ss.getSheetByName('Schools');
    if (!sh) return out;

    const vals = sh.getDataRange().getValues();
    const head = vals.shift().map(h => String(h).trim());
    const idx = n => head.indexOf(n);

    const kIdx = idx('School Key');
    const nIdx = idx('School Name');
    const aIdx = idx('Active');
    const dIdx = idx('Email Domain');

    vals.forEach(r => {
      const active = String(r[aIdx] || '').trim().toUpperCase() === 'Y';
      if (active) {
        out.push({
          key: String(r[kIdx] || '').trim(),
          name: String(r[nIdx] || '').trim(),
          domain: String(r[dIdx] || '').trim()
        });
      }
    });
  } catch (err) {
    console.log('[Login] listActiveSchools error: ' + (err && err.stack || err));
  }
  return out;
}

// ========================================
// 🔐 School Key Selection (low-risk add)
// - Persist user-selected School Key (per email) in Cache + UserProperties
// - Resolve tenant branding + primary workbook from CONFIG by School Key
// - Validate Staff from the school's PRIMARY workbook (hard fail if missing)
// ========================================

function _cacheKeyForSelectedSchool_(email) {
  return 'selectedSchoolKey:' + (email || 'unknown').toLowerCase();
}

function setSelectedSchoolKeyForEmail_(email, schoolKey) {
  schoolKey = (schoolKey || '').trim();
  const cache = CacheService.getScriptCache();
  cache.put(_cacheKeyForSelectedSchool_(email), schoolKey, 21600); // 6h
  const props = PropertiesService.getUserProperties();
  props.setProperty(_cacheKeyForSelectedSchool_(email), schoolKey);
  Logger.log('[SchoolResolve] Selected School Key set for ' + email + ' → ' + schoolKey);
}

function getSelectedSchoolKeyForEmail_(email) {
  const cache = CacheService.getScriptCache();
  const k = _cacheKeyForSelectedSchool_(email);
  let v = cache.get(k);
  if (v) return v;
  const props = PropertiesService.getUserProperties();
  v = props.getProperty(k) || '';
  if (v) cache.put(k, v, 21600);
  return v;
}

/**
 * Look up School row by School Key in CONFIG_SHEET_URL → "Schools".
 * Returns null if not found or inactive.
 */
function findSchoolByKey_(schoolKey) {
  try {
    const ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    const sh = ss.getSheetByName('Schools') || ss.getSheetByName('Sheet1'); // tolerant to rename
    if (!sh) return null;
    const values = sh.getDataRange().getDisplayValues();
    if (values.length < 2) return null;

    const H = values[0].map(h => (h || '').toString().trim().toLowerCase());
    const idx = {
      key: H.indexOf('school key'),
      name: H.indexOf('school name'),
      domain: H.indexOf('email domain'),
      color: H.indexOf('color'),
      logo: H.indexOf('logo url'),
      data: H.indexOf('data sheet url'),
      inc: H.indexOf('incident form url'),
      att: H.indexOf('attendance form url'),
      active: H.indexOf('active')
    };
    if (idx.key < 0 || idx.name < 0 || idx.active < 0) return null;

    const needle = (schoolKey || '').trim();
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (!r || !r.length) continue;
      if ((r[idx.key] || '').toString().trim() === needle) {
        const active = ((r[idx.active] || '') + '').trim().toUpperCase() === 'Y';
        if (!active) return null;
        return {
          schoolKey: needle,
          schoolName: (r[idx.name] || '').trim(),
          schoolColor: (r[idx.color] || '').trim(),
          schoolLogo: (r[idx.logo] || '').trim(),
          dataSheetUrl: (r[idx.data] || '').trim(),
          incidentFormUrl: (r[idx.inc] || '').trim(),
          attendanceFormUrl: (r[idx.att] || '').trim(),
          emailDomain: (r[idx.domain] || '').trim()
        };
      }
    }
    return null;
  } catch (err) {
    Logger.log('[SchoolResolve] findSchoolByKey_ error: ' + err);
    return null;
  }
}

/**
 * Read Staff from the TENANT PRIMARY workbook (not CONFIG).
 * PRIMARY must have a "Staff" sheet with headers:
 * Email | Display Name | Role | (optional others)
 */
function findStaffInPrimary_(primaryDataSheetUrl, email) {
  try {
    if (!primaryDataSheetUrl) return null;
    const ss = SpreadsheetApp.openByUrl(primaryDataSheetUrl);
    const sh = ss.getSheetByName('Staff');
    if (!sh) return null;
    const values = sh.getDataRange().getDisplayValues();
    if (values.length < 2) return null;

    const H = values[0].map(h => (h || '').toString().trim().toLowerCase());
    const colEmail = H.indexOf('email');
    const colName  = H.indexOf('display name');
    const colRole  = H.indexOf('role');
    if (colEmail < 0 || colRole < 0) return null;

    const needle = (email || '').toString().trim().toLowerCase();
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (!r || !r.length) continue;
      const em = (r[colEmail] || '').toString().trim().toLowerCase();
      if (em === needle) {
        const roleRaw = (r[colRole] || '').toString().trim().toLowerCase();
        const role = (roleRaw === 'admin' || roleRaw === 'administrator') ? 'admin'
                   : (roleRaw === 'manager' || roleRaw === 'owner') ? 'manager'
                   : 'teacher';
        return {
          displayName: (r[colName] || '').toString().trim(),
          role
        };
      }
    }
    return null;
  } catch (err) {
    Logger.log('[SchoolResolve] findStaffInPrimary_ error: ' + err);
    return null;
  }
}

/**
 * Small hook inside doGet/doPost to capture ?setSchoolKey=... and cache it.
 * Call this at the very top of doGet(e) (before routing), or at the start of getUserContext_(e).
 */
function maybeCaptureSchoolKeyParam_(e, email) {
  try {
    if (e && e.parameter && e.parameter.setSchoolKey) {
      const key = (e.parameter.setSchoolKey || '').trim();
      if (key) {
        setSelectedSchoolKeyForEmail_(email, key);
        // Also clear userCtx cache to ensure fresh branding resolves immediately
        const cache = CacheService.getScriptCache();
        cache.remove('userCtx:' + (email || '').toLowerCase());
        Logger.log('[SchoolResolve] Captured setSchoolKey=' + key + ' for ' + email);
      }
    }
  } catch (err) {
    Logger.log('[SchoolResolve] maybeCaptureSchoolKeyParam_ error: ' + err);
  }
}

function echoContextJson_(e) {
  var ctx = getUserContext_(e) || {};
  var safe = {
    email: ctx.email || '',
    userDisplayName: ctx.userDisplayName || '',
    role: ctx.role || '',
    schoolName: ctx.schoolName || '',
    schoolColor: ctx.schoolColor || '',
    schoolLogo: ctx.schoolLogo || '',
    dataSheetUrl: ctx.dataSheetUrl || '',
    incidentFormUrl: ctx.incidentFormUrl || '',
    attendanceFormUrl: ctx.attendanceFormUrl || '',
    scriptUrl: getBaseUrl_()
  };
  return ContentService
    .createTextOutput(JSON.stringify(safe, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

// Look for Staff sheet in the PRIMARY workbook; read Role + TeacherName for the signed-in email.
// Expected headers (case-insensitive): Email | Role | TeacherName (or Teacher Name)
// Falls back gracefully with reasons in logs.
function getStaffRoleFromDataSheet_(dataSheetUrl, email) {
  const out = { ok:false, role:'', displayName:'', reason:'' };
  try {
    if (!dataSheetUrl) { out.reason = 'Missing dataSheetUrl'; return out; }
    if (!email) { out.reason = 'Missing email'; return out; }

    const ss = SpreadsheetApp.openByUrl(dataSheetUrl);

    // Prefer 'Staff', otherwise try common alternates
    const preferred = ['Staff','Users','User Roles','UserRole','Roles','STAFF'];
    const allNames = ss.getSheets().map(s => s.getName());
    Logger.log('[StaffLookup] Available sheets: ' + JSON.stringify(allNames));

    let sh = null;
    for (const name of preferred) {
      sh = ss.getSheetByName(name);
      if (sh) { Logger.log('[StaffLookup] Using sheet: ' + name); break; }
    }
    if (!sh) {
      // last resort: if a legacy sheet exists
      sh = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet1.Old');
      if (sh) Logger.log('[StaffLookup] Using legacy sheet: ' + sh.getName());
    }
    if (!sh) { out.reason = 'Staff sheet not found'; return out; }

    const values = sh.getDataRange().getValues();
    if (!values || values.length < 2) { out.reason = 'No rows in Staff'; return out; }

    const h = values[0];
    const iEmail = findHeaderIndex_(h, ['Email','Email Address','User Email']);
    const iRole  = findHeaderIndex_(h, ['Role','User Role']);
    const iName  = findHeaderIndex_(h, ['TeacherName','Teacher Name','Name','Full Name','Display Name']);

    Logger.log('[StaffLookup] iEmail=' + iEmail + ' iRole=' + iRole + ' iName=' + iName);
    if (iEmail < 0 || iRole < 0) { out.reason = 'Missing Email/Role columns'; return out; }

    const needle = String(email||'').trim().toLowerCase();
    for (let r=1;r<values.length;r++){
      const em = String(values[r][iEmail] || '').trim().toLowerCase();
      if (em !== needle) continue;

      const role = String(values[r][iRole] || '').trim().toLowerCase() || 'teacher';
      const displayName = iName>=0 ? String(values[r][iName] || '').trim() : '';

      out.ok = true;
      out.role = role;
      out.displayName = displayName || ''; // leave blank; caller will fallback to getUsername()
      return out;
    }
    out.reason = 'No matching email';
    return out;
  } catch (e) {
    out.reason = (e && e.message ? e.message : String(e));
    return out;
  }
}

// ======================= School resolution helpers =======================

// 1) From the Staff sheet (main workbook), get School Key by teacher email.
function _lookupStaffSchoolKey_(email) {
  try {
    var ss = SpreadsheetApp.getActive();
    var staff = ss && ss.getSheetByName('Staff');
    if (!staff) { console.log('[SchoolResolve] Staff sheet missing'); return ''; }

    var vals = staff.getDataRange().getValues();
    if (!vals || vals.length < 2) return '';

    // Build header map (case-insensitive)
    var head = vals[0].map(function(h){ return String(h||'').toLowerCase().trim(); });
    function hIdx(name){ return head.indexOf(String(name||'').toLowerCase().trim()); }

    var iEmail = hIdx('email');
    var iKey   = hIdx('school key');     // <— required for this flow
    if (iEmail === -1 || iKey === -1) {
      console.log('[SchoolResolve] Staff headers missing Email and/or School Key');
      return '';
    }

    var target = String(email||'').toLowerCase().trim();
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      var rowEmail = String(row[iEmail]||'').toLowerCase().trim();
      if (rowEmail === target) {
        var key = String(row[iKey]||'').trim();
        if (key) return key;
        break;
      }
    }
    return '';
  } catch (err) {
    console.log('[SchoolResolve] _lookupStaffSchoolKey_ error:', err);
    return '';
  }
}

// 2) From Config → Schools, fetch fields by School Key (preferred) or Email Domain (fallback).
function _fetchSchoolFieldsByKeyOrDomain_(schoolKey, userEmail) {
  try {
    if (typeof CONFIG_SHEET_URL !== 'string' || !CONFIG_SHEET_URL) {
      console.log('[SchoolResolve] CONFIG_SHEET_URL not set'); 
      return null;
    }
    var cfg = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    var sh = cfg.getSheetByName('Schools') || cfg.getSheetByName('Sheet1'); // tolerate old name
    if (!sh) { console.log('[SchoolResolve] Schools sheet not found'); return null; }

    var data = sh.getDataRange().getValues();
    if (!data || data.length < 2) return null;

    // Header map
    var head = data[0].map(function(h){ return String(h||'').toLowerCase().trim(); });
    function hIdx(name){ return head.indexOf(String(name||'').toLowerCase().trim()); }

    var iActive = hIdx('active');
    var iKey    = hIdx('school key');
    var iName   = hIdx('school name');
    var iColor  = hIdx('color');
    var iLogo   = hIdx('logo url');
    var iData   = hIdx('data sheet url');
    var iInc    = hIdx('incident form url');
    var iAtt    = hIdx('attendance form url');
    var iDom    = hIdx('email domain');

    var email = String(userEmail||'').toLowerCase().trim();

    var domain = '';
    var at = email.indexOf('@');
    if (at > -1) domain = email.slice(at+1).toLowerCase().trim();

    // ---- Pass 1: STRICT by School Key (preferred) ----
    if (schoolKey && iKey !== -1) {
      for (var r1 = 1; r1 < data.length; r1++) {
        var row1 = data[r1];
        var isY = (iActive !== -1 && String(row1[iActive]||'').trim().toUpperCase() === 'Y');
        if (!isY) continue;
        var rowKey = String(row1[iKey]||'').trim();
        if (rowKey && rowKey === schoolKey) {
          return {
            matchedBy: 'key',
            schoolName:        iName!==-1 ? String(row1[iName]||'').trim() : '',
            schoolColor:       iColor!==-1? String(row1[iColor]||'').trim() : '',
            schoolLogo:        iLogo!==-1 ? String(row1[iLogo]||'').trim() : '',
            dataSheetUrl:      iData!==-1 ? String(row1[iData]||'').trim() : '',
            incidentFormUrl:   iInc!==-1  ? String(row1[iInc]||'').trim()  : '',
            attendanceFormUrl: iAtt!==-1  ? String(row1[iAtt]||'').trim()  : ''
          };
        }
      }
    }

    // ---- Pass 2: FALLBACK by Email Domain (optional) ----
    if (iDom !== -1 && domain) {
      for (var r2 = 1; r2 < data.length; r2++) {
        var row2 = data[r2];
        var isY2 = (iActive !== -1 && String(row2[iActive]||'').trim().toUpperCase() === 'Y');
        if (!isY2) continue;
        var rowDom = String(row2[iDom]||'').toLowerCase().trim();
        if (!rowDom) continue;
        // exact or suffix match (handles subdomains)
        if (domain === rowDom || domain.endsWith('.' + rowDom)) {
          return {
            matchedBy: 'domain',
            schoolName:        iName!==-1 ? String(row2[iName]||'').trim() : '',
            schoolColor:       iColor!==-1? String(row2[iColor]||'').trim() : '',
            schoolLogo:        iLogo!==-1 ? String(row2[iLogo]||'').trim() : '',
            dataSheetUrl:      iData!==-1 ? String(row2[iData]||'').trim() : '',
            incidentFormUrl:   iInc!==-1  ? String(row2[iInc]||'').trim()  : '',
            attendanceFormUrl: iAtt!==-1  ? String(row2[iAtt]||'').trim()  : ''
          };
        }
      }
    }

    // Nothing found
    return null;
  } catch (err) {
    console.log('[SchoolResolve] _fetchSchoolFieldsByKeyOrDomain_ error:', err);
    return null;
  }
}

function authorizeExternal() {
  // Simple external call just to trigger the consent screen
  var res = UrlFetchApp.fetch('https://www.google.com/generate_204', {muteHttpExceptions: true});
  Logger.log('External request OK: ' + res.getResponseCode());
}

function dumpScriptProperties_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Logger.log(JSON.stringify(props, null, 2));
}

function importScriptProperties() {
  // Paste the JSON string from the main project between the backticks:
  const JSON_FROM_MAIN = `
  { 
  "SMS_SA_DEFAULT_SENDER_ID": "0750311132",
  "SMS_SA_SEND_SMS_URL": "https://rest.mymobileapi.com/v3/BulkMessages",
  "SMS_SA_USERNAME": "92e1b68a-b614-447b-bafd-a54c8dc07d59",
  "SMS_SA_PASSWORD": "d0b9c324-c7ac-402e-9087-60ed72ce42c1",
  "EXEC_URL": "",
  "SMS_SA_AUTH_URL": "https://rest.mymobileapi.com/Authentication"
  }
  `;
  const obj = JSON.parse(JSON_FROM_MAIN);
  PropertiesService.getScriptProperties().setProperties(obj, true);
  Logger.log('Imported ' + Object.keys(obj).length + ' properties.');
}

function testSheetAccess() {
  try {
    var cfgSS = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    Logger.log('Config sheet accessible: ' + !!cfgSS.getSheetByName('Sheet1'));
    var ctx = getUserContext_();
    if (ctx.dataSheetUrl) {
      var dataSS = SpreadsheetApp.openByUrl(ctx.dataSheetUrl);
      Logger.log('Data sheet accessible: ' + !!dataSS.getSheetByName(CONTACT_SHEET_NAME));
    }
  } catch (e) {
    Logger.log('Sheet access error: ' + (e && e.message ? e.message : e));
  }
}

function testHealthPage() {
  var ctx = getUserContext_();
  var output = buildHealthReportHtml_(ctx);
  Logger.log('Health page output (first 500 chars): ' + output.getContent().slice(0, 500));
}

// Run this once from the IDE or wire it to the menu wrapper
function setExecUrlOnce() {
  // ⬇️ Paste your URL between quotes the first time you run it:
  var pasted = '';

  var cleaned = normalizeExecUrl_(pasted);
  if (!cleaned) {
    throw new Error(
      'Invalid /exec URL. Paste the Web App URL from "Manage deployments" that ends with /exec.\n' +
      'You gave: ' + pasted + '\n' +
      'Tip: If yours ends with /dev, replace it with /exec.'
    );
  }

  PropertiesService.getScriptProperties().setProperty('EXEC_URL', cleaned);
  CacheService.getScriptCache().remove('exec_url');
  Logger.log('EXEC_URL saved: ' + cleaned);
}

function clearExecUrlCache() {
  CacheService.getScriptCache().remove('exec_url');
  Logger.log('Cache cleared for exec_url');
}

// === ADD: Diagnostics builder for the /health page ===
function buildHealthReportHtml_(ctx) {
  Logger.log('buildHealthReportHtml_ started for email: ' + (ctx.email || 'none'));
  var ok = (b) => b ? '✅' : '❌';
  var rows = [];
  var details = [];

  // 1) Base URL
  var baseUrl = '';
  var baseValid = false;
  try {
    Logger.log('Checking base URL');
    baseUrl = getBaseUrl_();
    baseValid = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(baseUrl);
    Logger.log('Base URL check: valid=%s, url=%s', baseValid, baseUrl);
  } catch (e) {
    Logger.log('Error reading base URL: ' + (e && e.message ? e.message : e));
    details.push('Error reading base URL: ' + (e && e.message ? e.message : e));
  }
  rows.push([ok(baseValid), 'Web App URL available', baseValid ? baseUrl : 'Missing/invalid']);

  // 2) Config sheet reachability
  var cfgOk = false, cfgMsg = '';
  try {
    Logger.log('Checking config spreadsheet: %s', CONFIG_SHEET_URL);
    var cfgSS = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    var cfgSheet = cfgSS.getSheetByName('Sheet1');
    cfgOk = !!cfgSheet;
    cfgMsg = cfgOk ? 'Sheet1 found' : 'Sheet1 missing';
    Logger.log('Config sheet check: %s', cfgMsg);
  } catch (e) {
    cfgMsg = 'Open failed: ' + (e && e.message ? e.message : e);
    Logger.log('Config sheet error: %s', cfgMsg);
  }
  rows.push([ok(cfgOk), 'Config spreadsheet reachable', cfgMsg]);

  // 3) Contacts sheet + Token column in DATA workbook
  var dataUrl = ctx && ctx.dataSheetUrl ? ctx.dataSheetUrl : '';
  var contactsOk = false, tokenColOk = false, contactsMsg = '';
  try {
    Logger.log('Checking contacts sheet in data workbook: %s', dataUrl);
    if (!dataUrl) throw new Error('No dataSheetUrl in context');
    var dataSS = SpreadsheetApp.openByUrl(dataUrl);
    var contactSh = dataSS.getSheetByName(CONTACT_SHEET_NAME);
    contactsOk = !!contactSh;
    if (!contactsOk) {
      contactsMsg = 'Contacts sheet "' + CONTACT_SHEET_NAME + '" not found';
    } else {
      var h = contactSh.getDataRange().getValues()[0] || [];
      var iTok = findHeaderIndex_(h, ['Token','Parent Token','Portal Token']);
      tokenColOk = iTok >= 0;
      contactsMsg = tokenColOk ? 'Token column present' : 'Token column missing';
    }
    Logger.log('Contacts sheet check: contactsOk=%s, tokenColOk=%s, message=%s', contactsOk, tokenColOk, contactsMsg);
  } catch (e) {
    contactsMsg = 'Open failed: ' + (e && e.message ? e.message : e);
    Logger.log('Contacts sheet error: %s', contactsMsg);
  }
  rows.push([ok(contactsOk && tokenColOk), 'Contacts sheet & Token column', contactsMsg]);

  // 4) Sample token round-trip
  var tokenTestOk = false, tokenTestMsg = '';
  try {
    Logger.log('Starting sample token lookup');
    if (contactsOk && tokenColOk) {
      var values = SpreadsheetApp.openByUrl(dataUrl).getSheetByName(CONTACT_SHEET_NAME).getDataRange().getValues();
      var h = values[0]; var iTok = findHeaderIndex_(h, ['Token','Parent Token','Portal Token']);
      var foundTok = '';
      for (var r = 1; r < values.length; r++) {
        var t = String(values[r][iTok] || '').trim();
        if (t) { foundTok = t; break; }
      }
      if (!foundTok) {
        tokenTestMsg = 'No token values found to test';
      } else {
        Logger.log('Testing token: %s', maskToken_(foundTok));
        var pctx = getParentContextByToken_(foundTok);
        tokenTestOk = !!(pctx && pctx.ok && pctx.learner);
        tokenTestMsg = tokenTestOk
          ? ('Resolved learner: ' + pctx.learner + (pctx.grade ? (' (Grade ' + pctx.grade + ')') : ''))
          : 'Lookup failed (token not found in context)';
      }
    } else {
      tokenTestMsg = 'Skipped (contacts/token not OK)';
    }
    Logger.log('Sample token lookup result: ok=%s, message=%s', tokenTestOk, tokenTestMsg);
  } catch (e) {
    tokenTestMsg = 'Token test error: ' + (e && e.message ? e.message : e);
    Logger.log('Sample token lookup error: %s', tokenTestMsg);
  }
  rows.push([ok(tokenTestOk), 'Sample token lookup', tokenTestMsg]);

  // Render simple HTML
  var esc = function (s) { return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); };
  var li = rows.map(function (r) {
    return '<tr><td style="width:40px;">' + r[0] + '</td><td><strong>' + esc(r[1]) + '</strong><div style="color:#555;">' + esc(r[2]) + '</div></td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    '<title>InForm – Health</title>' +
    '<style>body{font-family:Arial,sans-serif;padding:20px;max-width:900px;margin:0 auto;color:#333}' +
    'table{width:100%;border-collapse:separate;border-spacing:0 10px}' +
    'td{vertical-align:top;padding:12px;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)}' +
    'h2{margin-top:0}</style></head><body>' +
    '<h2>🔎 InForm – Health Check</h2>' +
    '<table>' + li + '</table>' +
    '<p style="color:#666;margin-top:20px;">Tip: if the Web App URL changes, run <code>__setExecUrlOnce__()</code> with the new <code>/exec</code> URL, or re-deploy by editing the existing deployment (pencil icon) to keep the URL stable.</p>' +
    '</body></html>';

  Logger.log('buildHealthReportHtml_ completed, output length: %s chars', html.length);
  return HtmlService.createHtmlOutput(html)
    .setTitle('InForm – Health')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function __listSheetNames_(ss) {
  try { return ss.getSheets().map(s => s.getName()); } catch (e) { return []; }
}

// Try exact Staff, then case/trim variants, else header-based discovery
function __findStaffSheet_(ss) {
  // 1) exact
  let sh = ss.getSheetByName(STAFF_SHEET_NAME);
  if (sh) return sh;

  // 2) case/trim variants for common naming issues
  const wanted = String(STAFF_SHEET_NAME || 'Staff').toLowerCase().trim();
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) {
    const n = String(all[i].getName() || '').toLowerCase().trim();
    if (n === wanted) return all[i];            // "staff" == "Staff"
    if (n.replace(/\s+/g,'') === wanted.replace(/\s+/g,'')) return all[i]; // "Staff " or " Staff"
  }

  // 3) header-based discovery: find a sheet with Email + Role headers
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    try {
      const rng = s.getDataRange();
      if (!rng) continue;
      const vals = rng.getValues();
      if (!vals || vals.length < 1) continue;
      const h = vals[0];
      const iEmail = findHeaderIndex_(h, ['Email','Staff Email','User Email']);
      const iRole  = findHeaderIndex_(h, ['Role','Staff Role','Permission']);
      if (iEmail >= 0 && iRole >= 0) return s; // looks like a Staff sheet
    } catch (_) {}
  }
  return null;
}

/*******************************************************
 * 🔹 Thin wrappers for Login.html
 * - getTenantSchools(): list active schools from Config
 * - validateEmailForSchool(schoolKey, email): verify in PRIMARY Staff
 *******************************************************/
function getTenantSchools() {
  try {
    const ss = SpreadsheetApp.openByUrl(CONFIG_SHEET_URL);
    // Prefer your 'Schools' sheet; tolerate Sheet1 fallback:
    const sh = ss.getSheetByName('Schools') || ss.getSheetByName('Sheet1');
    if (!sh) return [];

    const rows = sh.getDataRange().getDisplayValues();
    if (!rows || rows.length < 2) return [];

    const H = rows[0].map(h => (h || '').toString().trim().toLowerCase());
    const idx = {
      active: H.indexOf('active'),
      key:    H.indexOf('school key'),
      name:   H.indexOf('school name'),
      logo:   H.indexOf('logo url'),
      color:  H.indexOf('color'),
      data:   H.indexOf('data sheet url')
    };

    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const isActive = (idx.active >= 0 ? String(row[idx.active] || '').trim().toUpperCase() === 'Y' : true);
      if (!isActive) continue;

      out.push({
        key:   idx.key   >= 0 ? String(row[idx.key]   || '').trim() : '',
        name:  idx.name  >= 0 ? String(row[idx.name]  || '').trim() : '',
        url:   idx.data  >= 0 ? String(row[idx.data]  || '').trim() : '',
        logo:  idx.logo  >= 0 ? String(row[idx.logo]  || '').trim() : '',
        color: idx.color >= 0 ? String(row[idx.color] || '').trim() : ''
      });
    }
    return out.filter(s => s.name); // must at least have a name
  } catch (err) {
    Logger.log('[LoginWrappers] getTenantSchools error: ' + err);
    return [];
  }
}

function validateEmailForSchool(schoolKey, emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email) return { ok: false, reason: 'Missing email' };
  const key = String(schoolKey || '').trim();
  if (!key) return { ok: false, reason: 'Missing school key' };

  // Reuse your existing resolvers:
  const school = findSchoolByKey_(key);
  if (!school) return { ok: false, reason: 'School not found or inactive in Config' };
  if (!school.dataSheetUrl) return { ok: false, reason: 'No Primary Data Sheet URL for this school' };

  const staff = findStaffInPrimary_(school.dataSheetUrl, email);
  if (!staff) {
    return { ok: false, reason: 'Email not found in Staff for this school' };
  }

  // Optional: persist the selection immediately for convenience
  try { setSelectedSchoolKeyForEmail_(email, key); } catch (e) {}

  return {
    ok: true,
    school: {
      key: school.schoolKey || key,
      name: school.schoolName || '',
      logo: school.schoolLogo || '',
      color: school.schoolColor || ''
    },
    role: staff.role || 'teacher',
    displayName: staff.displayName || '',
    message: 'Email found in Staff'
  };
}

//18Sept2025-10
// ========================================
// 📋 Incidents Page Renderer (server-side)
// Restores the function your router expects: showIncidentsPage(scriptUrl, ctx, opts)
// - Returns HtmlOutput for Incidents.html
// - Passes ctx, opts, and (optionally) pre-fetched data for the template to use

/** Render the Incidents page with data and hard logs */
function showIncidentsPage(baseUrl, ctx, opts) {
  // --- Normalize options
  var filters = {
    days:    (opts && parseInt(opts.days, 10)) || 30,
    limit:   (opts && parseInt(opts.limit, 10)) || 100,
    grade:   (opts && String(opts.grade || '')) || '',
    subject: (opts && String(opts.subject || '')) || '',
    teacher: (opts && String(opts.teacher || '')) || '',
    learner: (opts && String(opts.learner || '')) || '',
    nature:  (opts && String(opts.nature  || '')) || ''
  };

  // --- Sanity: data source
  if (!ctx || !ctx.dataSheetUrl) {
    Logger.log('[IncidentsPage] No ctx.dataSheetUrl; rendering empty template.');
    var t0 = HtmlService.createTemplateFromFile('Incidents');
    t0.schoolName  = (ctx && ctx.schoolName)  || 'School';
    t0.schoolLogo  = (ctx && ctx.schoolLogo)  || '';
    t0.schoolColor = (ctx && ctx.schoolColor) || '#1a73e8';
    t0.scriptUrl   = baseUrl || '';
    t0.filters = filters;
    t0.summary = { days: filters.days, totalInWindow: 0, today: 0, last7: 0, ytdTotal: 0,
                   topSubjects: [], topLearners: [], topNatures: [], byGrade: [] };
    t0.incidents = [];
    return t0.evaluate().setTitle('Incidents – InForm');
  }

  // --- Read data
  Logger.log('[Incidents] ➜ Reading from workbook: ' + ctx.dataSheetUrl);
  var summary   = getIncidentsSummary_(ctx.dataSheetUrl, filters);
  var incidents = getIncidents_(ctx.dataSheetUrl, filters);

  // --- Strong diagnostics
  if (incidents && incidents.length) {
    Logger.log('[IncidentsPage Incidents.v9-2025-09-19T08:55] count=%s firstRow=%s',
      incidents.length, JSON.stringify(incidents[0]));
  } else {
    Logger.log('[IncidentsPage Incidents.v9-2025-09-19T08:55] count=0');
  }

  // --- Template
  var t = HtmlService.createTemplateFromFile('Incidents');
  t.schoolName  = ctx.schoolName  || 'School';
  t.schoolLogo  = ctx.schoolLogo  || '';
  t.schoolColor = ctx.schoolColor || '#1a73e8';
  t.scriptUrl   = baseUrl || '';
  t.filters     = filters;
  t.summary     = summary || { days: filters.days, totalInWindow: 0, today: 0, last7: 0, ytdTotal: 0,
                               topSubjects: [], topLearners: [], topNatures: [], byGrade: [] };
  t.incidents   = incidents || [];

  //return t.evaluate().setTitle('Incidents – InForm');
  var out = t.evaluate();
  var html = out.getContent();
  var m = html.match(/<title>([^<]*)<\/title>/i);
  out.setTitle(m ? m[1] : 'Incidents – InForm');  // fallback only if no <title>
  return out;

}

// ========================================
// 🧩 Client-facing data APIs (optional but helpful)
// If your Incidents.html uses google.script.run to fetch data,
// expose thin wrappers that call your private helpers.

function listIncidentsForUi(opts) {
  try {
    var ctx = getUserContext_();
    if (!ctx || !ctx.dataSheetUrl) return [];
    var safeOpts = {
      days:    _toInt(opts && opts.days, 30),
      limit:   _toInt(opts && opts.limit, 100),
      grade:   (opts && opts.grade)   || '',
      subject: (opts && opts.subject) || '',
      teacher: (opts && opts.teacher) || '',
      learner: (opts && opts.learner) || '',
      nature:  (opts && opts.nature)  || ''
    };
    return getIncidents_(ctx.dataSheetUrl, safeOpts);
  } catch (e) {
    console.error('listIncidentsForUi failed:', e);
    return [];
  }
}

function getIncidentsSummaryForUi(opts) {
  try {
    var ctx = getUserContext_();
    var d = _toInt(opts && opts.days, 30);
    if (!ctx || !ctx.dataSheetUrl) {
      return { days: d, totalInWindow: 0, today: 0, last7: 0, ytdTotal: 0, topSubjects: [], topLearners: [], topNatures: [], byGrade: [] };
    }
    var safeOpts = {
      days:    d,
      limit:   _toInt(opts && opts.limit, 100),
      grade:   (opts && opts.grade)   || '',
      subject: (opts && opts.subject) || '',
      teacher: (opts && opts.teacher) || '',
      learner: (opts && opts.learner) || '',
      nature:  (opts && opts.nature)  || ''
    };
    return getIncidentsSummary_(ctx.dataSheetUrl, safeOpts);
  } catch (e) {
    console.error('getIncidentsSummaryForUi failed:', e);
    var dd = _toInt(opts && opts.days, 30);
    return { days: dd, totalInWindow: 0, today: 0, last7: 0, ytdTotal: 0, topSubjects: [], topLearners: [], topNatures: [], byGrade: [] };
  }
}

function testMask() {
  Logger.log(maskToken_('secret123'));
}

function testLogHelper() {
  logHelper('Testing log helper');
}