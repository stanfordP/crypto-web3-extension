/**
 * Background Service Worker Bootstrap
 * 
 * CRITICAL: This file registers the PING handler FIRST before loading
 * any other modules. This ensures service worker wake-up detection works
 * even if the main background script has import errors.
 * 
 * This file MUST have NO imports at the top level to ensure it runs first.
 */

// ============================================================================
// Bootstrap State
// ============================================================================

let _bootstrapReady = false;
let _bootstrapError: string | null = null;
let _mainModuleLoaded = false;

// ============================================================================
// CRITICAL: Register PING handler IMMEDIATELY
// ============================================================================

chrome.runtime.onMessage.addListener((message: { type?: string; requestId?: string }, _sender, sendResponse) => {
  // Handle PING immediately for service worker wake-up detection
  if (message?.type === 'PING') {
    console.log('[bootstrap] Responding to PING', { 
      ready: _bootstrapReady, 
      mainLoaded: _mainModuleLoaded,
      error: _bootstrapError 
    });
    sendResponse({
      success: true,
      data: { 
        pong: true, 
        timestamp: Date.now(), 
        ready: _bootstrapReady,
        mainLoaded: _mainModuleLoaded,
        error: _bootstrapError 
      },
      requestId: message.requestId,
    });
    return true;
  }
  // Let the main module handle non-PING messages
  return false;
});

console.log('[bootstrap] PING handler registered - loading main module...');

// ============================================================================
// Load Main Module Dynamically
// This ensures PING handler is registered before any imports run
// ============================================================================

import('./background-main')
  .then((module) => {
    console.log('[bootstrap] Main module loaded successfully');
    _mainModuleLoaded = true;
    
    // Set the bootstrap ready callback so main module can update state
    module.setBootstrapReadyCallback((ready: boolean, error: string | null) => {
      _bootstrapReady = ready;
      _bootstrapError = error;
      console.log('[bootstrap] Ready state updated', { ready, error });
    });
  })
  .catch((error) => {
    console.error('[bootstrap] Failed to load main module:', error);
    _bootstrapError = `Module load failed: ${String(error)}`;
    
    // Store error in chrome.storage for debugging
    chrome.storage.local.set({ 
      _bootstrapError: {
        message: String(error),
        stack: error?.stack,
        timestamp: Date.now()
      }
    }).catch(() => {
      // Ignore storage errors
    });
  });

export {};
