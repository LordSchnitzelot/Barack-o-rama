# Drills data format

This describes how the Drills content is stored: the two dictionaries and the tagged sentences
from SPEC.md section 3.3. A script checks every rule below (see "Checking the data").

The files live in the English-for-Hebrew-speakers language pack:

| File | What it holds |
| --- | --- |
| `packs/en-he/drills/dictionary-en.json` | The English dictionary (English to Hebrew) |
| `packs/en-he/drills/dictionary-he.json` | The Hebrew dictionary (Hebrew to English) |
| `packs/en-he/drills/sentences.json` | The tagged sentences, English and Hebrew |

All three are plain JSON text files, so the app can load them as they are, with no build step.

## The dictionaries

Each dictionary is a list of **groups**. A group holds one or more words that mean the same thing
(synonyms). Each group has a number (`id`), and **the English group and its Hebrew partner have the
same number**. That is how a group "points at" its partner: group 151 in the English file is
{"big", "large"}, and group 151 in the Hebrew file is {גָּדוֹל}.

```json
{"id": 151, "pos": "adjective", "words": [
  {"id": "en169", "text": "big",   "rank": 149, "accepted": ["big"]},
  {"id": "en170", "text": "large", "rank": 201, "accepted": ["large"]}
]}
```

```json
{"id": 151, "pos": "adjective", "words": [
  {"id": "he165", "text": "גָּדוֹל", "rank": 149, "accepted": ["גדול", "גדולה", "גדולים", "גדולות"]}
]}
```

### Group fields

| Field | Meaning |
| --- | --- |
| `id` | The group number. Shared with the partner group in the other dictionary. |
| `pos` | Part of speech: `noun`, `verb`, `adjective`, `adverb`, `pronoun`, `preposition`, `conjunction`, `determiner`, `number`, `question`, `modal` or `interjection`. All words in a group share it. |
| `verbForm` | Verbs only: `infinitive` or `past`. |
| `otherForm` | Verbs only: the number of the group with the same verb's other form. "to go" points at "went" and back. |
| `words` | The words (entries) in the group. |

### Word (entry) fields

| Field | Meaning |
| --- | --- |
| `id` | A permanent name for the entry, such as `en169` or `he165`. Progress is saved against this, so it never changes, even if the spelling is corrected. |
| `text` | The word as shown on screen and spoken. English: plain, such as `big`. Hebrew: with nikkud, such as `גָּדוֹל`. A label, if needed, goes at the end in brackets: `bat (sports)`. |
| `rank` | The frequency rank: 1 is the most common. New words are taught from rank 1 down. |
| `accepted` | Every answer that counts as correct for this word, already **normalized** (lowercase, no punctuation, no nikkud), because that is how spoken answers are compared. |
| `sayAs` | Optional. Only for words spelled alike but pronounced differently. The app speaks this instead of `text`. Example: `read (past tense)` has `"sayAs": "red (past tense)"`. |

### How a drill uses this

1. The app picks a group, then one word from it, and plays it. Example: English group 151, word "large".
2. The learner answers out loud. The answer is normalized (lowercase, punctuation and nikkud removed).
3. The answer is correct if it matches **any accepted form of any word in the partner group**.
   For "large", the partner is Hebrew group 151, so גדול, גדולה, גדולים or גדולות are all correct.
4. Progress is saved per word, using its `id`, so "big" and "large" are tracked separately.

### Verbs

Every verb has two group pairs, tested separately: the infinitive and the past.

| Group | English | Hebrew |
| --- | --- | --- |
| infinitive | "to go" (accepts "to go" and "go") | לָלֶכֶת |
| past | "went" | הָלַךְ (accepts הלך, הלכה, הלכתי, הלכת, הלכנו, הלכתם, הלכתן, הלכו) |

The two groups point at each other with `otherForm`. A past group's partner is always a past group,
so saying "go" for הָלַךְ is wrong.

Hebrew present tense (הולך, רוצה) is not a separate entry, because the spec only has past and
infinitive entries. In sentences, present-tense words are tagged with the infinitive entry.

### Labels

A label is needed when two entries are spelled the same but mean different things, such as
`time (occasion)` = פַּעַם and `time (duration)` = זְמַן, or Hebrew `עַל (on top of)` = "on" and
`עַל (about a topic)` = "about". Labels are always in English.

In English, a label is also needed when a word is spelled like an answer of another group:
`put (past tense)` needs a label because "put" is also an accepted answer for "to put".

Hebrew words with the same letters but different nikkud need no label, because the nikkud tells them
apart: שָׁם (there), שָׂם (put) and שֵׁם (name).

## The sentences

```json
{"id": "en-s1", "language": "en", "text": "I want to go home.",
 "tags": [{"text": "I", "word": "en6"}, {"text": "want", "word": "en94"},
          {"text": "to go", "word": "en31"}, {"text": "home", "word": "en225"}],
 "tenses": ["present"], "clauses": 1, "difficulty": 2}
```

| Field | Meaning |
| --- | --- |
| `id` | A permanent name for the sentence. |
| `language` | `en` or `he`. No translation is stored (spec 3.3). |
| `text` | The sentence as shown and spoken. |
| `tags` | The words of the sentence, in order. `text` is the word as written in the sentence ("likes", "children", "בבית ספר"); `word` is the `id` of the exact dictionary entry it belongs to ("to like", "child", בֵּית סֵפֶר). One tag can cover several words, such as "to go". |
| `tenses` | One or more of `present`, `past`, `future`, `imperative`. |
| `clauses` | How many clauses the sentence has ("I think this is a good idea" has 2). |
| `difficulty` | 1 (easiest) to 5. Calculated from the rarest word's rank, the number of words, the tenses and the clauses (see below). |

Every word in a sentence must have a tag, except small grammar words that have no dictionary entry.
Those are listed once at the top of the file, in `untaggedWords`: for English "the", "a", "an",
"is", "am", "are", "it", "and", "in", "at", "will", "do", "does"; for Hebrew את.

**Difficulty** starts at 1 and adds points: rarest word rank over 100 (+1), over 300 (+2), over
1000 (+3); more than 5 words (+1), more than 8 (+2), more than 12 (+3); any tense other than present
(+1); each clause after the first (+1). The highest level is 5. These numbers are a first guess and
can be tuned.

## Checking the data

The checker (`tools/validate-drills.js`) tests every rule:

- There are exactly two dictionaries, and both have the same set of group numbers, so every group
  points at exactly one group in the other language, in both directions.
- Group numbers are unique, every group has at least one word, and every word `id` appears only
  once, so every entry is in exactly one group.
- Every entry is distinct. Entries spelled the same need labels; labels are English, in brackets,
  at the end.
- English entries are English letters only and have no "the", "a" or "an". Hebrew entries are
  Hebrew letters only, and every Hebrew word has nikkud.
- Every entry has a frequency rank (a whole number, 1 or more).
- Every entry has accepted forms, stored normalized, with no repeats. English entries accept the
  word itself. English infinitives start with "to" and also accept the word without "to". Hebrew
  infinitives start with ל. Hebrew past verbs list every person and gender (at least 7 different
  spellings). Hebrew adjectives list every gender and number (at least 3 different spellings, since
  some forms share a spelling, such as שונה).
- Verb groups have a form (past or infinitive) and point at their other form, which points back. A
  past group's partner is a past group, and an infinitive's partner is an infinitive.
- "Say as", when present, is not empty and differs from the word.
- Every sentence tag points at an entry in the sentence's own language, the tags follow the
  sentence's word order, and every word is tagged or listed in `untaggedWords`.
- Every sentence has valid tenses and clauses, and its difficulty matches the calculation.
- Unknown field names (usually typos) are reported as warnings.

Some rules can only be checked by a person, not by code: that nouns are singular, that Hebrew nouns
have no attached prefixes (ה, ו, ב, ל, מ, כ, ש), that the nikkud is correct, and that the
translations are right.

**On a computer**, run:

```bash
node tools/validate-drills.js
```

**In a browser**, open `tools/validate-drills.html` on the live site. It shows "All rules pass" or
a list of problems.

`node tools/test-validate-drills.js` proves the checker works: it breaks each rule on purpose in a
copy of the data and checks that the problem is reported.

## The starter set

The starter set has the 300 most common English words, as 365 group pairs (394 English entries and
387 Hebrew entries), plus 60 tagged sentences (50 English, 10 Hebrew).

- **Where it came from.** It was written by hand to test the format; no outside dictionary was
  copied, so there is no license question for it. The frequency ranks are approximate, based on
  common English word-frequency lists. **The Hebrew ranks are copied from their English partners**
  for now. Build step 6 replaces this with a licensed dictionary and real frequency data.
- **How the 300 words were counted.** Each counted word is a dictionary headword, so "go" counts once
  but gives two entries ("to go" and "went"), and "know" gives four ("to know (a fact)",
  "to know (a person)", "knew (a fact)", "knew (a person)"). "people" is stored as "person"
  (nouns are singular).
- **Words with one shared Hebrew translation are one group.** For example {"to do", "to make"} =
  לַעֲשׂוֹת, {"no", "not"} = לֹא, {"woman", "wife"} = אִשָּׁה, {"child", "boy"} = יֶלֶד.
- **Words left out.** Going down a common-words list, 150 words were skipped to reach 300 usable ones.
  47 have no single Hebrew dictionary word or would break a rule:

| Word | Why it was left out |
| --- | --- |
| the | Hebrew uses the prefix ה |
| and | Hebrew uses the prefix ו |
| a | no Hebrew word |
| in | Hebrew uses the prefix ב |
| have | no Hebrew verb; Hebrew uses יש ל |
| it | Hebrew uses הוא/היא/זה depending on gender |
| at | Hebrew uses the prefix ב or אצל |
| by | several Hebrew words (על ידי, ליד) |
| as | Hebrew uses כ or כמו |
| would, will, could | Hebrew uses verb tense |
| into | Hebrew uses לתוך |
| than | Hebrew uses the prefix מ |
| its | Hebrew uses שלו/שלה depending on gender |
| well, any, through, should, over, become, most, another, seem, such, must | several Hebrew words |
| may, might | Hebrew uses אולי or verb tense |
| state | mostly a US meaning |
| own, let | no single Hebrew word |
| while | Hebrew uses בזמן ש |
| same | Hebrew uses אותו, which is already "him" |
| turn, case, off, point, set | many meanings |
| American | proper adjective |
| next | Hebrew uses הבא, with the prefix ה |
| lot | Hebrew uses הרבה, already "many" |
| kid, anything, perhaps, yeah | same Hebrew word as an included word (ילד, משהו, אולי, כן); could be added to those groups later |
| person | included, as the singular of "people" |
| oh | interjection |

  The other 103 were simply not chosen for this starter set: few, each, national, though, issue,
  since, provide, away, yet, political, among, ever, however, member, include, once, least, real,
  best, several, ago, lead, social, whether, follow, create, public, others, allow, add, spend,
  sure, within, grow, result, guy, himself, force, offer, across, although, second, toward, able,
  policy, process, including, consider, appear, actually, human, serve, market, expect, sense,
  build, nation, plan, cut, college, interest, death, course, experience, reach, local, kill,
  remain, effect, suggest, control, raise, care, field, else, pass, former, major, require, along,
  development, themselves, report, role, better, economic, effort, rate, drug, leader, light, mind,
  pull, free, military, less, according, decision, develop, view, relationship, carry, town.
