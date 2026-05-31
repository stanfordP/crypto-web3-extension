# CTJ Web3 Extension

A Manifest V3 Chrome browser extension providing secure Web3 wallet authentication for CTJ (Crypto Trading Journal).

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Coverage](https://img.shields.io/badge/Coverage-75.16%25-yellow.svg)]()
[![Version](https://img.shields.io/badge/Version-2.2.9-blue.svg)]()
[![Tests](https://img.shields.io/badge/Tests-1651-brightgreen.svg)]()
[![Status](https://img.shields.io/badge/Status-Published%20on%20CWS-green.svg)]()

## Overview

**Important:** This extension is an **authentication bridge**, NOT a standalone wallet. It connects your existing wallet (MetaMask, Brave Wallet, etc.) to Crypto Trading Journal for passwordless Web3 authentication.

### For Chrome Web Store Reviewers
The extension popup now displays helpful status indicators showing:
- ✅ Extension Active status
- Wallet detection (guides to MetaMask if not installed)
- Domain validation (shows if on correct site)
- Direct links to required resources

**Test Instructions:** See [TEST_INSTRUCTIONS_500_CHAR.txt](TEST_INSTRUCTIONS_500_CHAR.txt) for concise testing guide with pre-configured test wallet (under 500 characters).

### Prerequisites
- A wallet extension already installed (MetaMask, Brave Wallet, Rabby, etc.)
- Access to Crypto Trading Journal (https://cryptotradingjournal.xyz)

## Features

- 🔐 **SIWE Authentication** - Sign-In With Ethereum (EIP-4361)
- 🛡️ **Anti-Phishing Protection** - Only verified origins can trigger auth
- 🔗 **Wallet Bridge** - Connects MetaMask, Rabby, Brave Wallet, Phantom to your app
- 🔒 **Security Extension Compatible** - Works with Pocket Universe, Wallet Guard
- ⚡ **Service Worker Keep-Alive** - Handles MV3 inactivity timeout
- 🌐 **Multi-Network** - Ethereum, Polygon, Arbitrum, Optimism, Base, BNB
- 🔄 **Rate Limiting** - Token bucket algorithm prevents message spam

**Note:** This extension does NOT provide wallet functionality. You must have MetaMask or another EIP-1193 compatible wallet extension already installed.

## Wallet Compatibility

| Wallet | Status | Notes |
|--------|--------|-------|
| MetaMask | ✅ Tested | Primary development wallet |
| Rabby | ✅ Tested | Full compatibility |
| Brave Wallet | ✅ Tested | Built-in browser wallet |
| Phantom | ✅ Tested | EVM mode only |
| Coinbase Wallet | ⚠️ Untested | Needs verification |
| Hardware (Ledger/Trezor) | ⚠️ Via MetaMask | Tested via MetaMask bridge |

## Quick Start

### Prerequisites

- Node.js 20.x or higher
- Chrome/Brave browser
- MetaMask, Rabby, or other Web3 wallet

### Installationbash
# Clone the repository
git clone https://github.com/stanfordP/crypto-web3-extension.git
cd crypto-web3-extension

# Install dependencies
npm install

# Build for development
npm run build:dev
```

### Load in Browser

1. Open Chrome/Brave and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. Extension icon appears in toolbar

## Architecture

### How It Works

```
Main App                    Extension                     Wallet
────────                    ─────────                     ──────
    │                           │                            │
    │  1. Click "Connect"       │                            │
    │──────────────────────────►│                            │
    │                           │                            │
    │                           │  2. eth_requestAccounts    │
    │                           │───────────────────────────►│
    │                           │                            │
    │                           │  3. User approves          │
    │                           │◄───────────────────────────│
    │                           │                            │
    │                           │  4. Get SIWE challenge (API)
    │                           │                            │
    │                           │  5. personal_sign          │
    │                           │───────────────────────────►│
    │                           │                            │
    │                           │  6. User signs message     │
    │                           │◄───────────────────────────│
    │                           │                            │
    │                           │  7. Verify signature (API) │
    │                           │                            │
    │  8. Session established   │                            │
    │◄──────────────────────────│                            │
```

### Key Components (v2.2.1 Architecture)

| Component | Entry Point | Controller | Purpose |
|-----------|-------------|------------|---------||
| Content Script | `entry/content-entry.ts` | `ui/content/ContentController.ts` | Message routing, wallet script injection |
| Injected Script | `injected-auth.ts` | - | Direct wallet access (`window.ethereum`) |
| Background | `entry/background-entry.ts` | `ui/background/BackgroundController.ts` | Session management, keep-alive |
| Popup | `entry/popup-entry.ts` | `ui/popup/PopupController.ts` | Status display, disconnect |
| Auth Page | `entry/auth-entry.ts` | `ui/auth/AuthController.ts` | Wallet detection, SIWE flow |

> **Note:** Legacy files (`content.ts`, `background.ts`, `popup.ts`, `auth.ts`) are deprecated and will be removed in v3.0.0.

## Development

```bash
# Watch mode
npm run dev

# Production build
npm run build

# Type check
npm run type-check

# Lint
npm run lint

# Test
npm run test:unit
npm run test:coverage
```

## API Integration

The extension communicates with the main app's API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/siwe/challenge` | POST | Get SIWE message |
| `/api/auth/siwe/verify` | POST | Verify signature |
| `/api/auth/disconnect` | POST | End session |

## Message Protocol

### Main App → Extension

```javascript
// Detect extension
window.postMessage({ type: 'CJ_CHECK_EXTENSION' }, '*')

// Connect wallet
window.postMessage({ type: 'CJ_OPEN_AUTH' }, '*')

// Get session
window.postMessage({ type: 'CJ_GET_SESSION' }, '*')

// Disconnect
window.postMessage({ type: 'CJ_DISCONNECT' }, '*')
```

### Extension → Main App

```javascript
// Extension present
{ type: 'CJ_EXTENSION_PRESENT' }

// Auth result
{ type: 'CJ_AUTH_OPENED', success: true/false, error?: string }

// Session state
{ type: 'CJ_SESSION_STATE', session: { address, chainId } | null }

// Session changed
{ type: 'CJ_SESSION_CHANGED', session: { address, chainId } | null }
```

## Security

### Anti-Phishing

- ✅ Content script only runs on allowed origins
- ✅ Origin validation before processing messages
- ✅ SIWE message shows domain (user verification in wallet)

### Allowed Origins

```json
[
  "http://localhost:3000/*",
  "http://localhost:3001/*",
  "https://cryptotradingjournal.xyz/*",
  "https://www.cryptotradingjournal.xyz/*",
  "https://*.cryptotradingjournal.xyz/*"
]
```

## Wallet Compatibility

| Wallet | Status | Notes |
|--------|--------|-------|
| MetaMask | ✅ Works | Full support |
| Rabby | ✅ Works | Full support |
| Brave Wallet | ✅ Works | Full support |
| Phantom | ✅ Works | EVM mode |
| Coinbase Wallet | 🔄 Untested | Should work |

## Security Extensions

The extension works seamlessly with security tools. For detailed compatibility information, see [Security Extensions Guide](docs/SECURITY_EXTENSIONS.md).

| Extension | Status | Behavior |
|-----------|--------|----------|
| Pocket Universe | ✅ Compatible | Transaction simulation |
| Wallet Guard | ✅ Compatible | Phishing protection |
| Fire | ✅ Compatible | Gas estimation |
| Blowfish | ✅ Compatible | Transaction preview |

These extensions will intercept and display our SIWE signature request, showing it's a safe "sign-in" signature.

## Testing

### Unit Tests

```bash
# Run unit tests
npm run test:unit

# Run with coverage
npm run test:coverage
```

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e:all

# Run auth flow tests only
npm run test:e2e

# Run security extension compatibility tests
npm run test:e2e:security
```

### Test Coverage

**Current Status:** 1651 tests passing (59 suites), 75.16% statement coverage from the last coverage audit

| Component | Coverage | Notes |
|-----------|----------|-------|
| ChromeAlarmsAdapter | 100% ✅ | Fully tested |
| ChromeTabsAdapter | 100% ✅ | Fully tested |
| api.ts | 95% ✅ | Fully tested |
| DOMAdapter | 96% ✅ | Fully tested |
| SessionManager | 92% ✅ | Fully tested |
| ChromeRuntimeAdapter | 91% ✅ | Fully tested |
| SiweFlow | 86% ✅ | Fully tested |
| InjectionService | 85% ✅ | Fully tested |
| Container | 85% ✅ | DI container |
| MessageRouter | 83% ✅ | Message routing |
| AuthStateMachine | 82% ✅ | State machine |
| AuthController | 78% ✅ | Auth logic |
| PopupView | 82% ✅ | UI layer |
| ContentController | 94.77% lines ✅ | Branch coverage improved to 79.65% |
| AuthView | Covered ✅ | `tests/AuthView.test.ts` exercises the DOM view layer |
| Entry points | Covered ✅ | Production entry-point wiring tests exist |

### Test Areas

| Area | Tests | Status |
|------|-------|--------|
| Extension Loading | 3 | ✅ |
| Wallet Connection | 2 | ✅ |
| SIWE Signing | 2 | ✅ |
| Session Management | 27 | ✅ |
| Rate Limiting | 21 | ✅ |
| Service Worker | 30 | ✅ |
| Full Auth Flow | 1 | ✅ |
| Security Extension Compat | 8 | ✅ |

## Extension Scope

### What This Extension Does ✅

| Feature | Purpose |
|---------|---------|
| **Wallet Bridge** | Connects existing wallet extensions (MetaMask, etc.) to the app |
| **SIWE Authentication** | Facilitates Sign-In With Ethereum signature flow |
| **Session Management** | Persist auth state in `chrome.storage.local` |
| **Cross-Tab Sync** | Broadcast session changes to all tabs |
| **Wallet Events** | Handle account/chain changes from connected wallet |

### What This Extension Does NOT Do ❌

| Not Our Job | Why |
|-------------|-----|
| Provide wallet functionality | Users must install MetaMask or similar separately |
| Store private keys | Security—keys stay in user's wallet extension |
| Send/receive crypto | Not a wallet—authentication only |
| Account mode (Live/Demo) | Main app's business logic |
| Trade data | Main app's React Query |
| UI components | Main app's React |

**This extension is a wallet authentication bridge, not a wallet itself.**

## Troubleshooting

### Wallet Not Detected

**Symptom**: "No wallet detected" error

**Solutions**:
1. Ensure MetaMask/Rabby is installed and unlocked
2. Refresh the page and try again
3. Check if wallet is enabled for the site

### "Cannot redefine property: ethereum"

**Cause**: Multiple wallet extensions conflict

**Note**: This is NOT our bug - it's caused by Phantom/MetaMask conflict. Does not affect functionality.

### Service Worker Inactive

**Symptom**: Slow response or timeout

**Solution**: Extension has automatic retry. Wait a moment and try again.

## Project Structure

```
crypto-web3-extension/
├── src/
│   ├── scripts/
│   │   ├── entry/            # Entry points (v2.2.0+)
│   │   │   ├── background-entry.ts
│   │   │   ├── content-entry.ts
│   │   │   ├── popup-entry.ts
│   │   │   └── auth-entry.ts
│   │   ├── ui/               # Controllers & Views
│   │   ├── core/             # Pure business logic
│   │   ├── adapters/         # Chrome API wrappers
│   │   ├── services/         # Shared services
│   │   ├── injected-auth.ts  # Wallet interactions
│   │   └── config.ts         # Configuration
│   ├── styles/
│   └── icons/
├── dist/                     # Built extension
├── manifest.json
└── package.json
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## V2.2 Architecture (IMPLEMENTED)

V2.2 introduced a **testable architecture** with dependency injection and separated concerns. This is now the **active production code**.

### Architecture Overview

```
src/scripts/
├── entry/          # Thin entry points (wire dependencies)
├── core/           # Pure logic (100% testable)
│   ├── session/    # SessionManager
│   ├── auth/       # AuthStateMachine, SiweFlow
│   ├── messaging/  # MessageRouter
│   └── storage/    # StorageService
├── adapters/       # Browser API wrappers (mockable)
├── ui/             # Controllers + Views
│   ├── background/ # BackgroundController
│   ├── content/    # ContentController
│   ├── popup/      # PopupController + PopupView
│   └── auth/       # AuthController + AuthView
└── services/       # Shared services (InjectionService)
```

### Implementation Status

| Phase | Status | Coverage |
|-------|--------|----------|
| Phase 0: E2E baseline | ✅ Complete | - |
| Phase 1: Foundation | ✅ Complete | 30% |
| Phase 2: Core logic | ✅ Complete | 44% |
| Phase 3: Controllers | ✅ Complete | 44% |
| Phase 4: UI separation | ✅ Complete enough for current release | 75.16% last coverage audit (Target: 80%+) |

### Remaining Coverage Follow-ups

| Component | Coverage | Gap |
|-----------|----------|-----|
| AuthView.ts | Covered | Keep improving branch coverage opportunistically |
| Entry points | Covered | Keep in sync when adding new entry dependencies |
| ContentController branches | 79.65% | Maintain edge-case coverage for message routing |

### Key Benefits
- **1651 unit tests** (up from 532)
- **75.16% statement coverage** from last coverage audit (up from 23%)
- **Fully mockable** Chrome APIs via adapters
- **Testable controllers** with injected dependencies
- **Rate limiting** implemented (token bucket algorithm)

See [claude.md](claude.md) for detailed architecture documentation.

## Related

- [Crypto Trading Journal (Main App)](https://github.com/stanfordP/crypto-futures-jn)
- [SIWE Specification (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361)
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
