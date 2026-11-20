-- Safe Examination Lifecycle, Deletion Safeguards & Optional Lockdown Environment Migration

-- 1. Examination soft-delete / archival support
ALTER TABLE exams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_exams_deleted_at ON exams(deleted_at);

-- 2. Candidate attempt lockdown verification tracking
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS lockdown_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS lockdown_platform TEXT DEFAULT NULL;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS lockdown_app_version TEXT DEFAULT NULL;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS lockdown_verified_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_lockdown_verified ON exam_attempts(lockdown_verified);

COMMENT ON COLUMN exams.deleted_at IS 'Timestamp when the exam was soft-deleted or archived. Null for active exams.';
COMMENT ON COLUMN exams.deleted_by IS 'Profile ID of the administrator who deleted or archived the exam.';
COMMENT ON COLUMN exams.deletion_reason IS 'Administrative note or reason provided upon exam deletion/archival.';
COMMENT ON COLUMN exam_attempts.lockdown_verified IS 'Whether this attempt was entered and verified through the EVALORA Secure Exam Application.';
COMMENT ON COLUMN exam_attempts.lockdown_platform IS 'Operating system platform reported by verified lockdown client (e.g. win32, darwin, linux).';
COMMENT ON COLUMN exam_attempts.lockdown_app_version IS 'Version of the EVALORA Secure Exam Application used for this attempt.';
COMMENT ON COLUMN exam_attempts.lockdown_verified_at IS 'Timestamp of the verified lockdown handshake.';
