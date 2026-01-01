# Claude Code Context: Crypto Web3 Extension

## Project Overview

This is a Manifest V3 Chrome browser extension that provides custom Web3 authentication for the Crypto Trading Journal application. The extension uses an **Extension-First Auth Flow** with **Injected Script Architecture** for wallet interactions.

**Key Technologies:**
- TypeScript (strict mode)
- Webpack 5 for bundling
- Chrome Extension APIs (Manifest V3)
- Jest for unit testing
- Playwright for E2E testing

**Supported Browsers:** Chrome, Brave, Edge, Opera (all Chromium-based)

**Version:** 2.0.0
**Last Updated:** December 29, 2025

---

## 🎯 Extension Purpose & Scope

### What the Extension DOES (Wallet Bridge)

| Responsibility | Why Extension? |
|----------------|----------------|
| Access `window.ethereum` | Only injected scripts can access wallet providers |
| `eth_requestAccounts` | Triggers wallet connection popup |
| `personal_sign` | Signs SIWE messages |
| Store session | `chrome.storage.local` persists across tabs/restarts |
| Cross-tab sync | Broadcasts `CJ_SESSION_CHANGED` to all tabs |
| Wallet events | Handle `accountsChanged`, `chainChanged` |

### What the Extension does NOT do (App Concerns)

| NOT Extension's Job | Where It Belongs |
|---------------------|------------------|
| Account mode (live/demo) | App's Zustand store |
| Trade data | App's React Query |
| UI components | App's React |
| Business logic | App |
| User preferences | App's localStorage |

---

## 🏗️ Architecture: Injected Script Wallet Connection

### Design Philosophy

The extension uses a **content script + injected script** approach where:
1. Main app sends `CJ_OPEN_AUTH` message to trigger authentication
2. Content script injects `injected-auth.js` into the page context
3. Injected script has direct access to `window.ethereum` (MetaMask, Rabby, etc.)
4. SIWE challenge/verify happens via API calls
5. Session stored in `chrome.storage.local`

### Why This Architecture?

| Problem | Solution |
|---------|----------|
| Content scripts can't access `window.ethereum` | Injected script runs in page context |
| Extension pages don't have wallet access | Auth happens on web page, not extension tab |
| Multiple wallet conflicts | Injected script handles multi-provider detection |
| Security extensions (Pocket Universe) | Works seamlessly - they intercept signatures |

### Flow Diagram

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   MAIN APP       │      │  CONTENT SCRIPT  │      │ INJECTED SCRIPT  │
│   (Next.js)      │      │  (content.ts)    │      │ (injected-auth)  │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         │ 1. CJ_OPEN_AUTH         │                         │
         │─────────────────────────►                         │
         │                         │                         │
         │                         │ 2. Inject script        │
         │                         │─────────────────────────►
         │                         │                         │
         │                         │ 3. CJ_WALLET_CONNECT    │
         │                         │─────────────────────────►
         │                         │                         │ 4. eth_requestAccounts
         │                         │                         │    (wallet popup)
         │                         │                         │
         │                         │ 5. Address + ChainID    │
         │                         │◄─────────────────────────
         │                         │                         │
         │                         │ 6. GET /api/auth/siwe/challenge
         │                         │─────────────────────────────────────► API
         │                         │                         │
         │                         │ 7. SIWE Message         │
         │                         │◄─────────────────────────────────────
         │                         │                         │
         │                         │ 8. CJ_WALLET_SIGN       │
         │                         │─────────────────────────►
         │                         │                         │ 9. personal_sign
         │                         │                         │    (wallet popup)
         │                         │                         │
         │                         │ 10. Signature           │
         │                         │◄─────────────────────────
         │                         │                         │
         │                         │ 11. POST /api/auth/siwe/verify
         │                         │─────────────────────────────────────► API
         │                         │                         │
         │                         │ 12. Session Token       │
         │                         │◄─────────────────────────────────────
         │                         │                         │
         │                         │ 13. Store in chrome.storage
         │                         │                         │
         │ 14. CJ_SESSION_CHANGED  │                         │
         │◄─────────────────────────                         │
```

### Component Responsibilities

#### Current Architecture (v2.0)
```
CONTENT SCRIPT (content.ts)
├── Handle CJ_* messages from main app
├── Inject injected-auth.js into page context
├── Relay wallet messages to/from injected script
├── v1.1 Legacy: Make SIWE API calls (CJ_OPEN_AUTH)
├── v2.0 New: Pure wallet bridge (CJ_WALLET_CONNECT, CJ_WALLET_SIGN)
├── v2.0 New: App-driven session storage (CJ_STORE_SESSION, CJ_CLEAR_SESSION)
├── v2.0 New: Request deduplication (prevents duplicate auth flows)
├── Store session in chrome.storage.local
├── Notify main app of session changes
└── Service worker health checks

INJECTED SCRIPT (injected-auth.ts) - RUNS IN PAGE CONTEXT
├── Direct access to window.ethereum
├── Handle CJ_WALLET_CHECK - detect available wallets
├── Handle CJ_WALLET_CONNECT - eth_requestAccounts
├── Handle CJ_WALLET_SIGN - personal_sign
├── Multi-provider detection (MetaMask, Rabby, Brave)
└── Works with security extensions (Pocket Universe, etc.)

BACKGROUND SERVICE WORKER (background.ts)
├── Session management and validation
├── Handle legacy OPEN_AUTH_TAB message
├── Service worker keep-alive system
└── Extension lifecycle management

POPUP (popup.ts / popup.html)
├── Quick status view (connected/disconnected)
├── Display connected address
├── Disconnect button
└── Settings link
```

---

## 📁 Project Structure

```
crypto-web3-extension/
├── manifest.json              # Extension manifest (Manifest V3)
├── package.json               # Dependencies and scripts
├── webpack.config.js          # Build configuration
├── tsconfig.json              # TypeScript config
├── jest.config.js             # Unit test config
├── playwright.config.ts       # E2E test config
│
├── src/
│   ├── auth.html              # Auth page (legacy, kept for compatibility)
│   ├── popup.html             # Extension popup UI
│   │
│   ├── scripts/
│   │   ├── content.ts         # Content script - CJ_* message handler
│   │   ├── injected-auth.ts   # Injected script - wallet interactions
│   │   ├── background.ts      # Service worker bootstrap
│   │   ├── background-main.ts # Main background logic
│   │   ├── popup.ts           # Popup UI logic
│   │   ├── auth.ts            # Auth page logic (legacy)
│   │   │
│   │   ├── api.ts             # API client
│   │   ├── config.ts          # Configuration (URLs, origins)
│   │   ├── types.ts           # TypeScript interfaces
│   │   ├── errors.ts          # Error handling
│   │   ├── logger.ts          # Logging utilities
│   │   │
│   │   ├── sw-state.ts        # Service worker state management
│   │   ├── sw-keepalive.ts    # Keep-alive system
│   │   │
│   │   └── __tests__/         # Unit tests
│   │
│   ├── styles/
│   │   ├── auth.css           # Auth page styles
│   │   └── popup.css          # Popup styles
│   │
│   └── icons/                 # Extension icons
│
├── dist/                      # Built extension (load this in browser)
├── coverage/                  # Test coverage reports
└── test-ground/               # Manual testing environment
```

---

## 🔐 Message Protocol (CJ_* Messages)

### Main App → Extension (v1.1 Legacy)

```typescript
// Check if extension is installed
{ type: "CJ_CHECK_EXTENSION" }

// Trigger wallet connection flow (extension handles SIWE)
{ type: "CJ_OPEN_AUTH" }

// Get current session state
{ type: "CJ_GET_SESSION" }

// Disconnect and clear session
{ type: "CJ_DISCONNECT" }
```

### Main App → Extension (v2.0 App-Driven SIWE)

```typescript
// Direct wallet connect - returns address/chainId, app handles SIWE
{ type: "CJ_WALLET_CONNECT", requestId?: string }

// Direct message sign - app provides SIWE message
{ type: "CJ_WALLET_SIGN", message: string, address: string, requestId?: string }

// Store session after app verifies signature
{ type: "CJ_STORE_SESSION", session: { sessionToken, address, chainId }, requestId?: string }

// Clear session (app handles API cleanup)
{ type: "CJ_CLEAR_SESSION", requestId?: string }
```

### Extension → Main App (v1.1 Legacy)

```typescript
// Response to CJ_CHECK_EXTENSION
{ type: "CJ_EXTENSION_PRESENT" }

// Auth flow result
{ type: "CJ_AUTH_OPENED", success: boolean, error?: string }

// Session state response
{ type: "CJ_SESSION_RESPONSE", session: { address, chainId, accountMode } | null }

// Session changed notification
{ type: "CJ_SESSION_CHANGED", session: { address, chainId, accountMode } | null }

// Disconnect confirmation
{ type: "CJ_DISCONNECT_RESPONSE", success: boolean }
```

### Extension → Main App (v2.0 Responses)

```typescript
// Wallet connection result
{ type: "CJ_WALLET_RESULT", success: true, address, chainId, walletName?, requestId? }

// Signature result
{ type: "CJ_SIGN_RESULT", success: true, signature, requestId? }

// Session stored confirmation
{ type: "CJ_SESSION_STORED", success: boolean, requestId? }

// Error response (for any v2.0 request)
{ type: "CJ_ERROR", success: false, code: ErrorCode, message: string, originalType?, requestId? }
```

### Error Codes (v2.0)

```typescript
enum ErrorCode {
  // EIP-1193 standard errors
  USER_REJECTED = 4001,        // User rejected the request
  UNAUTHORIZED = 4100,         // Unauthorized
  UNSUPPORTED_METHOD = 4200,   // Method not supported
  DISCONNECTED = 4900,         // Provider disconnected
  CHAIN_DISCONNECTED = 4901,   // Chain disconnected

  // Extension-specific errors
  NO_WALLET = 5001,            // No wallet detected
  WALLET_CONNECTION_FAILED = 5002,
  SIGNING_FAILED = 5003,
  INVALID_REQUEST = 5004,      // Missing required fields
  SESSION_STORAGE_FAILED = 5005,
  REQUEST_TIMEOUT = 5006,
  ALREADY_IN_PROGRESS = 5007,  // Duplicate request blocked
}
```

### Content Script ↔ Injected Script (Internal)

```typescript
// Check wallet availability
{ type: "CJ_WALLET_CHECK", requestId: string }
{ type: "CJ_WALLET_CHECK_RESULT", requestId, available: boolean, walletName: string }

// Connect wallet
{ type: "CJ_WALLET_CONNECT", requestId: string }
{ type: "CJ_WALLET_CONNECT_RESULT", requestId, success, address?, chainId?, error? }

// Sign message
{ type: "CJ_WALLET_SIGN", requestId, message: string, address: string }
{ type: "CJ_WALLET_SIGN_RESULT", requestId, success, signature?, error? }
```

---

## 🔧 Development Commands

```bash
# Install dependencies
npm install

# Development build (with watch)
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Unit tests
npm run test:unit
npm run test:coverage

# E2E tests
npm run test:e2e
```

---

## 🔌 API Endpoints

The extension communicates with these main app API endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/siwe/challenge` | POST | Get SIWE message to sign |
| `/api/auth/siwe/verify` | POST | Verify signature, get session token |
| `/api/auth/session` | GET | Validate existing session |
| `/api/auth/disconnect` | POST | Clear session |

### Challenge Request/Response
```json
// Request
POST /api/auth/siwe/challenge
{ "address": "0x1234...", "chainId": 1 }

// Response
{ "message": "localhost:3000 wants you to sign in...", "nonce": "abc123...", "expiresAt": 1735500000000 }
```

### Verify Request/Response
```json
// Request
POST /api/auth/siwe/verify
{ "message": "localhost:3000 wants you to sign in...", "signature": "0xabc..." }

// Response
{ "success": true, "address": "0x1234...", "sessionToken": "uuid-session-token" }
```

---

## 🛡️ Security Features

### Anti-Phishing Protection
- Content script only injected on allowed origins (manifest.json)
- Origin validation before processing messages
- SIWE message shows domain for user verification

### Allowed Origins
```javascript
"http://localhost:3000/*",
"http://localhost:3001/*",
"https://cryptojournal.app/*",
"https://*.cryptojournal.app/*"
```

---

## 🧪 Testing

```bash
# Unit tests
npm run test:unit

# Coverage report
npm run test:coverage

# E2E tests
npm run test:e2e
```

---

## 🚀 v2.0 Architecture (App-Driven SIWE) - IMPLEMENTED

### v1.1 Legacy vs v2.0 New

| Flow Step | v1.1 Legacy (CJ_OPEN_AUTH) | v2.0 New (App-Driven) |
|-----------|----------------------------|------------------------|
| Connect wallet | Extension | Extension ✓ |
| Fetch challenge | Extension | **App** ✓ |
| Sign message | Extension | Extension ✓ |
| Verify signature | Extension | **App** ✓ |
| Store session | Extension | Extension ✓ |

### Why v2.0 is Better

1. **Simpler Extension** - Pure "wallet bridge" for v2.0 flow
2. **Better Debugging** - Each step visible in app's network tab
3. **Progress UI** - App can show "Connecting... Signing... Verifying..."
4. **Testability** - SIWE flow testable without extension
5. **Request Deduplication** - Prevents duplicate auth flows

### v2.0 Message Flow

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   MAIN APP       │      │  CONTENT SCRIPT  │      │ INJECTED SCRIPT  │
│   (Next.js)      │      │  (content.ts)    │      │ (injected-auth)  │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         │ 1. CJ_WALLET_CONNECT    │                         │
         │─────────────────────────►                         │
         │                         │ 2. CJ_WALLET_CONNECT    │
         │                         │─────────────────────────►
         │                         │                         │ 3. eth_requestAccounts
         │                         │                         │    (wallet popup)
         │                         │ 4. Address + ChainID    │
         │                         │◄─────────────────────────
         │ 5. CJ_WALLET_RESULT     │                         │
         │◄─────────────────────────                         │
         │                         │                         │
         │ 6. App fetches SIWE challenge from API            │
         │ 7. App receives SIWE message                      │
         │                         │                         │
         │ 8. CJ_WALLET_SIGN       │                         │
         │   (message, address)    │                         │
         │─────────────────────────►                         │
         │                         │ 9. CJ_WALLET_SIGN       │
         │                         │─────────────────────────►
         │                         │                         │ 10. personal_sign
         │                         │                         │     (wallet popup)
         │                         │ 11. Signature           │
         │                         │◄─────────────────────────
         │ 12. CJ_SIGN_RESULT      │                         │
         │◄─────────────────────────                         │
         │                         │                         │
         │ 13. App verifies signature with API               │
         │ 14. App receives session token                    │
         │                         │                         │
         │ 15. CJ_STORE_SESSION    │                         │
         │   (sessionToken, addr)  │                         │
         │─────────────────────────►                         │
         │                         │ 16. Store in chrome.storage
         │ 17. CJ_SESSION_STORED   │                         │
         │◄─────────────────────────                         │
         │ 18. CJ_SESSION_CHANGED  │                         │
         │◄─────────────────────────                         │
```

### Migration Path

Both v1.1 and v2.0 protocols are supported simultaneously:

- **v1.1 Legacy** (`CJ_OPEN_AUTH`) - Extension handles entire SIWE flow
- **v2.0 New** (`CJ_WALLET_CONNECT` + `CJ_WALLET_SIGN` + `CJ_STORE_SESSION`) - App controls flow

Apps can migrate gradually by switching from `CJ_OPEN_AUTH` to the v2.0 messages.

### SSR Safety

v2.0 maintains **SSR-safety** because:
- App still NEVER imports Web3 libraries (no wagmi, ethers)
- App still NEVER accesses `window.ethereum`
- All wallet operations still go through `postMessage()`
- Extension remains the secure wallet bridge

---

## ⚠️ Account Mode (NOT Extension's Concern)

Account mode (Live/Demo) is **NOT stored or managed by the extension**.

| Aspect | Where It Lives |
|--------|----------------|
| Storage | App's Zustand store + localStorage |
| Switching | App's UI toggle |
| Data filtering | App's React Query |
| Persistence | Per-device (localStorage) |

**Why?**
- Account mode is business logic, not authentication
- Should switch instantly (no message passing)
- Keeps extension focused on wallet operations

---

## ⚠️ Known Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot redefine property: ethereum" | Multiple wallets conflict | Not our bug - caused by Phantom/MetaMask |
| Service worker inactive | MV3 30-second timeout | Keep-alive system with alarms |
| Wallet not detected | Slow injection | Retry with exponential backoff (up to 3.5s) |

---

## 📋 Compatibility

### Wallets Tested
- ✅ MetaMask
- ✅ Rabby Wallet
- ✅ Brave Wallet
- ✅ Phantom (EVM mode)

### Security Extensions
- ✅ Pocket Universe
- ✅ Wallet Guard
- ✅ Fire

### Networks
- Ethereum, Polygon, Arbitrum, Optimism, Base, BNB Chain
