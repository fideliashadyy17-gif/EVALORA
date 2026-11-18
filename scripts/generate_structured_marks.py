#!/usr/bin/env python3
"""
Generate structured_marks for all 215 open-ended questions missing them.
Reads question data from all_questions_data.py and outputs SQL updates.
"""

import json
import re
import sys

sys.path.insert(0, '/home/user/EVALORA/scripts')
from all_questions_data import QUESTIONS

def norm(s):
    return s.strip().lower().replace('\u2026', '').replace('...', '').strip()

def extract_mark_allocations(text):
    """Extract mark allocations like '1m for X', '1.5m for Y', '3m' from text."""
    allocations = []
    # Pattern: "Xm for Y" where X is a valid number (integer or decimal like 1.5)
    for match in re.finditer(r'(\d+(?:\.\d+)?)\s*m\s*for\s*([^;.]+)', text, re.IGNORECASE):
        marks = float(match.group(1))
        desc = match.group(2).strip().rstrip('.')
        allocations.append((marks, desc))
    # Pattern: just "Xm" at end (where X is a valid number)
    if not allocations:
        for match in re.finditer(r'(\d+(?:\.\d+)?)\s*m', text, re.IGNORECASE):
            marks = float(match.group(1))
            allocations.append((marks, "Written answer"))
    return allocations

def make_text_rule(rule_id, label, points, keyword_groups, accepted_answers=None, min_groups=None):
    """Create a text structured mark rule."""
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
        "label": label,
        "points": round(points + 1e-9, 2),
        "expected": expected
    }

def generate_structured_marks(qid, prompt, ms, mc, printed_marks, points):
    """Generate structured_marks configuration for a question."""
    rules = []
    
    # Determine total points
    total_points = float(points) if points else (float(printed_marks) if printed_marks else 0)
    if total_points == 0:
        return rules
    
    # Use marking_criteria if available, otherwise marking_scheme
    text = mc or ms or ""
    
    if not text:
        # No marking info at all - derive from prompt
        # For simple "Write X" questions, extract key nouns
        return [make_text_rule("text-answer", "Written answer", total_points,
            [[prompt.lower()[:30]]], [prompt.lower()[:50]], 1)]
    
    # Pattern: "Answer: X = flower, Y = tree."
    if text.strip().startswith("Answer:"):
        answer_part = text[len("Answer:"):].split(".")[0]
        answer_items = re.findall(r'(\d+)\s*=\s*([^,.]+)', answer_part)
        if answer_items:
            keyword_groups = []
            accepted_answers = []
            for num, ans in answer_items:
                ans_clean = norm(ans)
                keyword_groups.append([ans_clean])
                accepted_answers.append(ans_clean)
            n = len(answer_items)
            per_point = total_points / n
            # If total_points is 2 and we have 2 items, each gets 1
            # Use individual rules for each answer
            for i, (num, ans) in enumerate(answer_items):
                ans_clean = norm(ans)
                rules.append(make_text_rule(f"ans-{i+1}", f"Answer {num}", per_point,
                    [[ans_clean]], [ans_clean], 1))
            return rules
    
    # Pattern: Multi-part with mark allocations "(a) X; (b) Y; 1m for X; 1m for Y; 3m."
    allocations = extract_mark_allocations(text)
    if allocations and len(allocations) > 1:
        total_alloc = sum(a[0] for a in allocations)
        # Scale to match total_points if needed
        scale = total_points / total_alloc if total_alloc > 0 else 1
        for i, (marks, desc) in enumerate(allocations):
            scaled_points = round(marks * scale + 1e-9, 2)
            # Extract key terms from description
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
    
    # Pattern: Single mark allocation "1 mark. ..." or "0.5 mark. ..."
    mark_match = re.match(r'(\d+(?:\.\d+)?)\s*marks?\.?\s*(.+)', text, re.IGNORECASE)
    if mark_match:
        marks_val = round(float(mark_match.group(1)) + 1e-9, 2)
        desc = mark_match.group(2).strip()
        # For mathematical formulas, extract the formula
        formula_match = re.search(r'(u_n\s*=|a_n\s*=|S_n\s*=|T_n\s*=|V_n\s*=|a\s*=|r\s*=|d\s*=)[^.,]+', desc)
        if formula_match:
            formula = formula_match.group(0)
            rules.append(make_text_rule("formula", "Mathematical formula", marks_val,
                [re.findall(r'[a-zA-Z0-9\^\(\)\.\+\-\*\/]+', formula)],
                [formula.lower()], 1))
        else:
            # Extract key terms
            terms = re.findall(r'([A-Za-z]{3,})', desc)
            terms = list(set([norm(t) for t in terms if len(t) > 3][:5]))
            if not terms:
                terms = [norm(desc[:30])]
            rules.append(make_text_rule("text-answer", "Written answer", marks_val,
                [terms], [norm(desc[:100])], 1))
        return rules
    
    # Pattern: General text with mark info at end "... 2m" or "... 3m."
    # Extract all nouns/key terms as keyword groups
    terms = re.findall(r'([A-Za-z]{3,})', text)
    terms = list(set([norm(t) for t in terms if len(t) > 4][:6]))
    if terms:
        rules.append(make_text_rule("text-answer", "Written answer", total_points,
            [terms], [norm(text[:100])], max(1, len(terms) // 2)))
    
    return rules


def generate_sql_update(qid, config, structured_marks):
    """Generate SQL to update config.structured_marks."""
    new_config = dict(config)
    new_config['structured_marks'] = structured_marks
    config_json = json.dumps(new_config, ensure_ascii=False)
    config_sql = config_json.replace("'", "''")
    return f"UPDATE public.questions SET config = '{config_sql}'::jsonb WHERE id = '{qid}';"


if __name__ == "__main__":
    print(f"Processing {len(QUESTIONS)} questions...\n")
    
    sql_updates = []
    for qid, prompt, ms, mc, printed_marks, points in QUESTIONS:
        rules = generate_structured_marks(qid, prompt, ms, mc, printed_marks, points)
        if not rules:
            print(f"WARNING: No rules generated for {qid}")
            continue
        
        # Build minimal config - we only need to add structured_marks
        # Get existing config from DB - but we don't have it here
        # We'll generate SQL that uses jsonb_set to add structured_marks to existing config
        marks_json = json.dumps(rules, ensure_ascii=False)
        marks_sql = marks_json.replace("'", "''")
        sql = f"UPDATE public.questions SET config = jsonb_set(config, '{{structured_marks}}', '{marks_sql}'::jsonb) WHERE id = '{qid}';"
        sql_updates.append(sql)
        print(f"  {qid}: {len(rules)} rule(s), total points = {sum(r['points'] for r in rules)}")
    
    print(f"\nGenerated {len(sql_updates)} SQL updates")
    
    # Save to file
    with open('/home/user/EVALORA/scripts/structured_marks_updates.sql', 'w') as f:
        f.write("-- Structured marks updates for 215 open-ended questions\n")
        f.write("-- Generated from marking scheme analysis\n\n")
        for sql in sql_updates:
            f.write(sql + "\n")
    
    print("SQL saved to scripts/structured_marks_updates.sql")