# Chrome Web Store Reviewer Quick Start Guide

**Extension:** Crypto Trading Journal - Web3 Auth  
**Version:** 2.2.4  
**Estimated Testing Time:** 3-5 minutes  

---

## ⏱️ Quick Overview

| Step | Action | Time |
|------|--------|------|
| 1 | Install MetaMask (skip if installed) | ~1 min |
| 2 | Import test wallet | ~30 sec |
| 3 | Install & check extension | ~30 sec |
| 4 | Visit cryptotradingjournal.xyz | ~30 sec |
| 5 | Connect & authenticate | ~30 sec |
| 6 | Verify success | ~15 sec |
| **Total** | | **~3-5 min** |

---

## 🎯 What to Expect

### This Extension IS:
- ✅ An authentication bridge (connects existing wallets to our app)
- ✅ A SIWE (Sign-In With Ethereum) facilitator
- ✅ Session management for cryptotradingjournal.xyz

### This Extension is NOT:
- ❌ A cryptocurrency wallet
- ❌ A key/seed phrase storage
- ❌ Standalone software (requires MetaMask + website)

---

## 📋 Test Instructions (Copy-Paste Ready)

### For Chrome Web Store Submission (466 characters):

```
REQUIRES MetaMask extension.

TEST WALLET (no real funds):
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

STEPS:
1. In MetaMask: Import wallet using seed above
2. Visit https://cryptotradingjournal.xyz
3. Click "Connect Wallet" on site
4. Approve in MetaMask popup
5. Success = wallet address shown in extension popup

Extension ONLY works on cryptotradingjournal.xyz domain.
Contact: support@cryptotradingjournal.xyz
```

---

## 🔧 Step-by-Step Testing

### Step 1: Prerequisites (~1 min)

**If MetaMask is NOT installed:**
1. Go to https://metamask.io/download/
2. Install the Chrome extension
3. Create or import a wallet

**If MetaMask IS installed:**
- Skip to Step 2

### Step 2: Import Test Wallet (~30 sec)

1. Open MetaMask
2. Click account icon → "Import Account" → "Import using seed phrase"
3. Enter this test seed:
   ```
   abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
   ```
4. Set any password (this is a test wallet with no real funds)

### Step 3: Install & Verify Extension (~30 sec)

1. Install this extension
2. Click the extension icon in the toolbar
3. **What you should see immediately:**
   - ✅ "Extension Active" indicator
   - ⚠️ Wallet status (checking MetaMask)
   - ⚠️ Domain status (not on correct domain yet)

> **This proves the extension is working!** The status indicators show the code is functional.

### Step 4: Visit the Website (~30 sec)

1. Go to https://cryptotradingjournal.xyz
2. You should see a "Connect Wallet" button

### Step 5: Authenticate (~30 sec)

1. Click "Connect Wallet" on the website
2. MetaMask will pop up - approve the connection
3. MetaMask will ask to sign a message - this is the SIWE authentication
4. Sign the message
5. You'll be logged in and redirected to the dashboard

### Step 6: Verify Success (~15 sec)

1. Click the extension icon again
2. **What you should see:**
   - "Connected" status
   - Your wallet address (0x...)
   - Network name (Ethereum, etc.)
   - "Active" status badge

### Step 7: Test Disconnect (Optional)

1. Click "Disconnect" button in popup
2. Should return to "Not Connected" state
3. Session is cleared

---

## ✅ Success Criteria Checklist

- [ ] Extension installs without errors
- [ ] Popup shows status indicators immediately
- [ ] "Extension Active" shows ✅
- [ ] After auth, wallet address appears in popup
- [ ] After auth, "Connected" status shows
- [ ] Disconnect clears the session

---

## ⚠️ Troubleshooting

### "Extension popup shows 'Not Connected'"
- **Expected!** This is normal before authentication
- The status indicators show the extension is working
- You need to complete the auth flow on the website

### "MetaMask not detected"
- Make sure MetaMask is installed and unlocked
- Refresh the page and try again
- Check that MetaMask is not disabled

### "Website is unavailable"
- The external website may be temporarily down
- **However**, you can still verify:
  - Extension loads correctly
  - Status indicators work
  - Popup UI functions properly

### "Can't find wallet features"
- **This is expected!** This extension is NOT a wallet
- It only provides authentication to the trading journal app

---

## 📞 Need Help?

- **Email:** support@cryptotradingjournal.xyz
- **Website:** https://cryptotradingjournal.xyz
- **GitHub:** https://github.com/stanfordP/crypto-web3-extension

---

## 📎 Additional Documentation

- [Privacy Policy](https://stanfordp.github.io/crypto-web3-extension/)
- [Reviewer Testing Page](https://stanfordp.github.io/crypto-web3-extension/reviewer.html)
- [SIWE Specification (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361)

---

**Thank you for reviewing our extension!**
