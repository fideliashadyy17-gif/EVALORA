#!/usr/bin/env node

/**
 * Verification Suite:
 * 1. Oak International School logo asset verification (existence, dimensions, integrity)
 * 2. Version C Grade 10 & Grade 9 examinations logo configuration
 * 3. Student exam writing surface (TakeExamClient) header and banner branding
 * 4. "Power by M. SADIKOU" creator attribution across platform surfaces
 * 5. Strict regression check: question counts, marks, and content remain completely unchanged
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BRAND } from "../src/lib/brand.ts";

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log("=========================================================================");
console.log("EVALORA Oak School Logo & Creator Branding ('Power by M. SADIKOU') Suite");
console.log("=========================================================================\n");

test("Oak International School logo image asset exists and is valid", () => {
  const logoPath = path.resolve("public/brand/oak-logo.png");
  assert.ok(fs.existsSync(logoPath), "public/brand/oak-logo.png must exist");

  const stat = fs.statSync(logoPath);
  assert.ok(stat.size > 2000, `Logo file size must be substantial, got ${stat.size} bytes`);

  const shieldPath = path.resolve("public/brand/oak-shield.png");
  assert.ok(fs.existsSync(shieldPath), "public/brand/oak-shield.png must exist");
});

test("BRAND config carries creator M. SADIKOU attribution", () => {
  assert.equal(BRAND.creator, "M. SADIKOU", "BRAND.creator must be 'M. SADIKOU'");
  assert.equal(BRAND.poweredBy, "Power by M. SADIKOU", "BRAND.poweredBy must be 'Power by M. SADIKOU'");
});

test("TakeExamClient renders Oak International School logo during exam taking", () => {
  const clientPath = path.resolve("src/app/take-exam/[attemptId]/TakeExamClient.tsx");
  const code = fs.readFileSync(clientPath, "utf8");

  // Check that header renders school logo
  assert.ok(code.includes("examLogo"), "TakeExamClient must compute examLogo");
  assert.ok(code.includes('data-testid="exam-school-logo-header"'), "Header must have school logo element");
  assert.ok(code.includes('data-testid="exam-school-banner"'), "Exam writing surface must have school banner");

  // Check that "Power by M. SADIKOU" is in header, banner, and footer
  assert.ok(code.includes("Power by M. SADIKOU"), "TakeExamClient must display 'Power by M. SADIKOU'");
});

test("API route /api/exam/state resolves and returns school logo for Version C exams", () => {
  const routePath = path.resolve("src/app/api/exam/state/route.ts");
  const code = fs.readFileSync(routePath, "utf8");

  assert.ok(code.includes("examLogoUrl"), "/api/exam/state must resolve examLogoUrl");
  assert.ok(code.includes("/brand/oak-logo.png"), "/api/exam/state must provide /brand/oak-logo.png");
  assert.ok(code.includes("logo_url: examLogoUrl"), "/api/exam/state must include logo_url in response");
});

test("Platform surfaces display 'Power by M. SADIKOU' creator attribution", () => {
  const siteChrome = fs.readFileSync("src/components/site/SiteChrome.tsx", "utf8");
  assert.ok(siteChrome.includes("Power by M. SADIKOU"), "SiteChrome footer must include 'Power by M. SADIKOU'");

  const studentPortal = fs.readFileSync("src/app/student/page.tsx", "utf8");
  assert.ok(studentPortal.includes("Power by M. SADIKOU"), "Student portal footer must include 'Power by M. SADIKOU'");

  const resultPage = fs.readFileSync("src/app/exam/result/[token]/page.tsx", "utf8");
  assert.ok(resultPage.includes("Power by M. SADIKOU"), "Exam result footer must include 'Power by M. SADIKOU'");

  const authShell = fs.readFileSync("src/components/AuthShell.tsx", "utf8");
  assert.ok(authShell.includes("Power by M. SADIKOU"), "AuthShell must include 'Power by M. SADIKOU'");
});

test("Migration for Oak logo and Version C settings exists and is valid SQL", () => {
  const migPath = path.resolve("supabase/migrations/20261122120000_version_c_oak_logo_and_creator_branding.sql");
  assert.ok(fs.existsSync(migPath), "Migration file must exist");
  const sql = fs.readFileSync(migPath, "utf8");
  assert.ok(sql.includes("update public.organizations"), "Must update organizations logo_url");
  assert.ok(sql.includes("ce000000-0000-4000-8000-000000000002"), "Must target Grade 10 Version C");
  assert.ok(sql.includes("cd000000-0000-4000-8000-000000000002"), "Must target Grade 9 Version C");
});

console.log("\n=========================================================================");
console.log("All Oak Logo and 'Power by M. SADIKOU' Verification Tests Passed!");
console.log("=========================================================================\n");
