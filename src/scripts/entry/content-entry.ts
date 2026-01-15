/**
 * Content Script Entry Point
 *
 * Thin entry point that wires up adapters and initializes the ContentController.
 * This file should contain minimal logic - just dependency injection setup.
 *
 * Runs at document_start for early message handling.
 */

import { initializeContainer } from '../core/Container';
import { ChromeStorageAdapter } from '../adapters/ChromeStorageAdapter';
import { ChromeRuntimeAdapter } from '../adapters/ChromeRuntimeAdapter';
import { ChromeTabsAdapter } from '../adapters/ChromeTabsAdapter';
import { ChromeAlarmsAdapter } from '../adapters/ChromeAlarmsAdapter';
import { DOMAdapter } from '../adapters/DOMAdapter';
import { ContentController } from '../ui/content';
import { InjectionService } from '../services';
import { contentLogger as logger } from '../logger';

/**
 * Initialize the content script
 */
async function main(): Promise<void> {
  logger.info('Content script entry point starting');

  try {
    // Create adapters
    const storageAdapter = new ChromeStorageAdapter();
    const runtimeAdapter = new ChromeRuntimeAdapter();
    const tabsAdapter = new ChromeTabsAdapter();
    const alarmsAdapter = new ChromeAlarmsAdapter();
    const domAdapter = new DOMAdapter();

    // Initialize the container for any code that uses getContainer()
    initializeContainer({
      storage: storageAdapter,
      runtime: runtimeAdapter,
      tabs: tabsAdapter,
      alarms: alarmsAdapter,
      dom: domAdapter,
    });

    // Create injection service
    const injectionService = new InjectionService({
      domAdapter,
      logger,
    });

    // Create content controller
    const controller = new ContentController({
      storageAdapter,
      runtimeAdapter,
      domAdapter,
      injectionService,
      logger,
    });

    // Initialize
    await controller.initialize();

    logger.info('Content script entry point initialized');
  } catch (error) {
    logger.error('Content script entry point failed', { error: String(error) });
  }
}

// Initialize immediately
main();

export {};
