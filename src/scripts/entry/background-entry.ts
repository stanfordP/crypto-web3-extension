/**
 * Background Service Worker Main Entry Point
 *
 * Thin entry point that wires up adapters and initializes the BackgroundController.
 * This file is loaded by background.ts (the bootstrap file) via require().
 *
 * The bootstrap file (background.ts) handles:
 * - Early PING handler registration for wake-up detection
 * - Session storage access level configuration
 * - Error capture during module loading
 *
 * This file handles:
 * - Creating production adapters
 * - Initializing BackgroundController with dependencies
 * - Setting up lifecycle event handlers (onStartup, onInstalled)
 * - Initializing keep-alive systems
 */

import { ChromeStorageAdapter } from '../adapters/ChromeStorageAdapter';
import { ChromeRuntimeAdapter } from '../adapters/ChromeRuntimeAdapter';
import { ChromeTabsAdapter } from '../adapters/ChromeTabsAdapter';
import { ChromeAlarmsAdapter } from '../adapters/ChromeAlarmsAdapter';
import { BackgroundController } from '../ui/background';
import { apiClient } from '../api';
import { ALLOWED_ORIGINS } from '../config';
import { initializeOnWakeUp, recordActivity } from '../sw-state';
import { initializeServiceWorkerKeepAlive } from '../sw-keepalive';
import { backgroundLogger as logger } from '../logger';
import { errorReporter } from '../error-reporting';

// ============================================================================
// Create Adapters
// ============================================================================

const storageAdapter = new ChromeStorageAdapter();
const runtimeAdapter = new ChromeRuntimeAdapter();
const tabsAdapter = new ChromeTabsAdapter();
const alarmsAdapter = new ChromeAlarmsAdapter();

// ============================================================================
// Create Controller
// ============================================================================

const controller = new BackgroundController({
  storageAdapter,
  runtimeAdapter,
  tabsAdapter,
  alarmsAdapter,
  allowedOrigins: ALLOWED_ORIGINS,
  apiClient,
  logger,
});

// ============================================================================
// Lifecycle Event Handlers
// ============================================================================

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(async () => {
  try {
    await initializeOnWakeUp();
    await controller.handleStartup();
  } catch (error) {
    logger.error('Startup handler failed', { error: String(error) });
    void errorReporter.report(error, { source: 'startup-handler' });
  }
});

/**
 * Handle extension installation/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await initializeOnWakeUp();
    await controller.handleInstalled({
      reason: details.reason,
      previousVersion: details.previousVersion,
    });
  } catch (error) {
    logger.error('Installed handler failed', { error: String(error) });
    void errorReporter.report(error, { source: 'installed-handler' });
  }
});

/**
 * Track activity on each message for service worker state management
 */
chrome.runtime.onMessage.addListener(() => {
  recordActivity();
  return false; // Don't interfere with other listeners
});

// ============================================================================
// Initialization
// ============================================================================

/**
 * Full initialization sequence
 */
async function initializeBackgroundScript(): Promise<void> {
  try {
    logger.info('Background entry point starting');

    // Initialize state management (handles wake-up recovery)
    await initializeOnWakeUp();

    // Initialize the controller
    await controller.initialize();

    // Initialize keep-alive system (alarms)
    await initializeServiceWorkerKeepAlive();

    logger.info('Background service worker fully initialized');
  } catch (error) {
    logger.error('Failed to initialize service worker', { error: String(error) });
    void errorReporter.report(error, { source: 'service-worker-init' });
    
    // Still try to initialize the controller so messages can be processed
    try {
      await controller.initialize();
    } catch {
      // Already failed, nothing more we can do
    }
  }
}

// Run initialization
initializeBackgroundScript();

export {};
