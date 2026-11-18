#!/usr/bin/env python3
"""
Process open-ended questions missing structured_marks.
Generates SQL update statements based on marking scheme analysis.
"""

import json
import re
import sys

def parse_marking_scheme(ms_text, points, marking_criteria=None):
    """
    Parse a marking scheme text and generate structured_marks configuration.
    
    Returns a list of structured mark rules.
    """
    rules = []
    
    if not ms_text:
        return rules
    
    ms = ms_text.strip()
    
    # Pattern: "Answer: X = flower, Y = tree. Award 1 mark for flower and 1 mark for tree."
    if ms.startswith("Answer:"):
        answer_part = ms[len("Answer:"):].split(".")[0].strip()
        # Extract "1 = flower, 2 = tree" style answers
        answer_items = re.findall(r'(\d+)\s*=\s*([^,.]+)', answer_part)
        if answer_items:
            keyword_groups = []
            accepted_answers = []
            total_points = 0
            for num, ans in answer_items:
                ans = ans.strip()
                keyword_groups.append([ans.lower()])
                accepted_answers.append(ans.lower())
                total_points += 1  # Default 1 mark per answer
            
            # Adjust points to match question total
            per_point = points / len(answer_items) if answer_items else points
            
            rules.append({
                "id": "text-answer",
                "mode": "keyword_match",
                "tool": "text",
                "label": "Written answer",
                "points": int(points) if points == int(points) else points,
                "expected": {
                    "keyword_groups": keyword_groups,
                    "accepted_answers": accepted_answers,
                    "min_keyword_groups": len(keyword_groups)
                }
            })
        return rules
    
    # Pattern: Multi-part like "(a) South Zone (3 shops); (b) 6; (c) … 1m for South (3); 1m for 6; 1m for …; 3m."
    # Extract mark allocations like "1m for X", "1.5m for Y", etc.
    mark_allocations = re.findall(r'([\d.]+)m?\s*(?:for|mark?s?\s+for)\s*([^;.]+)', ms, re.IGNORECASE)
    if mark_allocations:
        for marks, desc in mark_allocations:
            marks_val = float(marks)
            desc = desc.strip().rstrip('.')
            # Extract key terms from description
            key_terms = re.findall(r'\(([^)]+)\)|([A-Z][a-z]+|\d+)', desc)
            terms = []
            for t in key_terms:
                term = t[0] or t[1]
                if term:
                    terms.append(term.lower())
            if not terms:
                terms = [desc.lower()[:30]]
            
            rules.append({
                "id": f"part-{len(rules)+1}",
                "mode": "keyword_match",
                "tool": "text",
                "label": desc[:100],
                "points": marks_val,
                "expected": {
                    "keyword_groups": [terms],
                    "accepted_answers": [desc.lower()],
                    "min_keyword_groups": 1
                }
            })
        return rules
    
    # Pattern: Simple mark allocation like "1 mark. ..." or "0.5 mark. ..."
    mark_match = re.match(r'([\d.]+)\s*mark[s?]\.?\s*(.+)', ms, re.IGNORECASE)
    if mark_match:
        marks_val = float(mark_match.group(1))
        desc = mark_match.group(2).strip()
        # Extract key terms
        terms = re.findall(r'([A-Za-z]{3,})', desc)
        terms = [t.lower() for t in terms if len(t) > 3][:5]
        if not terms:
            terms = [desc.lower()[:30]]
        
        rules.append({
            "id": "text-answer",
            "mode": "keyword_match",
            "tool": "text",
            "label": "Written answer",
            "points": marks_val,
            "expected": {
                "keyword_groups": [terms],
                "accepted_answers": [desc.lower()[:100]],
                "min_keyword_groups": 1
            }
        })
        return rules
    
    # Default: treat entire marking scheme as keyword groups
    terms = re.findall(r'([A-Za-z]{3,})', ms)
    terms = list(set([t.lower() for t in terms if len(t) > 3][:5]))
    if terms:
        rules.append({
            "id": "text-answer",
            "mode": "keyword_match",
            "tool": "text",
            "label": "Written answer",
            "points": points,
            "expected": {
                "keyword_groups": [terms],
                "accepted_answers": [ms.lower()[:100]],
                "min_keyword_groups": 1
            }
        })
    
    return rules


def generate_sql_update(question_id, config, structured_marks):
    """Generate SQL to update config.structured_marks."""
    # Build the new config JSON
    new_config = dict(config)
    new_config['structured_marks'] = structured_marks
    
    config_json = json.dumps(new_config, ensure_ascii=False)
    # Escape single quotes for SQL
    config_sql = config_json.replace("'", "''")
    
    return f"UPDATE public.questions SET config = '{config_sql}'::jsonb WHERE id = '{question_id}';"


if __name__ == "__main__":
    # This script will be populated with data from the Supabase queries
    print("Structured marks processor ready")
    print("Usage: Import question data and call parse_marking_scheme()")
PYEOF
echo "Script created"