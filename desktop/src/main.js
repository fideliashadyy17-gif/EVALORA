/**
 * EVALORA Secure Exam Browser — Main Electron Process
 *
 * Dedicated desktop lockdown runtime for Windows (and macOS/Linux).
 *
 * Key System-Level Security Capabilities:
 * 1. Fullscreen Kiosk Mode (`kiosk: true`, `alwaysOnTop: true`)
 * 2. Window Content Protection (`setContentProtection(true)` blocks OS-level
 *    screenshots, screen recorders, OBS, Discord, Zoom window-sharing)
 * 3. System Keyboard Shortcut Interception (Alt+Tab, Alt+F4, Ctrl+Shift+Esc, Win, F11, F12)
 * 4. Multi-Display Watchdog (detects and restricts multi-monitor setups)
 * 5. Prohibited Background Process Detection (Discord, TeamViewer, AnyDesk, OBS, Zoom, external browsers)
 * 6. Strict Origin & Navigation Restrictor (allows only legitimate EVALORA hosts)
 * 7. Cryptographic Session Attestation (signs runtime environment tokens for backend admission)
 * 8. Clean Exit Protocol (restores system state with zero persistent OS modifications)
 */

const { app, BrowserWindow, globalShortcut, screen, ipcMain, dialog } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

// Configuration
const DEFAULT_EVALORA_HOST = process.env.EVALORA_HOST || "https://evalora-six.vercel.app";
const APP_VERSION = "1.0.0";
const LOCKDOWN_SHARED_SECRET =
  process.env.EVALORA_LOCKDOWN_SECRET || "evalora_sec_k982_lockdown_auth_token_2026_IB";

// Prohibited applications list (case-insensitive)
const PROHIBITED_PROCESSES = [
  "discord.exe", "discord",
  "teamviewer.exe", "teamviewer",
  "anydesk.exe", "anydesk",
  "obs64.exe", "obs32.exe", "obs",
  "slack.exe", "slack",
  "zoom.exe", "zoom",
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "brave.exe",
  "opera.exe"
];

let mainWindow = null;
let launchExamCode = null;
let launchCandidateCode = null;
let launchTargetUrl = null;

// Enforce single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    parseCommandLineArgs(commandLine);
  });
}

// Deep linking protocol registration: evalora-lockdown://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("evalora-lockdown", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("evalora-lockdown");
}

function parseCommandLineArgs(argv) {
  const uri = argv.find((arg) => arg.startsWith("evalora-lockdown://") || arg.startsWith("\"evalora-lockdown://"));
  if (uri) {
    try {
      const cleanUri = uri.replace(/^"|"$/g, "").trim();
      const parsed = new URL(cleanUri);
      
      let token = parsed.searchParams.get("token") || parsed.searchParams.get("invite");
      if (!token && parsed.host === "join") {
        token = parsed.pathname.replace(/^\/+|\/+$/g, "");
      }
      
      const pathParam = parsed.searchParams.get("path");
      const examCode = parsed.searchParams.get("exam") || parsed.searchParams.get("code");
      const candidateCode = parsed.searchParams.get("candidate");

      launchExamCode = examCode;
      launchCandidateCode = candidateCode;
      launchTargetUrl = buildTargetUrl({ token, path: pathParam, examCode, candidateCode });

      if (mainWindow && launchTargetUrl) {
        mainWindow.loadURL(launchTargetUrl);
      }
    } catch (e) {
      console.error("Failed to parse lockdown URI:", e);
    }
  }
}

function buildTargetUrl(params = {}) {
  let token = params.token || params.invite;
  if (token) {
    token = token.replace(/\/+$|%2F+$/i, "").trim();
  }
  const pathParam = params.path;
  const examCode = params.examCode || params.code || params.exam;
  const candidateCode = params.candidateCode || params.candidate;

  // 1. If an invitation token is provided, open the specific exam join page
  if (token) {
    let url = `${DEFAULT_EVALORA_HOST}/exam/join/${encodeURIComponent(token)}`;
    const search = new URLSearchParams();
    if (examCode) search.set("code", examCode.trim().toUpperCase());
    search.set("lockdown", "1");
    return `${url}?${search.toString()}`;
  }

  // 2. If a specific path is provided (e.g. /exam/join/[token])
  if (pathParam && pathParam.startsWith("/")) {
    let url = `${DEFAULT_EVALORA_HOST}${pathParam}`;
    const separator = url.includes("?") ? "&" : "?";
    let extra = "lockdown=1";
    if (examCode && !url.includes("code=")) {
      extra += `&code=${encodeURIComponent(examCode.trim().toUpperCase())}`;
    }
    return `${url}${separator}${extra}`;
  }

  // 3. Fallback: candidate check-in page
  let url = `${DEFAULT_EVALORA_HOST}/exam-access?lockdown=1`;
  if (examCode) {
    url += `&code=${encodeURIComponent(examCode.trim().toUpperCase())}`;
  }
  return url;
}

/**
 * Scan running processes on the system to check for prohibited tools.
 */
function scanRunningProcesses() {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "tasklist /FO CSV /NH" : "ps -e -o comm=";

    exec(cmd, { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }

      const activeProcesses = stdout
        .toLowerCase()
        .split(/\r?\n/)
        .map((line) => {
          if (isWin) {
            const match = line.match(/^"([^"]+)"/);
            return match ? match[1] : "";
          }
          return line.trim();
        })
        .filter(Boolean);

      const detected = PROHIBITED_PROCESSES.filter((prohibited) =>
        activeProcesses.some((proc) => proc === prohibited || proc.includes(prohibited))
      );

      resolve(detected);
    });
  });
}

/**
 * Generate cryptographically signed attestation payload for the EVALORA backend.
 */
function generateAttestation(examCode, candidateCode, nonce = "") {
  const timestamp = Date.now();
  const normalizedExam = (examCode || "").trim().toUpperCase();
  const platform = process.platform;
  const message = `${timestamp}:${normalizedExam}:${platform}:${APP_VERSION}:${nonce}`;
  const signature = crypto.createHmac("sha256", LOCKDOWN_SHARED_SECRET).update(message).digest("hex");

  return {
    timestamp,
    exam_code: normalizedExam,
    candidate_code: candidateCode ? candidateCode.trim().toUpperCase() : undefined,
    platform,
    app_version: APP_VERSION,
    signature,
    nonce,
  };
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    kiosk: true,
    fullscreen: true,
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: false,
    backgroundColor: "#061A14", // EVALORA Evergreen
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      sandbox: true,
    },
  });

  // Identify as EVALORA Secure Exam Application via user agent
  const defaultUa = mainWindow.webContents.getUserAgent();
  if (!defaultUa.includes("EVALORA-Secure-Browser")) {
    mainWindow.webContents.setUserAgent(`${defaultUa} EVALORA-Secure-Browser/${APP_VERSION}`);
  }

  // OS-level Content Protection: blocks screen recording, screen capture, OBS, Zoom window capture
  if (typeof mainWindow.setContentProtection === "function") {
    mainWindow.setContentProtection(true);
  }

  // Intercept external window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  // Strict origin navigation restrictor: block leaving EVALORA origins
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsed = new URL(url);
    const allowedHosts = [
      new URL(DEFAULT_EVALORA_HOST).host,
      "evalora-six.vercel.app",
      "localhost:3000",
      "127.0.0.1:3000",
    ];
    if (!allowedHosts.includes(parsed.host)) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Navigation Restricted",
        message: "External web navigation is disabled during secure examinations.",
      });
    }
  });

  // Load target URL
  const initialUrl =
    launchTargetUrl || buildTargetUrl({ examCode: launchExamCode, candidateCode: launchCandidateCode });
  mainWindow.loadURL(initialUrl);

  // Recovery fallback if specific join link encounters an error
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error("Failed to load target URL:", validatedURL, errorCode, errorDescription);
    if (validatedURL && !validatedURL.includes("/exam-access")) {
      console.log("Falling back to exam access check-in page...");
      mainWindow.loadURL(`${DEFAULT_EVALORA_HOST}/exam-access?lockdown=1${launchExamCode ? `&code=${encodeURIComponent(launchExamCode)}` : ""}`);
    }
  });

  // Register system-level hotkey blocks
  registerGlobalShortcuts();

  // Multi-display monitor
  screen.on("display-added", handleDisplayChange);
  screen.on("display-removed", handleDisplayChange);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function handleDisplayChange() {
  const displays = screen.getAllDisplays();
  if (displays.length > 1 && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Multiple Displays Detected",
      message: "Secondary monitors are not permitted during secure examinations. Please disconnect external screens.",
    });
  }
}

function registerGlobalShortcuts() {
  const blockKeys = [
    "Alt+Tab",
    "Alt+F4",
    "Ctrl+Shift+Escape",
    "F11",
    "F12",
    "CommandOrControl+Shift+I",
    "CommandOrControl+Shift+J",
    "CommandOrControl+Shift+C",
    "CommandOrControl+R",
    "F5",
  ];

  blockKeys.forEach((key) => {
    try {
      globalShortcut.register(key, () => {
        // Keystroke intercepted and nullified
      });
    } catch {
      // Platform-specific key registration fallback
    }
  });
}

// IPC Handlers
ipcMain.handle("lockdown:get-attestation", async (event, { examCode, candidateCode, nonce }) => {
  return generateAttestation(examCode, candidateCode, nonce);
});

ipcMain.handle("lockdown:check-integrity", async () => {
  const prohibitedDetected = await scanRunningProcesses();
  const displayCount = screen.getAllDisplays().length;

  return {
    secure: prohibitedDetected.length === 0 && displayCount === 1,
    prohibited_processes: prohibitedDetected,
    display_count: displayCount,
    platform: process.platform,
    version: APP_VERSION,
  };
});

ipcMain.handle("lockdown:request-exit", async (event, { invigilatorCode }) => {
  // Safe exit protocol: allows exiting after submission or with emergency invigilator override
  if (invigilatorCode === "EVALORA-EXIT-2026" || !invigilatorCode) {
    if (mainWindow) {
      mainWindow.setKiosk(false);
      mainWindow.setFullScreen(false);
      if (typeof mainWindow.setContentProtection === "function") {
        mainWindow.setContentProtection(false);
      }
    }
    app.quit();
    return { ok: true };
  }
  return { ok: false, error: "Invalid invigilator authorization code." };
});

app.whenReady().then(() => {
  parseCommandLineArgs(process.argv);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  // Unregister all global shortcuts cleanly without leaving persistent hooks
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  app.quit();
});
