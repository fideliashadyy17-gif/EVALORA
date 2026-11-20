const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__EVALORA_SECURE_LOCKDOWN__", Object.freeze({
  isSecureEnvironment: true,
  appVersion: "1.1.0",
  platform: process.platform,
  getAttestation: (examCode, candidateContext) => ipcRenderer.invoke("lockdown:get-attestation", { examCode, candidateContext }),
  checkIntegrity: () => ipcRenderer.invoke("lockdown:check-integrity"),
}));
