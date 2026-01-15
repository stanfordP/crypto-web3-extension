/**
 * Popup Entry Point
 * 
 * Thin entry point that wires up the popup with production adapters.
 * All business logic is in PopupController, UI in PopupView.
 * 
 * @module entry/popup-entry
 */

import { ChromeStorageAdapter } from '../adapters/ChromeStorageAdapter';
import { ChromeRuntimeAdapter } from '../adapters/ChromeRuntimeAdapter';
import { ChromeTabsAdapter } from '../adapters/ChromeTabsAdapter';
import { DOMAdapter } from '../adapters/DOMAdapter';
import { PopupController } from '../ui/popup/PopupController';
import { PopupView } from '../ui/popup/PopupView';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  defaultAppUrl: 'http://localhost:3000',
  apiSessionEndpoint: '/api/auth/session',
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the popup with production adapters
 */
async function initializePopup(): Promise<void> {
  try {
    // Create adapters
    const storage = new ChromeStorageAdapter();
    const runtime = new ChromeRuntimeAdapter();
    const tabs = new ChromeTabsAdapter();
    const dom = new DOMAdapter();

    // Create view (connects to DOM elements)
    const view = new PopupView(dom);

    // Create controller with dependencies
    const controller = new PopupController(storage, runtime, tabs, view, CONFIG);

    // Initialize controller (sets up event handlers and checks session)
    await controller.initialize();

    console.log('[PopupEntry] Popup initialized successfully');
  } catch (error) {
    console.error('[PopupEntry] Failed to initialize popup:', error);
    
    // Show error to user
    const errorElement = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const loading = document.getElementById('loading');
    
    if (loading) loading.classList.add('hidden');
    if (errorElement) errorElement.classList.remove('hidden');
    if (errorMessage) errorMessage.textContent = 'Failed to initialize. Please try again.';
  }
}

// Run on load
initializePopup();

export {};
