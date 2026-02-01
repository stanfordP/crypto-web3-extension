# Chrome Web Store Reviewer Testing Instructions

**CRITICAL:** REQUIRES MetaMask extension (or similar) installed. This extension is an "AUTHENTICATION BRIDGE," not a standalone wallet.

## Extension Overview

**Name:** Crypto Trading Journal - Web3 Auth  
**Version:** 2.2.4  
**Type:** Authentication Bridge (NOT a wallet)

**Important:** This extension is NOT a standalone cryptocurrency wallet. It bridges existing wallet extensions (MetaMask, Brave Wallet, etc.) to the Crypto Trading Journal web application for authentication purposes only.

---

## Prerequisites for Testing

Before testing this extension, you **MUST** have one of these wallet extensions already installed:

### Option 1: MetaMask (Recommended)
- Install from: https://metamask.io/download/
- Create a test account (use test/development mode)
- No real funds needed for testing

### Option 2: Brave Browser
- Use built-in Brave Wallet (if using Brave browser)
- Enable in brave://settings/wallet

### Option 3: Any EIP-1193 Compatible Wallet
- Coinbase Wallet, Rabby, Rainbow, etc.

---

## Testing Steps

### Step 1: Install Prerequisites
1. Install MetaMask extension (if not already installed)
2. Create or unlock a test wallet
3. Ensure MetaMask is connected and shows a wallet address

### Step 2: Install This Extension
1. Load the unpacked extension in Chrome
2. You should see the "CJ Trading" icon in your extensions toolbar

### Step 3: Open Extension Popup
1. Click the extension icon in the toolbar
2. You should see "Not Connected" status
3. This is EXPECTED - the extension only works with the main app

### Step 4: Test with Main Application

**Option A: Test with Production Site** (Recommended)
1. Visit https://cryptotradingjournal.xyz
2. Click "Connect Wallet" button on the login page
3. The extension will detect your wallet (MetaMask)
4. Approve connection in MetaMask popup
5. Sign the SIWE authentication message in MetaMask
6. You should be authenticated and redirected to dashboard

**Option B: Test with Demo Environment** (If provided)
1. Contact developer for test/demo URL if needed
2. Follow same steps as Option A

### Step 5: Verify Extension Popup
1. After successful authentication, click extension icon again
2. You should now see "Connected" status
3. Your wallet address should be displayed
4. "Active" status indicator should show

### Step 6: Test Disconnect
1. In the extension popup, click "Disconnect" button
2. Confirmation dialog should appear in popup or main app
3. After disconnect, popup should show "Not Connected"

---

## Expected Behavior

### ✅ What SHOULD Work

1. **Wallet Detection**: Extension detects installed wallet (MetaMask, Brave, etc.)
2. **Authentication Flow**: Complete SIWE sign-in via existing wallet
3. **Session Management**: Maintains authenticated session across tabs
4. **Disconnect**: Clean session termination
5. **Popup Display**: Shows connection status and wallet info

### ❌ What Will NOT Work Without Prerequisites

1. Extension popup alone (requires main app + wallet)
2. Standalone wallet functionality (not a wallet)
3. Sending/receiving crypto (not a wallet)
4. Using without MetaMask or similar wallet installed

---

## What This Extension Does

- **Bridges** existing wallet extensions to Crypto Trading Journal
- **Facilitates** SIWE (Sign-In With Ethereum) authentication
- **Manages** session state for authenticated users
- **Syncs** auth state across browser tabs

## What This Extension Does NOT Do

- ❌ Does NOT provide wallet functionality
- ❌ Does NOT store private keys or seed phrases
- ❌ Does NOT send or receive cryptocurrency
- ❌ Does NOT work standalone (requires cryptotradingjournal.xyz)

---

## Troubleshooting

### "No wallet detected" error
**Cause:** MetaMask or another wallet extension is not installed  
**Solution:** Install MetaMask from https://metamask.io/download/

### Extension popup shows "Not Connected"
**Cause:** This is normal—extension requires the main app to initiate connection  
**Solution:** Visit cryptotradingjournal.xyz to test authentication

### Can't find wallet features
**Cause:** This is NOT a wallet—it's an authentication bridge  
**Solution:** This is expected behavior. The extension only handles authentication.

---

## Technical Details

### Permissions Used
- **storage**: Store session tokens locally (not synced to cloud)
- **activeTab**: Detect when user is on cryptotradingjournal.xyz
- **alarms**: Keep service worker alive for session management

### Security
- Uses SIWE (EIP-4361) standard for authentication
- Only communicates with cryptotradingjournal.xyz domain
- No private keys or seed phrases stored
- Session tokens encrypted in local storage

### Architecture
- **Content Script**: Runs on cryptotradingjournal.xyz pages only
- **Background Service Worker**: Manages sessions and cross-tab sync
- **Popup**: Displays connection status
- **Auth Page**: Facilitates wallet detection and SIWE flow

---

## Contact Information

**Website:** https://cryptotradingjournal.xyz  
**Support:** support@cryptotradingjournal.xyz  
**Repository:** https://github.com/stanfordP/crypto-web3-extension

---

## Summary for Reviewers

This extension is a **specialized authentication bridge** that:
1. Requires a separate wallet extension (MetaMask, etc.) to be already installed
2. Only works with the Crypto Trading Journal website
3. Facilitates SIWE authentication—does NOT provide wallet functionality
4. Cannot be fully tested without both prerequisites (wallet + main app)

The "Wallet" functionality mentioned in the description refers to **wallet integration/compatibility**, not standalone wallet features. Users bring their own wallet; this extension bridges it to our app.
