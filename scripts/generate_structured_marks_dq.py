#!/usr/bin/env python3
"""
Generate structured_marks SQL updates using PostgreSQL dollar-quoting ($$...$$)
to avoid single-quote escaping issues when passing through Supabase connector.
"""

import json
import re
import sys

sys.path.insert(0, '/home/user/EVALORA/scripts')
from all_questions_data import QUESTIONS

def norm(s):
    return s.strip().lower().replace('\u2026', '').replace('...', '').strip()

def extract_mark_allocations(text):
    allocations = []
    for match in re.finditer(r'(\d+(?:\.\d+)?)\s*m\s*for\s*([^;.]+)', text, re.IGNORECASE):
        marks = float(match.group(1))
        desc = match.group(2).strip().rstrip('.')
        allocations.append((marks, desc))
    if not allocations:
        for match in re.finditer(r'(\d+(?:\.\d+)?)\s*m', text, re.IGNORECASE):
            marks = float(match.group(1))
            allocations.append((marks, "Written answer"))
    return allocations

def make_text_rule(rule_id, label, points, keyword_groups, accepted_answers=None, min_groups=None):
    if min_groups is None:
        min_groups = len(keyword_groups)
    expected = {
        "keyword_groups": keyword_groups,
        "min_keyword_groups": min_groups,
    }
    if accepted_answers:
        expected["accepted_answers"] = accepted_answers
    return {
        "id": rule_id,
        "mode": "keyword_match",
        "tool": "text",
        "points": round(points + 1e-9, 2),
        "expected": expected
    }

def generate_structured_marks(qid, prompt, ms, mc, printed_marks, points):
    rules = []
    total_points = float(points) if points else (float(printed_marks) if printed_marks else 0)
    if total_points == 0:
        return rules
    
    text = mc or ms or ""
    
    if not text:
        return [make_text_rule("text-answer", "Written answer", total_points,
            [[prompt.lower()[:30]]], [prompt.lower()[:50]], 1)]
    
    if text.strip().startswith("Answer:"):
        answer_part = text[len("Answer:"):].split(".")[0]
        answer_items = re.findall(r'(\d+)\s*=\s*([^,.]+)', answer_part)
        if answer_items:
            for i, (num, ans) in enumerate(answer_items):
                ans_clean = norm(ans)
                rules.append(make_text_rule(f"ans-{i+1}", f"Answer {num}", total_points / len(answer_items),
                    [[ans_clean]], [ans_clean], 1))
            return rules
    
    allocations = extract_mark_allocations(text)
    if allocations and len(allocations) > 1:
        total_alloc = sum(a[0] for a in allocations)
        scale = total_points / total_alloc if total_alloc > 0 else 1
        for i, (marks, desc) in enumerate(allocations):
            scaled_points = round(marks * scale + 1e-9, 2)
            terms = re.findall(r'\(([^)]+)\)|([A-Z][a-z]+|\d+)', desc)
            term_list = []
            for t in terms:
                term = t[0] or t[1]
                if term:
                    term_list.append(norm(term))
            if not term_list:
                term_list = [norm(desc[:30])]
            rules.append(make_text_rule(f"part-{i+1}", desc[:100], scaled_points,
                [term_list], [norm(desc[:100])], 1))
        return rules
    
    mark_match = re.match(r'(\d+(?:\.\d+)?)\s*marks?\.?\s*(.+)', text, re.IGNORECASE)
    if mark_match:
        marks_val = round(float(mark_match.group(1)) + 1e-9, 2)
        desc = mark_match.group(2).strip()
        formula_match = re.search(r'(u_n\s*=|a_n\s*=|S_n\s*=|T_n\s*=|V_n\s*=|a\s*=|r\s*=|d\s*=)[^.,]+', desc)
        if formula_match:
            formula = formula_match.group(0)
            rules.append(make_text_rule("formula", "Mathematical formula", marks_val,
                [re.findall(r'[a-zA-Z0-9\^\(\)\.\+\-\*\/]+', formula)],
                [formula.lower()], 1))
        else:
            terms = re.findall(r'([A-Za-z]{3,})', desc)
            terms = list(set([norm(t) for t in terms if len(t) > 3][:5]))
            if not terms:
                terms = [norm(desc[:30])]
            rules.append(make_text_rule("text-answer", "Written answer", marks_val,
                [terms], [norm(desc[:100])], 1))
        return rules
    
    terms = re.findall(r'([A-Za-z]{3,})', text)
    terms = list(set([norm(t) for t in terms if len(t) > 4][:6]))
    if terms:
        rules.append(make_text_rule("text-answer", "Written answer", total_points,
            [terms], [norm(text[:100])], max(1, len(terms) // 2)))
    
    return rules


if __name__ == "__main__":
    print(f"Processing {len(QUESTIONS)} questions...\n")
    
    sql_updates = []
    for qid, prompt, ms, mc, printed_marks, points in QUESTIONS:
        rules = generate_structured_marks(qid, prompt, ms, mc, printed_marks, points)
        if not rules:
            print(f"WARNING: No rules generated for {qid}")
            continue
        
        marks_json = json.dumps(rules, ensure_ascii=False)
        # Use PostgreSQL dollar-quoting to avoid single-quote issues
        sql = f"UPDATE public.questions SET config = jsonb_set(config, '{{structured_marks}}', $${marks_json}$$::jsonb) WHERE id = $${qid}$$;"
        sql_updates.append(sql)
    
    print(f"Generated {len(sql_updates)} SQL updates")
    
    # Save to file
    with open('/home/user/EVALORA/scripts/structured_marks_updates_dq.sql', 'w') as f:
        f.write("-- Structured marks updates for 215 open-ended questions\n")
        f.write("-- Generated using PostgreSQL dollar-quoting\n\n")
        for sql in sql_updates:
            f.write(sql + "\n")
    
    print("SQL saved to scripts/structured_marks_updates_dq.sql")
    
    # Split into batches
    batch_size = 20
    batches = [sql_updates[i:i+batch_size] for i in range(0, len(sql_updates), batch_size)]
    print(f"Split into {len(batches)} batches of ~{batch_size}")
    
    import os
    os.makedirs('scripts/batches_dq', exist_ok=True)
    for i, batch in enumerate(batches):
        with open(f'scripts/batches_dq/batch_{i:03d}.sql', 'w') as f:
            f.write('\n'.join(batch) + '\n')
    
    print(f"Batch files saved to scripts/batches_dq/")