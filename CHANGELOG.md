# Changelog

All notable changes to the Crypto Trading Journal Web3 Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.5] - 2026-02-01 (UX Audit Implementation - Complete)

### Added
- **Header help icon** (inline SVG) linking to reviewer.html for instant context
- **Horizontal header layout** with Logo → Title/Subtitle → Help icon
- **Status icon for disconnected state** (SVG link icon with pulsing warning effect)
- **Status icon for connected state** (SVG checkmark with success glow effect)
- **State-adaptive CTA button** that changes based on context:
  - "Get MetaMask" → when wallet not detected (opens metamask.io)
  - "Open CTJ App" → when wallet detected but not on site (opens CTJ login)
  - "Connect on Page" → when on supported domain (closes popup)
- New CSS styles: `.header-row`, `.help-icon`, `.status-icon`, `.status-icon.disconnected`, `.status-icon.connected`, `.icon-svg`, `.icon-svg-large`
- New method: `updateConnectButtonState()` in PopupController

### Added - Documentation
- **Theme Design System** (`docs/THEME_DESIGN_SYSTEM.md`) — comprehensive documentation for the Deep Oceanic theme:
  - Full color palette with CSS variable mappings
  - WCAG 2.1 accessibility analysis with contrast ratios
  - Identified accessibility gaps (muted text at 3.8:1 ratio)
  - Recommended non-breaking palette tweaks for improved readability
  - Hardware rendering considerations (OLED/LCD optimization)
  - Color psychology mapping for trading UI
  - Animation guidelines
- **UI & Theme section** added to `claude.md` with quick reference table

### Changed
- **Subtitle text:** "Web3 Authentication" → "Web3 Auth Bridge" (clearer positioning)
- **Info-box framing:** Now includes BOTH positive framing AND explicit disclaimer
  - "🔐 Authentication Bridge" (positive)
  - "⚠️ This is NOT a wallet" (explicit for reviewers)
- **Header logo size:** Reduced from 48px to 40px for compact layout
- **Page title:** Updated to "Crypto Trading Journal - Web3 Auth Bridge"
- **Connected state:** Replaced logo+status-dot with unified SVG checkmark icon
- **All emoji icons replaced with inline SVG** for cross-platform rendering consistency:
  - 🔗 → SVG link icon (Feather icons style)
  - ✅ → SVG checkmark icon
  - ℹ️ → SVG info icon

### UX Audit Findings Addressed (All Items)
- ✅ U1: Removed double logo in notConnected state
- ✅ U2: Added header help icon for reviewers
- ✅ U3: Updated subtitle to "Web3 Auth Bridge"
- ✅ U4: Positive framing in info-box
- ✅ U5: Horizontal header layout
- ✅ U6: State-adaptive CTA button
- ✅ U7: Removed double logo in connected state
- ✅ U8: Re-added explicit "NOT a wallet" disclaimer
- ✅ U9: SVG icons for cross-platform consistency
- ✅ U10: Page title consistency

### Accessibility Analysis (New in Theme Documentation)
| Element | Current | WCAG AA | Status |
|---------|---------|---------|--------|
| Primary text | 12.8:1 | 4.5:1 | ✅ AAA |
| Secondary text | 7.2:1 | 4.5:1 | ✅ AAA |
| Muted text | 4.7:1 | 4.5:1 | ✅ AA |

### Accessibility Palette Tweaks (Implemented)
Applied non-breaking accessibility improvements to CSS variables:
| Variable | Before | After | Contrast Improvement |
|----------|--------|-------|---------------------|
| `--text-secondary` | `#94a3b8` | `#a1b5c8` | 6.1:1 → 7.2:1 (WCAG AAA) |
| `--text-muted` | `#64748b` | `#78909c` | 3.8:1 → 4.7:1 (WCAG AA) |
| `--border` | `rgba(..., 0.15)` | `rgba(..., 0.20)` | Improved visibility |

Files updated with accessibility tweaks:
- `src/styles/popup.css`
- `src/styles/auth.css`
- `docs/install.html`

### Remaining Low Priority (Kept As-Is)
- U11: Redundant "How it works" in header + footer (helps reviewers find info)
- U12: Cold-open edge cases on chrome:// pages (rare scenario)

### Technical Details
- Files modified: `src/popup.html`, `src/styles/popup.css`, `src/scripts/ui/popup/PopupController.ts`
- Files added: `docs/THEME_DESIGN_SYSTEM.md`
- No new permissions required
- All 1,529 unit tests pass
- TypeScript check passes
- Build successful

---

## [2.2.4] - 2026-01-31 (Version Bump)

### Changed
- Version alignment for resubmission preparation
- Documentation updates

---

## [2.2.3] - 2026-01-30 (Chrome Web Store Resubmission - Enhanced)

### Added
- **Status indicators in popup** for Chrome Web Store reviewers
  - Extension active status (always shows ✅)
  - Wallet detection indicator (guides to MetaMask installation)
  - Domain validation indicator (shows if on correct site)
  - Helpful links to MetaMask and cryptotradingjournal.xyz
- **500-character test instructions** with pre-configured test wallet
  - Uses standard BIP-39 test mnemonic (abandon...about)
  - No real funds required for testing
  - Step-by-step guide within character limit
- TEST_INSTRUCTIONS_500_CHAR.txt file for easy copy-paste

### Changed
- Popup now shows meaningful status even when not connected
- Enhanced user experience for reviewers who don't have wallet installed
- Updated STORE_LISTING.md with concise test instructions section

### Fixed
- Addresses Chrome Web Store reviewer friction (500-char limit constraint)
- Makes extension self-documenting for reviewers
- Reduces barrier to testing functionality

### Technical Details
- Added updateStatusIndicators() method to PopupController
- Enhanced popup.html with status-checks section
- Added CSS styling for status indicators
- Popup detects current tab domain and shows appropriate guidance

---

## [2.2.2] - 2026-01-30 (Chrome Web Store Resubmission)

### Changed
- **CRITICAL:** Clarified extension positioning as "authentication bridge" not standalone wallet
- Updated store listing description to explicitly state prerequisites (requires existing wallet)
- Revised manifest description to clarify functionality
- Updated short description to emphasize bridge functionality
- Added clear "What this does / does not do" sections to store listing

### Added
- CHROME_REVIEWER_INSTRUCTIONS.md with detailed testing guide for Chrome Web Store reviewers
- Prerequisites section in store listing (must have MetaMask or similar wallet installed)
- Explicit disclaimer that extension is NOT a wallet

### Fixed
- Chrome Web Store rejection issue (Violation ID: Red Potassium)
- Misleading terminology that implied standalone wallet functionality
- Reviewer confusion about "Wallet" functionality

### Notes
This release addresses the Chrome Web Store rejection where reviewers couldn't reproduce "Wallet" functionality. The extension is an authentication bridge that requires a separate wallet extension (MetaMask, Brave Wallet, etc.) to function—it does not provide wallet functionality itself.

---

## [2.2.1] - 2026-01-04 (Rejected by Chrome Web Store)

### Added
- Comprehensive test coverage documentation with targets
- Wallet compatibility matrix (MetaMask, Rabby, Brave, Phantom tested)
- Security extension compatibility documentation (Pocket Universe, Wallet Guard)
- Rate limiting documentation (token bucket algorithm)
- Error recovery flow documentation
- Operational considerations section (logging, updates, sessions)

### Changed
- Updated README with v2.2.1 architecture references
- Updated Key Components table to reference entry points and controllers
- Clarified deprecated file migration paths
- Added coverage gap priorities (P0: AuthView, Entry points; P1: ContentController)

### Documentation
- Added coverage targets: Statements 70%+, Branches 60%+
- Prioritized remaining work with effort estimates
- Added security enhancement recommendations
- Updated STORE_LISTING.md with v2.2.1 release notes

### Known Issues (To Address Post-Approval)
- AuthView.ts: 0% test coverage (P0)
- Entry points: 0% test coverage (P0)
- ContentController branch coverage: 30.46% (P1)
- Coinbase Wallet: Untested (P2)

---

## [2.2.0] - 2026-01-03

### Added

#### Dependency Injection Architecture (Complete Refactoring)

**Phase 1: DI Foundation**
- **Adapter Interfaces** (`adapters/types.ts`)
  - `IStorageAdapter` - Chrome storage abstraction (local, session, sync)
  - `IRuntimeAdapter` - Message passing and runtime APIs
  - `ITabsAdapter` - Tab management abstraction
  - `IDOMAdapter` - DOM manipulation abstraction
  - `IAlarmsAdapter` - Chrome alarms abstraction
- **Production Adapters** (`adapters/`)
  - `ChromeStorageAdapter` - Real chrome.storage implementation
  - `ChromeRuntimeAdapter` - Real chrome.runtime implementation
  - `ChromeTabsAdapter` - Real chrome.tabs implementation
  - `ChromeAlarmsAdapter` - Real chrome.alarms implementation
  - `BrowserDOMAdapter` - Real DOM implementation
- **DI Container** (`core/Container.ts`)
  - `getContainer()` - Production adapter factory
  - `createMockStorageAdapter()` - Testing mock
  - `createMockRuntimeAdapter()` - Testing mock
  - `createMockDOMAdapter()` - Testing mock

**Phase 2: Controller Extractions**
- **PopupController** (`ui/popup/PopupController.ts`)
  - Session state management
  - Connection/disconnection flow
  - App navigation
  - Offline detection
- **PopupView** (`ui/popup/PopupView.ts`)
  - DOM manipulation only
  - No business logic
  - Event delegation to controller
- **ContentController** (`ui/content/ContentController.ts`)
  - CJ_* message routing
  - Service worker health checks
  - Rate limiting
  - Session synchronization
- **BackgroundController** (`ui/background/BackgroundController.ts`)
  - Session management
  - Origin validation
  - Auth tab management

**Phase 3: Auth Controller Extraction**
- **AuthController** (`ui/auth/AuthController.ts`)
  - Wallet detection (EIP-6963 + legacy)
  - SIWE authentication flow
  - Multi-step progress management
  - Session storage
- **AuthView** (`ui/auth/AuthView.ts`)
  - DOM manipulation only
  - Step progress UI
  - Error/success displays

**Phase 4: Webpack Integration**
- **New Entry Points** (`entry/`)
  - `background-entry.ts` → BackgroundController
  - `content-entry.ts` → ContentController
  - `popup-entry.ts` → PopupController + PopupView
  - `auth-entry.ts` → AuthController + AuthView
- **Legacy Deprecation**
  - Old entry points (`content.ts`, `popup.ts`, `auth.ts`, `background.ts`) marked deprecated
  - Will be removed in v3.0.0

**Phase 5: Services Layer**
- **InjectionService** (`services/InjectionService.ts`)
  - Wallet script injection
  - Message handler registration
  - Retry logic with exponential backoff
- **AuthApiClient** (`services/AuthApiClient.ts`)
  - SIWE challenge/verify API calls
  - Session validation

#### New Test Coverage (1015 Tests Total)
- `adapter-integration.test.ts` - 45 tests for adapter layer
- `popup-controller.test.ts` - 48 tests for popup logic
- `content-controller.test.ts` - 62 tests for content script
- `background-controller.test.ts` - 51 tests for background
- `auth-controller.test.ts` - 39 tests for auth flow
- `injection-service.test.ts` - 35 tests for wallet injection
- `mock-factories.test.ts` - 28 tests for test utilities
- `message-router.test.ts` - 32 tests for message routing
- `session-manager.test.ts` - 27 tests for session logic

### Changed

#### Test Statistics
- **Total Tests**: 1015 (up from 532)
- **Statement Coverage**: 45% (up from 23%)
- **Branch Coverage**: 37% (up from 16%)
- **Test Suites**: 39 (up from 21)

#### Architecture
- All business logic extracted to testable controllers
- Pure DOM manipulation in View classes
- Adapters enable 100% unit test coverage without browser
- Entry points are thin shells (<100 lines)

### Deprecated
- `content.ts` → Use `entry/content-entry.ts`
- `popup.ts` → Use `entry/popup-entry.ts`
- `auth.ts` → Use `entry/auth-entry.ts`
- `background.ts` → Use `entry/background-entry.ts`
- `background-main.ts` → Logic moved to BackgroundController

---

## [2.1.0] - 2026-01-02

### Added

#### Session Synchronization Fixes
- **API-based session verification** in `popup.ts`
  - New `tryVerifySessionFromAPI()` function checks main app's session cookie
  - Fallback when `chrome.storage.session` is cleared on browser restart
- **Content script session fallback** in `content.ts`
  - `handlePopupGetSession()` now queries `/api/auth/session` when storage is empty
  - Syncs extension state with main app's HTTP cookie session

#### New Test Coverage
- `session-sync.test.ts` - 27 tests for session synchronization
- `service-worker.test.ts` - 30 tests for SW lifecycle management
- `logger-config.test.ts` - 15 tests for logging system
- `rate-limiting.test.ts` - 21 tests for rate limiter and request tracker

### Changed

#### Test Statistics
- **Total Tests**: 532 (up from ~505)
- **Statement Coverage**: 23% (baseline for refactoring)
- **Files at 95%+ coverage**: api.ts, errors.ts, config.ts, siwe-utils.ts

---

## [1.1.0] - 2024-12-29

### Added

#### Extension-First Architecture
- **Full-page Auth UI** (`auth.html`, `auth.ts`)
  - Dedicated authentication page opens in new tab
  - Direct wallet connection to MetaMask/Brave Wallet
  - Step-by-step progress indicator (Connect → Challenge → Sign → Verify)
  - Account mode selection (Live Trading / Demo Mode)
  - Multi-network support display
  - Anti-phishing protection through origin validation

#### CJ_* Message Protocol
- New message types for main app ↔ extension communication:
  - `CJ_CHECK_EXTENSION` / `CJ_EXTENSION_PRESENT` - Extension detection
  - `CJ_OPEN_AUTH` / `CJ_AUTH_OPENED` - Trigger auth flow from main app
  - `CJ_GET_SESSION` / `CJ_SESSION_RESPONSE` - Session queries
  - `CJ_DISCONNECT` / `CJ_DISCONNECT_RESPONSE` - Logout handling
  - `CJ_SESSION_CHANGED` - Push session updates to main app

#### New Test Suites
- `types.test.ts` - 47 tests for type definitions and enums
- `content-handlers.test.ts` - 21 tests for CJ_* message handling
- `background-session.test.ts` - 18 tests for session management
- `auth-flow.test.ts` - 31 tests for authentication flow

### Changed

#### Architecture Migration
- **Popup** (`popup.ts`)
  - Simplified to status display and quick actions
  - Now opens auth page instead of handling wallet connection directly
  - Removed all relay logic (PORT_NAMES, sendMessageViaPort)

- **Background Service Worker** (`background-main.ts`)
  - Streamlined to session management only
  - Removed WalletHandler and AuthenticationHandler classes
  - Added auth tab management (prevents duplicate auth tabs)
  - Reduced bundle size from ~127 KB to ~19 KB

- **Content Script** (`content.ts`)
  - Removed provider injection (no more `window.ethereum` conflicts)
  - Removed wallet relay functionality
  - Now handles only CJ_* message protocol
  - Includes service worker health checks

#### Deprecated
- **Injected Wallet** (`injected-wallet.ts`)
  - Replaced with minimal deprecation stub (~1 KB)
  - No longer used in Extension-First architecture
  - Kept for backwards compatibility

### Improved

#### Security
- **Anti-phishing protection**: Only whitelisted origins can trigger auth
- **Origin validation**: Content script validates message sources
- **Reduced attack surface**: No provider injection means no XSS signature requests
- **Clear separation**: Extension context isolated from page context

#### Performance
- **Smaller bundles**:
  - `background.js`: 19 KB (was ~127 KB)
  - `auth.js`: 14 KB (new)
  - `content.js`: 7 KB (optimized)
  - `popup.js`: 7 KB (optimized)
- **Faster startup**: Simplified initialization
- **Less complexity**: Removed multi-hop relay architecture

#### Developer Experience
- **195 unit tests** with comprehensive coverage
- **Clean TypeScript**: All type errors resolved
- **ESLint clean**: No linting warnings
- **Updated documentation**: README.md, CLAUDE.md reflect new architecture

### Fixed
- Resolved `Cannot redefine ethereum` conflicts with MetaMask
- Fixed provider injection race conditions
- Eliminated service worker relay timeouts
- Resolved port disconnection issues during long operations

### Security Notes
- Session tokens stored in `chrome.storage.session` (cleared on browser close)
- Non-sensitive data in `chrome.storage.local` (persistent)
- SIWE messages signed directly by MetaMask in extension context
- No private keys ever leave the user's wallet

---

## [1.0.0] - 2024-12-15

### Added

#### Core Features
- Initial release of Web3 authentication extension
- SIWE (Sign-In With Ethereum) authentication flow
- Multi-network support (Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Avalanche)
- Manifest V3 compliance

#### Service Worker Keep-Alive System
- Chrome Alarms implementation (24-second heartbeat)
- Port-based communication for long operations
- Operation tracking and lifecycle management
- `withKeepAlive()` wrapper for async operations

#### Resumable Authentication
- State machine persists auth flow progress
- Automatic resumption after service worker restart
- Exponential backoff retry logic
- Error state handling and recovery

#### Infrastructure
- TypeScript with strict mode
- Webpack 5 bundling
- Jest unit testing
- Playwright E2E testing
- ESLint configuration

### Technical Details
- **Manifest Version**: 3
- **Permissions**: storage, activeTab, alarms
- **Supported Browsers**: Chrome, Brave, Edge, Opera (Chromium-based)

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2024-12-29 | Extension-First Architecture, CJ_* Protocol |
| 1.0.0 | 2024-12-15 | Initial release |

---

## Upgrade Guide

### From 1.0.0 to 1.1.0

No breaking changes for end users. The extension will automatically use the new architecture.

**For Main App Integration:**
1. Replace direct `window.ethereum` calls with CJ_* message protocol
2. Use `CJ_CHECK_EXTENSION` to detect extension presence
3. Use `CJ_OPEN_AUTH` to trigger authentication
4. Listen for `CJ_SESSION_CHANGED` for session updates

**Example:**
```typescript
// Check if extension is installed
window.postMessage({ type: 'CJ_CHECK_EXTENSION' }, '*');

// Listen for response
window.addEventListener('message', (event) => {
  if (event.data?.type === 'CJ_EXTENSION_PRESENT') {
    // Extension is installed, can trigger auth
    window.postMessage({ type: 'CJ_OPEN_AUTH' }, '*');
  }
});
```
