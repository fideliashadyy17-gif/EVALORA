import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261123174539_enforce_class_student_plan_quotas.sql', 'utf8');
const prior = readFileSync('supabase/migrations/0037_plan_limit_enforcement.sql', 'utf8');
const classes = readFileSync('src/app/dashboard/academics/actions.ts', 'utf8');
const students = readFileSync('src/app/dashboard/students/actions.ts', 'utf8');
const studentImport = readFileSync('src/app/api/students/import/route.ts', 'utf8');
const staffAccounts = readFileSync('src/app/dashboard/accounts/actions.ts', 'utf8');
let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`  ✓ ${name}`);
}

check('the quota guard serializes same-tenant writes on the organization row', () => {
  assert.match(migration, /from public\.organizations where id = v_org for update/i);
  assert.match(migration, /perform 1 from public\.organizations/i);
});
check('classes are enforced against the max_classes entitlement', () => {
  assert.match(migration, /plan_quota_classes[\s\S]*?public\.classes[\s\S]*?\('classes', 'max_classes', 'classes'\)/i);
});
check('student records are enforced against the max_students entitlement', () => {
  assert.match(migration, /plan_quota_students[\s\S]*?public\.students[\s\S]*?\('students', 'max_students', 'students'\)/i);
});
check('the server-side quota trigger retains its service-role and Platform Owner bypasses', () => {
  assert.match(migration, /auth\.uid\(\) is null or public\.is_super_admin\(\)/i);
  assert.match(migration, /security definer set search_path = public/i);
});
check('class registration, student registration, and CSV import surface friendly quota errors', () => {
  assert.match(classes, /isPlanLimitError\(error\)[\s\S]*?planLimitMessage\(error\)/);
  assert.match(students, /isPlanLimitError\(error\)[\s\S]*?planLimitMessage\(error\)/);
  assert.match(studentImport, /isPlanLimitError\(error\)[\s\S]*?planLimitMessage\(error\)/);
});
check('organization staff membership writes use authenticated RLS instead of bypassing quotas with service role', () => {
  assert.match(staffAccounts, /supabase\.from\("organization_members"\)\.insert/);
  assert.match(staffAccounts, /isPlanLimitError\(memberError\)/);
  assert.match(staffAccounts, /if \(createdAuthUser\) await admin\.auth\.admin\.deleteUser/);
});
check('the new enforcement complements existing exam, quiz, question, and membership triggers', () => {
  for (const trigger of ['plan_quota_exams', 'plan_quota_quizzes', 'plan_quota_questions', 'plan_quota_members']) {
    assert.ok(prior.includes(trigger), `missing existing trigger ${trigger}`);
  }
});

console.log(`\n${checks} school quota enforcement checks passed`);
