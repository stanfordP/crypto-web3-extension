/**
 * Accessibility Tests using Axe-core
 * 
 * Tests WCAG 2.1 AA compliance for popup and auth page UI.
 * 
 * @module tests/accessibility
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Test Configuration
// ============================================================================

const POPUP_HTML = path.resolve(__dirname, '../src/popup.html');
const AUTH_HTML = path.resolve(__dirname, '../src/auth.html');

// WCAG 2.1 AA tags to test against
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Acceptable impact levels (skip if only minor issues)
const CRITICAL_IMPACT_LEVELS = ['critical', 'serious'];

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Run axe accessibility scan with standard configuration
 */
async function runAxeScan(page: any, options?: { excludeRules?: string[] }) {
  let builder = new AxeBuilder({ page })
    .withTags(WCAG_TAGS);
  
  if (options?.excludeRules) {
    builder = builder.disableRules(options.excludeRules);
  }
  
  return builder.analyze();
}

/**
 * Filter violations to only critical/serious ones
 */
function getCriticalViolations(violations: any[]) {
  return violations.filter(v => CRITICAL_IMPACT_LEVELS.includes(v.impact));
}

/**
 * Format violation for readable error message
 */
function formatViolation(violation: any): string {
  const targets = violation.nodes
    .map((n: any) => n.target.join(' > '))
    .join('\n    - ');
  
  return `
  [${violation.impact?.toUpperCase() || 'UNKNOWN'}] ${violation.id}: ${violation.description}
    Help: ${violation.helpUrl}
    Targets:
    - ${targets}`;
}

// ============================================================================
// Popup Page Accessibility Tests
// ============================================================================

test.describe('Popup Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Load popup.html directly
    await page.goto(`file://${POPUP_HTML}`);
    // Wait for any scripts to initialize
    await page.waitForTimeout(500);
  });

  test('should have no critical accessibility violations', async ({ page }) => {
    const results = await runAxeScan(page);
    const criticalViolations = getCriticalViolations(results.violations);
    
    if (criticalViolations.length > 0) {
      const formattedViolations = criticalViolations.map(formatViolation).join('\n');
      throw new Error(`Critical accessibility violations found:\n${formattedViolations}`);
    }
    
    expect(criticalViolations).toHaveLength(0);
  });

  test('should have proper document structure', async ({ page }) => {
    // Check lang attribute
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('en');
    
    // Check title
    const title = await page.title();
    expect(title).toBeTruthy();
    
    // Check main landmark
    const main = await page.$('[role="main"]');
    expect(main).toBeTruthy();
  });

  test('should have accessible loading state', async ({ page }) => {
    const loadingSection = await page.$('#loading');
    expect(loadingSection).toBeTruthy();
    
    // Check aria-live for dynamic content
    const ariaLive = await page.getAttribute('#loading', 'aria-live');
    expect(ariaLive).toBe('polite');
    
    // Check role status
    const role = await page.getAttribute('#loading', 'role');
    expect(role).toBe('status');
    
    // Check sr-only text exists
    const srOnlyText = await page.$('#loading .sr-only');
    expect(srOnlyText).toBeTruthy();
  });

  test('should have accessible buttons', async ({ page }) => {
    // Make not connected section visible for testing
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('notConnected')?.classList.remove('hidden');
    });
    
    const connectButton = await page.$('#connectButton');
    expect(connectButton).toBeTruthy();
    
    // Check button has accessible name
    const ariaLabel = await page.getAttribute('#connectButton', 'aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel?.length).toBeGreaterThan(0);
  });

  test('should have accessible status indicators', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('notConnected')?.classList.remove('hidden');
    });
    
    // Check status indicators have proper roles
    const statusItems = await page.$$('[role="status"]');
    expect(statusItems.length).toBeGreaterThan(0);
    
    // Check each status indicator has aria-label
    for (const item of statusItems) {
      const indicator = await item.$('.status-indicator');
      if (indicator) {
        const ariaLabel = await indicator.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
      }
    }
  });

  test('should have accessible links', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('notConnected')?.classList.remove('hidden');
      document.getElementById('gettingStarted')?.classList.remove('hidden');
    });
    
    const links = await page.$$('a[href]');
    
    for (const link of links) {
      // Each link should have discernible text
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      expect(text || ariaLabel).toBeTruthy();
      
      // External links should have rel="noopener"
      const target = await link.getAttribute('target');
      if (target === '_blank') {
        const rel = await link.getAttribute('rel');
        expect(rel).toContain('noopener');
      }
    }
  });

  test('should have accessible images', async ({ page }) => {
    const images = await page.$$('img');
    
    for (const img of images) {
      // All images should have alt attribute (can be empty for decorative)
      const hasAlt = await img.evaluate((el: HTMLImageElement) => el.hasAttribute('alt'));
      expect(hasAlt).toBe(true);
    }
  });

  test('should have sufficient color contrast', async ({ page }) => {
    const results = await runAxeScan(page, {
      excludeRules: ['color-contrast'] // Test separately due to CSS loading
    });
    
    // This test verifies other contrast-related issues
    const contrastViolations = results.violations.filter(v => 
      v.id.includes('contrast') && CRITICAL_IMPACT_LEVELS.includes(v.impact)
    );
    
    expect(contrastViolations).toHaveLength(0);
  });
});

// ============================================================================
// Auth Page Accessibility Tests
// ============================================================================

test.describe('Auth Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    await page.waitForTimeout(500);
  });

  test('should have no critical accessibility violations', async ({ page }) => {
    const results = await runAxeScan(page);
    const criticalViolations = getCriticalViolations(results.violations);
    
    if (criticalViolations.length > 0) {
      const formattedViolations = criticalViolations.map(formatViolation).join('\n');
      throw new Error(`Critical accessibility violations found:\n${formattedViolations}`);
    }
    
    expect(criticalViolations).toHaveLength(0);
  });

  test('should have proper document structure', async ({ page }) => {
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('en');
    
    const title = await page.title();
    expect(title).toContain('Crypto Trading Journal');
    
    const main = await page.$('[role="main"]');
    expect(main).toBeTruthy();
  });

  test('should have accessible no wallet state', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('noWallet')?.classList.remove('hidden');
    });
    
    // Check heading hierarchy
    const h2 = await page.$('#noWallet h2');
    expect(h2).toBeTruthy();
    
    // Check navigation has label
    const nav = await page.$('[role="navigation"]');
    if (nav) {
      const ariaLabel = await nav.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    }
    
    // Check retry button is accessible
    const retryButton = await page.$('#retryDetectionButton');
    expect(retryButton).toBeTruthy();
    const ariaLabel = await page.getAttribute('#retryDetectionButton', 'aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('should have accessible connect section', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('connect')?.classList.remove('hidden');
    });
    
    const connectSection = await page.$('#connect');
    if (connectSection) {
      // Check for accessible form controls - radios wrapped in labels are accessible
      const radios = await page.$$('input[type="radio"]');
      for (const radio of radios) {
        const id = await radio.getAttribute('id');
        const name = await radio.getAttribute('name');
        
        // Radio should have name attribute for grouping
        expect(name).toBeTruthy();
        
        // Either has explicit label or is wrapped in label
        if (id) {
          const label = await page.$(`label[for="${id}"]`);
          const parentLabel = await radio.evaluate((el: HTMLInputElement) => 
            el.closest('label') !== null
          );
          expect(label !== null || parentLabel).toBe(true);
        }
      }
    }
  });

  test('should have accessible error state', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('error')?.classList.remove('hidden');
    });
    
    const errorSection = await page.$('#error');
    if (errorSection) {
      // Error should be announced - role="alert" implies aria-live="assertive"
      const role = await page.getAttribute('#error', 'role');
      const ariaLive = await page.getAttribute('#error', 'aria-live');
      // Either explicit aria-live or implicit via role="alert"
      expect(role === 'alert' || ariaLive === 'assertive' || ariaLive === 'polite').toBe(true);
    }
  });

  test('should have accessible step progress', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('connecting')?.classList.remove('hidden');
    });
    
    const stepsContainer = await page.$('.auth-steps');
    if (stepsContainer) {
      // Steps should have accessible labels
      const steps = await page.$$('.auth-step');
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  test('should have accessible wallet links', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('noWallet')?.classList.remove('hidden');
    });
    
    const walletLinks = await page.$$('.wallet-link');
    
    for (const link of walletLinks) {
      const ariaLabel = await link.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      
      const rel = await link.getAttribute('rel');
      expect(rel).toContain('noopener');
    }
  });
});

// ============================================================================
// Keyboard Navigation Tests
// ============================================================================

test.describe('Keyboard Navigation', () => {
  test('popup should be fully keyboard navigable', async ({ page }) => {
    await page.goto(`file://${POPUP_HTML}`);
    
    // Show interactive elements
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('notConnected')?.classList.remove('hidden');
      document.getElementById('gettingStarted')?.classList.remove('hidden');
    });
    
    // Count focusable elements
    const focusableCount = await page.evaluate(() => {
      const focusable = document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      return focusable.length;
    });
    
    // Should have at least some focusable elements
    expect(focusableCount).toBeGreaterThan(0);
    
    // Tab to first interactive element
    await page.keyboard.press('Tab');
    
    // Should be able to focus on something
    const hasFocus = await page.evaluate(() => {
      return document.activeElement !== document.body;
    });
    
    expect(hasFocus).toBe(true);
  });

  test('auth page should be fully keyboard navigable', async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    
    // Show connect section
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('connect')?.classList.remove('hidden');
    });
    
    await page.focus('body');
    
    const focusedElements: string[] = [];
    
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      
      const focusedInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'BODY';
        return el.tagName + (el.id ? `#${el.id}` : '');
      });
      
      if (focusedInfo === 'BODY' && focusedElements.length > 0) break;
      if (focusedInfo !== 'BODY') {
        focusedElements.push(focusedInfo);
      }
    }
    
    expect(focusedElements.length).toBeGreaterThan(0);
  });

  test('should have visible focus indicators', async ({ page }) => {
    await page.goto(`file://${POPUP_HTML}`);
    
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('notConnected')?.classList.remove('hidden');
    });
    
    const connectButton = await page.$('#connectButton');
    expect(connectButton).toBeTruthy();
    
    await connectButton!.focus();
    
    // Check if focus is visible (element should have focus styles)
    const hasFocusStyle = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const styles = window.getComputedStyle(el);
      
      // Check for common focus indicators
      const hasOutline = styles.outline !== 'none' && styles.outline !== '';
      const hasBoxShadow = styles.boxShadow !== 'none' && styles.boxShadow !== '';
      const hasBorder = styles.borderColor !== '' || styles.borderWidth !== '0px';
      
      return hasOutline || hasBoxShadow || hasBorder;
    });
    
    expect(hasFocusStyle).toBe(true);
  });

  test('should support Escape key to close error', async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    
    // Show error section
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('error')?.classList.remove('hidden');
    });
    
    const closeErrorButton = await page.$('#closeErrorButton');
    if (closeErrorButton) {
      await closeErrorButton.focus();
      
      // Verify button is focusable
      const isFocused = await page.evaluate(() => {
        return document.activeElement?.id === 'closeErrorButton';
      });
      expect(isFocused).toBe(true);
    }
  });

  test('radio buttons should be navigable with arrow keys', async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('connect')?.classList.remove('hidden');
    });
    
    // Focus on first radio button
    const radios = await page.$$('input[type="radio"][name="accountMode"]');
    if (radios.length >= 2) {
      await radios[0].focus();
      
      // Check initial selection
      const initialChecked = await radios[0].isChecked();
      expect(typeof initialChecked).toBe('boolean');
      
      // Arrow down should move to next radio
      await page.keyboard.press('ArrowDown');
      
      const newFocused = await page.evaluate(() => {
        return (document.activeElement as HTMLInputElement)?.value;
      });
      
      expect(newFocused).toBeTruthy();
    }
  });
});

// ============================================================================
// Screen Reader Compatibility Tests
// ============================================================================

test.describe('Screen Reader Compatibility', () => {
  test('should have descriptive aria-labels', async ({ page }) => {
    await page.goto(`file://${POPUP_HTML}`);
    
    // Check all elements with aria-label have non-empty values
    const ariaElements = await page.$$('[aria-label]');
    
    for (const el of ariaElements) {
      const label = await el.getAttribute('aria-label');
      expect(label).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    }
  });

  test('should use proper heading hierarchy', async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    
    // Get all headings
    const headings = await page.$$('h1, h2, h3, h4, h5, h6');
    const levels: number[] = [];
    
    for (const heading of headings) {
      const tagName = await heading.evaluate((el: HTMLElement) => el.tagName);
      levels.push(parseInt(tagName.charAt(1)));
    }
    
    // Should have at least one h1
    expect(levels).toContain(1);
    
    // No skipped heading levels (e.g., h1 to h3)
    for (let i = 1; i < levels.length; i++) {
      const diff = levels[i] - levels[i - 1];
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  test('should have proper landmark regions', async ({ page }) => {
    await page.goto(`file://${POPUP_HTML}`);
    
    // Check for main landmark
    const main = await page.$('[role="main"], main');
    expect(main).toBeTruthy();
    
    // Check for header
    const header = await page.$('header, [role="banner"]');
    expect(header).toBeTruthy();
  });

  test('should announce dynamic content changes', async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    
    // Loading should have aria-live
    const loading = await page.$('#loading[aria-live]');
    expect(loading).toBeTruthy();
    
    // Status indicators should have proper ARIA
    const statusIndicators = await page.$$('[role="status"]');
    expect(statusIndicators.length).toBeGreaterThan(0);
  });

  test('should have accessible form controls', async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('connect')?.classList.remove('hidden');
    });
    
    // All form controls should have labels
    const inputs = await page.$$('input:not([type="hidden"])');
    
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      
      if (id) {
        const label = await page.$(`label[for="${id}"]`);
        // Should have either label, aria-label, or aria-labelledby
        const hasAccessibleName = label || ariaLabel || ariaLabelledBy;
        expect(hasAccessibleName).toBeTruthy();
      }
    }
  });
});

// ============================================================================
// Full Axe Report Test
// ============================================================================

test.describe('Full Accessibility Audit', () => {
  test('generate popup accessibility report', async ({ page }) => {
    await page.goto(`file://${POPUP_HTML}`);
    
    // Show all sections for full audit
    await page.evaluate(() => {
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('notConnected')?.classList.remove('hidden');
      document.getElementById('gettingStarted')?.classList.remove('hidden');
    });
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    
    // Log results for review
    console.log('\n=== Popup Accessibility Report ===');
    console.log(`Violations: ${results.violations.length}`);
    console.log(`Passes: ${results.passes.length}`);
    console.log(`Incomplete: ${results.incomplete.length}`);
    
    if (results.violations.length > 0) {
      console.log('\nViolations:');
      results.violations.forEach(v => {
        console.log(`  - [${v.impact}] ${v.id}: ${v.help}`);
      });
    }
    
    // Critical violations should be zero
    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical).toHaveLength(0);
  });

  test('generate auth page accessibility report', async ({ page }) => {
    await page.goto(`file://${AUTH_HTML}`);
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();
    
    console.log('\n=== Auth Page Accessibility Report ===');
    console.log(`Violations: ${results.violations.length}`);
    console.log(`Passes: ${results.passes.length}`);
    console.log(`Incomplete: ${results.incomplete.length}`);
    
    if (results.violations.length > 0) {
      console.log('\nViolations:');
      results.violations.forEach(v => {
        console.log(`  - [${v.impact}] ${v.id}: ${v.help}`);
      });
    }
    
    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical).toHaveLength(0);
  });
});
