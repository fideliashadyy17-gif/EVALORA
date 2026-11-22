const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const fixtureHtml = fs.readFileSync(path.join(__dirname, 'fixture.html'));
const challenges = new Map();
const reports = [];
const normalize = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const proofMessage = proof => JSON.stringify([
  'EVALORA-LOCKDOWN-ATTESTATION-V2', proof.challenge_id, proof.nonce, proof.expires_at,
  normalize(proof.exam_code), proof.candidate_binding, proof.session_id, proof.platform, proof.app_version,
]);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/exam-access') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(fixtureHtml);
  }
  if (req.method === 'POST' && url.pathname === '/api/exam/lockdown/challenge') {
    const body = await jsonBody(req);
    const challenge = {
      challenge_id: crypto.randomUUID(), nonce: crypto.randomBytes(32).toString('base64url'),
      expires_at: new Date(Date.now() + 120_000).toISOString(), exam_code: normalize(body.exam_code),
      candidate_binding: body.candidate_binding, session_id: body.session_id,
      platform: body.platform, app_version: body.app_version, public_key_pem: body.public_key_pem,
      consumed: false,
    };
    challenges.set(challenge.challenge_id, challenge);
    const { public_key_pem, consumed, ...response } = challenge;
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(response));
  }
  if (req.method === 'POST' && url.pathname === '/report') {
    const body = await jsonBody(req);
    const proof = body.proof;
    const challenge = challenges.get(proof?.challenge_id);
    let signatureValid = false;
    try {
      signatureValid = Boolean(challenge && !challenge.consumed && Date.parse(challenge.expires_at) > Date.now() &&
        proof.nonce === challenge.nonce && proof.expires_at === challenge.expires_at &&
        proof.exam_code === challenge.exam_code && proof.candidate_binding === challenge.candidate_binding &&
        proof.session_id === challenge.session_id && proof.platform === challenge.platform &&
        proof.app_version === challenge.app_version &&
        crypto.verify(null, Buffer.from(proofMessage(proof)), crypto.createPublicKey(challenge.public_key_pem),
          Buffer.from(proof.signature, 'base64url')));
    } catch { signatureValid = false; }
    if (signatureValid) challenge.consumed = true;
    let replayAccepted = false;
    try {
      replayAccepted = Boolean(challenge && !challenge.consumed && crypto.verify(null, Buffer.from(proofMessage(proof)),
        crypto.createPublicKey(challenge.public_key_pem), Buffer.from(proof.signature, 'base64url')));
    } catch { replayAccepted = false; }
    const outcome = {
      ok: signatureValid && !replayAccepted && body.integrity?.key_protection === 'os-protected-at-rest',
      signature_valid: signatureValid, replay_rejected: !replayAccepted,
      integrity: body.integrity, app_version: proof?.app_version,
      exam_bound: proof?.exam_code === 'FIXTURE-EXAM',
      candidate_bound: proof?.candidate_binding === challenge?.candidate_binding,
      session_bound: proof?.session_id === challenge?.session_id,
    };
    reports.push(outcome);
    res.writeHead(outcome.ok ? 200 : 400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(outcome));
  }
  res.writeHead(404).end('not found');
});

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}
function findInstalledExe() {
  const installRoot = path.join(process.env.LOCALAPPDATA || '', 'Programs');
  return walk(installRoot).find(file => path.basename(file) === 'EVALORA Secure Exam Browser.exe');
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full)); else result.push(full);
  }
  return result;
}

(async () => {
  let app;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3000, '127.0.0.1', resolve); });
    const exe = findInstalledExe();
    if (!exe) throw new Error('Installed Electron executable not found under %LOCALAPPDATA%\\Programs');
    app = spawn(exe, [], { env: { ...process.env, EVALORA_HOST: 'http://127.0.0.1:3000' }, windowsHide: false, stdio: 'ignore' });
    const outcome = await new Promise((resolve, reject) => {
      let check;
      const timeout = setTimeout(() => { clearInterval(check); reject(new Error('Installed Secure Browser fixture timed out')); }, 60_000);
      app.once('error', error => { clearTimeout(timeout); clearInterval(check); reject(error); });
      check = setInterval(() => {
        if (!reports.length) return;
        clearTimeout(timeout); clearInterval(check);
        const value = reports[0];
        if (!value.ok || !value.signature_valid || !value.replay_rejected ||
            !value.exam_bound || !value.candidate_bound || !value.session_bound ||
            value.app_version !== require(path.join(root, 'package.json')).version) {
          reject(new Error(`Packaged app verification failed: ${JSON.stringify(value)}`));
        } else resolve(value);
      }, 100);
    });
    console.log(`PASS: installed Windows Electron app launched; preload bridge, OS-protected key, Ed25519 proof, exam/candidate/session binding and one-use replay rejection verified (${outcome.app_version}).`);
  } finally {
    if (app && !app.killed) app.kill();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
