// Narrow compatibility shims for legacy unit tests that compile server modules
// directly and mock their original dependencies. New workflow tests exercise the
// real publication helpers separately; these shims keep older tests focused on
// their existing boundaries.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const isCompiledTest = String(parent?.filename ?? '').includes('/scripts/__');
  if (isCompiledTest && request === '@/lib/supabase/client') {
    return { createClient: () => ({ channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }) }) };
  }
  if (isCompiledTest && (request === '@/lib/resultPublication' || request === './resultPublication')) {
    return {
      resultPublicationMode: (mode) => mode === 'automatic' ? 'automatic' : 'manual',
      examResultChannelName: (id, token) => `exam-result:${id}:${token}`,
      hasAnswerContent: (answer) => Boolean(answer && typeof answer === 'object' && !Array.isArray(answer) && Object.values(answer).some((value) => typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined)),
      isAutoGradableQuestion: (type) => ['single_choice', 'multiple_choice', 'true_false', 'matching', 'ordering'].includes(type),
      broadcastExamManualPublication: async () => undefined,
      publishAutomaticExamAttempt: async () => false,
      recordExamResultEvent: async () => undefined,
      isExamResultPublished: (attempt, exam) => Boolean(attempt?.published_at || exam?.settings?.results_published),
      publishExamResults: async () => ({ ok: true }),
    };
  }
  if (isCompiledTest && request === '@/lib/exam') {
    return {
      attemptRows: async () => [],
      gradeAttempt: async () => ({ score: 0, max: 0, pendingManualCount: 0, gradingStatus: 'graded' }),
      attemptDeadline: (_exam, startedAt) => new Date(new Date(startedAt ?? Date.now()).getTime() + 3600000),
      loadAttemptContext: async () => null,
    };
  }
  if (isCompiledTest && request === '@/lib/liveResults') {
    return {
      recordLiveResultEvent: async () => undefined,
      publishFinishedLiveParticipant: async () => undefined,
      finalizeLiveSessionResults: async () => ({ ok: true }),
      setLiveSessionResultsPublished: async () => ({ ok: true }),
      liveResultChannelName: (id, token) => `live-result:${id}:${token}`,
    };
  }
  if (isCompiledTest && request === '@/lib/examSubmission') {
    return {
      submitAndGradeExamAttempt: async (input) => {
        const helpers = parent.require('@/lib/exam');
        const rows = await helpers.attemptRows(input.admin, input.exam, input.attempt);
        const grade = await helpers.gradeAttempt(rows);
        const patch = {
          status: input.finalStatus,
          submitted_at: input.submittedAt instanceof Date ? input.submittedAt.toISOString() : input.submittedAt,
          submission_reason: input.reason,
          grading_status: 'graded',
          score: grade.score,
          max_score: grade.max,
          pending_manual_count: 0,
        };
        const { data, error } = await input.admin.from('exam_attempts').update(patch)
          .eq('id', input.attempt.id).select('*').maybeSingle();
        if (error || !data) throw new Error('mock submission write failed');
        if (input.candidateId) {
          const candidate = await input.admin.from('exam_candidates').update({ status: 'submitted', submitted_at: patch.submitted_at }).eq('id', input.candidateId);
          if (candidate?.error) throw new Error('mock candidate write failed');
        }
        return { status: input.finalStatus, gradingStatus: 'graded', pendingManualCount: 0, published: false, score: grade.score, maxScore: grade.max };
      },
    };
  }
  return originalLoad.apply(this, arguments);
};
