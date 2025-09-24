// === Masking helpers ===
// Mask long secrets/tokens in logs (e.g., ABCD…WXYZ)
function maskToken_(tok) {
  var s = String(tok || '');
  if (!s) return '';
  if (s.length <= 8) return '•'.repeat(s.length);
  return s.slice(0, 4) + '…' + s.slice(-4);
}

function logHelper(message) {
  Logger.log('[App] ' + message);
}