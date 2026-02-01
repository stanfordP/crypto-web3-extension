# Memory Leak Analysis Guide

> Guide for profiling the CTJ Web3 Extension service worker to detect and prevent memory leaks.

## Overview

Chrome extension service workers (MV3) run indefinitely and can accumulate memory if not properly managed. This guide covers profiling techniques and common leak patterns.

## Potential Leak Sources

### 1. `activeOperations` Map

**Location:** `src/scripts/sw-state.ts`

```typescript
const activeOperations = new Map<string, OperationState>();
```

**Risk:** Operations that never complete (timeout/error without cleanup) will accumulate.

**Mitigation:**
- 60-second expiry check on each new operation
- Automatic cleanup on operation completion
- Keep-alive alarm triggers periodic cleanup

**Verification:**
```javascript
// In DevTools Console (background page)
chrome.runtime.getBackgroundPage(console.log);
// Then inspect activeOperations.size
```

### 2. Message Port Listeners

**Location:** `src/scripts/sw-keepalive.ts`

```typescript
const activePorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  activePorts.add(port);
  port.onDisconnect.addListener(() => {
    activePorts.delete(port);  // Critical cleanup
  });
});
```

**Risk:** If `onDisconnect` listener fails, ports accumulate.

**Verification:**
```javascript
// Check port count (should be 0-2 normally)
activePorts.size
```

### 3. Event Listener Accumulation

**Risk:** Adding listeners without removal on cleanup.

**Locations to check:**
- `BackgroundController.initialize()` / `cleanup()`
- `chrome.storage.onChanged` listeners
- `chrome.tabs.onRemoved` listeners

---

## DevTools Memory Profiler Guide

### Setup

1. Open `chrome://extensions`
2. Find CTJ Extension
3. Click "service worker" link to open DevTools
4. Go to **Memory** tab

### Heap Snapshot Comparison

**Best for:** Finding objects that persist when they shouldn't.

1. Take initial snapshot (after fresh install)
2. Perform operations (connect, disconnect, repeat 10x)
3. Force garbage collection (click trash icon)
4. Take second snapshot
5. Select "Comparison" view between snapshots

**What to look for:**
- `Map` entries should be close to initial count
- `Set` entries should not grow
- No accumulating `Promise` objects
- No orphaned `MessageChannel` or `Port` objects

### Allocation Timeline

**Best for:** Finding what creates new objects.

1. Select "Allocation instrumentation on timeline"
2. Click "Start"
3. Perform typical workflow (connect/disconnect)
4. Click "Stop"
5. Examine blue bars (allocations) vs gray bars (GC'd)

**Red flags:**
- Continuous blue bars without corresponding gray
- Large spikes on simple operations
- Objects retained across disconnect cycles

---

## Automated Leak Detection Test

Add this test to verify no leaks in long-running scenarios:

```typescript
// tests/memory-leak.test.ts
describe('Memory Leak Prevention', () => {
  it('should not accumulate operations over time', async () => {
    const { activeOperations, recordActivity, cleanupStaleOperations } = 
      await import('../src/scripts/sw-state');
    
    // Simulate 100 operations
    for (let i = 0; i < 100; i++) {
      recordActivity();
      // Simulate operation completion
      cleanupStaleOperations();
    }
    
    // Should have cleaned up
    expect(activeOperations.size).toBeLessThan(5);
  });

  it('should clean up ports on disconnect', async () => {
    const { activePorts, handleConnect, handleDisconnect } = 
      await import('../src/scripts/sw-keepalive');
    
    // Simulate port connections
    for (let i = 0; i < 10; i++) {
      const mockPort = { name: 'keep-alive', onDisconnect: { addListener: jest.fn() } };
      handleConnect(mockPort);
    }
    
    // Simulate disconnections
    // ... trigger disconnect handlers
    
    expect(activePorts.size).toBe(0);
  });
});
```

---

## Cleanup Verification Checklist

Run this checklist periodically during development:

### Service Worker State

- [ ] `activeOperations.size` returns to 0 after operations complete
- [ ] `activePorts.size` is 0 when no popups open
- [ ] No console errors about unhandled promise rejections

### Background Controller

- [ ] `cleanup()` method removes all listeners
- [ ] `authTabId` is null after auth tab closes
- [ ] Storage change listeners properly removed

### Content Scripts

- [ ] `injectedScript` removed on page unload
- [ ] No orphaned message listeners

---

## Common Leak Patterns to Avoid

### Pattern 1: Missing Error Cleanup

```typescript
// ❌ BAD: Error path doesn't clean up
async function doOperation() {
  activeOperations.set(id, state);
  try {
    await riskyOperation();
    activeOperations.delete(id);  // Only cleans up on success
  } catch (error) {
    throw error;  // Leak! Operation still in map
  }
}

// ✅ GOOD: Finally block ensures cleanup
async function doOperation() {
  activeOperations.set(id, state);
  try {
    await riskyOperation();
  } finally {
    activeOperations.delete(id);  // Always cleans up
  }
}
```

### Pattern 2: Event Listener Without Removal

```typescript
// ❌ BAD: Listener accumulates
function init() {
  chrome.storage.onChanged.addListener(handler);
}

// ✅ GOOD: Track and remove listener
let storageListener: Function | null = null;

function init() {
  storageListener = handler;
  chrome.storage.onChanged.addListener(handler);
}

function cleanup() {
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }
}
```

### Pattern 3: Closure Capturing Large Objects

```typescript
// ❌ BAD: Closure captures entire response
chrome.runtime.onMessage.addListener((message) => {
  const largeData = fetchLargeData();
  setTimeout(() => {
    console.log(largeData);  // Keeps largeData in memory
  }, 60000);
});

// ✅ GOOD: Only capture what you need
chrome.runtime.onMessage.addListener((message) => {
  const largeData = fetchLargeData();
  const summary = extractSummary(largeData);
  setTimeout(() => {
    console.log(summary);  // Only keeps small summary
  }, 60000);
});
```

---

## Monitoring in Production

### Chrome Performance Monitor

1. Open `chrome://performance-monitor`
2. Watch "JS heap size" for extension
3. Should stay relatively flat over time

### Extension Inspector

1. Open `chrome://inspect/#extensions`
2. Find CTJ Extension
3. Click "inspect" on service worker
4. Use Performance tab for timeline analysis

---

## References

- [Chrome DevTools Memory Guide](https://developer.chrome.com/docs/devtools/memory-problems/)
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [MV3 Memory Best Practices](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-migration/#memory)
