/**
 * @deprecated This file is kept for reference only. The active entry point is:
 * ./entry/background-entry.ts → BackgroundController
 * 
 * This file will be removed in v3.0.0
 * 
 * Background Service Worker Entry Point
 * 
 * CRITICAL: This file registers essential handlers FIRST before loading
 * any modules with heavy dependencies. This ensures:
 * 1. PING handler works immediately for wake-up detection
 * 2. Errors during module loading are captured and reported
 * 3. The service worker responds even if initialization fails
 * 
 * NOTE: We use require() instead of import to ensure our code runs
 * BEFORE the imported modules are executed.
 */

// ============================================================================
// Bootstrap State - Declared BEFORE any module loading
// ============================================================================

let _bootstrapReady = false;
let _bootstrapError: string | null = null;

// ============================================================================
// CRITICAL: Register PING handler IMMEDIATELY
// This MUST run before require() to ensure wake-up detection works
// even if the main module has errors
// ============================================================================

chrome.runtime.onMessage.addListener((message: { type?: string; requestId?: string }, _sender, sendResponse) => {
  // Handle PING immediately for service worker wake-up detection
  if (message?.type === 'PING') {
    console.log('[background] PING received', { 
      ready: _bootstrapReady, 
      error: _bootstrapError 
    });
    sendResponse({
      success: true,
      data: { 
        pong: true, 
        timestamp: Date.now(), 
        ready: _bootstrapReady,
        mainLoaded: true, // Will be true after require() completes
        error: _bootstrapError 
      },
      requestId: message.requestId,
    });
    return true;
  }
  // Let other listeners handle non-PING messages
  return false;
});

console.log('[background] Bootstrap PING handler registered, timestamp:', Date.now());

// ============================================================================
// CRITICAL: Enable chrome.storage.session access for content scripts
// By default, session storage is only accessible from the service worker.
// We need to explicitly allow content scripts to access it for session token storage.
// ============================================================================

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  .then(() => {
    console.log('[background] Session storage access level set for content scripts');
  })
  .catch((error) => {
    console.error('[background] Failed to set session storage access level:', error);
  });

// ============================================================================
// Load main module using require() - this is synchronous but runs AFTER
// the code above. Unlike import, require() doesn't get hoisted.
// ============================================================================

try {
  console.log('[background] Loading main module...');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./background-main');
  _bootstrapReady = true;
  console.log('[background] Main module loaded, bootstrap ready');
} catch (error) {
  console.error('[background] Failed to load main module:', error);
  _bootstrapError = error instanceof Error ? error.message : String(error);
  
  // Store error for debugging
  chrome.storage.local.set({
    _sw_bootstrap_error: {
      message: _bootstrapError,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: Date.now()
    }
  }).catch(() => {});
}

