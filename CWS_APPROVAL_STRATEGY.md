# Chrome Web Store Approval Strategy

**Extension:** Crypto Trading Journal - Web3 Auth
**Version:** 2.2.9
**Date:** May 28, 2026
**Status:** Published on Chrome Web Store
**Previous Rejection:** Violation ID: Red Potassium (January 6, 2026)

---

## Executive Summary

This document preserves the rejection analysis and current maintenance checklist for the published CTJ Web3 Auth Bridge.

---

## 1. Root Cause Analysis

### Why We Were Rejected

| Issue | Impact | How Reviewers Experience It |
|-------|--------|----------------------------|
| **"Wallet" terminology** | Critical | Reviewers expect balance/send features like MetaMask |
| **No MetaMask installed** | Critical | Extension appears "broken" on fresh Chrome profile |
| **500-char limit** | High | Can't explain multi-extension dependency |
| **No visual proof** | High | Extension looks non-functional until full flow complete |
| **Main site dependency** | High | If site is down/slow, extension "doesn't work" |

### Key Insight

> Chrome reviewers test on **fresh Chrome profiles** with **no other extensions**. If your extension requires another extension (MetaMask), you must make this dependency crystal clear in the **first line** of test instructions.

---

## 2. What Has Been Addressed

### ✅ Completed Items (v2.2.3-2.2.6)

| Item | Implementation | Files Modified |
|------|----------------|----------------|
| Positioning as "Auth Bridge" | Updated all descriptions | STORE_LISTING.md, manifest.json |
| Status indicators in popup | Shows Extension/Wallet/Domain status | popup.html, PopupController.ts |
| 500-char test instructions | Pre-configured test wallet seed | TEST_INSTRUCTIONS_500_CHAR.txt |
| "NOT a wallet" disclaimers | Explicit disclaimers in popup | popup.html |
| Reviewer documentation | Quick start guide, improvements doc | REVIEWER_*.md files |
| Main app requirements doc | Dependencies documented | MAIN_APP_REQUIREMENTS.md |
| Version sync | manifest = package.json = 2.2.9 | Both files (`npm run check-version`) |

---

## 3. Current Maintenance Checklist

### 🔴 P0 — Approval Blockers

| # | Item | Owner | Verification Method |
|---|------|-------|---------------------|
| 1 | Main site 24/7 availability | Main App Team | Uptime monitoring during review |
| 2 | Exact URL in test instructions (`/login` not generic) | Extension | Update TEST_INSTRUCTIONS |
| 3 | "REQUIRES MetaMask" as literal first line | Extension | Update TEST_INSTRUCTIONS |
| 4 | CWS permission justifications | Submission | Fill "Privacy practices" fields |
| 5 | CWS privacy disclosures match policy | Submission | Cross-check with PRIVACY.md |
| 6 | No CAPTCHA/bot protection on site | Main App Team | Fresh IP test |

### 🟡 P1 — Reviewer Ease

| # | Item | Owner | Verification Method |
|---|------|-------|---------------------|
| 7 | Updated screenshots (current UI) | Extension | Capture new screenshots |
| 8 | Domain scope justification | Submission | Explain wildcard or narrow it |
| 9 | CWS support URL/email filled | Submission | Verify in CWS form |
| 10 | Single "golden path" test flow | Extension | Remove alternative paths |
| 11 | "Waiting for wallet" loading state on site | Main App Team | UX implementation |

### 🟢 P2 — Quality Polish

| # | Item | Owner | Verification Method |
|---|------|-------|---------------------|
| 12 | ARIA labels on status indicators | Extension | ✅ Automated axe coverage exists; manual screen-reader QA remains optional |
| 13 | Promotional tiles (440x280, 1400x560) | Assets | Optional polish |
| 14 | Uninstall feedback URL | Extension | ✅ Implemented |
| 15 | Remove deprecated files | Extension | ✅ Legacy root scripts removed |

---

## 4. CWS Submission Field Reference

### Permission Justifications

**Storage:**
> "Stores encrypted session tokens locally for cross-tab authentication persistence. Session data never synced to cloud. Used only on cryptotradingjournal.xyz."

**ActiveTab:**
> "Detects when user navigates to cryptotradingjournal.xyz to enable wallet authentication flow. No browsing data is collected or stored."

**Alarms:**
> "Maintains Service Worker keep-alive during SIWE signing. MV3 service workers terminate after 30 seconds; signing can take longer when users read authentication messages carefully. Alarms fire only during active auth flows."

**Host Permissions (cryptotradingjournal.xyz):**
> "Content script runs exclusively on cryptotradingjournal.xyz to inject the wallet bridge code. No other domains are accessed."

### Privacy Practices Checklist

| CWS Field | Check? | Notes |
|-----------|--------|-------|
| Authentication info | ✅ | Wallet address, session tokens |
| Personally identifiable info | ❌ | Not collected |
| Health info | ❌ | Not applicable |
| Financial info | ❌ | No balances/transactions accessed |
| Location | ❌ | Not collected |
| Web history | ❌ | Not collected |
| User activity | ❌ | Only auth events |

---

## 5. Test Flow for Reviewers

### The "Golden Path" (Must Work Flawlessly)

```
1. Reviewer installs MetaMask
   └── Uses standard test seed: abandon×11 + about

2. Reviewer installs this extension
   └── Clicks extension icon → sees status indicators

3. Reviewer visits https://cryptotradingjournal.xyz
   └── Page loads in <3 seconds, "Connect Wallet" visible

4. Reviewer clicks "Connect Wallet"
   └── MetaMask popup appears immediately

5. Reviewer approves connection in MetaMask
   └── Site shows "Signing in..." or similar loading state

6. Reviewer signs SIWE message in MetaMask
   └── Clear, readable message with domain verification

7. Authentication completes
   └── User redirected to dashboard or success page

8. Reviewer clicks extension icon
   └── Shows "Connected" with wallet address

✅ SUCCESS: Extension approved
```

### Failure Points to Eliminate

| Failure Point | Cause | Prevention |
|---------------|-------|------------|
| "Extension not working" | MetaMask not installed | Status indicator + install link |
| "Nothing happens" | Site not responding | Loading states, error messages |
| "Can't connect" | CAPTCHA/bot protection | Whitelist reviewer IPs or disable |
| "Timeout" | Service worker died | Keep-alive alarms |
| "Signature failed" | User didn't see popup | Explicit "Check MetaMask" message |

---

## 6. Timeline & Ownership

### Before Resubmission

| Task | Owner | Deadline | Done |
|------|-------|----------|------|
| Verify main site availability | Main App | Before submit | ⬜ |
| Update test instructions | Extension Dev | Before submit | ⬜ |
| Fill CWS permission justifications | Extension Dev | At submit | ⬜ |
| Capture new screenshots | Extension Dev | At submit | ⬜ |
| Cross-check privacy disclosures | Extension Dev | At submit | ⬜ |

### During Review (1-5 business days)

| Task | Owner | Frequency |
|------|-------|-----------|
| Monitor site uptime | Main App | Continuous |
| Check for reviewer feedback | Extension Dev | Daily |
| Be ready to respond to questions | Both | On-demand |

### If Rejected Again

| Scenario | Action |
|----------|--------|
| Same issue | Provide video walkthrough, contact CWS support |
| New issue | Address feedback, iterate quickly |
| Unclear feedback | Use One Stop Support form for clarification |

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Test flow completion time | < 2 minutes |
| Main site response time | < 3 seconds |
| Extension popup load time | < 500ms |
| Error rate during testing | 0% |

---

## 8. Files Reference

| Document | Purpose |
|----------|---------|
| [claude.md](claude.md) | Full technical architecture |
| [RESUBMISSION_CHECKLIST.md](RESUBMISSION_CHECKLIST.md) | Detailed checklist with status |
| [TEST_INSTRUCTIONS_500_CHAR.txt](TEST_INSTRUCTIONS_500_CHAR.txt) | Exact CWS test instructions |
| [MAIN_APP_REQUIREMENTS.md](MAIN_APP_REQUIREMENTS.md) | Main site requirements |
| [STORE_LISTING.md](STORE_LISTING.md) | CWS listing content |
| [PRIVACY.md](PRIVACY.md) | Privacy policy |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | AI coding guidelines |

---

## 9. Contacts

| Role | Contact |
|------|---------|
| Extension Developer | support@cryptotradingjournal.xyz |
| CWS Support | https://support.google.com/chrome_webstore/contact/one_stop_support |
| Main App Team | [Internal contact] |

---

*This document should be reviewed before every Chrome Web Store submission.*
