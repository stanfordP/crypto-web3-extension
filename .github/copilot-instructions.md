# CTJ Web3 Extension - Copilot Instructions

A Manifest V3 Chrome browser extension providing secure Web3 authentication bridging for Crypto Trading Journal (CTJ). This is an **authentication bridge**, NOT a standalone wallet - it connects existing wallets (MetaMask, Brave Wallet, etc.) to CTJ for passwordless SIWE (Sign-In With Ethereum) authentication.

> **Full Documentation:** See `claude.md` for comprehensive architecture and implementation status.
> **Main App Integration:** See `../crypto-futures-jn/CLAUDE.md` for API endpoints and message protocol.

## Technology Stack

- **TypeScript 5.4+** - Strict mode enabled, all code must be strongly typed
- **Webpack 5** - Module bundling and build system
- **Chrome Extension APIs** - Manifest V3 (service workers, not background pages)
- **Web3 Libraries:** 
  - `viem` - Ethereum interactions (preferred over ethers.js)
  - `zod` - Runtime type validation
- **Testing:**
  - **Jest** - Unit tests (1,542 tests across 55 suites)
  - **Playwright** - E2E tests with accessibility checks
- **Build Tools:** webpack, ts-loader, copy-webpack-plugin

## Critical Context

**Chrome Web Store Status:** Rejected (Violation ID: Red Potassium)  
**Root Cause:** Reviewers expected standalone wallet functionality  
**Solution:** Position as "Authentication Bridge" — NEVER use "Wallet" as primary descriptor  
**Terminology:** Use "Authentication Bridge", "Wallet Bridge", or "Web3 Auth" - NEVER imply balance/send/receive features

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run build:dev` | Dev build → `dist/` |
| `npm run dev` | Watch mode (auto-rebuild) |
| `npm run test:unit` | Jest unit tests (1,240 tests) |
| `npm run test:coverage` | Coverage report |
| `npm run type-check` | TypeScript validation |
| `npm run release:full` | Validate + test + build + package |

## Architecture (Injected Script Pattern)

```
Content Script → injects → Injected Script → window.ethereum → Wallet
      ↓                                              
Background Service Worker (session storage, keep-alive)
```

**Why this pattern?** Content scripts cannot access `window.ethereum` directly - only injected scripts running in page context can.

## Project Structure

```
src/scripts/
├── entry/           # Webpack entry points (USE THESE)
├── core/            # Business logic (no Chrome APIs, testable)
├── adapters/        # Chrome API wrappers (mockable)
├── ui/              # Controllers (coordinate adapters + core)
└── *.ts             # ⚠️ DEPRECATED - do not modify
```

## Key Patterns

### Testability: Core vs Adapters
- **`core/`**: Pure business logic, no Chrome APIs → easy to unit test
- **`adapters/`**: Wrap Chrome APIs → mock in tests
- **`ui/controllers/`**: Coordinate adapters + core → integration tests

### Message Types (from `claude.md`)
```typescript
// App → Extension (v1.1 Legacy)
'CJ_OPEN_AUTH' | 'CJ_DISCONNECT' | 'CJ_GET_SESSION' | 'CJ_CHECK_EXTENSION'

// App → Extension (v2.0 App-Driven)
'CJ_WALLET_CONNECT' | 'CJ_WALLET_SIGN' | 'CJ_STORE_SESSION' | 'CJ_CLEAR_SESSION'

// Extension → App
'CJ_SESSION_STATE' | 'CJ_SESSION_CHANGED' | 'CJ_EXTENSION_INFO' | 'CJ_WALLET_RESULT' | 'CJ_SIGN_RESULT'
```

## Coding Standards

### TypeScript Rules (tsconfig.json)
- **Strict mode enabled** - all code must be strongly typed
- **No `any` type** - use proper types or `unknown` with type guards
- **Unused parameters** - prefix with underscore (`_param`) if required by interface
- **Path aliases** - use `@/` for `src/` imports (configured in tsconfig)

### ESLint Rules (.eslintrc.js)
- `@typescript-eslint/no-explicit-any`: warn (avoid `any`, but not blocking)
- `@typescript-eslint/no-unused-vars`: error (except `_prefixed` args)
- `no-console`: off (console allowed for extension debugging)

### Architecture Principles
- **Core** (`src/scripts/core/`): Pure business logic, NO Chrome APIs, 100% testable
- **Adapters** (`src/scripts/adapters/`): Wrap Chrome APIs, mockable in tests
- **Controllers** (`src/scripts/ui/`): Coordinate adapters + core, integration tests
- **Entry Points** (`src/scripts/entry/`): Webpack entry points - USE THESE, not root files

## Common Pitfalls

1. **Don't use Chrome APIs in `core/`** - breaks testability (inject via adapters)
2. **MV3 service worker timeout** - use keep-alive pattern in `sw-keepalive.ts`
3. **Rebuild required** - run `npm run build:dev` then reload in `chrome://extensions`
4. **Legacy files** - files in `src/scripts/` root are deprecated, use `entry/` instead
5. **Never call it "a wallet"** - always "authentication bridge" or "wallet bridge"
6. **Type safety** - prefer `viem` over `ethers.js` for better TypeScript support
7. **Message validation** - always validate messages with `zod` schemas before processing

## UI & Theme

> **Full documentation:** See `docs/THEME_DESIGN_SYSTEM.md`

The extension uses the **Deep Oceanic** theme (shared with main app):
- Background: `--cj-ocean-deepest` (#0a1628)
- Primary accent: `--cj-teal-glow` (#14b8a6)
- Text: `--cj-text-primary` (#f1f5f9)
- Use **inline SVGs** (not emojis) for cross-platform consistency

## Chrome Web Store Resubmission Requirements

### P0 — Must Fix Before Resubmission
- Main app (cryptotradingjournal.xyz) must be accessible 24/7
- Test instructions must specify exact URL (e.g., `/login` not "visit site")
- "REQUIRES MetaMask extension" must be FIRST LINE of test instructions
- Permission justifications filled in CWS submission form
- Version numbers aligned: manifest.json = package.json = store listing

### Error Handling Approach
| Error Code | Meaning | User Recovery |
|------------|---------|---------------|
| `USER_REJECTED (4001)` | User cancelled | Show retry option |
| `NO_WALLET (5001)` | MetaMask not installed | Show install link |
| `REQUEST_TIMEOUT (5006)` | Flow took too long | Auto-retry with backoff |
| `ALREADY_IN_PROGRESS (5007)` | Duplicate request | Wait for existing flow |

## Testing Strategy

### Unit Tests (Jest)
- **Run:** `npm run test:unit`
- **Coverage:** `npm run test:coverage` (target: 80%+ coverage)
- **Location:** `src/scripts/__tests__/` or co-located `*.test.ts` files
- **Mocking:** Mock Chrome APIs in adapters, not in core logic
- **Current Status:** 1,542 tests passing across 55 suites

### E2E Tests (Playwright)
- **Run:** `npm run test` or `npm run test:e2e:all`
- **Tests:** 
  - `tests/auth-flow.test.ts` - Main authentication flow
  - `tests/accessibility.test.ts` - WCAG 2.1 AA compliance
  - `tests/security-compat.test.ts` - Security extension compatibility
- **Prerequisites:** Build extension first with `npm run build:dev`

### Test Writing Guidelines
1. **Core logic** - Pure unit tests, no mocks needed
2. **Adapters** - Mock Chrome APIs (use `chrome.*` mocks)
3. **Controllers** - Integration tests with mocked adapters
4. **Always test error paths** - User rejection, timeouts, network failures

## Security Considerations

### Critical Security Rules
1. **Never log sensitive data** - No private keys, signatures, or session tokens in console
2. **Validate all messages** - Use `zod` schemas to validate messages from untrusted sources
3. **Origin validation** - Only process messages from allowed domains (`cryptotradingjournal.xyz`)
4. **Content Security Policy** - Extension follows strict CSP (no inline scripts, no eval)
5. **Permissions** - Only request minimum necessary permissions (storage, alarms, scripting)

### Chrome Web Store Requirements
- **No obfuscation** - All code must be readable (webpack dev builds for review)
- **Permission justification** - Document why each permission is needed
- **Privacy policy** - Must be accessible and match actual data usage
- **Test account** - Provide working test wallet in submission (use test networks)
