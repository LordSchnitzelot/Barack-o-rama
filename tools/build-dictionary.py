#!/usr/bin/env python3
"""Builds the Drills dictionaries (spec 3.3) from packs/en-he/drills/source/words.txt.

words.txt holds the choices that need a person: which meanings, which Hebrew word, labels.
Everything else is filled in from the sources named in the spec:
  - nikkud and Hebrew inflections (every past form, infinitive, present, feminine and plural)
    from English Wiktionary's Hebrew entries (kaikki.org, CC BY-SA 4.0);
  - English inflections (runs, ran, running, plural) from English Wiktionary (kaikki.org);
  - frequency ranks from Hermit Dave's OpenSubtitles word counts (CC BY-SA 4.0), counting every
    form of a word (spec 3.3, Frequency).
Every English-Hebrew pair is also checked against Wiktionary's own translations; pairs it does not
confirm, and lines it cannot fill in, are listed in docs/dictionary-review.md for a person to check.

Usage:
  python3 tools/build-dictionary.py --download DATA_DIR   # once: fetch the sources (about 3.5 GB read, 100 MB kept)
  python3 tools/build-dictionary.py DATA_DIR              # build the two dictionary files
Then run:  node tools/validate-drills.js
"""
import json, os, re, sys, unicodedata, urllib.request, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRILLS = os.path.join(ROOT, 'packs', 'en-he', 'drills')
SOURCE = os.path.join(DRILLS, 'source', 'words.txt')
NIKKUD_FILE = os.path.join(DRILLS, 'source', 'nikkud.txt')
FORMS_FILE = os.path.join(DRILLS, 'source', 'forms.txt')
REVIEW = os.path.join(ROOT, 'docs', 'dictionary-review.md')
URLS = {
    'en_50k.txt': 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt',
    'he_50k.txt': 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/he/he_50k.txt',
    'he.jsonl': 'https://kaikki.org/dictionary/Hebrew/kaikki.org-dictionary-Hebrew.jsonl',
}
EN_URL = 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl'
POS = {'n': 'noun', 'v': 'verb', 'adj': 'adjective', 'adv': 'adverb', 'pron': 'pronoun', 'prep': 'preposition',
       'conj': 'conjunction', 'det': 'determiner', 'num': 'number', 'q': 'question', 'modal': 'modal', 'intj': 'interjection'}
# Which Wiktionary parts of speech can hold the Hebrew word for each of ours.
WIKI_POS = {'noun': ['noun'], 'verb': ['verb'], 'adjective': ['adj', 'verb'], 'adverb': ['adv', 'adj', 'phrase', 'prep'],
            'pronoun': ['pron', 'det', 'adv'], 'preposition': ['prep', 'adv'], 'conjunction': ['conj', 'adv'],
            'determiner': ['det', 'adj', 'pron', 'adv', 'num'], 'number': ['num'], 'question': ['pron', 'adv', 'det'],
            'modal': ['adj', 'verb'], 'interjection': ['intj', 'phrase', 'adv', 'adj']}
BAD_TAGS = {'alternative', 'obsolete', 'archaic', 'dialectal', 'nonstandard', 'colloquial', 'table-tags',
            'inflection-template', 'error-unrecognized-form', 'romanization', 'class', 'possessed-form', 'construct',
            'definite', 'Biblical-Hebrew', 'rare', 'misspelling', 'pronunciation-spelling', 'slang', 'informal'}

# ---------- Text helpers (match normalize() in drills.js) ----------
NIKKUD = re.compile('[֑-ׇֽֿׁׂׅׄ]')
def normalize(t):
    t = unicodedata.normalize('NFD', str(t))
    t = unicodedata.normalize('NFC', NIKKUD.sub('', t)).lower()
    t = re.sub("['’‘`׳״\"]", '', t)
    t = ''.join(' ' if unicodedata.category(c)[0] in 'PS' else c for c in t)
    return re.sub(r'\s+', ' ', t).strip()
def nfc(t):
    """Clean Hebrew text for an entry: letters, nikkud and single spaces only (Wiktionary
    spellings sometimes carry a maqaf, meteg or dot: לְיַד־ -> לְיַד)."""
    t = unicodedata.normalize('NFD', t)
    t = ''.join(c for c in t if ('\u05d0' <= c <= '\u05ea') or ('\u05b0' <= c <= '\u05c7' and c not in '\u05bd\u05be\u05c0\u05c3\u05c6') or c == ' ' or not '\u0590' <= c <= '\u05ff' and c.isalpha())
    return unicodedata.normalize('NFC', re.sub(r'\s+', ' ', t).strip())
def has_nikkud(word): return any('ְ' <= c <= 'ׇ' and c not in '־׀׃׆' for c in word)

SHEVA, HIRIQ, HOLAM, HOLAM_VAV, QUBUTZ, DAGESH = 'ְ', 'ִ', 'ֹ', 'ֺ', 'ֻ', 'ּ'
FULL_VOWELS = '\u05b1\u05b2\u05b3\u05b5\u05b6\u05b7\u05b8\u05b9'  # hataf vowels, tsere, segol, patah, qamatz, holam
def plene(pointed):
    """The full spelling (with the vowel letters ו and י) that speech recognition writes:
    דִּבֵּר -> דיבר, לְוַתֵּר -> לוותר, לִכְתֹּב -> לכתוב. A rough version of the Academy's rules;
    both spellings are always accepted, so a rare miss does no harm."""
    out = []
    for word in unicodedata.normalize('NFD', pointed).split(' '):
        clusters, cur = [], None
        for c in word:
            if 'א' <= c <= 'ת':
                cur = [c, '']; clusters.append(cur)
            elif cur is not None:
                cur[1] += c
        res = ''
        last = len(clusters) - 1
        for i, (letter, marks) in enumerate(clusters):
            nxt = clusters[i + 1] if i < last else None
            vowels = marks.replace(DAGESH, '').replace('ׁ', '').replace('ׂ', '')
            res += letter
            # A consonant vav (with its own vowel) inside a word is written twice: לְוַתֵּר -> לוותר.
            if letter == 'ו' and 0 < i < last and vowels and HOLAM not in marks and HOLAM_VAV not in marks:
                res += 'ו'
            # A consonant yod inside a word is written twice when it is doubled (dagesh) or carries a
            # vowel other than hiriq: מְסַיֵּם -> מסיים, טִיֵּל -> טייל; but בַּיִת, חַיִּים stay as they are.
            if letter == 'י' and 0 < i < last and HIRIQ not in marks and nxt[0] not in 'וי' and (DAGESH in marks or any(v in marks for v in FULL_VOWELS)):
                res += 'י'
            # Holam and qubutz get a vav: לִכְתֹּב -> לכתוב, סֻכָּר -> סוכר.
            if HOLAM in marks and letter not in 'וא' and not (nxt and nxt[0] == 'ו'):
                res += 'ו'
            if QUBUTZ in marks:
                res += 'ו'
            # Hiriq gets a yod, except before a sheva (a closed syllable) or a final letter with no
            # vowel: דִּבֵּר -> דיבר, but מִשְׁפָּחָה and אִם stay as they are.
            if HIRIQ in marks and nxt and nxt[0] != 'י' and SHEVA not in nxt[1]:
                nxt_vowels = nxt[1].replace(DAGESH, '').replace('ׁ', '').replace('ׂ', '')
                if i + 1 < last or nxt_vowels:
                    res += 'י'
        out.append(res)
    return normalize(' '.join(out))
def spellings(pointed): return {normalize(pointed), plene(pointed)} - {''}

# ---------- Loading the sources ----------
def download(data):
    os.makedirs(data, exist_ok=True)
    for name, url in URLS.items():
        print('Downloading', url); urllib.request.urlretrieve(url, os.path.join(data, name))
    top = set(l.split()[0] for l in open(os.path.join(data, 'en_50k.txt'), encoding='utf-8'))
    print('Reading', EN_URL, '(3.4 GB; only the needed entries are kept)')
    with urllib.request.urlopen(EN_URL) as r, open(os.path.join(data, 'en_filtered.jsonl'), 'w', encoding='utf-8') as out:
        for line in r:
            e = json.loads(line)
            words = e.get('word', '').lower().replace('-', ' ').split()
            if e.get('lang_code') != 'en' or not words or len(words) > 4 or not all(x in top for x in words): continue
            keep = {'word': e['word'], 'pos': e.get('pos'),
                    'forms': [{'form': f.get('form'), 'tags': f.get('tags', [])} for f in e.get('forms', [])][:30],
                    'senses': [{'glosses': s.get('glosses', [])[:1], 'tags': s.get('tags', []), 'form_of': [x.get('word') for x in s.get('form_of', [])]} for s in e.get('senses', [])][:12],
                    'he': [{'sense': t.get('sense', ''), 'word': t.get('word')} for t in e.get('translations', []) + [t for s in e.get('senses', []) for t in s.get('translations', [])] if t.get('lang_code') == 'he']}
            if len(words) > 1 and not keep['he']: continue
            out.write(json.dumps(keep, ensure_ascii=False) + '\n')

def load(data):
    freq = {lang: collections.Counter() for lang in ('en', 'he')}
    for lang in freq:
        for l in open(os.path.join(data, lang + '_50k.txt'), encoding='utf-8'):
            w, c = l.split(); freq[lang][w] += int(c)
    he = collections.defaultdict(list)          # unpointed spelling -> Hebrew entries
    to_inf = {}                                 # unpointed past form -> pointed infinitive
    for l in open(os.path.join(data, 'he.jsonl'), encoding='utf-8'):
        e = json.loads(l)
        glosses = [(s.get('glosses') or [''])[0] for s in e.get('senses', [])]
        canon = [f['form'] for f in e.get('forms', []) if 'canonical' in f.get('tags', [])]
        canon = [c.split(' \\ ')[0].split(' / ')[0].strip() for c in canon if has_nikkud(c)]
        m = next((re.match(r'to-infinitive of (\S+)', g) for g in glosses if g.startswith('to-infinitive of')), None)
        if m and canon: to_inf.setdefault(normalize(m.group(1)), canon[0])
        if not canon or all(g.startswith(('defective spelling', 'Masculine singular', 'Feminine', 'Plural', 'to-infinitive', 'plural of', 'feminine')) for g in glosses): continue
        entry = {'pos': e['pos'], 'canon': canon[0], 'glosses': ' '.join(glosses).lower(), 'forms': [f for f in e.get('forms', []) if f.get('form') and not set(f.get('tags', [])) & BAD_TAGS]}
        for key in {normalize(e['word'])} | spellings(canon[0]):
            he[key].append(entry)
    en = collections.defaultdict(list)
    for l in open(os.path.join(data, 'en_filtered.jsonl'), encoding='utf-8'):
        e = json.loads(l); en[e['word'].lower()].append(e)
    return freq, he, to_inf, en

# ---------- Reading words.txt ----------
def read_source():
    lines, seen = [], set()
    for n, raw in enumerate(open(SOURCE, encoding='utf-8'), 1):
        raw = raw.split('#')[0].strip()
        if not raw: continue
        parts = [p.strip() for p in raw.split('|')]
        if len(parts) < 3 or parts[1] not in POS: sys.exit('words.txt line %d: expected "english | pos | hebrew | label": %s' % (n, raw))
        en_word, pos, hebrew = parts[0], POS[parts[1]], parts[2]
        label = parts[3] if len(parts) > 3 and parts[3] else None
        key = (en_word, pos, hebrew, label)
        if key in seen: continue
        seen.add(key)
        lines.append({'line': n, 'en': en_word, 'pos': pos, 'he': hebrew, 'label': label})
    return lines

# ---------- English forms ----------
def en_forms(en, word, pos):
    """{'past': [...], 'pp': [...], 'other': [...], 'plural': [...]} from Wiktionary, or built from the
    first word of a phrase ("give back" -> "gave back")."""
    out = collections.defaultdict(list)
    for e in en.get(word.lower(), []):
        if e['pos'] != ('verb' if pos == 'verb' else 'noun'): continue
        for f in e['forms']:
            t = set(f['tags']); form = f['form']
            if not form or t & BAD_TAGS: continue
            if form.lower() == word.lower() and not (pos == 'verb' and 'past' in t): continue
            if pos == 'verb':
                if 'past' in t and 'participle' not in t: out['past'].append(form)
                elif 'past' in t: out['pp'].append(form)
                elif 'third-person' in t or 'present' in t: out['other'].append(form)
            elif t == {'plural'}: out['plural'].append(form)
        if out: break
    if pos == 'verb' and not out.get('past') and ' ' in word:
        head, rest = word.split(' ', 1)
        sub = en_forms(en, head, 'verb')
        for k, v in sub.items(): out[k] = [x + ' ' + rest for x in v]
    for k in out: out[k] = [x for x in dict.fromkeys(out[k]) if normalize(x)]
    return out

# ---------- Hebrew: finding the pointed word and its forms ----------
review = collections.defaultdict(list)

def find_he(he, word, pos, english, line):
    if all(has_nikkud(w) for w in word.split(' ')): word = normalize(word)
    """The Wiktionary entry for an unpointed Hebrew word, preferring our part of speech and an
    English gloss that mentions our English word."""
    cands = he.get(normalize(word), [])
    if not cands: return None
    wanted = WIKI_POS[pos]
    ranked = sorted(cands, key=lambda e: (e['pos'] not in wanted, wanted.index(e['pos']) if e['pos'] in wanted else 9,
                                          not re.search(r'\b' + re.escape(english.split(' ')[-1].lower()) + r'\b', e['glosses'])))
    best = ranked[0]
    if best['pos'] not in wanted and pos not in ('adverb', 'interjection', 'determiner', 'pronoun', 'question', 'preposition', 'conjunction', 'modal'): return None
    same = [e for e in ranked if e['pos'] == best['pos'] and normalize(e['canon']) == normalize(best['canon']) and e['canon'] != best['canon']]
    if same and not re.search(r'\b' + re.escape(english.lower()) + r'\b', best['glosses']):
        review['choice'].append('line %d: %s = %s — chose %s from several spellings (%s)' % (line, english, word, best['canon'], ', '.join(e['canon'] for e in same)))
    return best

HAND = {}   # words.txt spelling -> nikkud written by hand in nikkud.txt (listed for review)
LOOSE = {}  # the same, by a looser spelling (see skeleton), used only when there is no exact match
def add_hand(x, first=False):
    for key in spellings(x): HAND[key] = nfc(x) if first else HAND.get(key, nfc(x))
    LOOSE.setdefault(skeleton(x), nfc(x))
def load_hand():
    for raw in open(NIKKUD_FILE, encoding='utf-8'):
        raw = raw.split('#')[0].strip()
        if not raw: continue
        # A line holds one phrase (up to 4 words), or a list of single words.
        items = [raw] if len(raw.split(' ')) <= 4 else raw.split(' ')
        for x in items: add_hand(x)
def skeleton(t):
    """Spelling without the vowel letters ו and י inside a word, so תיאטרון finds תֵּאַטְרוֹן.
    A final י stays, so טיפשי and טיפש stay apart."""
    return ' '.join(w[:1] + re.sub('[וי]', '', w[1:-1]) + w[-1:] if len(w) > 1 else w for w in normalize(t).split(' '))
FORMS = {}  # adjective -> accepted spellings of its other forms, from forms.txt
def load_forms():
    """forms.txt: "masculine | form (spelling), form, spelling". A form without brackets counts as
    itself without nikkud (and in its everyday full spelling); a word with no nikkud is an extra
    accepted spelling."""
    for raw in open(FORMS_FILE, encoding='utf-8'):
        raw = raw.split('#')[0].strip()
        if not raw: continue
        main, _, rest = (x.strip() for x in raw.partition('|'))
        acc = []
        for item in (x.strip() for x in rest.split(',') if x.strip()):
            m = re.match(r'^(.*?)\s*\(([^)]*)\)$', item)
            # The everyday full spelling is accepted too (טִפְּשִׁית -> טיפשית).
            acc += [normalize(m.group(2))] if m else ([normalize(item), plene(item)] if has_nikkud(item) else [normalize(item)])
        FORMS[skeleton(main)] = acc
        add_hand(main, first=True)
        for a in acc: HAND[a] = nfc(main) if a not in HAND else HAND[a]

def hand(text, english, line):
    p = HAND.get(normalize(text)) or LOOSE.get(skeleton(text))
    if p: review['hand'].append('line %d: %s = %s' % (line, english, p))
    return p

def point_phrase(he, text, pos, english, line):
    """Pointed text for a Hebrew word or phrase, or None. Phrases are looked up whole first,
    then in nikkud.txt, then word by word (listed for review). Text already written with nikkud
    in words.txt is used as it is."""
    if all(has_nikkud(w) for w in text.split(' ')):
        review['hand'].append('line %d: %s = %s (written with nikkud in words.txt)' % (line, english, text))
        return text
    whole = find_he(he, text, pos, english, line)
    if whole: return whole['canon']
    h = hand(text, english, line)
    if h: return h
    if ' ' not in text: return None
    parts = []
    for w in text.split(' '):
        e = find_he(he, w, 'adverb', english, line) or find_he(he, w, 'noun', english, line)
        if not e: return None
        parts.append(e['canon'])
    review['assembled'].append('line %d: %s = %s — nikkud put together word by word: %s' % (line, english, text, ' '.join(parts)))
    return ' '.join(parts)

def he_forms(entry, want):
    return [f['form'] for f in entry['forms'] if want(set(f.get('tags', [])))]

def he_verb(he, to_inf, past_text, inf_text, english, line):
    """Pointed past (3rd person masculine) and infinitive of a Hebrew verb, with the accepted forms
    of each. Multi-word verbs ("שם לב") conjugate the first word and keep the rest."""
    first, _, rest = past_text.partition(' ')
    inf_first, _, inf_rest = inf_text.partition(' ')
    e = find_he(he, first, 'verb', english, line)
    if not e or e['pos'] != 'verb': return None
    tail = ''
    if rest:
        tail = point_phrase(he, rest, 'adverb', english, line)
        if not tail: return None
        tail = ' ' + tail
    past = he_forms(e, lambda t: 'past' in t and 'participle' not in t)
    pointed = lambda xs: [y.strip() for x in xs for y in re.split(r' / | \\ ', x) if has_nikkud(y)]
    inf = pointed(he_forms(e, lambda t: 'infinitive' in t))
    if not inf and normalize(first) in to_inf: inf = [to_inf[normalize(first)]]
    if not inf:
        inf = pointed([i['canon'] for i in he.get(normalize(inf_first), [])])
    if not inf:
        h = hand(inf_first, english, line)
        if h: inf = [h]
    if not inf: return None
    # The infinitive also accepts the present tense (spec 3.3: other verb forms count as the
    # infinitive; the owner chose present only, so a past form like צחקו never matches an imperative).
    other = he_forms(e, lambda t: 'present' in t and 'participle' not in t)
    # Future and command forms are not answers, but they point at the infinitive when they appear
    # in a sentence or in the chat ("אלך" -> לָלֶכֶת). Stored as "seenAs".
    seen = he_forms(e, lambda t: bool(t & {'future', 'imperative'}) and 'negative' not in t)
    acc = lambda forms, extra: sorted(set().union(*[spellings(f + tail) for f in forms]) | {normalize(extra)})
    past_acc = acc([e['canon']] + past, past_text)
    if len(past_acc) < 7: return None
    inf_acc = acc(inf + other, inf_text)
    seen_as = sorted(set().union(*[spellings(f + tail) for f in seen]) - set(inf_acc)) if seen else []
    return {'past': nfc(e['canon'] + tail), 'past_acc': past_acc,
            'inf': nfc(inf[0] + tail), 'inf_acc': inf_acc, 'seen_as': seen_as, 'entry': e}

def he_word(he, text, extras, pos, english, line):
    pointed = point_phrase(he, text, pos, english, line)
    if not pointed: return None
    e = find_he(he, text, pos, english, line)
    forms = [pointed]
    if e and pos == 'adjective': forms += he_forms(e, lambda t: bool(t & {'feminine', 'plural'}))
    if e and pos == 'noun': forms += he_forms(e, lambda t: 'plural' in t)
    if e and pos in ('modal',): forms += he_forms(e, lambda t: 'present' in t)
    acc = set().union(*[spellings(f) for f in forms]) | {normalize(x) for x in [text] + extras}
    if pos == 'adjective' and extras:
        review['adjective_hand'].append('line %d: %s = %s — other forms or spellings written by hand in words.txt: %s' % (line, english, text, ', '.join(extras)))
    if pos == 'adjective' and len(acc) < 3 and skeleton(text) in FORMS:
        acc |= set(FORMS[skeleton(text)])
        review['forms'].append('line %d: %s = %s — forms from forms.txt' % (line, english, pointed))
    if pos == 'adjective' and len(acc) < 3:
        review['adjective'].append('line %d: %s = %s' % (line, english, pointed))
        return 'no-forms'
    return {'text': nfc(pointed), 'acc': sorted(acc - {''}), 'entry': e}

def confirmed(en, e, english, he_text):
    """Does Wiktionary itself pair this English word with this Hebrew word?"""
    targets = spellings(he_text)
    for x in en.get(english.lower(), []):
        for t in x['he']:
            if t.get('word') and spellings(t['word'].split(' \\ ')[0]) & targets: return True
    return bool(e) and bool(re.search(r'\b' + re.escape(english.lower()) + r'\b', e['glosses']))

# ---------- Building ----------
def build(data):
    freq, he, to_inf, en = load(data)
    load_hand(); load_forms()
    lines = read_source()
    entries = []   # one per English entry: {en_text, en_acc, label, pos, verbForm, he_text, he_acc, he_label, line, pair}
    for L in lines:
        heb, he_label = L['he'], None
        m = re.match(r'^(.*?)\s*\(([^)]+)\)\s*$', heb)
        if m: heb, he_label = m.group(1), m.group(2)
        items = [x.strip() for x in heb.split(',') if x.strip()]
        if he_label and not L['label']: L['label'] = he_label   # "(call out)" labels the English too
        main, extras = items[0], items[1:]
        word = L['en']
        if L['pos'] == 'verb' and main.partition('/')[2].strip() == '-':
            # A verb with no Hebrew infinitive ("deserved" = הִגִּיעַ לוֹ): only its past entry,
            # accepting the spellings listed after it.
            past_he = main.partition('/')[0].strip()
            pointed = point_phrase(he, past_he, 'verb', word, L['line'])
            f = en_forms(en, word, 'verb')
            if not pointed or not f.get('past'):
                review['missing'].append('line %d: %s = %s — no nikkud or English past form, so it was left out' % (L['line'], word, past_he)); continue
            entries.append(dict(en_text=f['past'][0], en_acc=sorted({normalize(x) for x in f['past']}), label=L['label'], pos='verb', verbForm='past',
                                he_text=nfc(pointed), he_acc=sorted({normalize(past_he)} | {normalize(x) for x in extras}), he_label=he_label,
                                line=L['line'], pair=None, base=word, verb=(pointed, None)))
        elif L['pos'] == 'verb':
            past_he, _, inf_he = (x.strip() for x in main.partition('/'))
            v = he_verb(he, to_inf, past_he, inf_he, word, L['line'])
            if not v:
                review['missing'].append('line %d: %s = %s — Wiktionary has no nikkud or past forms for it, so it was left out' % (L['line'], word, main)); continue
            f = en_forms(en, word, 'verb')
            if not f.get('past'):
                review['missing'].append('line %d: %s — no English past form found, so it was left out' % (L['line'], word)); continue
            pp = [x for x in f.get('pp', []) if x not in f['past']]
            inf_acc = sorted({normalize('to ' + word), normalize(word)} | {normalize(x) for x in f.get('other', []) + pp})
            past_acc = sorted({normalize(x) for x in f['past']})
            if not confirmed(en, v['entry'], word, v['past']): review['unconfirmed'].append('line %d: %s = %s' % (L['line'], word, v['past']))
            pair = len(entries)
            verb = (v['past'], v['inf'])
            entries.append(dict(en_text='to ' + word, en_acc=inf_acc, label=L['label'], pos='verb', verbForm='infinitive', he_text=v['inf'], he_acc=v['inf_acc'], he_seen=v['seen_as'], he_label=he_label, line=L['line'], pair=pair + 1, base=word, verb=verb))
            entries.append(dict(en_text=f['past'][0], en_acc=past_acc, label=L['label'], pos='verb', verbForm='past', he_text=v['past'], he_acc=v['past_acc'], he_label=he_label, line=L['line'], pair=pair, base=word, verb=verb))
        else:
            # Hebrew synonyms in one group: "כועס + עצבני" (spec 3.3, Groups).
            main, *more = [x.strip() for x in main.split('+')]
            h = he_word(he, main, extras, L['pos'], word, L['line'])
            if h == 'no-forms': continue   # listed under "Adjectives without forms"
            syn = [he_word(he, m, [], L['pos'], word, L['line']) for m in more]
            if any(not isinstance(x, dict) for x in syn):
                review['missing'].append('line %d: %s = %s — a Hebrew synonym has no nikkud or forms, so it was left out' % (L['line'], word, ' + '.join(more))); continue
            if not h:
                review['missing'].append('line %d: %s = %s — Wiktionary has no nikkud (or forms) for it, so it was left out' % (L['line'], word, main)); continue
            acc = {normalize(word)}
            if L['pos'] == 'noun' and ' ' not in word: acc |= {normalize(x) for x in en_forms(en, word, 'noun').get('plural', [])}
            if not confirmed(en, h['entry'], word, h['text']): review['unconfirmed'].append('line %d: %s = %s' % (L['line'], word, h['text']))
            entries.append(dict(en_text=word, en_acc=sorted(acc), label=L['label'], pos=L['pos'], verbForm=None, he_text=h['text'], he_acc=h['acc'], he_label=he_label, line=L['line'], pair=None, base=word, he_more=syn))

    # Groups: English words with the same Hebrew word (and meaning) are synonyms (spec 3.3).
    groups = collections.OrderedDict()
    for i, x in enumerate(entries):
        key = (x['pos'], x['verbForm'], x['he_text'], x['he_label'], x.get('verb'))
        groups.setdefault(key, []).append(i)
    for key, idx in groups.items():   # one English entry per spelling inside a group
        seen = {}
        for i in list(idx):
            t = entries[i]['en_text'].lower()
            if t in seen: idx.remove(i); entries[i]['dropped'] = True
            else: seen[t] = i
    gid_of = {}
    for key, idx in groups.items():
        for i in idx: gid_of[i] = key

    # Frequency: every form counts (spec 3.3); a phrase counts as its rarest word.
    def count(lang, forms):
        best = 0
        for f in forms:
            words = f.split(' ')
            if lang == 'en' and words[0] == 'to' and len(words) > 1: continue
            c = min(freq[lang].get(w, 0) for w in words) if len(words) > 1 else freq[lang].get(f, 0)
            best += c
        return best
    live = [i for i in range(len(entries)) if not entries[i].get('dropped')]
    order = {}
    for lang, acc in (('en', 'en_acc'), ('he', 'he_acc')):
        ranked = sorted(live, key=lambda i: -count(lang, entries[i][acc]))
        order[lang] = {i: r + 1 for r, i in enumerate(ranked)}

    # Group numbers, most common first.
    keys = sorted(groups, key=lambda k: min(order['en'][i] for i in groups[k]))
    gnum = {k: n + 1 for n, k in enumerate(keys)}

    # Labels (spec 3.3): needed when two entries are spelled the same, or when an English entry
    # is spelled like an answer of another group. The label from words.txt is used when there is one.
    POS_LABEL = {'noun': 'noun', 'verb': 'verb', 'adjective': 'adjective', 'adverb': 'adverb', 'pronoun': 'pronoun',
                 'preposition': 'preposition', 'conjunction': 'conjunction', 'determiner': 'determiner', 'number': 'number',
                 'question': 'question', 'modal': 'modal', 'interjection': 'greeting'}
    def en_label(i):
        x = entries[i]
        if x['verbForm'] == 'past' and normalize(x['en_text']) in [normalize(x['base']), normalize('to ' + x['base'])]: return 'past tense'
        return x['label'] or ('past tense' if x['verbForm'] == 'past' else POS_LABEL[x['pos']])
    by_text = collections.defaultdict(set)
    for i in live: by_text[entries[i]['en_text'].lower()].add(gid_of[i])
    accepted_by = collections.defaultdict(set)
    for i in live:
        for a in entries[i]['en_acc']: accepted_by[a].add(gid_of[i])
    for i in live:
        x = entries[i]; t = normalize(x['en_text'])
        clash = len(by_text[x['en_text'].lower()]) > 1 or accepted_by[t] - {gid_of[i]} or (x['verbForm'] == 'past' and t == normalize(x['base']))
        x['en_label'] = en_label(i) if clash else None
    # Entries that still share a spelling and label get the label of their Hebrew word's meaning.
    full = collections.defaultdict(list)
    for i in live:
        x = entries[i]; full[(x['en_text'].lower(), x['en_label'])].append(i)
    for (t, lab), idx in full.items():
        if len({gid_of[i] for i in idx}) > 1:
            review['labels'].append('%s: same spelling and label in several groups (%s) — give each its own label in words.txt' % (t, ', '.join('line %d' % entries[i]['line'] for i in idx)))
            for n, i in enumerate(idx):
                if n: entries[i]['en_label'] = (lab or 'meaning') + ' ' + str(n + 1)

    # Hebrew: one entry per group; same spelling in several groups needs an English label.
    he_text = {k: k[2] for k in groups}
    he_bare = collections.defaultdict(list)
    for k in groups: he_bare[k[2]].append(k)
    he_lab = {}
    for bare, ks in he_bare.items():
        if len(ks) == 1 and not ks[0][3]: continue
        for k in ks:
            first = entries[groups[k][0]]
            he_lab[k] = k[3] or (first['label'] or first['base'] if len(ks) > 1 else None)
        labs = collections.Counter(he_lab[k] for k in ks)
        for k in ks:
            if labs[he_lab[k]] > 1:
                first = entries[groups[k][0]]
                he_lab[k] = '%s, %s' % (he_lab[k], 'past tense' if first['verbForm'] == 'past' else POS_LABEL[first['pos']])
        labs = collections.Counter(he_lab[k] for k in ks)
        for k in ks:
            if labs[he_lab[k]] > 1:
                review['labels'].append('%s (%s): Hebrew entries spelled the same with the same label — give each its own label in words.txt' % (bare, he_lab[k]))

    # Permanent ids: reuse the starter set's id for the same text, so saved progress is kept.
    old_ids = {}
    for lang in ('en', 'he'):
        try:
            for g in json.load(open(os.path.join(DRILLS, 'dictionary-%s.json' % lang), encoding='utf-8'))['groups']:
                for w in g['words']: old_ids[(lang, w['text'])] = w['id']
        except FileNotFoundError: pass
    next_id = {lang: 1 + max([int(v[2:]) for (l, _), v in old_ids.items() if l == lang] or [0]) for lang in ('en', 'he')}
    taken = set()
    def word_id(lang, text):
        nonlocal next_id
        i = old_ids.get((lang, text))
        if i and i not in taken: taken.add(i); return i
        i = '%s%d' % (lang, next_id[lang]); next_id[lang] += 1; taken.add(i); return i

    out = {'en': [], 'he': []}
    for k in keys:
        idx = groups[k]; first = entries[idx[0]]
        g = {'id': gnum[k], 'pos': first['pos']}
        if first['verbForm']:
            g['verbForm'] = first['verbForm']
            if first['pair'] is not None: g['otherForm'] = gnum[gid_of[first['pair']]]
        en_words = []
        for i in sorted(idx, key=lambda i: order['en'][i]):
            x = entries[i]
            text = x['en_text'] + (' (%s)' % x['en_label'] if x['en_label'] else '')
            w = {'id': word_id('en', text), 'text': text, 'rank': order['en'][i], 'accepted': x['en_acc']}
            if x['en_text'] == 'read' and x['verbForm'] == 'past': w['sayAs'] = 'red (past tense)'
            en_words.append(w)
        out['en'].append(dict(g, words=en_words))
        htext = he_text[k] + (' (%s)' % he_lab[k] if he_lab.get(k) else '')
        hacc = sorted(set().union(*[set(entries[i]['he_acc']) for i in idx]))
        hrank = min(order['he'][i] for i in idx)
        he_words = [{'id': word_id('he', htext), 'text': htext, 'rank': hrank, 'accepted': hacc}]
        seen = sorted(set().union(*[set(entries[i].get('he_seen') or []) for i in idx]) - set(hacc))
        if seen: he_words[0]['seenAs'] = seen
        # Hebrew synonyms share the group's rank (DEFAULT: they are not ranked on their own).
        for syn in {x['text']: x for i in idx for x in entries[i].get('he_more') or []}.values():
            if syn['text'] != he_text[k]:
                he_words.append({'id': word_id('he', syn['text']), 'text': syn['text'], 'rank': hrank, 'accepted': syn['acc']})
        out['he'].append(dict(g, words=he_words))

    source = ('Built by tools/build-dictionary.py from packs/en-he/drills/source/words.txt. Nikkud and inflections: '
              'English Wiktionary via kaikki.org (CC BY-SA 4.0). Frequency ranks: Hermit Dave\'s OpenSubtitles word lists '
              '(CC BY-SA 4.0). Shared under CC BY-SA 4.0.')
    for lang, other in (('en', 'he'), ('he', 'en')):
        with open(os.path.join(DRILLS, 'dictionary-%s.json' % lang), 'w', encoding='utf-8') as f:
            f.write('{\n  "language": "%s",\n  "otherLanguage": "%s",\n  "source": %s,\n  "groups": [\n' % (lang, other, json.dumps(source)))
            f.write(',\n'.join('    ' + json.dumps(g, ensure_ascii=False) for g in out[lang]))
            f.write('\n  ]\n}\n')
    n_en = sum(len(g['words']) for g in out['en'])
    print('%d groups, %d English entries, %d Hebrew entries, from %d lines' % (len(keys), n_en, len(keys), len(lines)))
    write_review(len(lines))

def write_review(n):
    parts = ['# Dictionary: entries for a person to check',
             '',
             'Written by `tools/build-dictionary.py`. The spec (3.3 and section 12, Risks) asks for a person to check',
             'the most common few thousand words. These are the places the build could not confirm on its own.',
             'Fix a line in `packs/en-he/drills/source/words.txt` and run the build again.',
             '']
    sections = [('missing', 'Left out: no nikkud or forms in Wiktionary', 'These lines are not in the dictionary yet. Fill in the nikkud by hand (spec: Dicta\'s nikkud model, checked by a person) or choose another Hebrew word.'),
                ('unconfirmed', 'Translation not confirmed by Wiktionary', 'Wiktionary does not list this pair. Most are fine (Wiktionary is incomplete); check the meaning.'),
                ('assembled', 'Nikkud put together word by word', 'Phrases not in Wiktionary as a whole. Check the nikkud of each word (for example construct forms like בֵּית).'),
                ('adjective', 'Adjectives without feminine and plural forms in Wiktionary', 'Left out until their forms are added. Add them after the Hebrew in words.txt, separated by commas: "lazy | adj | עצלן, עצלנית, עצלנים, עצלניות".'),
                ('adjective_hand', 'Adjective forms written by hand', 'Check these extra forms and spellings.'),
                ('forms', 'Adjective forms from forms.txt', 'Feminine and plural forms given by the owner; the masculine plurals there were added by Claude.'),
                ('hand', 'Nikkud written by hand (nikkud.txt)', 'Wiktionary had no nikkud for these, so Claude wrote it. Check each one.'),
                ('choice', 'Several Hebrew spellings to choose from', 'The build picked one; check it is the right word.'),
                ('labels', 'Labels to improve', '')]
    for key, title, note in sections:
        items = review.get(key, [])
        parts += ['## %s (%d)' % (title, len(items)), '', note, ''] + ['- ' + x for x in items] + ['']
    open(REVIEW, 'w', encoding='utf-8').write('\n'.join(parts))
    print('Review list: %s (%s)' % (os.path.relpath(REVIEW, ROOT), ', '.join('%s %d' % (k, len(v)) for k, v in review.items())))

if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--download': download(sys.argv[2])
    elif len(sys.argv) == 2: build(sys.argv[1])
    else: print(__doc__)
