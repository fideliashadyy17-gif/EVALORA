/**
 * Public entrypoint for candidate examination browser-session lifecycle &
 * shared-device isolation helpers. Implemented in `./examSaveQueue` so the
 * save queue and session lifecycle remain a single zero-import unit for both
 * Next.js bundles and standalone Node test harnesses.
 */
export {
  ACTIVE_CANDIDATE_SESSION_KEY,
  attemptStorageKey,
  canonicalIdentityFingerprint,
  closedAttemptKey,
  ensureBrowserGuestKey,
  finalizeSubmittedAttemptSession,
  guestKeyStorageKey,
  messageOutboxKey,
  pendingQueueKey,
  readActiveCandidatePointer,
  readCandidateAttemptSession,
  readClosedAttemptMarker,
  saveCandidateAttemptSession,
  type ActiveCandidatePointer,
  type CandidateAttemptStatus,
  type ClosedAttemptMarker,
  type SimpleStorage,
  type StoredAttemptSession,
} from "@/lib/examSaveQueue";
