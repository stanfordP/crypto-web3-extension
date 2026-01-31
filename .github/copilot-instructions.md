# CTJ Web3 Extension - AI Coding Instructions

> **Full Documentation:** See `claude.md` for comprehensive architecture and implementation status.
> **Main App Integration:** See `../crypto-futures-jn/CLAUDE.md` for API endpoints and message protocol.

## Critical Context

**Chrome Web Store Status:** Rejected (Violation ID: Red Potassium)  
**Root Cause:** Reviewers expected standalone wallet functionality  
**Solution:** Position as "Authentication Bridge" — NEVER use "Wallet" as primary descriptor

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

## Common Pitfalls

1. **Don't use Chrome APIs in `core/`** - breaks testability
2. **MV3 service worker timeout** - use keep-alive pattern in `sw-keepalive.ts`
3. **Rebuild required** - run `npm run build:dev` then reload in `chrome://extensions`
4. **Legacy files** - files in `src/scripts/` root are deprecated, use `entry/` instead
5. **Never call it "a wallet"** - always "authentication bridge" or "wallet bridge"

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
