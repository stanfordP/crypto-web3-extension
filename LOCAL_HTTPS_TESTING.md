# CTJ local HTTPS testing

This private beta supports the exact `https://ctj.localhost` origin on this PC.
It retains the existing SIWE signing/session protocol and requires an existing
wallet such as MetaMask. It is an authentication bridge, not a wallet.

Run `npm ci`, `npm run validate`, `npm run test:unit -- --runInBand`, then
`npm run build:local`. This sets the background API base to the local HTTPS
origin and disables remote error reporting for this build. The normal store
build defaults remain unchanged. The popup selects the local origin when its
active tab is on that origin; an explicit existing advanced `appUrl` setting
takes precedence, so check that setting before testing.

Use a separate browser profile with the local CA trusted. Load the generated
`dist` folder unpacked via `chrome://extensions` developer mode. Avoid enabling
two copies of the CTJ bridge in one profile. This build does not update or
replace the installed signed store package. No store publication is included.

Open `https://ctj.localhost/login` and check that the page detects the bridge.
With the owner's wallet available, sign the normal SIWE authentication message;
verify refresh, logout, isolation from other profiles, and restart recovery.
Code tests and provider injection alone do not establish owner login acceptance.
Retain old browser profiles and export any unsynced drawings/local data before
changing origins. Never enter wallet seed phrases or private keys into CTJ.

Other devices require a separately selected private HTTPS origin; this loopback
origin provides no access from another device. Financial audit, ingestion,
backup/restoration, reboot and writer handover acceptance remain separate gates.
