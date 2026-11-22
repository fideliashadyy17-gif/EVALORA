const { app, BrowserWindow, globalShortcut, screen, ipcMain, dialog, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const APP_VERSION = app.getVersion();
const DEFAULT_EVALORA_HOST = (process.env.EVALORA_HOST || "https://evalora-edu.online").replace(/\/$/, "");
const ALLOWED_HOSTS = new Set([
  new URL(DEFAULT_EVALORA_HOST).host,
  "evalora-edu.online",
  "www.evalora-edu.online",
  "evalora-six.vercel.app",
  "evalora-starboyboy2017-cells-projects.vercel.app",
  "localhost:3000",
  "127.0.0.1:3000",
]);
const PROFILE_KEY_PATH = path.join(app.getPath("userData"), "device-key.dpapi");
let mainWindow = null;
let launchTargetUrl = null;
let keyPairCache = null;

// Ensure single instance across Windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", (_event, commandLine) => {
    parseCommandLineArgs(commandLine);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (launchTargetUrl) {
        mainWindow.loadURL(launchTargetUrl).catch((err) => console.error("Secure Browser loadURL error:", err));
      }
    } else {
      createWindow();
    }
  });
}

// Register protocol handler for evalora-lockdown://
try {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("evalora-lockdown", process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient("evalora-lockdown");
  }
} catch (e) {
  console.warn("Could not register default protocol client:", e);
}

function isTrustedEVALORAPage(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.host.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    if (host.endsWith(".vercel.app")) return true;
    if (host === "localhost" || host.startsWith("localhost:") || host === "127.0.0.1" || host.startsWith("127.0.0.1:")) return true;
    return false;
  } catch {
    return false;
  }
}

function parseCommandLineArgs(argv) {
  if (!Array.isArray(argv)) return;
  const arg = argv.find((value) => {
    if (typeof value !== "string") return false;
    const clean = value.replace(/^"|"$/g, "").trim().toLowerCase();
    return clean.startsWith("evalora-lockdown:") || clean.startsWith("evalora-lockdown://");
  });
  if (!arg) return;

  try {
    const raw = arg.replace(/^"|"$/g, "").trim();
    let normalized = raw;
    if (/^evalora-lockdown:\/\/\//i.test(normalized)) {
      normalized = normalized.replace(/^evalora-lockdown:\/\/\//i, "https://evalora.local/");
    } else if (/^evalora-lockdown:\/\//i.test(normalized)) {
      normalized = normalized.replace(/^evalora-lockdown:\/\//i, "https://evalora.local/");
    } else if (/^evalora-lockdown:/i.test(normalized)) {
      normalized = normalized.replace(/^evalora-lockdown:/i, "https://evalora.local/");
    }

    const parsed = new URL(normalized);
    const sp = parsed.searchParams;

    let token = sp.get("token") || sp.get("invite") || "";
    if (!token) {
      const match = parsed.pathname.match(/\/(?:exam\/)?(?:join\/)?([a-f0-9-]{8,})/i);
      if (match) token = match[1];
    }

    const code = (sp.get("code") || sp.get("exam") || "").trim().toUpperCase();
    const candidate = (sp.get("candidate") || "").trim().toUpperCase();
    const pathValue = sp.get("path");

    if (token) {
      const query = new URLSearchParams({ lockdown: "1", secure_browser: "1" });
      if (code) query.set("code", code);
      if (candidate) query.set("candidate", candidate);
      launchTargetUrl = `${DEFAULT_EVALORA_HOST}/exam/join/${encodeURIComponent(token)}?${query.toString()}`;
    } else if (pathValue && pathValue.startsWith("/") && !pathValue.startsWith("//")) {
      const target = new URL(pathValue, DEFAULT_EVALORA_HOST);
      if (isTrustedEVALORAPage(target.toString())) {
        target.searchParams.set("lockdown", "1");
        target.searchParams.set("secure_browser", "1");
        if (code) target.searchParams.set("code", code);
        if (candidate) target.searchParams.set("candidate", candidate);
        launchTargetUrl = target.toString();
      }
    } else {
      const query = new URLSearchParams({ lockdown: "1", secure_browser: "1" });
      if (code) query.set("code", code);
      if (candidate) query.set("candidate", candidate);
      launchTargetUrl = `${DEFAULT_EVALORA_HOST}/exam-access?${query.toString()}`;
    }
  } catch (error) {
    console.error("Rejected malformed EVALORA lockdown link:", error);
  }
}

function loadDeviceKeyPair() {
  if (keyPairCache) return keyPairCache;
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows OS-backed key protection is unavailable; Secure Browser verification cannot start.");
  fs.mkdirSync(path.dirname(PROFILE_KEY_PATH), { recursive: true });
  if (fs.existsSync(PROFILE_KEY_PATH)) {
    try {
      const privatePem = safeStorage.decryptString(fs.readFileSync(PROFILE_KEY_PATH));
      const privateKey = crypto.createPrivateKey(privatePem);
      if (privateKey.asymmetricKeyType === "ed25519") {
        const publicKey = crypto.createPublicKey(privateKey);
        const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
        keyPairCache = { privateKey, publicKey, publicPem };
        return keyPairCache;
      }
    } catch (e) {
      console.warn("Could not decrypt existing device key; regenerating fresh OS key:", e);
      try { fs.unlinkSync(PROFILE_KEY_PATH); } catch {}
    }
  }
  const pair = crypto.generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const encrypted = safeStorage.encryptString(privatePem);
  fs.writeFileSync(PROFILE_KEY_PATH, encrypted, { mode: 0o600, flag: "wx" });
  keyPairCache = { privateKey: pair.privateKey, publicKey: pair.publicKey, publicPem };
  return keyPairCache;
}

function candidateBinding(context = {}) {
  const norm = (value) => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() : "";
  const identity = Object.fromEntries(Object.entries(context.identity || {})
    .filter(([key]) => key !== "lockdown_attestation")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, norm(value)]));
  const canonical = JSON.stringify(["EVALORA-CANDIDATE-V2", norm(context.first_name), norm(context.last_name), norm(context.class_id), norm(context.class_name), norm(context.guest_key), norm(context.candidate_code), identity]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function challengeMessage(challenge) {
  return JSON.stringify(["EVALORA-LOCKDOWN-ATTESTATION-V2", challenge.challenge_id, challenge.nonce,
    challenge.expires_at, challenge.exam_code.trim().toUpperCase(), challenge.candidate_binding,
    challenge.session_id, challenge.platform, challenge.app_version]);
}

async function createAttestation(examCode, context) {
  if (typeof examCode !== "string" || !context || typeof context !== "object") throw new Error("Candidate and exam context are required.");
  const sessionId = String(context.guest_key || context.candidate_code || "").trim();
  if (sessionId.length < 4) throw new Error("Secure candidate session is missing. Return to the examination entry form.");
  const binding = candidateBinding(context);
  if (context.candidate_binding && context.candidate_binding !== binding) throw new Error("Candidate context changed while Secure Browser verification was being prepared.");
  const keys = loadDeviceKeyPair();
  const publicPem = keys.publicPem || keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const challengeResponse = await fetch(`${DEFAULT_EVALORA_HOST}/api/exam/lockdown/challenge`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam_code: examCode.trim().toUpperCase(), candidate_binding: binding,
      session_id: sessionId, public_key_pem: publicPem, platform: process.platform, app_version: APP_VERSION }),
    signal: AbortSignal.timeout(15000),
  });
  const challengeBody = await challengeResponse.json().catch(() => null);
  if (!challengeResponse.ok || !challengeBody?.challenge_id) throw new Error(challengeBody?.error || "Secure Browser challenge could not be obtained.");
  const unsigned = { ...challengeBody };
  const signature = crypto.sign(null, Buffer.from(challengeMessage(unsigned), "utf8"), keys.privateKey).toString("base64url");
  return { ...unsigned, signature };
}

function registerGlobalShortcuts() {
  ["Alt+F4", "F11", "F12", "CommandOrControl+Shift+I", "CommandOrControl+Shift+J", "CommandOrControl+R", "F5"]
    .forEach((accelerator) => { try { globalShortcut.register(accelerator, () => {}); } catch {} });
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    if (launchTargetUrl) mainWindow.loadURL(launchTargetUrl).catch(() => {});
    return;
  }

  let width = 1280;
  let height = 800;
  try {
    const primary = screen.getPrimaryDisplay();
    if (primary && primary.workAreaSize) {
      width = primary.workAreaSize.width;
      height = primary.workAreaSize.height;
    }
  } catch (e) {
    console.warn("Could not determine primary display size:", e);
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    show: false,
    kiosk: true,
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: "#061A14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      sandbox: true,
    },
  });

  if (typeof mainWindow.setContentProtection === "function") {
    try { mainWindow.setContentProtection(true); } catch {}
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedEVALORAPage(url)) {
      event.preventDefault();
      console.warn("Blocked navigation to untrusted URL:", url);
    }
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error("Secure Browser navigation failed", code, description, url);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Ensure window is shown even if network response is slow
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2000);

  const target = launchTargetUrl || `${DEFAULT_EVALORA_HOST}/exam-access?lockdown=1&secure_browser=1`;
  mainWindow.loadURL(target).catch((err) => {
    console.error("Initial loadURL failed:", err);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  registerGlobalShortcuts();

  try {
    screen.on("display-added", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Display policy",
          message: "A second display was detected. Disconnect it before continuing.",
        });
      }
    });
  } catch {}

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("lockdown:get-attestation", async (event, { examCode, candidateContext }) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !isTrustedEVALORAPage(event.senderFrame?.url || ""))
    throw new Error("Attestation is available only to the active EVALORA exam page.");
  return createAttestation(examCode, candidateContext);
});

ipcMain.handle("lockdown:check-integrity", async () => ({
  secure: screen.getAllDisplays().length === 1,
  display_count: screen.getAllDisplays().length,
  platform: process.platform,
  version: APP_VERSION,
  key_protection: safeStorage.isEncryptionAvailable() ? "os-protected-at-rest" : "unavailable",
}));

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in Secure Browser:", err);
  try {
    dialog.showErrorBox("EVALORA Secure Browser Error", err?.message || String(err));
  } catch {}
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in Secure Browser:", reason);
});

app.whenReady().then(() => {
  parseCommandLineArgs(process.argv);
  createWindow();
});

app.on("will-quit", () => {
  try { globalShortcut.unregisterAll(); } catch {}
});

app.on("window-all-closed", () => {
  app.quit();
});
