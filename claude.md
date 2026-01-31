# Claude Code Context: CTJ Web3 Extension

## Project Overview

This is a Manifest V3 Chrome browser extension that provides custom Web3 authentication for **CTJ (Crypto Trading Journal)**. The extension uses an **Extension-First Auth Flow** with **Injected Script Architecture** for wallet interactions.

> **Note:** The main application is branded as **CTJ**. Always use "CTJ" in documentation and code comments.

> **CRITICAL POSITIONING:** This extension is an **AUTHENTICATION BRIDGE**, NOT a cryptocurrency wallet. It connects existing wallets (MetaMask, Brave Wallet) to CTJ for passwordless SIWE authentication. Never describe it as a "wallet" in store listings or code comments.

**Key Technologies:**
- TypeScript (strict mode)
- Webpack 5 for bundling
- Chrome Extension APIs (Manifest V3)
- Jest for unit testing (1,240 tests)
- Playwright for E2E testing

**Supported Browsers:** Chrome, Brave, Edge, Opera (all Chromium-based)

**Version:** 2.2.4 (manifest & package.json synced)
**Last Updated:** January 31, 2026
**Status:** Rejected by Chrome Web Store (Violation ID: Red Potassium) — Resubmission pending

---

## 📊 Current Project Status (January 31, 2026)

### 🔴 Chrome Web Store Rejection Analysis

**Violation ID:** Red Potassium  
**Rejection Date:** January 6, 2026  
**Root Cause:** Reviewers couldn't reproduce "Wallet" functionality — they expected a standalone wallet like MetaMask.

**Key Learnings:**
1. Reviewers test on fresh Chrome profiles with NO other extensions
2. The word "Wallet" in description implies balance/send features
3. 500-character test instruction limit prevents full explanation
4. Without MetaMask installed, extension appears "broken"

### ✅ What's Working
| Component | Status | Notes |
|-----------|--------|-------|
| **Build System** | ✅ Working | Webpack 5 production build compiles successfully |
| **TypeScript** | ✅ Clean | `tsc --noEmit` passes with no errors |
| **Unit Tests** | ✅ 1,240 passing | All tests in 44 suites pass |
| **DI Architecture** | ✅ Complete | Entry points, Controllers, Adapters all implemented |
| **Core Logic** | ✅ Extracted | AuthStateMachine, SessionManager, SiweFlow, MessageRouter |
| **Adapters** | ✅ Complete | Chrome Storage, Runtime, Tabs, Alarms, DOM adapters |
| **Controllers** | ✅ Complete | Background, Content, Popup, Auth controllers |
| **Reviewer UX** | ✅ Added | Status indicators, MetaMask links, domain checks |

### 📈 Test Coverage Summary (v2.2.4)
| Metric | Value | Target | Gap |
|--------|-------|--------|-----|
| Unit Tests | 1,240 | - | ✅ |
| Test Suites | 44 | - | ✅ |
| Statement Coverage | ~45% | 70%+ | -25% |
| Branch Coverage | ~37% | 60%+ | -23% |
| Function Coverage | ~49% | 70%+ | -21% |

### 🎯 Chrome Web Store Resubmission Checklist

#### P0 — Approval Blockers (MUST FIX)
| Item | Status | Owner |
|------|--------|-------|
| Main site (cryptotradingjournal.xyz) accessible 24/7 | ⬜ Verify | Main App |
| Exact test URL in instructions (not "visit site") | ⬜ Update | Extension |
| Version consistency (manifest/package/listing/ZIP) | ✅ Done | Extension |
| Permissions rationale in CWS fields (esp. `alarms`) | ⬜ Add | Submission |
| MetaMask requirement in FIRST LINE of test instructions | ⬜ Update | Submission |

#### P1 — Reviewer Ease
| Item | Status | Owner |
|------|--------|-------|
| Screenshots show current popup UI + disclaimers | ⬜ Update | Submission |
| Domain scope narrowed or explicitly justified | ⬜ Review | Extension |
| Support URL + email in CWS form fields | ⬜ Verify | Submission |
| Privacy disclosure matches privacy policy | ⬜ Cross-check | Submission |

#### P2 — Quality & Polish
| Item | Status | Owner |
|------|--------|-------|
| A11y checks on status indicators (ARIA labels) | ⬜ Add | Extension |
| Remove deprecated legacy files | ⬜ Clean | Extension |
| Promotional tiles (440x280, 1400x560) | ⬜ Optional | Assets |

### 🗑️ Deprecated Files (Can Be Deleted)
These legacy files are NOT bundled (webpack uses `entry/` files) and should be removed:
- `src/scripts/popup.ts` → replaced by `PopupController` + `PopupView`
- `src/scripts/auth.ts` → replaced by `AuthController` + `AuthView`
- `src/scripts/content.ts` → replaced by `ContentController`
- `src/scripts/background.ts` → replaced by `BackgroundController`
- `src/scripts/background-main.ts` → merged into `BackgroundController`
- `src/scripts/auth-state-machine.ts` → replaced by `core/auth/AuthStateMachine.ts`

---

## 🏪 Chrome Web Store Compliance Guide

### Terminology Rules (CRITICAL)

| ❌ NEVER Use | ✅ Use Instead | Reason |
|--------------|----------------|--------|
| "Wallet" (as noun) | "Authentication Bridge" | Reviewers expect balance/send features |
| "Web3 Wallet" | "Web3 Auth" or "Wallet Bridge" | Implies standalone wallet |
| "Connect your wallet" (in descriptions) | "Connect your existing MetaMask" | Be explicit about dependency |
| "Wallet functionality" | "Authentication functionality" | Avoid ambiguity |

### Permission Justifications (for CWS Submission)

| Permission | Required Justification |
|------------|------------------------|
| `storage` | "Stores encrypted session tokens locally for cross-tab authentication persistence. No cloud sync." |
| `activeTab` | "Detects when user is on cryptotradingjournal.xyz to enable authentication flow." |
| `alarms` | "Maintains Service Worker keep-alive during SIWE signing. MV3 service workers timeout after 30 seconds; signing can take longer if user reads the message." |
| `host_permissions` | "Content script only runs on cryptotradingjournal.xyz to inject wallet bridge code." |

### Test Instructions Template (Under 500 chars)

**MUST include on line 1:** "REQUIRES MetaMask extension."

```
REQUIRES MetaMask extension.

TEST WALLET (no real funds):
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

STEPS:
1. Install MetaMask, import wallet using seed above
2. Visit https://cryptotradingjournal.xyz/login
3. Click "Connect Wallet" button
4. Approve connection in MetaMask popup
5. Sign the message in MetaMask
6. Success = wallet address shown in extension popup

Contact: support@cryptotradingjournal.xyz
```

### Main App Availability Requirements

The extension **CANNOT be approved** if cryptotradingjournal.xyz is unavailable:

| Requirement | Priority | Check |
|-------------|----------|-------|
| Site accessible 24/7 during review | 🔴 Critical | Uptime monitoring |
| Response time < 3 seconds | 🔴 Critical | Performance check |
| No CAPTCHA/bot protection blocking | 🔴 Critical | Test with fresh IP |
| No geographic restrictions | 🟡 High | VPN test |
| "Connect Wallet" visible without login | 🔴 Critical | Landing page check |
| HTTPS certificate valid | 🔴 Critical | SSL check |
| Test wallet accepted (no balance req) | 🔴 Critical | Flow test |

### CWS Privacy Practices Alignment

Ensure these match between the Privacy Policy (PRIVACY.md) and CWS "Privacy practices" tab:

| Data Type | Policy Says | CWS Field |
|-----------|-------------|-----------|
| Wallet address | Stored locally + server | ✅ Check "Authentication info" |
| Chain ID | Stored locally | ✅ Check "Authentication info" |
| Session tokens | Stored locally, 24h expiry | ✅ Check "Authentication info" |
| Browsing history | NOT collected | ❌ Leave unchecked |
| Personal info | NOT collected | ❌ Leave unchecked |

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

## 📁 Project Structure (v2.2.0+ DI Architecture)

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
│   ├── auth.html              # Auth page UI
│   ├── popup.html             # Extension popup UI
│   │
│   ├── scripts/
│   │   │
│   │   ├── entry/             # 🆕 ACTIVE ENTRY POINTS (v2.2.0+)
│   │   │   ├── background-entry.ts  # → BackgroundController
│   │   │   ├── content-entry.ts     # → ContentController
│   │   │   ├── popup-entry.ts       # → PopupController + PopupView
│   │   │   └── auth-entry.ts        # → AuthController + AuthView
│   │   │
│   │   ├── ui/                # 🆕 CONTROLLERS & VIEWS
│   │   │   ├── background/
│   │   │   │   ├── BackgroundController.ts  # Session, origin validation
│   │   │   │   └── index.ts
│   │   │   ├── content/
│   │   │   │   ├── ContentController.ts     # Message routing, health checks
│   │   │   │   └── index.ts
│   │   │   ├── popup/
│   │   │   │   ├── PopupController.ts       # Session state, navigation
│   │   │   │   ├── PopupView.ts             # DOM manipulation only
│   │   │   │   └── index.ts
│   │   │   └── auth/
│   │   │       ├── AuthController.ts        # Wallet detection, SIWE flow
│   │   │       ├── AuthView.ts              # DOM manipulation only
│   │   │       └── index.ts
│   │   │
│   │   ├── adapters/          # 🆕 BROWSER API ABSTRACTIONS
│   │   │   ├── types.ts             # Interface definitions
│   │   │   ├── ChromeStorageAdapter.ts
│   │   │   ├── ChromeRuntimeAdapter.ts
│   │   │   ├── ChromeTabsAdapter.ts
│   │   │   ├── ChromeAlarmsAdapter.ts
│   │   │   └── BrowserDOMAdapter.ts
│   │   │
│   │   ├── core/              # 🆕 DI CONTAINER
│   │   │   └── Container.ts   # getContainer() + mock factories
│   │   │
│   │   ├── services/          # 🆕 SHARED SERVICES
│   │   │   ├── InjectionService.ts  # Wallet script injection
│   │   │   ├── AuthApiClient.ts     # SIWE API calls
│   │   │   └── index.ts
│   │   │
│   │   ├── injected-auth.ts   # Injected script - wallet interactions
│   │   ├── api.ts             # API client (fetch wrapper)
│   │   ├── config.ts          # Configuration (URLs, origins)
│   │   ├── types.ts           # TypeScript interfaces
│   │   ├── errors.ts          # Error handling
│   │   ├── logger.ts          # Logging utilities
│   │   │
│   │   ├── [DEPRECATED] content.ts       # → Use entry/content-entry.ts
│   │   ├── [DEPRECATED] popup.ts         # → Use entry/popup-entry.ts
│   │   ├── [DEPRECATED] auth.ts          # → Use entry/auth-entry.ts
│   │   ├── [DEPRECATED] background.ts    # → Use entry/background-entry.ts
│   │   ├── [DEPRECATED] background-main.ts
│   │   │
│   │   └── __tests__/         # Unit tests (1015 tests)
│   │
│   ├── styles/
│   │   ├── auth.css           # Auth page styles
│   │   └── popup.css          # Popup styles
│   │
│   └── icons/                 # Extension icons
│
├── dist/                      # Built extension (load this in browser)
├── packages/                  # Release zip files
├── coverage/                  # Test coverage reports
└── test-ground/               # Manual testing environment
```

---

## 🏛️ Dependency Injection Architecture (v2.2.0)

### Overview

The extension uses dependency injection for testability and separation of concerns:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Entry Points (Thin Shells)                   │
│   background-entry.ts  content-entry.ts  popup-entry.ts  auth-entry │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ Wire up dependencies
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Controllers (Business Logic)                │
│  BackgroundController  ContentController  PopupController  Auth...  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ Use adapters
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Adapters (Browser API Abstractions)         │
│  IStorageAdapter  IRuntimeAdapter  ITabsAdapter  IDOMAdapter        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
┌──────────────────────┐                 ┌──────────────────────┐
│   Chrome Adapters    │                 │    Mock Adapters     │
│  (Production)        │                 │    (Testing)         │
│  ChromeStorageAdapter│                 │  createMockStorage() │
│  ChromeRuntimeAdapter│                 │  createMockRuntime() │
└──────────────────────┘                 └──────────────────────┘
```

### Container Usage

```typescript
// Production: Get real Chrome adapters
import { getContainer } from './core/Container';
const container = getContainer();

// Testing: Get mock adapters
import { createMockStorageAdapter, createMockRuntimeAdapter } from './core/Container';
const mockStorage = createMockStorageAdapter();
```

### Controller Pattern

Controllers encapsulate business logic, Views handle DOM only:

```typescript
// PopupController - business logic
class PopupController {
  constructor(deps: { storage, runtime, tabs }) { ... }
  async checkSession(): Promise<void> { ... }
  async connect(): Promise<void> { ... }
  async disconnect(): Promise<void> { ... }
}

// PopupView - DOM manipulation only
class PopupView {
  constructor(dom: IDOMAdapter) { ... }
  showView(state: 'loading' | 'connected' | 'notConnected'): void { ... }
  updateSessionDisplay(session: SessionData): void { ... }
}
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
"https://cryptotradingjournal.xyz/*",
"https://www.cryptotradingjournal.xyz/*",
"https://*.cryptotradingjournal.xyz/*"
```

### Rate Limiting (Implemented)
Token bucket algorithm prevents message spam from malicious pages:
```typescript
// content.ts - Token bucket rate limiter
const rateLimiter = {
  tokens: 20,        // Start with 20 tokens
  maxTokens: 20,     // Max 20 tokens
  refillRate: 5,     // Refill 5 tokens per second
};
```

### Security Enhancements (Recommended)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| Session validation timing | Side-channel attacks | Constant-time token comparison |
| No CSP documentation | XSS in popup/auth pages | Document Content Security Policy |
| SIWE challenge expiration | Replay attacks | Enforce server-side nonce expiry |

---

## 🔌 Wallet Compatibility

### Tested Wallets

| Wallet | Status | Notes |
|--------|--------|-------|
| MetaMask | ✅ Tested | Primary development wallet |
| Rabby | ✅ Tested | Full compatibility |
| Brave Wallet | ✅ Tested | Built-in browser wallet |
| Phantom | ✅ Tested | EVM mode only |
| Coinbase Wallet | ⚠️ Untested | Needs verification |
| WalletConnect | ❌ Not supported | Consider for future |
| Hardware (Ledger/Trezor) | ⚠️ Via MetaMask | Test MetaMask+Ledger combo |

### Security Extensions Compatibility

| Extension | Status | Notes |
|-----------|--------|-------|
| Pocket Universe | ✅ Compatible | Intercepts signatures seamlessly |
| Wallet Guard | ✅ Compatible | Works as expected |
| Fire | ⚠️ Untested | May need testing |

---

## 📊 Operational Considerations

### Error Recovery (Documented Flows)

| Error | Recovery Action |
|-------|-----------------|
| `USER_REJECTED (4001)` | Show "Cancelled" message, allow retry |
| `NO_WALLET (5001)` | Show wallet installation link |
| `WALLET_CONNECTION_FAILED (5002)` | Suggest page refresh or wallet reconnect |
| `REQUEST_TIMEOUT (5006)` | Auto-retry with exponential backoff |
| `ALREADY_IN_PROGRESS (5007)` | Wait for existing flow to complete |
| Service worker restart | PING/PONG health checks, auto-reconnect |

### Logging Strategy
- Development: Console logging with prefixes `[content]`, `[background]`, `[popup]`
- Production: Error-level only via `logger.ts`
- No PII or wallet addresses in logs

### Extension Update Handling
- Active sessions survive extension updates
- Sessions stored in `chrome.storage.local` (persisted)
- Extension reinstall clears sessions (expected)

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
- ⚠️ Coinbase Wallet (untested)
- ❌ WalletConnect (not supported - future consideration)

### Security Extensions
- ✅ Pocket Universe
- ✅ Wallet Guard
- ✅ Fire (untested but expected compatible)

### Networks
- Ethereum, Polygon, Arbitrum, Optimism, Base, BNB Chain

---

## 🔄 V2.2 Refactoring Architecture (COMPLETE)

### Migration Status: ✅ ACTIVE

The v2.2 DI architecture is **now the active production code**. Webpack entry points use the new `entry/` files:

| Entry | Source | Controller |
|-------|--------|------------|
| `background.js` | `entry/background-entry.ts` | `BackgroundController` |
| `content.js` | `entry/content-entry.ts` | `ContentController` |
| `popup.js` | `entry/popup-entry.ts` | `PopupController + PopupView` |
| `auth.js` | `entry/auth-entry.ts` | `AuthController + AuthView` |

### Well-Covered Components (Good Progress)

| Component | Statement % | Branch % | Notes |
|-----------|-------------|----------|-------|
| `ChromeAlarmsAdapter.ts` | 100% | 100% | ✅ Fully tested |
| `ChromeTabsAdapter.ts` | 100% | 100% | ✅ Fully tested |
| `DOMAdapter.ts` | 95.65% | 100% | ✅ Excellent |
| `SessionManager.ts` | 91.58% | 96.49% | ✅ Excellent |
| `ChromeRuntimeAdapter.ts` | 90.62% | 84.61% | ✅ Good |
| `SiweFlow.ts` | 85.6% | 77.77% | ✅ Good |
| `InjectionService.ts` | 84.84% | 57.14% | 🟡 Branches need work |
| `Container.ts` | 84.87% | 75% | ✅ Good |
| `MessageRouter.ts` | 83.15% | 66.66% | ✅ Good |
| `AuthStateMachine.ts` | 82.08% | 72.54% | ✅ Good |
| `PopupView.ts` | 82.27% | 62.79% | ✅ Good |
| `AuthController.ts` | 77.77% | 59.09% | 🟡 Branches need work |
| `siwe-utils.ts` | 79.74% | 54.34% | 🟡 Branches need work |
| `StorageService.ts` | 77.96% | 94.44% | ✅ Good |

### Coverage Improvement

| Metric | Before (v2.1) | After (v2.2) | Target |
|--------|---------------|--------------|--------|
| Statement Coverage | 23% | **44%** | 70%+ |
| Branch Coverage | 16% | **37%** | 60%+ |
| Unit Tests | 532 | **1015** | - |

### Legacy Files (NOT BUNDLED)

These files remain in the codebase for reference but are **not included in builds**:

| File | Status | Replacement |
|------|--------|-------------|
| `content.ts` | Deprecated | `ContentController.ts` |
| `popup.ts` | Deprecated | `PopupController.ts` + `PopupView.ts` |
| `auth.ts` | Deprecated | `AuthController.ts` + `AuthView.ts` |
| `background.ts` | Deprecated | `BackgroundController.ts` |
| `background-main.ts` | Deprecated | `BackgroundController.ts` |
| `auth-state-machine.ts` | Deprecated | `core/auth/AuthStateMachine.ts` |

### Target Architecture

```
src/scripts/
├── core/                          # Pure logic (100% testable)
│   ├── session/
│   │   ├── SessionManager.ts      # Session state logic
│   │   └── SessionValidator.ts    # Validation rules
│   ├── auth/
│   │   ├── AuthStateMachine.ts    # Pure state transitions
│   │   ├── SiweFlow.ts            # SIWE message handling
│   │   └── AuthEvents.ts          # Event type definitions
│   ├── messaging/
│   │   ├── MessageRouter.ts       # Route CJ_* messages
│   │   ├── MessageHandlers.ts     # Handler implementations
│   │   └── MessageTypes.ts        # Type definitions
│   └── storage/
│       ├── StorageService.ts      # Abstract storage operations
│       └── StorageKeys.ts         # Key constants
│
├── adapters/                      # Browser API wrappers (mockable)
│   ├── ChromeStorageAdapter.ts    # chrome.storage wrapper
│   ├── ChromeRuntimeAdapter.ts    # chrome.runtime wrapper
│   ├── ChromeTabsAdapter.ts       # chrome.tabs wrapper
│   └── DOMAdapter.ts              # document/window wrapper
│
├── ui/                            # UI layer (thin shells)
│   ├── popup/
│   │   ├── PopupController.ts     # Orchestrates popup logic
│   │   ├── PopupView.ts           # DOM manipulation only
│   │   └── popup-entry.ts         # Entry point (side effects)
│   └── auth/
│       ├── AuthController.ts      # Orchestrates auth flow
│       ├── AuthView.ts            # DOM manipulation only
│       └── auth-entry.ts          # Entry point (side effects)
│
├── workers/                       # Background scripts
│   ├── BackgroundController.ts    # Main orchestrator
│   ├── AlarmService.ts            # Alarm management
│   └── background-entry.ts        # Entry point (side effects)
│
└── content/                       # Content script
    ├── ContentController.ts       # Message handling logic
    ├── InjectionService.ts        # Script injection logic
    └── content-entry.ts           # Entry point (side effects)
```

### Key Design Patterns

#### 1. Dependency Injection Container
```typescript
// core/Container.ts
interface Dependencies {
  storage: StorageAdapter;
  runtime: RuntimeAdapter;
  tabs: TabsAdapter;
  dom?: DOMAdapter;
}

// In tests: provide mock dependencies
// In production: provide real Chrome adapters
```

#### 2. Pure State Machine
```typescript
// core/auth/AuthStateMachine.ts
type AuthState = 'idle' | 'connecting' | 'signing' | 'verifying' | 'connected' | 'error';
type AuthEvent = { type: 'CONNECT' } | { type: 'SIGN_REQUEST', message: string } | ...;

// Pure function - no side effects
function transition(state: AuthState, event: AuthEvent): { 
  newState: AuthState; 
  effects: Effect[];  // Effects to execute
}
```

#### 3. Command Pattern for Messages
```typescript
// core/messaging/MessageRouter.ts
class MessageRouter {
  private handlers: Map<string, MessageHandler>;
  
  // Pure routing logic - returns handler, doesn't execute
  route(message: PageMessage): MessageHandler | null;
  
  // Separate execution from routing
  async execute(handler: MessageHandler, message: PageMessage): Promise<Response>;
}
```

---

## 📅 V2.2 Implementation Phases

### Phase 0: Integration Test Baseline (Before Refactoring)
| Task | Effort | Purpose |
|------|--------|--------|
| Expand Playwright E2E tests | 8h | Catch regressions during refactoring |
| Document all current behaviors | 4h | Define acceptance criteria |
| Set up CI coverage tracking | 2h | Monitor progress |

### Phase 1: Foundation (Week 1) - Low Risk
| Task | Effort | Impact |
|------|--------|--------|
| Create adapter interfaces | 4h | Enables mocking |
| Extract `StorageService` from scattered code | 4h | +5% coverage |
| Extract `MessageRouter` from content.ts | 6h | +8% coverage |
| Create shared test utilities | 2h | Faster test writing |

### Phase 2: Core Logic Extraction (Week 2) - Medium Risk
| Task | Effort | Impact |
|------|--------|--------|
| Extract `AuthStateMachine` as pure functions | 8h | +12% coverage |
| Extract `SessionManager` logic | 6h | +8% coverage |
| Refactor `SiweFlow` to pure logic | 4h | +5% coverage |
| Add tests for extracted modules | 8h | Validates extraction |

### Phase 3: Controller Layer (Week 3) - Medium Risk
| Task | Effort | Impact |
|------|--------|--------|
| Create `PopupController` with injected deps | 6h | +10% coverage |
| Create `ContentController` | 6h | +15% coverage |
| Create `BackgroundController` | 6h | +8% coverage |
| Convert entry points to thin shells | 4h | Minimal logic in shells |

### Phase 4: UI Separation (Week 4) - Higher Risk
| Task | Effort | Impact |
|------|--------|--------|
| Extract `PopupView` (DOM-only) | 4h | Clean separation |
| Extract `AuthView` (DOM-only) | 4h | Clean separation |
| Integration tests for full flows | 8h | End-to-end verification |
| Update documentation | 4h | Maintainability |

### Implementation Status

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 0 | E2E test baseline | ✅ Complete |
| Phase 1 | Foundation & adapters | ✅ Complete |
| Phase 2 | Core logic extraction | ✅ Complete |
| Phase 3 | Controller layer | ✅ Complete |
| Phase 4 | UI separation | ⏳ Partial (AuthView at 0% coverage) |

### Remaining Work (Prioritized) - Updated January 14, 2026

| Priority | Task | Impact | Effort | Status |
|----------|------|--------|--------|--------|
| 🔴 P0 | Add tests for `AuthView.ts` (0% → 80%) | +2.5% overall coverage | 4h | 🔲 Not Started |
| 🔴 P0 | Add tests for entry points (0% → 70%) | +2.9% overall coverage | 3h | 🔲 Not Started |
| 🔴 P0 | Increase `ContentController` branch coverage (30% → 60%) | +3% branch coverage | 6h | 🔲 Not Started |
| 🟡 P1 | Add rate limiting unit tests | Security code coverage | 2h | 🔲 Not Started |
| 🟡 P1 | Add sw-keepalive.ts tests | Service worker stability | 2h | 🔲 Not Started |
| 🟡 P1 | Sync package.json version to 2.2.1 | Version consistency | 5min | 🔲 Not Started |
| 🟢 P2 | Delete deprecated legacy files | Reduces maintenance burden | 1h | 🔲 Not Started |
| 🟢 P2 | Document error recovery flows | Operational readiness | 2h | 🔲 Not Started |
| 🟢 P2 | Test Coinbase Wallet compatibility | Expand user base | 4h | 🔲 Not Started |

### Files at 0% Coverage (Require Attention)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `entry/auth-entry.ts` | 10-82 | Entry point | Wires AuthController + AuthView |
| `entry/background-entry.ts` | 19-130 | Entry point | Wires BackgroundController |
| `entry/content-entry.ts` | 10-68 | Entry point | Wires ContentController |
| `entry/popup-entry.ts` | 10-66 | Entry point | Wires PopupController + PopupView |
| `ui/auth/AuthView.ts` | 12-333 | View | DOM manipulation for auth page |
| `rate-limiter.ts` | 15-391 | Security | Token bucket rate limiting |
| `sw-keepalive.ts` | 18-379 | Background | Service worker keep-alive |
| `sw-state.ts` | 36-199 | Background | Service worker state management |
| `popup.ts` | 19-518 | **DEPRECATED** | Can delete - not bundled |

### Deprecated Files (To Remove in v3.0.0)

These files have `@deprecated` JSDoc headers and are kept for reference only:
- `content.ts` → Use `entry/content-entry.ts`
- `background.ts` → Use `entry/background-entry.ts`
- `popup.ts` → Use `entry/popup-entry.ts`
- `auth.ts` → Use `entry/auth-entry.ts`
- `background-main.ts` → Merged into BackgroundController
- `auth-state-machine.ts` → Use `core/auth/AuthStateMachine`

### Architecture Principles

1. **Dependency Injection** - All controllers receive adapters via constructor
2. **Pure Logic** - Core modules (`core/`) have no side effects
3. **Thin Entry Points** - `entry/` files only wire dependencies
4. **Mockable Adapters** - Chrome APIs wrapped for testing
