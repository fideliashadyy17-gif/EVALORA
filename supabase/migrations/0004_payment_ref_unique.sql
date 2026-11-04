-- EVALORA 0004: database-level duplicate payment protection.
--
-- QA finding (Owner Control Center battery): the duplicate transaction_ref
-- guard existed only in application code (a pre-check in createManualPayment),
-- so a racing or bypassing write could record the same bank/mobile reference
-- twice for one organization. This partial unique index enforces exactly the
-- app semantics at the database level: one live payment per
-- (organization_id, transaction_ref); rejected/cancelled records do not block
-- a corrected resubmission with the same reference.

create unique index if not exists payment_requests_org_ref_unique
  on public.payment_requests (organization_id, transaction_ref)
  where status not in ('rejected', 'cancelled');

comment on index public.payment_requests_org_ref_unique is
  'Prevents duplicate financial operations: one live payment per org + transaction_ref (rejected/cancelled excluded so corrected resubmissions are allowed).';
