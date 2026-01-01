/**
 * Injected Wallet Script (DEPRECATED)
 *
 * This file is kept for backwards compatibility but is no longer used
 * in the Extension-First architecture.
 *
 * Previous Purpose:
 * - Ran in PAGE context to relay wallet calls to MetaMask
 * - Flow: Background → Content Script → This Script → window.ethereum
 *
 * New Architecture (Extension-First):
 * - Wallet connections happen directly in auth.html (extension context)
 * - Extension pages have direct access to window.ethereum
 * - No relay needed - eliminates complexity and failure points
 *
 * This file is still included in webpack build but does nothing.
 * It can be safely removed in a future release.
 */

// Log deprecation notice for debugging purposes
if (typeof console !== 'undefined') {
  console.debug(
    '[CryptoJournal] injected-wallet.ts is deprecated. ' +
    'Extension-First architecture uses direct wallet access in auth.html.'
  );
}

export {};
