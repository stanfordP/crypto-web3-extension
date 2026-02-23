# Claude Code Context: CTJ Web3 Extension

## Project Overview

This is a Manifest V3 Chrome browser extension that provides custom Web3 authentication for **CTJ (Crypto Trading Journal)**. The extension uses an **Extension-First Auth Flow** with **Injected Script Architecture** for wallet interactions.

> **Note:** The main application is branded as **CTJ**. Always use "CTJ" in documentation and code comments.

> **CRITICAL POSITIONING:** This extension is an **AUTHENTICATION BRIDGE**, NOT a cryptocurrency wallet. It connects existing wallets (MetaMask, Brave Wallet) to CTJ for passwordless SIWE authentication. Never describe it as a "wallet" in store listings or code comments.

**Key Technologies:**
- TypeScript (strict mode)
- Webpack 5 for bundling
- Chrome Extension APIs (Manifest V3)
- Jest for unit testing (1,542 tests across 55 suites)
- Playwright for E2E testing

**Supported Browsers:** Chrome, Brave, Edge, Opera (all Chromium-based)

**Version:** 2.2.6 (manifest & package.json synced)
**Last Updated:** February 21, 2026
**Status:** Rejected by Chrome Web Store (Violation ID: Red Potassium) — Resubmission in progress

---

## 📊 Current Project Status (February 21, 2026)

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
| **Unit Tests** | ✅ 1,621 passing | All tests in 57 suites pass |
| **DI Architecture** | ✅ Complete | Entry points, Controllers, Adapters all implemented |
| **Core Logic** | ✅ Extracted | AuthStateMachine, SessionManager, SiweFlow, MessageRouter |
| **Adapters** | ✅ Complete | Chrome Storage, Runtime, Tabs, Alarms, DOM adapters |
| **Controllers** | ✅ Complete | Background, Content, Popup, Auth controllers |
| **Reviewer UX** | ✅ Added | Status indicators, MetaMask links, domain checks, Getting Started guide |
| **Main App Auth** | ✅ Fixed | Race conditions, hydration, rate limiting, 401 noise all resolved |

### 📈 Test Coverage Summary (v2.2.6) — Updated February 2026

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Unit Tests | **1,621** | - | ✅ |
| Test Suites | **57** | - | ✅ |
| Statement Coverage | **75.16%** | 80%+ | 🔴 -4.84% |
| Branch Coverage | **65.78%** | 70%+ | 🔴 -4.22% |
| Function Coverage | **72.6%** | 80%+ | 🔴 -7.4% |

**Recent Additions (Jan 31):**
- +20 tests for `sw-keepalive.ts` (0% → 81.48%)
- +24 tests for `PopupController.ts` (59% → 81.86%)
- +22 tests for entry point adapters/controllers

### 🎯 Chrome Web Store Resubmission Checklist (PENDING)

#### P0 — Approval Blockers (MUST FIX)
| Item | Status | Owner |
|------|--------|-------|
| Main site (cryptotradingjournal.xyz) accessible 24/7 | ⬜ Verify | Main App |
| Exact test URL in instructions (not "visit site") | ✅ Done | Extension |
| Version consistency (manifest/package/listing/ZIP) | ✅ Done (2.2.6) | Extension |
| Permissions rationale in CWS fields (esp. `alarms`) | ⬜ Paste into CWS form | Submission |
| MetaMask requirement in FIRST LINE of test instructions | ✅ Done | Submission |
| SIWE nonces table exists in production Supabase | ⬜ Verify migration | Main App |
| End-to-end auth flow works on production site | ⬜ Test | Both |

#### P1 — Reviewer Ease
| Item | Status | Owner |
|------|--------|-------|
| Screenshots show current popup UI + disclaimers | ⬜ Take fresh screenshots | Submission |
| Domain scope narrowed or explicitly justified | ✅ Done (only cryptotradingjournal.xyz + localhost) | Extension |
| Support URL + email in CWS form fields | ✅ Done (GitHub Issues link in popup + reviewer page) | Submission |
| Privacy disclosure matches privacy policy | ⬜ Cross-check docs/index.html vs CWS form | Submission |
| Reviewer guide (docs/reviewer.html) up to date | ✅ Done (v2.2.6 referenced) | Extension |
| Popup "Getting Started" guide for off-site | ✅ Done | Extension |
| Popup "NOT a wallet" disclaimer | ✅ Done | Extension |
| Disconnect works without interruptions | ✅ Done (feedback modal disabled) | Main App |

#### P2 — Quality & Polish
| Item | Status | Owner |
|------|--------|-------|
| A11y checks on status indicators (ARIA labels) | ✅ Done (27 axe tests) | Extension |
| Remove deprecated legacy files | ✅ Done | Extension |
| Promotional tiles (440x280, 1400x560) | ⬜ Optional | Assets |

#### Main App Fixes for CWS Review (February 2026)
| Fix | Status | Impact on Review |
|-----|--------|------------------|
| Extension detection race condition | ✅ Fixed | No more redirect loops on first load |
| AuthGuard Zustand hydration | ✅ Fixed | Protected pages load without flashing login |
| Session check deduplication | ✅ Fixed | No 429 rate limit errors during review |
| Chat widget auth (removed API calls) | ✅ Fixed | No 401 console noise |
| Trades/new redundant auth check | ✅ Fixed | Pages load correctly when authenticated |
| Feedback modal disabled on disconnect | ✅ Fixed | Clean disconnect for reviewer testing |

---

## 🔐 Permission Justifications (for CWS Form)

When resubmitting, use these exact justifications for the requesting permissions in the developer dashboard:

| Permission | Justification |
|------------|---------------|
| **`storage`** | Required to securely persist the SIWE (Sign-In With Ethereum) session state and user preferences locally within the extension. This ensures the user remains authenticated across browser sessions without needing to re-sign daily. |
| **`activeTab`** | Used to detect the active state of the Crypto Trading Journal web application. This allows the extension to provide real-time connection status (Connected/Disconnected) and show the correct UI when the user interacts with the extension popup. |
| **`alarms`** | Required for the background service worker "keep-alive" mechanism. Since Manifest V3 service workers are ephemeral, alarms are used to ensure critical authentication processes or session heartbeats are not interrupted by unexpected worker termination. |
| **Host Permissions** (`cryptotradingjournal.xyz`) | Necessary for the extension to communicate with the application's API endpoints for session validation and to inject the authentication bridge script into the permitted domain only. |

---

## 🚀 Beta Distribution Strategy (Interim)

To support testers while CWS approval is pending, use the **GitHub Side-loading** method.

### 📦 Tester Deliverables
1. **Production ZIP**: Generated via `npm run release:full`.
2. **Installation Guide**: Located in [BETA_INSTALL_GUIDE.md](./BETA_INSTALL_GUIDE.md).
3. **Known Limitations**: 
   - No auto-updates (must manually re-install).
   - Chrome "Developer Mode" warning banner at startup.

### 🛠️ Beta Implementation Items
- [ ] **Remote Version Check**: Implement a simple fetch in the popup to notify users if a newer `.zip` is available on GitHub.
- [ ] **Tester Feedback Form**: Link a Google Form or GitHub Issue template in the popup for bug reports.
- [ ] **Environment Badge**: Add a "BETA" or "UNRELEASED" badge to the popup UI during non-CWS builds.

---

## 🗑️ Deprecated Files (DELETED)

All legacy files have been removed. The DI architecture (`entry/` files) is the sole active codebase:
- `src/scripts/popup.ts` — deleted, replaced by `PopupController` + `PopupView`
- `src/scripts/auth.ts` — deleted, replaced by `AuthController` + `AuthView`
- `src/scripts/content.ts` — deleted, replaced by `ContentController`
- `src/scripts/background.ts` — deleted, replaced by `BackgroundController`
- `src/scripts/background-main.ts` — deleted, merged into `BackgroundController`
- `src/scripts/auth-state-machine.ts` — deleted, replaced by `core/auth/AuthStateMachine.ts`

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

TEST WALLET (no real funds — copy seed below):
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

STEPS:
1. Install MetaMask, import wallet using copied seed above
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

## UI & Theme Design

### Deep Oceanic Theme

The extension uses the **Deep Oceanic** theme, a unified visual identity shared with the main CTJ application.

> **📖 Full documentation:** See [docs/THEME_DESIGN_SYSTEM.md](docs/THEME_DESIGN_SYSTEM.md)

| Element | Variable | Hex |
|---------|----------|-----|
| Background | `--cj-ocean-deepest` | `#0a1628` |
| Primary Accent | `--cj-teal-glow` | `#14b8a6` |
| Primary Text | `--cj-text-primary` | `#f1f5f9` |
| Secondary Text | `--cj-text-secondary` | `#94a3b8` |
| Success | `--cj-success` | `#10b981` |
| Error | `--cj-danger` | `#ef4444` |

### Accessibility Standards

> **Canonical source:** See `docs/THEME_DESIGN_SYSTEM.md` (shared with main app)

| Requirement | Status | Notes |
|-------------|--------|-------|
| WCAG 2.1 AA Primary Text | ✅ Pass | 12.8:1 contrast ratio |
| WCAG 2.1 AA Secondary Text | ✅ Pass | 6.1:1 contrast ratio |
| WCAG 2.1 AA Muted Text | ⚠️ Marginal | 3.8:1 contrast ratio |
| Focus ring visibility | ✅ Pass | Teal glow ring |
| Screen reader support | ✅ Pass | ARIA labels on interactive elements |
| axe-core automated tests | ✅ 27 tests | WCAG compliance verified |

### Icon System

The extension uses the **CTJ 16C Brand Mark** (Tier 1 grid+dot design) for all icon sizes:
- `src/icons/icon.svg` - Master SVG with Deep Oceanic colors (gold cells `#d4a854`, teal dot `#2dd4bf`, bg `#0a1628`)
- `src/icons/icon-16.png` - Toolbar icon (16x16)
- `src/icons/icon-48.png` - Extensions page (48x48)
- `src/icons/icon-128.png` - Chrome Web Store / install dialog (128x128)
- Generated via `node scripts/generate-icons.js` (requires `canvas` npm package)

UI elements use **inline SVGs** (Feather icon style) instead of emojis:
- Ensures consistent rendering across Windows, macOS, Linux
- Avoids emoji variation between OS versions
- Maintains color palette consistency

### Style Files

| File | Purpose |
|------|---------|
| `src/styles/popup.css` | Popup UI theme + animations |
| `src/styles/auth.css` | Auth page theme |
| `docs/install.html` | Installation guide (inline theme) |
| `docs/reviewer.html` | Reviewer guide (inline theme) |

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
│   │   └── __tests__/         # Unit tests (1,542 tests)
│   │
│   ├── styles/
│   │   ├── auth.css           # Auth page styles
│   │   └── popup.css          # Popup styles
│   │
│   └── icons/                 # CTJ 16C brand mark icons
│       ├── icon.svg           # Master SVG (Tier 1 grid+dot)
│       ├── icon-16.png        # 16x16 toolbar icon
│       ├── icon-48.png        # 48x48 extensions page
│       └── icon-128.png       # 128x128 CWS / install dialog
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

## Cross-Project Dependencies (Main App — crypto-futures-jn)

> **Context:** The main CTJ application's AI governance assessment (February 2026) identified two schema-level changes that affect the extension's session and identity contracts.
> **PRD Reference:** See `crypto-futures-jn/docs/CTJ_PRD.md` for CI/CD pipeline design with monorepo path-based filtering.

### CI/CD Integration (from PRD)

The PRD requires a GitHub Actions CI pipeline with path-based filtering for the monorepo:
- Extension CI should only run when `crypto-web3-extension/**` files change
- Pipeline: `npm ci` -> `npm run type-check` -> `npm run test:unit -- --coverage`
- **Status:** Not yet implemented — add `.github/workflows/ci.yml`

### Upstream Changes Affecting Extension

| Main App Gap ID | Change | Extension Impact | When |
|-----------------|--------|------------------|------|
| **G6** | Admin tables migrating `user_address TEXT` → `user_id UUID` | Extension's SIWE session currently stores `address` as primary identifier; session validation against admin/role tables will need to resolve `user_id` from `address` | Phase 20D.4 |
| **GOV-2** | Unified identity model (`useAuthIdentity()` hook) | Extension produces the wallet address + chain ID that feeds into the identity model; no extension changes required, but session token format may evolve | Phase 20A |

### What This Means for Extension Development

1. **No immediate action required** — The extension is an authentication bridge and operates outside the AI agent pipeline
2. **Session token contract is stable** — The extension stores `{ sessionToken, address, chainId }` in `chrome.storage.local`; this contract is not changing
3. **Watch for API changes** — When G6 migration lands, the `/api/auth/siwe/verify` response may include `user_id` alongside `address`; the extension should be prepared to store this if provided
4. **GOV-2 identity model** — The extension's SIWE flow is the primary identity source for wallet-linked users; the main app's `useAuthIdentity()` hook will abstract over both Web3 (extension) and session-based (Passkey) auth

### Recommended Extension Preparation

- [ ] Add optional `user_id` field to session storage schema (forward-compatible with G6)
- [ ] Update `CJ_STORE_SESSION` message type to accept optional `user_id` field
- [ ] No changes to wallet connection or signing flows

---

## ⚠️ Known Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot redefine property: ethereum" | Multiple wallets conflict | Not our bug - caused by Phantom/MetaMask |
| Service worker inactive | MV3 30-second timeout | Keep-alive system with alarms |
| Wallet not detected | Slow injection | Retry with exponential backoff (up to 3.5s) |

---

## 📋 Supported Networks

Ethereum, Polygon, Arbitrum, Optimism, Base, BNB Chain

> **Wallet compatibility:** See § Wallet Compatibility above for tested wallets and security extensions.

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

> **Full list with JSDoc status:** See § Deprecated Files (To Remove in v3.0.0) below.

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

---

## 🚨 Remaining Gaps & Implementation Plan (January 31, 2026)

This section tracks all identified gaps from comprehensive codebase analysis. Updated after each improvement cycle.

### Gap Analysis Summary

| Category | Gap Count | Severity | Est. Effort |
|----------|-----------|----------|-------------|
| Test Coverage & Alignment | 5 | 🔴 High | 16h |
| Accessibility Verification | 3 | 🟡 Medium | 6h |
| CWS Compliance Risk | 3 | 🔴 High | 4h |
| Technical Resilience | 3 | 🟡 Medium | 8h |

### 🔴 P0: Critical Gaps (Block CWS Approval)

#### 1. Tests Don't Exercise Production Modules
**Problem:** New tests (PopupController, injected-auth, sw-keepalive, error-reporting) use mirrored "Test*" classes instead of importing actual source files. Coverage reports still show low percentages for production code.

**Impact:** Actual bugs in production modules may not be caught.

**Resolution:**
- [ ] Refactor tests to import and test actual source modules
- [ ] Use Jest mocks for Chrome APIs instead of reimplementing logic
- [ ] Target: 70%+ statement coverage on all production files

**Effort:** 8h | **Owner:** Dev

#### 2. CWS Terminology Audit Incomplete
**Problem:** Need comprehensive sweep of all Chrome-facing text to ensure "wallet" is never the primary descriptor.

**Files to Audit:**
- [ ] `manifest.json` - name, short_name, description
- [ ] `STORE_LISTING.md` - all copy
- [ ] `popup.html` / `auth.html` - user-facing strings
- [ ] `CHROME_WEB_STORE_SUBMISSION.md` - submission fields

**Resolution:** Search-and-replace audit + manual review of context.

**Effort:** 2h | **Owner:** Dev

#### 3. Standalone Onboarding Gap
**Problem:** Extension lacks a "what to do next" flow when opened off-site. Reviewers who open the popup on google.com see "Not Connected" with no guidance.

**Resolution:**
- [ ] Add "Getting Started" mini-tutorial in popup when off-site
- [ ] Include animated GIF or step indicator showing the flow
- [ ] Link to reviewer documentation page

**Effort:** 4h | **Owner:** Dev

### 🟡 P1: High Priority Gaps

#### 4. Untested Entry Points
**Problem:** `entry/*.ts` files (auth-entry, background-entry, content-entry, popup-entry) remain at 0% coverage.

**Resolution:**
- [ ] Add integration tests that verify wiring is correct
- [ ] Mock adapters, verify controllers receive them

**Effort:** 4h | **Owner:** Dev

#### 5. Branch-Heavy Controllers Untested
**Problem:** `PopupController.ts` (59%) and `BackgroundController.ts` (68%) have complex error/edge branches still dark.

**Specific Areas:**
- PopupController: lines 418-582 (error states, retry logic)
- BackgroundController: lines 402-497 (keep-alive, port management)

**Resolution:**
- [ ] Add targeted tests for uncovered branches
- [ ] Use error injection to test failure paths

**Effort:** 6h | **Owner:** Dev

#### 6. No Automated Accessibility Audit
**Problem:** ARIA labels present but no automated verification (Axe-core, Lighthouse).

**Resolution:**
- [ ] Add Playwright + Axe-core integration test
- [ ] Run on popup.html and auth.html
- [ ] Target: 0 violations at WCAG 2.1 AA level

**Effort:** 3h | **Owner:** Dev

#### 7. Keyboard Navigation Unverified
**Problem:** No test confirms proper tab-order or focus management in popup/auth windows.

**Resolution:**
- [ ] Add E2E test for keyboard-only navigation
- [ ] Verify focus-trap behavior in modal-like views
- [ ] Test Escape key closes appropriate elements

**Effort:** 2h | **Owner:** Dev

### 🟢 P2: Medium Priority Gaps

#### 8. Screen Reader Announcements Unverified
**Problem:** `aria-live` regions exist but no verification that screen readers correctly announce state changes.

**Resolution:**
- [ ] Manual testing with NVDA/VoiceOver
- [ ] Document expected announcements in test plan

**Effort:** 2h | **Owner:** QA

#### 9. No Memory Leak Analysis
**Problem:** Background service worker runs indefinitely. No profiling for `activeOperations` Map or port listener leaks.

**Resolution:**
- [ ] Add DevTools Memory profiler session documentation
- [ ] Add cleanup verification in long-running tests
- [ ] Consider adding operation count metrics

**Effort:** 4h | **Owner:** Dev

#### 10. No Global Offline Mode
**Problem:** Individual API calls retry, but no unified "Offline Mode" UX when backend is unreachable.

**Resolution:**
- [ ] Add offline detection in popup/auth views
- [ ] Show "Offline - cached session" badge when appropriate
- [ ] Graceful degradation without errors

**Effort:** 3h | **Owner:** Dev

#### 11. Version Sync Guardrails Missing
**Problem:** No automated check that manifest.json, package.json, and CWS listing have matching versions.

**Resolution:**
- [ ] Add pre-commit hook or CI check
- [ ] Existing `sync-manifest-version.js` script needs integration

**Effort:** 1h | **Owner:** Dev

### Implementation Priority Matrix

| Week | Focus | Tasks | Success Criteria |
|------|-------|-------|------------------|
| **Week 1** | CWS Approval Blockers | #2 Terminology, #3 Onboarding | All "wallet" refs audited, Getting Started UI added |
| **Week 2** | Test Alignment | #1 Production tests, #4 Entry points | 70%+ coverage on production files |
| **Week 3** | Branch Coverage | #5 Controllers | PopupController 80%+, BackgroundController 80%+ |
| **Week 4** | Accessibility | #6 Axe audit, #7 Keyboard | 0 a11y violations, keyboard nav works |
| **Week 5** | Resilience | #9 Memory, #10 Offline, #11 Version | Leak-free, offline-ready, version-synced |

### Progress Tracking

| Gap # | Description | Status | Completed |
|-------|-------------|--------|-----------|
| 1 | Production module tests | ✅ Complete | Jan 31, 2026 |
| 2 | Terminology audit | ✅ Complete | Jan 31, 2026 |
| 3 | Standalone onboarding | ✅ Complete | Jan 31, 2026 |
| 4 | Entry point tests | ✅ Complete | Jan 31, 2026 |
| 5 | Controller branch tests (Popup, Background) | ✅ Complete | Jan 31, 2026 |
| 6 | Axe accessibility audit | ✅ Complete | Jan 31, 2026 |
| 7 | Keyboard navigation tests | ✅ Complete | Jan 31, 2026 |
| 8 | Screen reader verification | 🔲 Manual Testing Required | - |
| 9 | Memory leak analysis | ✅ Complete | Jan 31, 2026 |
| 10 | Offline mode UX | 🔲 Not Started | - |
| 11 | Version sync guardrails | ✅ Complete | Jan 31, 2026 |
| 12 | Security: validateSenderOrigin fix | ✅ Complete | Jan 31, 2026 |
| 13 | Error recovery documentation | ✅ Complete | Jan 31, 2026 |
| 14 | Coinbase Wallet support | ✅ Complete | Jan 31, 2026 |

### ✅ Completed P0 Items (Jan 31, 2026)

#### Production Module Tests
- Created `tests/sw-keepalive-production.test.ts` (20 tests)
  - Coverage: 0% → **81.48%** 
  - Tests: keep-alive alarm, port management, operation tracking, error handling
- Created `tests/popup-controller-production.test.ts` (24 tests)
  - Coverage: 59% → **81.86%**
  - Tests: session management, event handlers, storage changes, error scenarios
- Created `tests/entry-points-production.test.ts` (22 tests)
  - Tests adapter exports and controller interfaces
  - ChromeStorageAdapter: 82.5%, ChromeRuntimeAdapter: 93.75%, ChromeTabsAdapter: 100%, DOMAdapter: 95.65%

#### Overall Coverage Improvement
- **Tests:** 1,370 → **1,471** (+101 tests)
- **Statement Coverage:** ~71% → **76.44%** (+5.44%)
- **Branch Coverage:** ~63% → **67.01%** (+4.01%)
- **Function Coverage:** ~69% → **73%** (+4%)

---

### ✅ Completed P1/P2 Items (Jan 31, 2026)

#### P1 Completed
- Created `tests/background-controller-production.test.ts` (35 tests)
  - Coverage: 68% → **90.5%** statements, **78.4%** branches
  - Tests: message handling, origin validation (SECURITY FIX), tab notification, lifecycle events
- Created `tests/accessibility.test.ts` (27 Playwright tests)
  - WCAG 2.1 AA compliance with axe-core
  - Keyboard navigation, screen reader compatibility
- Fixed CSS color contrast issues in popup.css

#### P2 Completed  
- **SECURITY FIX**: `validateSenderOrigin()` - Fixed `startsWith` vulnerability
  - Now uses exact origin matching with wildcard support
  - Prevents domain suffix attacks (e.g., `cryptotradingjournal.xyz.evil.com`)
- Created `docs/ERROR_RECOVERY.md` - Comprehensive error recovery documentation
- Created `docs/COINBASE_WALLET_TESTING.md` - Test plan for Coinbase Wallet
- Created `docs/MEMORY_LEAK_ANALYSIS.md` - Profiling guide and leak prevention
- Added Coinbase Wallet detection to `injected-auth.ts`
- Verified `setUninstallURL` already implemented

---

### Remaining Work (Prioritized) - Updated January 31, 2026

| Priority | Task | Impact | Effort | Status |
|----------|------|--------|--------|--------|
| 🔴 P0 | Increase `ContentController` branch coverage (30% → 60%) | +3% branch coverage | 6h | 🔲 Not Started |
| 🟡 P1 | Manual screen reader verification (NVDA/VoiceOver) | Accessibility QA | 2h | 🔲 Not Started |
| 🟡 P1 | Offline mode UX | Graceful degradation | 3h | 🔲 Not Started |
| ✅ Done | Add tests for entry points (0% → 70%) | +2.9% overall coverage | 3h | ✅ Complete |
| ✅ Done | Add sw-keepalive.ts tests (0% → 81%) | Service worker stability | 2h | ✅ Complete |
| ✅ Done | Add PopupController.ts tests (59% → 82%) | UI code coverage | 3h | ✅ Complete |
| ✅ Done | Add BackgroundController tests (68% → 90%) | Message handling coverage | 3h | ✅ Complete |
| ✅ Done | Axe accessibility audit (27 tests) | WCAG compliance | 4h | ✅ Complete |
| ✅ Done | Error recovery documentation | Operational readiness | 2h | ✅ Complete |
| ✅ Done | Coinbase Wallet support | Expand user base | 2h | ✅ Complete |
| ✅ Done | Memory leak analysis docs | Production stability | 2h | ✅ Complete |
| ✅ Done | Version sync guardrails | Version consistency | 1h | ✅ Complete |

### Files at 0% Coverage (Require Attention)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `injected-auth.ts` | 51-494 | Injected script | Complex wallet interaction |
| `sw-state.ts` | 36-199 | Background | Service worker state management |
| `ui/auth/AuthView.ts` (low) | 12-333 | View | DOM manipulation for auth page |

### Significantly Improved Coverage (Jan 31, 2026)

| File | Before | After | Tests Added |
|------|--------|-------|-------------|
| `sw-keepalive.ts` | 0% | **81.48%** | 20 |
| `PopupController.ts` | 59% | **81.86%** | 24 |
| `ChromeStorageAdapter.ts` | - | **82.5%** | 7 |
| `ChromeRuntimeAdapter.ts` | - | **93.75%** | 4 |
| `ChromeTabsAdapter.ts` | - | **100%** | 3 |
| `DOMAdapter.ts` | - | **95.65%** | 4 |

### Deprecated Files (DELETED — Cleanup Complete)

All legacy files have been removed from the codebase:
- `content.ts` — deleted, use `entry/content-entry.ts`
- `background.ts` — deleted, use `entry/background-entry.ts`
- `popup.ts` — deleted, use `entry/popup-entry.ts`
- `auth.ts` — deleted, use `entry/auth-entry.ts`
- `background-main.ts` — deleted, merged into BackgroundController
- `auth-state-machine.ts` — deleted, use `core/auth/AuthStateMachine`

### Architecture Principles

1. **Dependency Injection** - All controllers receive adapters via constructor
2. **Pure Logic** - Core modules (`core/`) have no side effects
3. **Thin Entry Points** - `entry/` files only wire dependencies
4. **Mockable Adapters** - Chrome APIs wrapped for testing
