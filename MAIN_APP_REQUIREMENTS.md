# Main App Requirements for Chrome Web Store Approval

**Document:** Requirements for cryptotradingjournal.xyz to support Chrome Web Store extension review  
**Version:** 1.1  
**Date:** January 31, 2026  
**Status:** Updated with comprehensive resubmission requirements

---

## ⚠️ Critical Issue: Website Availability

The extension **CANNOT be approved** if the main website (https://cryptotradingjournal.xyz) is unavailable during the Chrome Web Store review process. Reviewers must be able to complete the full authentication flow.

---

## Essential Requirements Checklist

### 1. Website Availability (CRITICAL)

| Requirement | Priority | Status |
|-------------|----------|--------|
| Site accessible 24/7 | 🔴 Critical | Check |
| Response time < 3 seconds | 🔴 Critical | Check |
| No geographic restrictions | 🟡 High | Check |
| HTTPS certificate valid | 🔴 Critical | Check |
| No CAPTCHA/bot protection blocking reviewers | 🔴 Critical | Check |

**Why this matters:** Chrome reviewers may test at any time, from any location. If they cannot access the site, the extension will be rejected.

### 2. Landing Page Requirements

| Requirement | Priority | Notes |
|-------------|----------|-------|
| "Connect Wallet" button visible | 🔴 Critical | Must be prominently displayed |
| Button accessible without login | 🔴 Critical | Reviewers shouldn't need to create account first |
| Clear visual indication of Web3 support | 🟡 High | Logo/badge showing "Sign in with Ethereum" |
| Mobile-responsive design | 🟢 Medium | Some reviewers may test on mobile |

**Recommended Landing Page Elements:**
```
┌─────────────────────────────────────────────────┐
│                                                 │
│   [Logo] Crypto Trading Journal                 │
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │                                         │   │
│   │   Welcome! Sign in with your wallet     │   │
│   │                                         │   │
│   │   ┌─────────────────────────────────┐   │   │
│   │   │  🦊 Connect with MetaMask       │   │   │
│   │   └─────────────────────────────────┘   │   │
│   │                                         │   │
│   │   Supports: MetaMask, Brave, Coinbase   │   │
│   │                                         │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
│   Don't have a Web3 wallet?                     │
│   [Get MetaMask] ← Link to metamask.io          │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3. Wallet Connection Flow

| Step | Requirement | Expected Behavior |
|------|-------------|-------------------|
| 1 | Click "Connect Wallet" | MetaMask popup appears |
| 2 | Approve connection | Site shows "Connected" state |
| 3 | SIWE signature request | Clear message explaining what user is signing |
| 4 | Sign message | User authenticated, redirected to dashboard |
| 5 | Extension synced | Extension popup shows connected status |

**Error Handling Required:**
- "No wallet detected" → Show link to install MetaMask
- "User rejected connection" → Clear messaging, retry option
- "Extension not installed" → Graceful fallback or clear instruction
- "Network error" → Retry mechanism with user feedback

### 4. Test Wallet Support

The Chrome Web Store test instructions include this seed phrase:
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

**Requirements:**
| Requirement | Priority |
|-------------|----------|
| Accept connections from this test wallet | 🔴 Critical |
| No minimum balance requirements | 🔴 Critical |
| No IP/rate limiting blocking repeated tests | 🟡 High |
| No phone/email verification required | 🔴 Critical |

### 5. Extension Detection (Recommended)

Add JavaScript to detect if the CTJ Web3 Auth extension is installed:

```javascript
// Example: Check if extension is installed
async function checkExtensionInstalled() {
  try {
    // The extension should expose a detection method
    const response = await chrome.runtime.sendMessage(
      'YOUR_EXTENSION_ID', 
      { type: 'PING' }
    );
    return response?.success === true;
  } catch {
    return false;
  }
}

// Show appropriate UI based on extension status
if (!await checkExtensionInstalled()) {
  showInstallExtensionPrompt();
}
```

---

## Recommended Improvements

### 1. Add a Reviewer/Demo Mode

Create a special endpoint for Chrome reviewers:
```
https://cryptotradingjournal.xyz/reviewer-demo
```

This page should:
- Allow wallet connection without full account creation
- Show clear success/failure states
- Display the connected wallet address prominently
- Have a "Test Complete" confirmation message
- Auto-clear session after demonstration

### 2. Add Health Status Indicator

Add a simple health check endpoint:
```
GET https://cryptotradingjournal.xyz/api/health
Response: { "status": "ok", "timestamp": "..." }
```

Benefits:
- Can be monitored for uptime
- Extension could check site availability
- Reviewers can verify site is operational

### 3. Add Clear Extension Status on Site

Show in the UI whether the extension is:
- Not installed → "Install our Chrome extension for the best experience"
- Installed but not connected → "Click Connect Wallet to get started"
- Connected → "✅ Connected as 0x..."

### 4. Add Detailed Error Messages

Instead of generic errors, show specific messages:
```
❌ "MetaMask not found. Please install MetaMask to continue."
❌ "Connection rejected. Please approve the connection in MetaMask."
❌ "Signature rejected. Please sign the message to authenticate."
❌ "Network error. Please check your internet connection."
```

---

## Pre-Submission Checklist for Main App

Before submitting the extension to Chrome Web Store, verify:

- [ ] **Site is accessible** from multiple locations/VPNs
- [ ] **Connect Wallet button** works without prior registration
- [ ] **MetaMask connection** succeeds with test wallet
- [ ] **SIWE signature** request is clear and understandable
- [ ] **Authentication completes** successfully
- [ ] **Extension popup** shows connected status after auth
- [ ] **Disconnect** works and clears session
- [ ] **No CAPTCHA** or bot protection blocking the flow
- [ ] **Error messages** are clear and helpful
- [ ] **Mobile view** works (some reviewers use mobile)

---

## Monitoring Recommendations

### Uptime Monitoring
Set up alerts for:
- Site downtime (Pingdom, UptimeRobot, etc.)
- SSL certificate expiration
- API endpoint failures
- High response times (>3s)

### During Review Period
When extension is submitted for review:
1. **Monitor site 24/7** for any issues
2. **Have on-call support** ready to respond
3. **Check logs** for any blocked requests
4. **Test the full flow** daily

---

## Contact Points

If site issues are detected during review:

- **Main App Team:** [Add contact]
- **DevOps/Infrastructure:** [Add contact]  
- **Extension Developer:** support@cryptotradingjournal.xyz

---

## Summary

The extension's Chrome Web Store approval is **directly dependent** on the main app's availability and functionality. If reviewers cannot complete the authentication flow, the extension will be rejected regardless of how well the extension code works.

**Key priorities:**
1. 🔴 **Ensure 99.9% uptime** during review periods
2. 🔴 **Test the full flow** with the provided test wallet
3. 🟡 **Add clear error messages** for all failure scenarios
4. 🟢 **Consider adding a reviewer demo mode** for easier testing

---

*This document should be shared with the main app development team to ensure alignment.*
