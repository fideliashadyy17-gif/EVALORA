# EVALORA Secure Exam Browser (Desktop Lockdown Environment)

The official dedicated desktop examination application for EVALORA Assessment Suite, engineered for high-stakes summative e-assessments, IB MYP assessments, and institutional examinations.

---

## 1. Architectural Investigation & Technical Rationale

### Web Browser Limitations vs. Native Desktop Capabilities
A standard web browser (Chrome, Edge, Firefox, Safari) runs inside a restricted user sandbox governed by Web standards. While EVALORA's web application enforces robust presentation-level protections (capture-phase clipboard interception, context-menu cancellation, focus-loss observation, and fullscreen monitoring via `src/lib/assessmentLockdown.ts` and `src/lib/integrity.ts`), **no standard web browser can reliably control host operating-system facilities**:

| Security Threat | Standard Web Browser Capability | EVALORA Secure Exam Browser (Native Desktop) |
|---|---|---|
| **OS Shortcuts (`Alt+Tab`, `Win`, `Alt+F4`)** | Observable after the fact via blur; cannot prevent switching | **Intercepted at OS level** via global shortcut hooks before the OS switches tasks |
| **External Applications (Discord, OBS, WhatsApp, Zoom)** | Cannot detect or terminate running background processes | **Active process watchdog** monitors Windows process table (`tasklist`) and blocks prohibited tools |
| **Screen Recording / Capture / Screen Sharing** | Vulnerable to OBS, Discord stream, PrintScreen, Snipping Tool | **`setContentProtection(true)`** engages Windows DWM hardware-level screen capture blacking |
| **Multi-Monitor Exploitation** | Fullscreen API only covers one display; secondary displays stay active | **Multi-Display Watchdog** detects all connected monitors via `screen.getAllDisplays()` and enforces single-screen policy |
| **Developer Tools & Inspection** | Cannot disable DevTools on student's personal browser | **DevTools strictly disabled**, context isolation enabled, node integration forbidden |
| **Navigation Escape** | Student can open new tabs or navigate away | **Strict origin firewall** rejects any navigation outside the official EVALORA platform |
| **System Modification Risk** | None | **Clean exit protocol**: zero permanent registry or OS modifications upon exit |

---

## 2. Cryptographic Attestation Protocol

To prevent client spoofing or unauthorized entry from standard browsers when Lockdown is enabled:

1. **Challenge Request**: The Secure Exam Browser requests or receives an ephemeral cryptographic challenge.
2. **HMAC-SHA256 Signing**: The application's isolated runtime signs `timestamp:examCode:platform:version:nonce` with the shared runtime secret.
3. **Backend Verification (`/api/exam/access`)**:
   - Validates timestamp within a 5-minute sliding window (guards against replay attacks).
   - Validates exam code matching.
   - Validates platform (`win32`, `darwin`, `linux`) and minimum acceptable version.
   - Verifies the cryptographic HMAC signature.
4. **Admission Granted**: The student's attempt is flagged with `lockdown_verified: true`, `lockdown_platform: "win32"`, and `lockdown_verified_at: timestamp`.
5. **Admin Visibility**: Invigilators see the verified green badge in the real-time proctoring console.

---

## 3. Distribution & Deployment Models for Schools

### A. Windows Managed Lab Deployment (Active Directory / Intune / GPO)
For school-owned desktop laboratories:
- Build MSI / Silent Installer: `npm run dist:win` produces an installer that supports silent installation via:
  ```powershell
  EvaloraSecureBrowserSetup.exe /S /allusers
  ```
- Protocol Registration: Automatically registers `evalora-lockdown://` so web links launch directly into the secure shell.

### B. Student Personal Laptops (BYOD — Windows 10 & 11)
- Portable Standalone Executable:
  ```powershell
  npm run dist:portable
  ```
  Produces `EVALORA-Secure-Browser-Portable.exe` which requires **zero administrative installation rights**. Students can download, run, take the exam, and close the file with no lingering system footprint.

### C. macOS Deployments
- Packaged as a signed `.dmg` application bundle with macOS accessibility and full-screen kiosk support.

---

## 4. Building the Application

```bash
cd desktop
npm install
npm run start       # Run in local development
npm run dist:win    # Generate Windows NSIS and Portable installers in /dist
```

---

## 5. Invigilator Emergency Exit
In the event of an emergency or unexpected interruption before paper submission, invigilators can press `Ctrl + Alt + Shift + X` and enter the authorization code:
`EVALORA-EXIT-2026`
This smoothly restores normal window controls and exits the application cleanly.
