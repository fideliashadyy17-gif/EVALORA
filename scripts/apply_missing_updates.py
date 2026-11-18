#!/usr/bin/env python3
"""Apply structured_marks updates for the missing questions."""

import json
import sys

sys.path.insert(0, '/home/user/EVALORA/scripts')
from all_questions_data import QUESTIONS
from generate_structured_marks_dq import generate_structured_marks

MISSING_IDS = [
    '397f4622-d9b6-4dba-8baf-124760630d57',
    '3a5acc2d-e9a1-420b-94de-d97cec1b7eb2',
    'aef82709-65c6-4655-9fea-25894ca34ecb',
    'af8e433c-90a7-451e-a5a8-d56463ade972',
    'afd97018-2961-4816-a1b0-a0888a3391a9',
    'b0ee27ad-a0ce-447e-bc05-544d189372bd',
    'b2000000-0000-4000-8000-000000000125',
    'b4000000-0000-4000-8000-000000000102',
    'b997b41e-92a5-4ef9-8bef-6e8e5faa1a38',
    'b9db7b1b-e1b5-4f65-a79f-186188fb2386',
    'bfc551f2-7d3a-486e-a8d2-1634e0d0b92d',
    'bff667e9-d6cc-423c-b494-a1239b0f7ee4',
    'c0700000-0000-4000-8000-000000001042',
    'c0700000-0000-4000-8000-000000001043',
    'c0700000-0000-4000-8000-000000001044',
    'c0700000-0000-4000-8000-000000001045',
    'c0800000-0000-4000-8000-000000001015',
    'c0800000-0000-4000-8000-000000001026',
    'c0800000-0000-4000-8000-000000001027',
    'c0800000-0000-4000-8000-000000001028',
    'c0800000-0000-4000-8000-000000001029',
    'c0800000-0000-4000-8000-000000001030',
    'c0800000-0000-4000-8000-000000001031',
    'c0800000-0000-4000-8000-000000001032',
    'c0800000-0000-4000-8000-000000001033',
    'c0800000-0000-4000-8000-000000001034',
    'c0800000-0000-4000-8000-000000001035',
    'c0800000-0000-4000-8000-000000001036',
    'c0800000-0000-4000-8000-000000001037',
    'c0800000-0000-4000-8000-000000001038',
    'c0800000-0000-4000-8000-000000001039',
    'c0800000-0000-4000-8000-000000001040',
    'c0800000-0000-4000-8000-000000001041',
    'c0800000-0000-4000-8000-000000001042',
    'c0800000-0000-4000-8000-000000001043',
    'c0800000-0000-4000-8000-000000001044',
    'c0800000-0000-4000-8000-000000001045',
    'c0900000-0000-4000-8000-000000001026',
    'c0900000-0000-4000-8000-000000001027',
    'c0900000-0000-4000-8000-000000001028',
    'c0900000-0000-4000-8000-000000001029',
    'c0900000-0000-4000-8000-000000001030',
    'c0900000-0000-4000-8000-000000001031',
    'c0900000-0000-4000-8000-000000001032',
    'c0900000-0000-4000-8000-000000001033',
    'c0900000-0000-4000-8000-000000001034',
    'c0900000-0000-4000-8000-000000001035',
    'c0900000-0000-4000-8000-000000001036',
    'c0900000-0000-4000-8000-000000001037',
    'c0900000-0000-4000-8000-000000001038',
    'c0900000-0000-4000-8000-000000001039',
    'c0900000-0000-4000-8000-000000001040',
    'c0900000-0000-4000-8000-000000001041',
]

print(f"Missing IDs: {len(MISSING_IDS)}")

missing_dict = {q[0]: q for q in QUESTIONS}
sql_updates = []
for qid in MISSING_IDS:
    if qid not in missing_dict:
        print(f"WARNING: {qid} not found in QUESTIONS data")
        continue
    qid_val, prompt, ms, mc, printed_marks, points = missing_dict[qid]
    rules = generate_structured_marks(qid_val, prompt, ms, mc, printed_marks, points)
    if not rules:
        print(f"WARNING: No rules for {qid_val}")
        continue
    marks_json = json.dumps(rules, ensure_ascii=False)
    # Use .format() to avoid f-string issues with $$
    sql = ("UPDATE public.questions SET config = jsonb_set(config, "
           "'{{structured_marks}}', $${marks_json}$$::jsonb) "
           "WHERE id = $${qid}$$;").format(marks_json=marks_json, qid=qid_val)
    sql_updates.append(sql)

print(f"Generated {len(sql_updates)} SQL updates")

# Verify first SQL looks correct
if sql_updates:
    print(f"\nFirst SQL preview: {sql_updates[0][:150]}...")

# Save to file
with open('/home/user/EVALORA/scripts/missing_updates.sql', 'w') as f:
    f.write("-- Missing structured_marks updates\n\n")
    for sql in sql_updates:
        f.write(sql + "\n")

print("Saved to scripts/missing_updates.sql")

# Split into 2 batches
batch_size = 30
batches = [sql_updates[i:i+batch_size] for i in range(0, len(sql_updates), batch_size)]
for i, batch in enumerate(batches):
    with open(f'/home/user/EVALORA/scripts/batches_missing/batch_{i:03d}.sql', 'w') as f:
        f.write('\n'.join(batch) + '\n')
    print(f"batch_{i:03d}.sql: {len(batch)} updates")

print("Done.")