// Checks the Drills content (two dictionaries and the tagged sentences) against
// the rules in SPEC.md section 3.3. The data format is described in
// docs/drills-data-format.md.
//
// Run it in a terminal:   node tools/validate-drills.js packs/en-he/drills
// Or open it in a browser: tools/validate-drills.html
//
// The same file works in both places: in the browser it defines
// window.DrillsValidator, in Node it exports the same functions.

(function (root) {
  'use strict';

  const POS = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
    'determiner', 'number', 'question', 'modal', 'interjection'];
  const VERB_FORMS = ['past', 'infinitive'];
  const TENSES = ['present', 'past', 'future', 'imperative'];

  const GROUP_FIELDS = ['id', 'pos', 'verbForm', 'otherForm', 'words'];
  const WORD_FIELDS = ['id', 'text', 'rank', 'accepted', 'sayAs', 'seenAs'];
  const SENTENCE_FIELDS = ['id', 'language', 'text', 'tags', 'tenses', 'clauses', 'difficulty'];

  // Hebrew points (nikkud), cantillation marks and Hebrew punctuation.
  const HEBREW_MARKS = /[֑-ׇ]/g;
  const NIKKUD = /[ְ-ׇּׁׂ]/;
  const HEBREW_WORD = /^[א-תְ-ׇּׁׂ׳״]+$/;
  const ENGLISH_WORD = /^[A-Za-z][A-Za-z']*$/;
  const LABEL = /^[A-Za-z][A-Za-z ,'-]*$/;

  // The answer normalization from spec 3.3: lowercase, punctuation removed,
  // nikkud removed. Accepted forms are stored already normalized.
  function normalize(text) {
    return String(text)
      .replace(/־/g, ' ')            // Hebrew hyphen (maqaf) becomes a space
      .replace(HEBREW_MARKS, '')          // nikkud and other Hebrew marks
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')   // punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }

  // "bat (sports)" -> { bare: "bat", label: "sports" }
  function splitLabel(text) {
    const m = /^(.*?) \(([^()]*)\)$/.exec(text);
    return m ? { bare: m[1], label: m[2] } : { bare: text, label: null };
  }

  // A sentence split into normalized words.
  function tokens(text) {
    const n = normalize(text);
    return n ? n.split(' ') : [];
  }

  // Sentence difficulty from spec 3.3: the frequency of its words and its
  // structure (tense, length, clauses). 1 is easiest, 5 is hardest.
  function difficulty(wordCount, maxRank, tenses, clauses) {
    let points = 0;
    points += maxRank <= 100 ? 0 : maxRank <= 300 ? 1 : maxRank <= 1000 ? 2 : 3;
    points += wordCount <= 5 ? 0 : wordCount <= 8 ? 1 : wordCount <= 12 ? 2 : 3;
    if (tenses.some(t => t !== 'present')) points += 1;
    points += Math.max(0, clauses - 1);
    return Math.min(5, 1 + points);
  }

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  function validate(dictionaries, sentencesFile) {
    const errors = [];
    const warnings = [];
    const err = (where, msg) => errors.push(where + ': ' + msg);
    const warn = (where, msg) => warnings.push(where + ': ' + msg);
    const unknownFields = (where, obj, allowed) => {
      for (const k of Object.keys(obj)) {
        if (!allowed.includes(k)) warn(where, 'unknown field "' + k + '" (typo?)');
      }
    };

    const langs = Object.keys(dictionaries);
    if (langs.length !== 2) {
      err('dictionaries', 'there must be exactly two dictionaries, found ' + langs.length);
      return { errors, warnings, stats: {} };
    }

    // Per language: group id -> group, word id -> {word, group}
    const index = {};

    for (const lang of langs) {
      const dict = dictionaries[lang];
      const other = langs.find(l => l !== lang);
      const D = 'dictionary-' + lang;
      index[lang] = { groups: new Map(), words: new Map() };

      if (!isPlainObject(dict)) { err(D, 'is not a JSON object'); continue; }
      if (dict.language !== lang) err(D, '"language" must be "' + lang + '"');
      if (dict.otherLanguage !== other) err(D, '"otherLanguage" must be "' + other + '"');
      if (!Array.isArray(dict.groups) || dict.groups.length === 0) {
        err(D, '"groups" must be a non-empty list');
        continue;
      }

      const texts = new Map();   // exact text -> word id (every entry is distinct)
      const bares = new Map();   // bare text (no label) -> [words]

      dict.groups.forEach((g, gi) => {
        const G = D + ' group #' + (gi + 1) + (g && g.id !== undefined ? ' (id ' + g.id + ')' : '');
        if (!isPlainObject(g)) { err(G, 'is not an object'); return; }
        unknownFields(G, g, GROUP_FIELDS);

        if (!Number.isInteger(g.id) || g.id < 1) err(G, '"id" must be a whole number, 1 or more');
        else if (index[lang].groups.has(g.id)) err(G, 'group id ' + g.id + ' is used twice');
        else index[lang].groups.set(g.id, g);

        if (!POS.includes(g.pos)) err(G, '"pos" must be one of: ' + POS.join(', '));
        if (g.pos === 'verb') {
          if (!VERB_FORMS.includes(g.verbForm)) err(G, 'a verb group needs "verbForm": "past" or "infinitive"');
          // A past verb with no Hebrew infinitive ("deserved" = הִגִּיעַ לוֹ) may have no other form.
          if (!Number.isInteger(g.otherForm) && !(g.verbForm === 'past' && g.otherForm === undefined)) err(G, 'a verb group needs "otherForm": the id of the group with its other verb form');
        } else {
          if (g.verbForm !== undefined) err(G, '"verbForm" is only for verb groups');
          if (g.otherForm !== undefined) err(G, '"otherForm" is only for verb groups');
        }

        if (!Array.isArray(g.words) || g.words.length === 0) {
          err(G, '"words" must hold at least one word');
          return;
        }

        g.words.forEach((w, wi) => {
          const W = G + ' word #' + (wi + 1) + (w && w.text ? ' "' + w.text + '"' : '');
          if (!isPlainObject(w)) { err(W, 'is not an object'); return; }
          unknownFields(W, w, WORD_FIELDS);

          // Word id: unique, so each entry is in exactly one group.
          if (typeof w.id !== 'string' || !w.id.startsWith(lang)) {
            err(W, '"id" must be text starting with "' + lang + '"');
          } else if (index[lang].words.has(w.id)) {
            err(W, 'word id "' + w.id + '" is used twice (an entry can be in only one group)');
          } else {
            index[lang].words.set(w.id, { word: w, group: g });
          }

          if (typeof w.text !== 'string' || w.text.trim() !== w.text || w.text === '') {
            err(W, '"text" must be non-empty text with no spaces at the ends');
            return;
          }

          // Unique entries.
          if (texts.has(w.text)) err(W, 'the same entry appears twice; add a label in brackets to tell them apart');
          texts.set(w.text, w.id);

          // Labels: English, in brackets, at the end.
          const { bare, label } = splitLabel(w.text);
          if (label !== null && !LABEL.test(label)) err(W, 'the label "' + label + '" must be English words');
          if (/[()]/.test(bare)) err(W, 'brackets are only allowed for one label at the end, like "bat (sports)"');
          if (!bares.has(bare)) bares.set(bare, []);
          bares.get(bare).push({ w, label, group: g });

          const parts = bare.split(/[ ־]/);
          if (w.text.normalize('NFC') !== w.text) err(W, 'text must be stored in Unicode NFC form');
          if (lang === 'he') {
            for (const p of parts) {
              if (!HEBREW_WORD.test(p)) err(W, '"' + p + '" must be Hebrew letters and nikkud only');
              else if (!NIKKUD.test(p)) err(W, '"' + p + '" has no nikkud (every Hebrew entry is written with nikkud)');
            }
          } else {
            for (const p of parts) {
              if (!ENGLISH_WORD.test(p)) err(W, '"' + p + '" must be English letters only');
            }
            if (/^(the|a|an) /i.test(bare)) err(W, 'entries are in dictionary form, without "the", "a" or "an"');
          }

          // Frequency rank.
          if (!Number.isInteger(w.rank) || w.rank < 1) err(W, '"rank" must be a whole number, 1 or more');

          // Accepted forms.
          if (!Array.isArray(w.accepted) || w.accepted.length === 0) {
            err(W, '"accepted" must list at least one accepted answer');
          } else {
            const seen = new Set();
            for (const a of w.accepted) {
              if (typeof a !== 'string' || a === '') { err(W, 'an accepted form is empty'); continue; }
              if (normalize(a) !== a) err(W, 'accepted form "' + a + '" must be stored normalized, as "' + normalize(a) + '"');
              if (seen.has(a)) err(W, 'accepted form "' + a + '" is listed twice');
              seen.add(a);
              if (lang === 'he' && /[a-z]/.test(a)) err(W, 'accepted form "' + a + '" must be in Hebrew');
              if (lang !== 'he' && /[֐-׿]/.test(a)) err(W, 'accepted form "' + a + '" must not be in Hebrew');
            }
            if (lang !== 'he' && !seen.has(normalize(bare))) {
              err(W, 'accepted forms must include the word itself, "' + normalize(bare) + '"');
            }
            if (g.pos === 'verb' && lang === 'en' && g.verbForm === 'infinitive') {
              if (!/^to /.test(bare)) err(W, 'an English infinitive starts with "to", like "to go"');
              else if (!seen.has(normalize(bare).slice(3))) err(W, 'an English infinitive also accepts the word without "to" ("' + normalize(bare).slice(3) + '")');
            }
            if (g.pos === 'verb' && lang === 'en' && g.verbForm === 'past' && /^to /.test(bare)) {
              err(W, 'a past form does not start with "to"');
            }
            if (g.pos === 'verb' && lang === 'he' && g.verbForm === 'infinitive' && !normalize(bare).startsWith('ל')) {
              err(W, 'a Hebrew infinitive starts with ל');
            }
            if (g.pos === 'verb' && lang === 'he' && g.verbForm === 'past' && seen.size < 7) {
              err(W, 'a Hebrew past verb accepts every person and gender (at least 7 different spellings), found ' + seen.size);
            }
            if (g.pos === 'adjective' && lang === 'he' && seen.size < 3) {
              err(W, 'a Hebrew adjective accepts every gender and number (at least 3 different spellings), found ' + seen.size);
            }
          }

          // Optional "seen as": spellings that point at this entry in sentences and in the chat
          // (Hebrew future and command forms) but are not accepted as answers.
          if (w.seenAs !== undefined) {
            if (!Array.isArray(w.seenAs)) err(W, '"seenAs" must be a list');
            else for (const a of w.seenAs) {
              if (typeof a !== 'string' || normalize(a) !== a) err(W, 'seen-as form "' + a + '" must be stored normalized');
              else if ((w.accepted || []).includes(a)) err(W, 'seen-as form "' + a + '" is already an accepted answer');
            }
          }

          // Optional "say as".
          if (w.sayAs !== undefined) {
            if (typeof w.sayAs !== 'string' || w.sayAs.trim() === '') err(W, '"sayAs" must be non-empty text');
            else if (w.sayAs === w.text) err(W, '"sayAs" is the same as the text; leave it out');
          }
        });
      });

      // Same spelling, several meanings: every one of them needs a label.
      for (const [bare, list] of bares) {
        if (list.length > 1) {
          for (const { w, label } of list) {
            if (label === null) err(D + ' "' + w.text + '"', 'there are ' + list.length + ' entries spelled "' + bare + '"; each needs a label in brackets');
          }
        }
      }

      // English only: a word spelled like an accepted answer of another group
      // ("put" the past form vs "to put") needs a label to tell them apart.
      if (lang === 'en') {
        const acceptedIn = new Map();
        for (const g of dict.groups) {
          for (const w of (g && g.words) || []) {
            for (const a of (w && w.accepted) || []) {
              if (!acceptedIn.has(a)) acceptedIn.set(a, new Set());
              acceptedIn.get(a).add(g);
            }
          }
        }
        for (const [bare, list] of bares) {
          for (const { w, label, group } of list) {
            if (label !== null) continue;
            const users = acceptedIn.get(normalize(bare));
            if (users && [...users].some(g => g !== group)) {
              err(D + ' "' + w.text + '"', 'another group also accepts "' + normalize(bare) + '", so this entry needs a label in brackets');
            }
          }
        }
      }

      // Past and infinitive point at each other inside one dictionary.
      for (const g of dict.groups) {
        if (!g || g.pos !== 'verb' || !Number.isInteger(g.otherForm)) continue;
        const G = D + ' group ' + g.id;
        const o = index[lang].groups.get(g.otherForm);
        if (!o) { err(G, '"otherForm" points at group ' + g.otherForm + ', which does not exist'); continue; }
        if (o.pos !== 'verb' || o.verbForm === g.verbForm) err(G, '"otherForm" must point at a verb group with the other form (past/infinitive)');
        else if (o.otherForm !== g.id) err(G, 'group ' + o.id + ' must point back with "otherForm": ' + g.id);
      }
    }

    // Every group points at exactly one group in the other language, in both
    // directions: the two dictionaries have the same set of group ids.
    const [a, b] = langs;
    if (index[a] && index[b]) {
      for (const [x, y] of [[a, b], [b, a]]) {
        for (const [id, g] of index[x].groups) {
          const partner = index[y].groups.get(id);
          const G = 'group ' + id + ' (' + x + ': ' + ((g.words || []).map(w => w && w.text).join(', ')) + ')';
          if (!partner) { err(G, 'has no partner group with id ' + id + ' in dictionary-' + y); continue; }
          if (x !== a) continue; // compare each pair once
          if ((g.verbForm || null) !== (partner.verbForm || null)) {
            err(G, 'is "' + (g.verbForm || g.pos) + '" but its partner in ' + y + ' is "' + (partner.verbForm || partner.pos) + '"; a past form translates only to a past form, an infinitive only to an infinitive');
          }
          if (g.pos === 'verb' && partner.pos === 'verb' && g.otherForm !== partner.otherForm) {
            err(G, 'its other verb form is group ' + g.otherForm + ' but in ' + y + ' it is group ' + partner.otherForm + '; they must match');
          }
          if (g.pos !== partner.pos) warn(G, 'part of speech "' + g.pos + '" differs from its partner\'s "' + partner.pos + '"');
        }
      }
      if (index[a].groups.size !== index[b].groups.size) {
        err('dictionaries', 'both dictionaries need the same number of groups (' + a + ': ' + index[a].groups.size + ', ' + b + ': ' + index[b].groups.size + ')');
      }
    }

    // Sentences.
    const S = 'sentences';
    let sentenceCount = 0;
    if (!isPlainObject(sentencesFile)) {
      err(S, 'is not a JSON object');
    } else {
      const untagged = {};
      for (const lang of langs) {
        const list = sentencesFile.untaggedWords && sentencesFile.untaggedWords[lang];
        if (!Array.isArray(list)) { err(S, '"untaggedWords" needs a list for "' + lang + '"'); untagged[lang] = new Set(); continue; }
        for (const u of list) if (normalize(u) !== u) err(S, 'untagged word "' + u + '" must be stored normalized, as "' + normalize(u) + '"');
        untagged[lang] = new Set(list);
      }
      const ids = new Set();
      const list = Array.isArray(sentencesFile.sentences) ? sentencesFile.sentences : [];
      if (!Array.isArray(sentencesFile.sentences)) err(S, '"sentences" must be a list');
      sentenceCount = list.length;

      list.forEach((s, si) => {
        const W = 'sentence #' + (si + 1) + (s && s.id ? ' (' + s.id + ')' : '');
        if (!isPlainObject(s)) { err(W, 'is not an object'); return; }
        unknownFields(W, s, SENTENCE_FIELDS);
        if (typeof s.id !== 'string' || s.id === '') err(W, '"id" must be text');
        else if (ids.has(s.id)) err(W, 'id "' + s.id + '" is used twice');
        ids.add(s.id);
        if (!langs.includes(s.language)) { err(W, '"language" must be one of: ' + langs.join(', ')); return; }
        if (typeof s.text !== 'string' || s.text.trim() === '') { err(W, '"text" must be non-empty'); return; }
        if (s.language === 'he' && /[a-z]/i.test(s.text)) err(W, 'a Hebrew sentence must not contain English letters');
        if (s.language !== 'he' && /[֐-׿]/.test(s.text)) err(W, 'an English sentence must not contain Hebrew');

        const words = tokens(s.text);
        let maxRank = 0;
        let pos = 0;   // walks through the sentence's words, left to right

        if (!Array.isArray(s.tags) || s.tags.length === 0) {
          err(W, '"tags" must list the words of the sentence');
        } else {
          for (const t of s.tags) {
            if (!isPlainObject(t) || typeof t.text !== 'string' || typeof t.word !== 'string') {
              err(W, 'each tag needs "text" (as written in the sentence) and "word" (an entry id)');
              continue;
            }
            const found = index[s.language] && index[s.language].words.get(t.word);
            if (!found) err(W, 'tag "' + t.text + '" points at "' + t.word + '", which is not in dictionary-' + s.language);
            else maxRank = Math.max(maxRank, found.word.rank || 0);

            // Tags are in sentence order. Every word between them must be an
            // untagged grammar word.
            const tw = tokens(t.text);
            let at = -1;
            for (let i = pos; tw.length && i + tw.length <= words.length; i++) {
              if (matchesAt(words, i, tw)) { at = i; break; }
            }
            if (at < 0) {
              err(W, 'tag "' + t.text + '" was not found in the sentence (tags must be in sentence order)');
              continue;
            }
            missingTags(words.slice(pos, at));
            pos = at + tw.length;
          }
          missingTags(words.slice(pos));
        }
        function missingTags(list) {
          for (const x of list) {
            if (!untagged[s.language].has(x)) {
              err(W, 'the word "' + x + '" has no tag (tag it, or add it to "untaggedWords" if it has no dictionary entry)');
            }
          }
        }

        if (!Array.isArray(s.tenses) || s.tenses.length === 0 || s.tenses.some(t => !TENSES.includes(t))) {
          err(W, '"tenses" must list one or more of: ' + TENSES.join(', '));
        }
        if (!Number.isInteger(s.clauses) || s.clauses < 1) err(W, '"clauses" must be a whole number, 1 or more');
        if (Array.isArray(s.tenses) && Number.isInteger(s.clauses)) {
          const d = difficulty(words.length, maxRank, s.tenses, s.clauses);
          if (s.difficulty !== d) err(W, '"difficulty" should be ' + d + ' (from ' + words.length + ' words, rarest word rank ' + maxRank + ', tenses and clauses)');
        }
      });
    }

    const stats = { sentences: sentenceCount };
    for (const lang of langs) {
      if (index[lang]) {
        stats[lang] = { groups: index[lang].groups.size, entries: index[lang].words.size };
      }
    }
    return { errors, warnings, stats };
  }

  function matchesAt(words, pos, part) {
    if (pos + part.length > words.length) return false;
    for (let i = 0; i < part.length; i++) if (words[pos + i] !== part[i]) return false;
    return true;
  }

  const api = { validate, normalize, splitLabel, tokens, difficulty };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      const fs = require('fs');
      const path = require('path');
      const dir = process.argv[2] || path.join(__dirname, '..', 'packs', 'en-he', 'drills');
      const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      let dicts, sentences;
      try {
        dicts = { en: read('dictionary-en.json'), he: read('dictionary-he.json') };
        sentences = read('sentences.json');
      } catch (e) {
        console.error('Could not read the files in ' + dir + ': ' + e.message);
        process.exit(2);
      }
      const r = validate(dicts, sentences);
      for (const w of r.warnings) console.log('WARNING ' + w);
      for (const e of r.errors) console.log('ERROR   ' + e);
      console.log(JSON.stringify(r.stats));
      console.log(r.errors.length ? r.errors.length + ' error(s). Not valid.' : 'Valid: every rule passed (' + r.warnings.length + ' warning(s)).');
      process.exit(r.errors.length ? 1 : 0);
    }
  } else {
    root.DrillsValidator = api;
  }
})(typeof window !== 'undefined' ? window : this);
