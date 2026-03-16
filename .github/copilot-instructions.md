# CTJ Web3 Extension - Copilot Instructions

> **STATUS: PAUSED / ARCHIVED (February 28, 2026)**
>
> This repository is **paused** under the CTJ architecture pivot to a personal autonomous trading system. The extension served as an authentication bridge for a multi-user SaaS product. Under the single-user pivot, it is no longer needed. No active development.
>
> See `crypto-futures-jn/CLAUDE.md` v5.0 for the autonomous trading architecture.

A Manifest V3 Chrome browser extension providing secure Web3 authentication bridging for Crypto Trading Journal (CTJ). This is an **authentication bridge**, NOT a standalone wallet - it connects existing wallets (MetaMask, Brave Wallet, etc.) to CTJ for passwordless SIWE (Sign-In With Ethereum) authentication.

> **Full Documentation:** See `claude.md` for comprehensive architecture and implementation status.
> **Main App Integration:** See `../crypto-futures-jn/CLAUDE.md` for API endpoints and message protocol.
> **PRD:** See `../crypto-futures-jn/docs/CTJ_PRD.md` for CI/CD and testing requirements.

## Technology Stack

- **TypeScript 5.4+** - Strict mode enabled, all code must be strongly typed
- **Webpack 5** - Module bundling and build system
- **Chrome Extension APIs** - Manifest V3 (service workers, not background pages)
- **Web3 Libraries:**
  - `viem` - Ethereum interactions (preferred over ethers.js)
  - `zod` - Runtime type validation
- **Testing:**
  - **Jest** - Unit tests (1,542 tests across 55 suites)
  - **Playwright** - E2E tests with accessibility checks (axe-core)
- **Build Tools:** webpack, ts-loader, copy-webpack-plugin

## Critical Context

**Chrome Web Store Status:** Rejected (Violation ID: Red Potassium)
**Root Cause:** Reviewers expected standalone wallet functionality
**Solution:** Position as "Authentication Bridge" — NEVER use "Wallet" as primary descriptor
**Terminology:** Use "Authentication Bridge", "Wallet Bridge", or "Web3 Auth" - NEVER imply balance/send/receive features

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run build:dev` | Dev build -> `dist/` |
| `npm run dev` | Watch mode (auto-rebuild) |
| `npm run test:unit` | Jest unit tests (1,542 tests) |
| `npm run test:coverage` | Coverage report |
| `npm run type-check` | TypeScript validation |
| `npm run release:full` | Validate + test + build + package |

## Architecture (Injected Script Pattern)

```
Content Script -> injects -> Injected Script -> window.ethereum -> Wallet
      |
Background Service Worker (session storage, keep-alive)
```

**Why this pattern?** Content scripts cannot access `window.ethereum` directly - only injected scripts running in page context can.

## Project Structure

```
src/scripts/
  entry/           # Webpack entry points (USE THESE, not root files)
  core/            # Business logic (no Chrome APIs, testable)
    Container.ts   # DI container + mock factories
    messaging/     # MessageRouter
    session/       # SessionManager
    storage/       # StorageService
  adapters/        # Chrome API wrappers (mockable)
    ChromeStorageAdapter, ChromeRuntimeAdapter, ChromeTabsAdapter,
    ChromeAlarmsAdapter, DOMAdapter
  ui/              # Controllers + Views
    background/    # BackgroundController
    content/       # ContentController
    popup/         # PopupController + PopupView
    auth/          # AuthController + AuthView
  services/        # InjectionService, AuthApiClient
```

**All legacy root-level scripts (`popup.ts`, `auth.ts`, `content.ts`, `background.ts`) have been deleted.** Only `entry/` files are active.

## Key Patterns

### Testability: Core vs Adapters
- **`core/`**: Pure business logic, no Chrome APIs -> easy to unit test
- **`adapters/`**: Wrap Chrome APIs -> mock in tests
- **`ui/controllers/`**: Coordinate adapters + core -> integration tests

### Message Types
```typescript
// App -> Extension (v1.1 Legacy)
'CJ_OPEN_AUTH' | 'CJ_DISCONNECT' | 'CJ_GET_SESSION' | 'CJ_CHECK_EXTENSION'

// App -> Extension (v2.0 App-Driven)
'CJ_WALLET_CONNECT' | 'CJ_WALLET_SIGN' | 'CJ_STORE_SESSION' | 'CJ_CLEAR_SESSION'

// Extension -> App
'CJ_SESSION_STATE' | 'CJ_SESSION_CHANGED' | 'CJ_EXTENSION_INFO' | 'CJ_WALLET_RESULT' | 'CJ_SIGN_RESULT'
```

## Coding Standards

### TypeScript Rules (tsconfig.json)
- **Strict mode enabled** - all code must be strongly typed
- **No `any` type** - use proper types or `unknown` with type guards
- **Unused parameters** - prefix with underscore (`_param`) if required by interface
- **Path aliases** - use `@/` for `src/` imports (configured in tsconfig)

### Architecture Principles
- **Core** (`src/scripts/core/`): Pure business logic, NO Chrome APIs, 100% testable
- **Adapters** (`src/scripts/adapters/`): Wrap Chrome APIs, mockable in tests
- **Controllers** (`src/scripts/ui/`): Coordinate adapters + core, integration tests
- **Entry Points** (`src/scripts/entry/`): Webpack entry points - USE THESE, not root files

## Testing Strategy (PRD-Aligned)

**Testing Pyramid:** 60% Unit / 30% Integration / 10% E2E

### Coverage Targets
- **Overall:** 80%+ statement coverage (currently 75.16%)
- **Adapters:** 90%+ (most are already there)
- **Core logic:** 85%+ (SessionManager, AuthStateMachine)
- **Controllers:** 80%+ (PopupController at 81.86%, Background at 90.5%)

### Test Writing Guidelines
1. **Core logic** - Pure unit tests, no mocks needed
2. **Adapters** - Mock Chrome APIs (use `chrome.*` mocks)
3. **Controllers** - Integration tests with mocked adapters
4. **Always test error paths** - User rejection, timeouts, network failures
5. **Import production modules** - NEVER create mirrored "Test*" classes

## Common Pitfalls

1. **Don't use Chrome APIs in `core/`** - breaks testability (inject via adapters)
2. **MV3 service worker timeout** - use keep-alive pattern in `sw-keepalive.ts`
3. **Rebuild required** - run `npm run build:dev` then reload in `chrome://extensions`
4. **Never call it "a wallet"** - always "authentication bridge" or "wallet bridge"
5. **Type safety** - prefer `viem` over `ethers.js` for better TypeScript support
6. **Message validation** - always validate messages with `zod` schemas before processing
7. **Origin validation** - Only process messages from allowed domains (`cryptotradingjournal.xyz`)

## Security Considerations

### Critical Security Rules
1. **Never log sensitive data** - No private keys, signatures, or session tokens in console
2. **Validate all messages** - Use `zod` schemas to validate messages from untrusted sources
3. **Origin validation** - Only process messages from allowed domains
4. **Content Security Policy** - Extension follows strict CSP (no inline scripts, no eval)
5. **Permissions** - Only request minimum necessary permissions (storage, alarms, scripting)

## Git Workflow

**Conventional commits required:** `type(scope?): description`
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`
- Example: `fix(content): resolve origin validation bypass`

## CI/CD (from PRD - not yet implemented)

The PRD requires a GitHub Actions pipeline with path-based filtering:
- Extension CI only runs when `crypto-web3-extension/**` files change
- Pipeline: `type-check` -> `lint` -> `test:unit --coverage`

## Chrome Web Store Resubmission Requirements

### P0 - Must Fix Before Resubmission
- Main app (cryptotradingjournal.xyz) must be accessible 24/7
- Test instructions must specify exact URL (e.g., `/login` not "visit site")
- "REQUIRES MetaMask extension" must be FIRST LINE of test instructions
- Permission justifications filled in CWS submission form
- Version numbers aligned: manifest.json = package.json = store listing

## UI & Theme

> **Full documentation:** See `docs/THEME_DESIGN_SYSTEM.md`

The extension uses the **Deep Oceanic** theme (shared with main app):
- Background: `--cj-ocean-deepest` (#0a1628)
- Primary accent: `--cj-teal-glow` (#14b8a6)
- Text: `--cj-text-primary` (#f1f5f9)
- Use **inline SVGs** (not emojis) for cross-platform consistency
