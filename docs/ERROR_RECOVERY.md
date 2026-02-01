# Error Recovery Flows

> Documentation of how the CTJ Web3 Extension handles various error scenarios and provides recovery paths for users.

## Overview

The extension implements graceful degradation and user-friendly error recovery for all failure modes. Each error type maps to a specific recovery flow.

---

## Error Types & Recovery Matrix

| Error Code | Name | Cause | User Recovery | Auto-Recovery |
|------------|------|-------|---------------|---------------|
| `USER_REJECTED (4001)` | User Cancelled | User clicked "Reject" in MetaMask | Show retry button | No |
| `NO_WALLET (5001)` | No Wallet Detected | MetaMask/Brave Wallet not installed | Show install links | Retry on visibility change |
| `WALLET_LOCKED (5002)` | Wallet Locked | MetaMask is locked | Prompt to unlock | Retry after 5s |
| `REQUEST_TIMEOUT (5006)` | Request Timeout | Operation took >60s | Show retry button | Exponential backoff (3 attempts) |
| `ALREADY_IN_PROGRESS (5007)` | Duplicate Request | Auth flow already running | Disable button, show spinner | Wait for existing flow |
| `NETWORK_ERROR (5003)` | Network Failure | Backend unreachable | Show offline badge | Retry with backoff |
| `INVALID_SIGNATURE (5004)` | Signature Invalid | SIWE verification failed | Show retry button | No |
| `CHAIN_UNSUPPORTED (5005)` | Wrong Network | User on unsupported chain | Show switch network prompt | No |

---

## Detailed Recovery Flows

### 1. User Rejected (4001)

**Scenario:** User clicks "Reject" in MetaMask when prompted to sign.

**Flow:**
```
MetaMask Popup → User clicks Reject → Extension receives 4001
                                          ↓
                                   AuthController.handleUserRejection()
                                          ↓
                                   Show error UI with retry button
                                          ↓
                                   User clicks retry → Full auth restart
```

**Implementation:**
```typescript
// AuthController.ts
private handleUserRejection(): void {
  this.view.showError('Connection cancelled. Click below to try again.');
  this.view.showRetryButton();
  this.machine.transition('ERROR');
}
```

**User Experience:**
- Error message: "Connection cancelled. Click below to try again."
- Single "Try Again" button
- No auto-retry (respects user's explicit rejection)

---

### 2. No Wallet Detected (5001)

**Scenario:** User doesn't have MetaMask or Brave Wallet installed.

**Flow:**
```
Page Load → Check window.ethereum → Not found
                                       ↓
                               Show "No Wallet" section
                                       ↓
                               Display install links:
                               - MetaMask: metamask.io/download
                               - Brave: brave.com/wallet
                                       ↓
                               "Retry Detection" button
                                       ↓
                               On retry → Re-check window.ethereum
```

**Implementation:**
```typescript
// AuthController.ts
private async checkWalletPresence(): Promise<boolean> {
  // Check multiple injection points
  if (window.ethereum || window.coinbaseWalletExtension) {
    return true;
  }
  
  // Also listen for EIP-6963 announcements
  return new Promise((resolve) => {
    window.addEventListener('eip6963:announceProvider', () => resolve(true), { once: true });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => resolve(false), 500);
  });
}
```

**User Experience:**
- Clear message explaining MetaMask is required
- Direct links to install wallets
- "Retry Detection" button for users who just installed
- Auto-retry when page becomes visible (user may have installed in another tab)

---

### 3. Request Timeout (5006)

**Scenario:** Auth flow takes longer than 60 seconds (user distracted, MetaMask popup minimized).

**Flow:**
```
Auth Request Sent → 60s Timer Starts → Timer Expires
                                           ↓
                                   Cancel pending request
                                           ↓
                                   Show timeout error
                                           ↓
                                   Auto-retry (up to 3 times)
                                           ↓
                                   After 3 failures → Manual retry only
```

**Implementation:**
```typescript
// BackgroundController.ts
private async executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 60000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const result = await operation();
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ExtensionError('REQUEST_TIMEOUT', 'Request timed out. Please try again.');
    }
    throw error;
  }
}
```

**User Experience:**
- Progress indicator during auth
- Clear timeout message after 60s
- Auto-retry with exponential backoff: 1s, 2s, 4s
- After 3 attempts: "Taking too long? Click to retry manually."

---

### 4. Network Error (5003)

**Scenario:** Backend API is unreachable (offline, server down, DNS issues).

**Flow:**
```
API Request → Network Failure
                  ↓
           Check navigator.onLine
                  ↓
    ┌─────────────┴─────────────┐
    │                           │
Offline                      Online (server issue)
    │                           │
Show "Offline" badge      Show "Server unreachable"
    │                           │
Listen for 'online'       Retry with backoff
event                     (1s, 2s, 4s, 8s, 16s)
    │                           │
Auto-retry on            After 5 attempts:
reconnect                "Service temporarily unavailable"
```

**Implementation:**
```typescript
// api.ts
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 5): Promise<Response> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await delay(Math.pow(2, i) * 1000); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}
```

**User Experience:**
- Show offline indicator in popup header
- Display cached session data if available
- "You're offline. Session data from last sync."
- Auto-reconnect when network returns

---

### 5. Wallet Locked (5002)

**Scenario:** MetaMask is installed but locked (password required).

**Flow:**
```
Connect Request → MetaMask Returns Locked Error
                          ↓
                  Show "Unlock Wallet" message
                          ↓
                  Retry after 5 seconds
                          ↓
                  Still locked? Show manual retry
```

**User Experience:**
- "Your wallet is locked. Please unlock MetaMask and try again."
- "Waiting for wallet..." with spinner
- Auto-check every 5s for up to 30s
- Then: "Still locked? Click to retry."

---

### 6. Chain Unsupported (5005)

**Scenario:** User is connected to an unsupported blockchain network.

**Flow:**
```
Check ChainId → Not in SUPPORTED_CHAINS
                        ↓
                Show "Wrong Network" error
                        ↓
                Display supported chains list
                        ↓
                "Switch Network" button (if wallet supports wallet_switchEthereumChain)
```

**Supported Chains:**
- Ethereum Mainnet (0x1)
- Polygon (0x89)
- Arbitrum One (0xa4b1)
- Base (0x2105)

**User Experience:**
- "Please switch to a supported network."
- List of supported chains with icons
- "Switch to Ethereum" button (auto-switches if supported)

---

## Error Boundary Hierarchy

```
RootErrorBoundary (app crash recovery)
    └── Web3ErrorBoundary (wallet issues)
            └── AuthErrorBoundary (auth flow issues)
                    └── APIErrorBoundary (backend issues)
```

Each boundary captures errors in its domain and provides appropriate fallback UI.

---

## Logging & Telemetry

All errors are logged with context for debugging:

```typescript
logger.error('Auth flow failed', {
  errorCode: error.code,
  errorMessage: error.message,
  walletType: detectedWallet,
  chainId: currentChainId,
  step: currentAuthStep,
  duration: Date.now() - authStartTime,
});
```

**Privacy Note:** No wallet addresses or signatures are logged. Only error codes, timing, and flow state.

---

## Testing Error Scenarios

### Manual Testing Checklist

- [ ] Reject MetaMask prompt → Shows retry button
- [ ] Disconnect internet → Shows offline badge
- [ ] Lock MetaMask mid-flow → Shows unlock prompt
- [ ] Switch to unsupported network → Shows switch prompt
- [ ] Close MetaMask popup without action → Timeout handling
- [ ] Rapid connect button clicks → Deduplication works

### Automated Tests

See `tests/error-recovery.test.ts` for unit tests covering all error paths.

---

## Recovery UX Guidelines

1. **Never blame the user** - "Something went wrong" not "You did something wrong"
2. **Always provide a clear action** - Every error screen has a button
3. **Auto-recover when possible** - Retry network errors, detect wallet unlock
4. **Preserve state** - Don't lose form data or selections on error
5. **Explain what happened** - Brief, non-technical explanation
6. **Show progress on retry** - Visual feedback that retry is happening
