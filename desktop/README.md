# EVALORA Secure Browser 1.1.0

The Windows distribution is a packaged Electron application. The published Windows setup files download and run the NSIS installer; they never start Chrome or Edge and never use a User-Agent as evidence.

## Build

```powershell
cd desktop
npm ci
npm test
npm run dist:win
```

The x64 installer is written to `desktop/dist/EVALORA-Secure-Browser-1.1.0-Setup.exe`.

## Native proof protocol

The main process creates a per-Windows-user Ed25519 key pair. Electron `safeStorage` encrypts the PKCS#8 private key using Windows DPAPI before it is persisted under Electron's user-data directory. The main process requests a two-minute server challenge, signs the challenge together with the normalized examination code, candidate-binding hash, guest-session identifier, platform, and application version, then returns the proof over a narrow context-isolated IPC API. Server admission independently authorizes the candidate, verifies the signature against the public key recorded with the challenge, binds it to the exact exam/session/identity, and atomically consumes the challenge.

No application-wide/shared HMAC secret is present. A challenge is not proof by itself; the signed challenge is accepted once and only in the context it was issued for. The browser UI's bridge/UA/URL markers are presentation signals, not backend authorization.

### Security limits (important)

This provides key-possession and replay resistance, not Windows Remote Attestation. DPAPI protects the private-key file at rest for the current Windows user; it does not prove secure boot, a pristine OS, an Authenticode-signed EVALORA publisher identity, or that a determined same-user attacker is running an unmodified binary. A client can generate a different key and request a challenge. Electron is not tamper-proof. High-stakes deployments requiring proof of a signed/managed binary need an Authenticode publisher certificate and a verifiable Windows device-attestation/enrollment service (for example, managed TPM-backed key attestation); those credentials/services are not configured in this repository/environment.

The NSIS artifact is currently unsigned because no publisher code-signing certificate is configured. Windows may show its normal unknown-publisher warning. Do not describe the current software key as publisher attestation.

## Launch and compatibility

The installer registers `evalora-lockdown://`. Exam links retain their invitation token or direct-entry path and examination code when handed to the application. Lockdown-OFF exams remain available in standard browsers; lockdown policy is per examination. Existing examination codes, links, settings, questions, candidates, attempts and answers are not changed by the application installer.

The 1.0 shared-HMAC protocol is retired by the server because its client-side secret was public. Candidates must update the old browser launcher/application to 1.1.0 for Lockdown exams; no exam credential or exam code is rotated.
