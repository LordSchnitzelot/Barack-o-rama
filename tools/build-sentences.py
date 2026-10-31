#!/usr/bin/env python3
"""Builds packs/en-he/drills/sentences.json from packs/en-he/drills/source/sentences.txt (spec 3.3,
Sentences and Sentence tags). Every word is tagged with its exact dictionary entry, found in code:
the longest run of words that an entry accepts, left to right. Hebrew words may carry attached
letters (ו, ה, ב, ל, מ, כ, ש), which are stripped to find the entry ("בבית ספר" -> בֵּית סֵפֶר).
A word with several entries needs its label in curly brackets in sentences.txt: "know{a person}".
Difficulty is calculated as in docs/drills-data-format.md.

Usage:  python3 tools/build-sentences.py      then   node tools/validate-drills.js
"""
import json, os, re, sys, importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRILLS = os.path.join(ROOT, 'packs', 'en-he', 'drills')
spec = importlib.util.spec_from_file_location('build_dictionary', os.path.join(ROOT, 'tools', 'build-dictionary.py'))
B = importlib.util.module_from_spec(spec); spec.loader.exec_module(B)
normalize = B.normalize

UNTAGGED = {'en': ['the', 'a', 'an', 'is', 'am', 'are', 'it', 'and', 'in', 'at', 'will', 'do', 'does', 'to', 'of'],
            'he': ['את']}
PREFIXES = ['ו', 'ה', 'ב', 'ל', 'מ', 'כ', 'ש', 'וה', 'וב', 'ול', 'ומ', 'וכ', 'וש', 'שה', 'שב', 'של', 'כש', 'מה', 'לה', 'בה', 'כה']
MAX_WORDS = 4

def difficulty(words, max_rank, tenses, clauses):
    p = 0 if max_rank <= 100 else 1 if max_rank <= 300 else 2 if max_rank <= 1000 else 3
    p += 0 if words <= 5 else 1 if words <= 8 else 2 if words <= 12 else 3
    if any(t != 'present' for t in tenses): p += 1
    p += max(0, clauses - 1)
    return min(5, 1 + p)

def load_dict(lang):
    by_form, rank = {}, {}
    for g in json.load(open(os.path.join(DRILLS, 'dictionary-%s.json' % lang), encoding='utf-8'))['groups']:
        for w in g['words']:
            rank[w['id']] = w['rank']
            w['verbForm'] = g.get('verbForm')
            for a in w['accepted'] + w.get('seenAs', []): by_form.setdefault(a, []).append(w)
    return by_form, rank

def tag(lang, text, hints, by_form, tenses):
    """[(text as written, entry)], or raises with the problem."""
    raw = re.findall(r"[\w'’֐-׿]+", text)
    toks = [normalize(t) for t in raw]
    tags, i = [], 0
    while i < len(toks):
        hit = None
        # The Hebrew object marker את stays untagged, even though את is also "you".
        if lang == 'he' and toks[i] in UNTAGGED[lang]: i += 1; continue
        for n in range(min(MAX_WORDS, len(toks) - i), 0, -1):
            forms = [' '.join(toks[i:i + n])]
            if lang == 'he': forms += [p_strip for p in PREFIXES if forms[0].startswith(p) for p_strip in [forms[0][len(p):]] if p_strip]
            found = [c for c in (list({w['id']: w for w in by_form.get(f, [])}.values()) for f in forms) if c]
            if found:
                # The word as written comes first; a label can choose a reading with its attached
                # letters removed instead: הבן{בֵּן} is ה + בֵּן ("the son"), not the command הָבֵן.
                hint, chosen = hints.get(i + n - 1), found[0]
                if hint: chosen = next((c for c in found if any(w['text'] == hint or w['text'].endswith('(%s)' % hint) for w in c)), chosen)
                hit = (n, chosen); break
        if not hit:
            if toks[i] in UNTAGGED[lang]: i += 1; continue
            raise ValueError('"%s" is not in the dictionary' % raw[i])
        n, cands = hit
        if toks[i] in UNTAGGED[lang] and n == 1 and len(cands) > 0 and lang == 'en' and toks[i] in ('do', 'does', 'will', 'is', 'am', 'are'):
            i += 1; continue   # helper verbs stay untagged
        hint = hints.get(i + n - 1)
        if hint:
            cands = [w for w in cands if w['text'] == hint or w['text'].endswith('(%s)' % hint)] or cands
        # The same spelling as a past form and as another verb form (צחקו): the sentence's tense decides.
        if len(cands) > 1 and all(w['verbForm'] for w in cands):
            want = 'past' if 'past' in tenses else 'infinitive'
            cands = [w for w in cands if w['verbForm'] == want] or cands
        if len(cands) > 1:
            fit = []
            if len(fit) != 1:
                raise ValueError('"%s" has several entries (%s): add one in curly brackets' % (' '.join(raw[i:i + n]), ', '.join(w['text'] for w in cands)))
            cands = fit
        tags.append({'text': ' '.join(raw[i:i + n]), 'word': cands[0]['id']})
        i += n
    return tags, len(toks)

def build():
    dicts = {lang: load_dict(lang) for lang in ('en', 'he')}
    out, problems, count = [], [], {'en': 0, 'he': 0}
    for n, line in enumerate(open(os.path.join(DRILLS, 'source', 'sentences.txt'), encoding='utf-8'), 1):
        line = line.split('#')[0].strip()
        if not line: continue
        lang, tenses, clauses, sentence = [x.strip() for x in line.split('|', 3)]
        # Hints: "know{a person}" -> word index 1 gets the label "a person".
        hints, clean, words_before = {}, '', 0
        for part in re.split(r'(\{[^}]*\})', sentence):
            if part.startswith('{'):
                hints[words_before - 1] = part[1:-1]
            else:
                clean += part
                words_before = len(re.findall(r"[\w'’֐-׿]+", clean))
        try:
            tags, wc = tag(lang, clean, hints, dicts[lang][0], [t.strip() for t in tenses.split(',')])
        except ValueError as e:
            problems.append('line %d (%s): %s' % (n, clean, e)); continue
        count[lang] += 1
        tl = [t.strip() for t in tenses.split(',')]
        max_rank = max([dicts[lang][1][t['word']] for t in tags] or [0])
        out.append({'id': '%s-s%d' % (lang, count[lang]), 'language': lang, 'text': clean, 'tags': tags,
                    'tenses': tl, 'clauses': int(clauses), 'difficulty': difficulty(wc, max_rank, tl, int(clauses))})
    if problems:
        print('\n'.join(problems)); sys.exit('%d sentence(s) could not be tagged' % len(problems))
    with open(os.path.join(DRILLS, 'sentences.json'), 'w', encoding='utf-8') as f:
        f.write('{\n  "untaggedWords": %s,\n  "sentences": [\n' % json.dumps(UNTAGGED, ensure_ascii=False))
        f.write(',\n'.join('    ' + json.dumps(s, ensure_ascii=False) for s in out))
        f.write('\n  ]\n}\n')
    print('%d sentences (%d English, %d Hebrew)' % (len(out), count['en'], count['he']))

if __name__ == '__main__': build()
