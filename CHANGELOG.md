# Changelog

All notable changes to the Crypto Trading Journal Web3 Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
