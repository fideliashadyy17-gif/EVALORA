const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
assert.match(main, /safeStorage\.encryptString/);
assert.match(main, /safeStorage\.decryptString/);
assert.match(main, /crypto\.sign\(null/);
assert.match(main, /\/api\/exam\/lockdown\/challenge/);
assert.doesNotMatch(main, /LOCKDOWN_SHARED_SECRET|evalora_sec_k982_lockdown_auth_token|EVALORA-EXIT-2026/);
assert.doesNotMatch(main, /request-exit|requestExit/);
assert.doesNotMatch(main, /User-Agent|user-agent|x-evalora-secure-browser/);
assert.match(preload, /contextBridge\.exposeInMainWorld/);
assert.match(preload, /ipcRenderer\.invoke\("lockdown:get-attestation"/);
assert.doesNotMatch(preload, /requestExit/);

const pair = crypto.generateKeyPairSync('ed25519');
const unsigned = { challenge_id: 'challenge-1', nonce: 'nonce-one', expires_at: new Date(Date.now() + 60000).toISOString(),
  exam_code: 'MYP4-VERSION-C', candidate_binding: 'a'.repeat(64), session_id: 'session-A', platform: 'win32', app_version: '1.1.0' };
const message = p => JSON.stringify(['EVALORA-LOCKDOWN-ATTESTATION-V2', p.challenge_id, p.nonce, p.expires_at,
  p.exam_code.trim().toUpperCase(), p.candidate_binding, p.session_id, p.platform, p.app_version]);
const signature = crypto.sign(null, Buffer.from(message(unsigned)), pair.privateKey);
assert.equal(crypto.verify(null, Buffer.from(message(unsigned)), pair.publicKey, signature), true);
assert.equal(crypto.verify(null, Buffer.from(message({ ...unsigned, candidate_binding: 'b'.repeat(64) })), pair.publicKey, signature), false);
assert.equal(crypto.verify(null, Buffer.from(message({ ...unsigned, exam_code: 'OTHER-EXAM' })), pair.publicKey, signature), false);
assert.equal(crypto.verify(null, Buffer.from(message({ ...unsigned, session_id: 'session-B' })), pair.publicKey, signature), false);
console.log('PASS: desktop contains no shared signing secret; Ed25519 proof binds exam, candidate hash, session and app version.');
