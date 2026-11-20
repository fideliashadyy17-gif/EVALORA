/**
 * EVALORA Secure Exam Browser — Preload Script
 *
 * Exposes a minimal, hardened, context-isolated API to the student exam runner.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__EVALORA_SECURE_LOCKDOWN__", {
  isSecureEnvironment: true,
  appVersion: "1.0.0",
  platform: process.platform,

  getAttestation: async (examCode, candidateCode, nonce) => {
    return ipcRenderer.invoke("lockdown:get-attestation", { examCode, candidateCode, nonce });
  },

  checkIntegrity: async () => {
    return ipcRenderer.invoke("lockdown:check-integrity");
  },

  requestExit: async (invigilatorCode) => {
    return ipcRenderer.invoke("lockdown:request-exit", { invigilatorCode });
  },
});
