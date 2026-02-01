# Screen Reader Testing Guide

> **Version**: 1.0  
> **Last Updated**: January 2025  
> **Extension**: Crypto Trading Journal Web3 Auth Bridge

## Overview

This document provides manual testing procedures for verifying accessibility with screen readers. While automated tests using axe-core cover WCAG compliance, manual testing ensures the actual user experience is smooth.

## Required Tools

### Windows
- **NVDA** (NonVisual Desktop Access) - Free, open source
  - Download: https://www.nvaccess.org/download/
  - Version: 2023.3+

### macOS
- **VoiceOver** - Built into macOS
  - Enable: System Preferences > Accessibility > VoiceOver
  - Shortcut: `Cmd + F5` to toggle

### Chrome DevTools
- Accessibility inspector
- Enable: DevTools > Elements > Accessibility pane

---

## Test Environment Setup

### 1. Install Extension
```bash
npm run build:dev
# Load dist/ folder in chrome://extensions (Developer mode ON)
```

### 2. Configure NVDA (Windows)
1. Open NVDA settings (`NVDA + N > Preferences > Settings`)
2. Set speech synthesizer to "eSpeak NG" (clearest for testing)
3. Enable "Report dynamic content changes" in Browse Mode settings
4. Set verbosity to "High" for detailed announcements

### 3. Configure VoiceOver (macOS)
1. Open VoiceOver Utility (`Cmd + F5`, then `Cmd + F8`)
2. Set Web > Navigate web pages by: "DOM order"
3. Enable "Speak notifications and messages"

---

## Test Cases

### TC-001: Popup Opens with Loading State

**Steps:**
1. Open extension popup (click extension icon)
2. Listen for screen reader announcements

**Expected Announcements (NVDA):**
```
"CJ Trading popup"
"Loading wallet status, please wait" (live region)
```

**Expected Announcements (VoiceOver):**
```
"Web dialog"
"Loading..." 
```

**Pass Criteria:**
- [ ] Loading state is announced immediately
- [ ] User knows to wait

---

### TC-002: Not Connected State Navigation

**Steps:**
1. Wait for popup to load (no active session)
2. Use Tab key to navigate elements
3. Listen for each element's announcement

**Expected Tab Order:**
1. "Not Connected, heading level 2"
2. "Extension Active, status" (Extension status check)
3. "Checking wallet, status" (Wallet detection)
4. "Checking domain, status" (Domain validation)
5. "Open Trading Journal, button" (Primary action)
6. "How it works, link"
7. "Privacy, link"

**Pass Criteria:**
- [ ] Tab order is logical (top to bottom)
- [ ] All interactive elements are reachable
- [ ] Button role is announced
- [ ] Status indicators have proper ARIA labels

---

### TC-003: Connected State Information

**Steps:**
1. Connect wallet via the main app
2. Reopen extension popup
3. Navigate with Tab and arrow keys

**Expected Announcements:**
```
"Connected, heading level 2"
"Address, [wallet address], list item"
"Network, Ethereum, list item"
"Mode, Live Trading, list item"
"Status, Active, status badge"
"Open Trading Journal, button"
"Disconnect, button"
```

**Pass Criteria:**
- [ ] All wallet info is readable
- [ ] Status is clearly announced
- [ ] Action buttons are announced with roles

---

### TC-004: Error State Announcement

**Steps:**
1. Simulate network error (disconnect internet)
2. Open popup
3. Navigate to error message

**Expected Announcements:**
```
"Connection Error, heading level 2"
"You are offline. Please check your internet connection." (live region alert)
"Try Again, button"
```

**Pass Criteria:**
- [ ] Error state uses `role="alert"`
- [ ] Error message is announced immediately
- [ ] Retry button is accessible

---

### TC-005: Offline Indicator

**Steps:**
1. Go offline (disconnect network)
2. Open extension popup
3. Listen for offline announcement

**Expected Announcements:**
```
"Offline" (banner notification)
"Cannot connect while offline. Please check your internet connection."
```

**Pass Criteria:**
- [ ] Offline status is announced
- [ ] Connect button announces it's disabled

---

### TC-006: Getting Started Guide (Off-site)

**Steps:**
1. Open popup while not on cryptotradingjournal.xyz
2. Navigate to "Getting Started" section

**Expected Announcements:**
```
"Getting Started, heading level 3"
"List with 4 items"
"1, Install MetaMask if not installed, link MetaMask"
"2, Visit cryptotradingjournal.xyz, link"
"3, Click Connect Wallet on the site"
"4, Approve connection in MetaMask popup"
```

**Pass Criteria:**
- [ ] Steps are read in order
- [ ] Links are announced with "link" role
- [ ] Step numbers are read

---

### TC-007: Keyboard Navigation

**Steps:**
1. Open popup
2. Press Tab repeatedly through all elements
3. Press Shift+Tab to go backwards
4. Press Enter on buttons
5. Press Space on buttons

**Pass Criteria:**
- [ ] Focus ring is visible on all elements
- [ ] Tab moves focus forward
- [ ] Shift+Tab moves focus backward
- [ ] Enter activates buttons
- [ ] Space activates buttons
- [ ] No focus traps exist

---

### TC-008: Dynamic Content Updates

**Steps:**
1. Open popup in not-connected state
2. Connect wallet from main app (in separate tab)
3. Listen for popup updates

**Expected Announcements:**
```
"Connected" (state change announced)
"Session updated" (if dynamic content region fires)
```

**Pass Criteria:**
- [ ] State change is announced
- [ ] User doesn't need to refresh to hear update

---

## Common Issues Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Missing button labels | Buttons say "button" only | Add `aria-label` |
| Images without alt | Image not described | Add `alt` attribute |
| Form labels missing | "Edit text" only | Add `<label>` or `aria-label` |
| Skip links absent | Can't skip navigation | Add skip link |
| Focus not visible | No focus indicator | Add `:focus` CSS |
| Reading order wrong | Content reads out of order | Fix DOM order |
| Live regions silent | Updates not announced | Add `aria-live` |

---

## Reporting Issues

When reporting accessibility issues, include:

1. **Screen Reader**: NVDA 2023.x / VoiceOver macOS XX.X
2. **Browser**: Chrome XXX.X.XXXX.XX
3. **Test Case**: TC-00X
4. **Expected**: What should have been announced
5. **Actual**: What was announced
6. **Steps to Reproduce**: Detailed steps

### Example Report
```
Issue: Disconnect button not announced as button

Screen Reader: NVDA 2023.3.3
Browser: Chrome 120.0.6099.130
Test Case: TC-003

Expected: "Disconnect, button"
Actual: "Disconnect" (no role)

Steps:
1. Connect wallet
2. Open popup  
3. Tab to disconnect button
4. Listen for announcement

Suggestion: Add role="button" or use <button> element
```

---

## ARIA Attributes Reference

### Currently Used in Extension

| Attribute | Element | Purpose |
|-----------|---------|---------|
| `role="main"` | Container | Identifies main content |
| `role="status"` | Loading | Live status updates |
| `role="alert"` | Error | Immediate error announcements |
| `role="region"` | Sections | Landmark navigation |
| `role="list"` | Info grid | List structure |
| `role="listitem"` | Info items | List items |
| `role="group"` | Button groups | Grouped controls |
| `aria-label` | Buttons | Accessible names |
| `aria-labelledby` | Regions | Connected labels |
| `aria-live="polite"` | Status | Deferred announcements |
| `aria-hidden="true"` | Icons | Hidden decorative elements |

### Recommended Additions

```html
<!-- Skip link (add to top of popup) -->
<a href="#main-content" class="sr-only focus:not-sr-only">
  Skip to main content
</a>

<!-- Announce state changes -->
<div aria-live="polite" aria-atomic="true" class="sr-only" id="announcer">
  <!-- Dynamically updated with state changes -->
</div>
```

---

## Automated vs Manual Testing

| Aspect | Automated (axe-core) | Manual (NVDA/VoiceOver) |
|--------|---------------------|------------------------|
| WCAG compliance | ✅ Excellent | ⚠️ Partial |
| Reading order | ❌ Limited | ✅ Excellent |
| Context understanding | ❌ None | ✅ Excellent |
| Dynamic content | ⚠️ Limited | ✅ Excellent |
| Real user experience | ❌ None | ✅ Full |
| Execution speed | ✅ Fast | ❌ Slow |
| CI/CD integration | ✅ Easy | ❌ Hard |

**Recommendation**: Run automated tests in CI, manual tests before major releases.

---

## Resources

- [NVDA User Guide](https://www.nvaccess.org/files/nvda/documentation/userGuide.html)
- [VoiceOver Getting Started](https://support.apple.com/guide/voiceover/welcome/mac)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Chrome Accessibility DevTools](https://developer.chrome.com/docs/devtools/accessibility/reference)
