# CJ_* Protocol Security Audit

> **Version**: 1.0  
> **Date**: January 17, 2026  
> **Status**: Complete  
> **Audited Protocol Version**: v2.0

---

## Executive Summary

This document provides a comprehensive STRIDE threat analysis of the CJ_* message protocol used for communication between the Crypto Trading Journal main application and browser extension.

### Overall Risk Assessment: **MEDIUM-LOW**

The protocol demonstrates solid security foundations with:
- ✅ Origin validation
- ✅ Rate limiting
- ✅ Request deduplication
- ✅ Session token isolation (not exposed to page)

Areas requiring improvement:
- ⚠️ No protocol version negotiation
- ⚠️ No message timestamps for replay protection
- ⚠️ No request ID uniqueness enforcement
- ⚠️ Limited message logging for incident analysis

---

## 1. STRIDE Threat Analysis

### 1.1 Spoofing

| Threat | Risk | Current Mitigation | Recommendation |
|--------|------|-------------------|----------------|
| Malicious page impersonating main app | LOW | Origin validation via `isAllowedOrigin()` | ✅ Adequate |
| Extension impersonation | LOW | Content script injection only on specific origins | ✅ Adequate |
| Session hijacking | LOW | Session token stored in `chrome.storage.session` (ephemeral) | ✅ Adequate |

**Code Review - Origin Validation:**
```typescript
// MessageRouter.ts - Line 230
if (!this.config.isAllowedOrigin(origin)) {
  return false;
}
```

**Finding:** Origin validation is properly implemented. The `isAllowedOrigin` function should verify against a whitelist of allowed origins.

### 1.2 Tampering

| Threat | Risk | Current Mitigation | Recommendation |
|--------|------|-------------------|----------------|
| Message modification in transit | LOW | postMessage within same window context | ✅ Adequate |
| Response modification | LOW | No signature on responses | ⚠️ Consider HMAC for sensitive data |
| Storage tampering | LOW | chrome.storage.session is extension-only | ✅ Adequate |

**Finding:** Message integrity is acceptable for same-origin postMessage. Cross-origin scenarios are prevented by manifest permissions.

### 1.3 Repudiation

| Threat | Risk | Current Mitigation | Recommendation |
|--------|------|-------------------|----------------|
| Denial of actions | MEDIUM | No message logging | ⚠️ Add structured logging |
| Audit trail gaps | MEDIUM | No persistent logs | ⚠️ Add debug mode logging |

**Recommendation:** Implement opt-in debug logging with privacy-safe redaction:
```typescript
interface MessageLog {
  timestamp: number;
  type: string;
  requestId?: string;
  origin: string;
  success: boolean;
  errorCode?: ErrorCode;
  // DO NOT log: sessionToken, signature, private keys
}
```

### 1.4 Information Disclosure

| Threat | Risk | Current Mitigation | Recommendation |
|--------|------|-------------------|----------------|
| Session token exposure | LOW | Token NOT included in postMessage | ✅ Adequate |
| Address enumeration | LOW | Only connected address shared | ✅ Adequate |
| Error message leakage | LOW | Generic error messages | ✅ Adequate |

**Code Review - Token Isolation:**
```typescript
// types.ts - Lines 119-124
/**
 * SECURITY NOTE (v2.1): sessionToken is intentionally NOT included here.
 * The session token is stored only in chrome.storage.session (ephemeral)
 * and is NEVER exposed to the page via postMessage.
 */
export interface PageSession {
  address: string;
  chainId: string;
  // NO sessionToken field - intentional
}
```

**Finding:** Excellent security practice. Session tokens remain isolated in extension storage.

### 1.5 Denial of Service

| Threat | Risk | Current Mitigation | Recommendation |
|--------|------|-------------------|----------------|
| Message flood | LOW | Token bucket rate limiter (20 tokens, 5/sec refill) | ✅ Adequate |
| Duplicate requests | LOW | Request deduplication with timeout | ✅ Adequate |
| Resource exhaustion | LOW | 60-second request timeout | ✅ Adequate |

**Code Review - Rate Limiting:**
```typescript
// MessageRouter.ts - Lines 174-178
const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxTokens: 20,
  refillRate: 5,
};
```

**Finding:** Rate limiting is properly implemented with configurable limits.

### 1.6 Elevation of Privilege

| Threat | Risk | Current Mitigation | Recommendation |
|--------|------|-------------------|----------------|
| Unauthorized operations | LOW | Handler registration is code-controlled | ✅ Adequate |
| Cross-origin access | LOW | Manifest limits content script injection | ✅ Adequate |
| Wallet operation escalation | MEDIUM | No per-operation authorization | ⚠️ Consider operation confirmations |

**Finding:** Wallet operations (connect, sign) should consider additional user confirmation for sensitive operations.

---

## 2. Protocol Vulnerabilities

### 2.1 No Protocol Version Negotiation

**Issue:** Messages do not include a protocol version field.

**Risk:** Future protocol changes may cause silent incompatibilities.

**Current State:**
```typescript
export interface BaseMessage {
  type: string;
  requestId?: string;
  // Missing: version field
}
```

**Recommendation:** Add version field to all messages:
```typescript
export interface BaseMessage {
  type: string;
  requestId?: string;
  version?: string; // e.g., "2.1"
}
```

### 2.2 No Replay Protection

**Issue:** Messages lack timestamps and nonces for replay protection.

**Risk:** A captured message could theoretically be replayed, though the attack surface is limited due to same-origin context.

**Recommendation:** Add timestamp validation:
```typescript
export interface BaseMessage {
  type: string;
  requestId?: string;
  timestamp?: number;  // Unix timestamp in ms
  nonce?: string;      // Unique per-request
}

// Validation: Reject messages older than 30 seconds
const MESSAGE_MAX_AGE_MS = 30_000;
if (message.timestamp && Date.now() - message.timestamp > MESSAGE_MAX_AGE_MS) {
  return this.sendError(ErrorCode.MESSAGE_EXPIRED, 'Message timestamp expired');
}
```

### 2.3 Request ID Not Enforced

**Issue:** `requestId` is optional and not validated for uniqueness.

**Risk:** Response correlation issues in high-frequency scenarios.

**Recommendation:** Generate and require requestId for all requests:
```typescript
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

---

## 3. Secure Defaults Analysis

### 3.1 Session Token Handling ✅

The protocol correctly isolates session tokens:
1. Stored in `chrome.storage.session` (ephemeral, cleared on browser close)
2. Never exposed via postMessage to page
3. Only shared with background service worker

### 3.2 Origin Validation ✅

Content script properly validates message origins before processing.

### 3.3 Rate Limiting ✅

Multiple rate limiting mechanisms:
1. Token bucket for general messages (MessageRouter)
2. Sliding window for API calls (rate-limiter.ts)
3. Operation-specific minInterval (walletOps: 1000ms, authFlow: 5000ms)

### 3.4 Error Handling ✅

Errors are returned with generic messages and typed error codes:
```typescript
export enum ErrorCode {
  INVALID_REQUEST = 1001,
  EXTENSION_NOT_READY = 1002,
  NO_WALLET_AVAILABLE = 1003,
  WALLET_CONNECTION_FAILED = 1004,
  SIGNATURE_REJECTED = 1005,
  // ...
}
```

---

## 4. Recommendations Summary

### Priority 1 (Implement in Sprint 5-6)

| Recommendation | Effort | Impact |
|----------------|--------|--------|
| Add protocol version to BaseMessage | 2h | Medium |
| Add timestamp to messages with validation | 4h | Medium |
| Add structured debug logging | 4h | High |

### Priority 2 (Consider for Sprint 7-8)

| Recommendation | Effort | Impact |
|----------------|--------|--------|
| Request ID enforcement with uniqueness | 4h | Low |
| User confirmation for sensitive wallet ops | 8h | Medium |
| HMAC signatures for sensitive responses | 8h | Low |

---

## 5. Conclusion

The CJ_* protocol demonstrates solid security fundamentals for a browser extension communication layer. The identified vulnerabilities are low-risk due to the same-origin context and existing mitigations.

**Recommended immediate actions:**
1. ✅ Add protocol version field (backward compatible)
2. ✅ Add optional timestamp validation
3. ✅ Implement debug logging infrastructure

The protocol is **approved for production use** with the recommended improvements scheduled for Sprint 5-6.

---

## Appendix A: Message Type Reference

| Type | Direction | Rate Limited | Deduplicated |
|------|-----------|--------------|--------------|
| CJ_CHECK_EXTENSION | App → Ext | Yes | No |
| CJ_OPEN_AUTH | App → Ext | Yes | Yes |
| CJ_GET_SESSION | App → Ext | No | No |
| CJ_DISCONNECT | App → Ext | Yes | Yes |
| CJ_WALLET_CONNECT | App → Ext | Yes | Yes |
| CJ_WALLET_SIGN | App → Ext | Yes | Yes |
| CJ_STORE_SESSION | App → Ext | Yes | No |
| CJ_CLEAR_SESSION | App → Ext | Yes | No |
| CJ_SET_ACCOUNT_MODE | App → Ext | Yes | No |

## Appendix B: Error Codes

| Code | Name | Description |
|------|------|-------------|
| 1001 | INVALID_REQUEST | Message structure invalid |
| 1002 | EXTENSION_NOT_READY | Extension not initialized |
| 1003 | NO_WALLET_AVAILABLE | No wallet detected |
| 1004 | WALLET_CONNECTION_FAILED | Wallet connect error |
| 1005 | SIGNATURE_REJECTED | User rejected signing |
| 1006 | SESSION_EXPIRED | Session no longer valid |
| 1007 | REQUEST_TIMEOUT | Operation timed out |
| 1008 | ALREADY_IN_PROGRESS | Duplicate request blocked |
