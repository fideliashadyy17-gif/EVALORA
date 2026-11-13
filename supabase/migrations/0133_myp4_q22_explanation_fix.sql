-- Fix a factual arithmetic slip in the stored explanation of MYP4 Q22
-- (question e4000000-0000-4000-8000-000000000122, quiz e4000000-0000-4000-8000-000000000001).
-- The printed paper has no answer key; this explanation is the marking guidance,
-- and it contained "30 + 2.27 ≈ 31.8 cm" (2.27 + 30 = 32.27, not 31.8).
-- The replacement below is internally consistent: the standard grouped-data
-- median (n ÷ 2 = 15) gives 30 + (15 − 13) ÷ 11 × 10 ≈ 31.8 cm.
-- Idempotent: re-running restores the same text. Aborts unless exactly one row
-- is affected.

begin;

do $$
declare
  touched int;
begin
  update questions
     set explanation = $expl$n = 30. Using the grouped-data median convention n ÷ 2 = 15: the 15th value sits in the 30 ≤ L < 40 class (cumulative frequency before it is 13), so estimated median = 30 + (15 − 13) ÷ 11 × 10 ≈ 30 + 1.8 ≈ 31.8 cm. (If you instead interpolate at the half-way position 15.5, you get 30 + (15.5 − 13) ÷ 11 × 10 ≈ 32.3 cm — both read-offs round to the printed answer.)

Answer: D$expl$,
         updated_at = now()
   where id = 'e4000000-0000-4000-8000-000000000122';

  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception 'expected exactly 1 row updated for MYP4 Q22, got %', touched;
  end if;

  if not exists (
    select 1 from questions
     where id = 'e4000000-0000-4000-8000-000000000122'
       and explanation like '%≈ 30 + 1.8 ≈ 31.8 cm%'
  ) then
    raise exception 'MYP4 Q22 explanation was not updated as expected';
  end if;
end
$$;

commit;
