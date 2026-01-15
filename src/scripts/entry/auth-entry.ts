/**
 * Auth Entry Point
 * 
 * Thin entry point that wires up the auth page with production adapters.
 * All business logic is in AuthController, UI in AuthView.
 * 
 * @module entry/auth-entry
 */

import { ChromeStorageAdapter } from '../adapters/ChromeStorageAdapter';
import { ChromeRuntimeAdapter } from '../adapters/ChromeRuntimeAdapter';
import { ChromeTabsAdapter } from '../adapters/ChromeTabsAdapter';
import { DOMAdapter } from '../adapters/DOMAdapter';
import { AuthController } from '../ui/auth/AuthController';
import { AuthView } from '../ui/auth/AuthView';
import { apiClient } from '../api';
import { API_BASE_URL, DEFAULTS } from '../config';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  apiBaseUrl: API_BASE_URL,
  dashboardPath: DEFAULTS.DASHBOARD_PATH,
  walletDetectionAttempts: 5,
  walletDetectionInitialDelay: 300,
  autoRedirectDelay: 2000,
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the auth page with production adapters
 */
function initializeAuth(): void {
  try {
    // Create adapters
    const storage = new ChromeStorageAdapter();
    const runtime = new ChromeRuntimeAdapter();
    const tabs = new ChromeTabsAdapter();
    const dom = new DOMAdapter();

    // Create view (connects to DOM elements)
    const view = new AuthView(dom);

    // Create controller with dependencies
    const controller = new AuthController(
      storage,
      runtime,
      tabs,
      dom,
      view,
      apiClient,
      CONFIG
    );

    // Initialize controller (sets up event handlers and starts wallet detection)
    controller.initialize();

    console.log('[AuthEntry] Auth page initialized successfully');
  } catch (error) {
    console.error('[AuthEntry] Failed to initialize auth page:', error);
    
    // Show error to user
    const errorElement = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const loading = document.getElementById('loading');
    
    if (loading) loading.classList.add('hidden');
    if (errorElement) errorElement.classList.remove('hidden');
    if (errorMessage) {
      errorMessage.textContent = 'Failed to initialize authentication. Please refresh the page.';
    }
  }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  initializeAuth();
});

export {};
