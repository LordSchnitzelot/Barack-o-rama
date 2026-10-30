# Dictionary and word-frequency sources

Research for build step 6 in `SPEC.md` (Drills content): where the English–Hebrew dictionary and
the word-frequency ranks come from. The choices below are recorded in `SPEC.md` section 3.3.

The app is a personal project and will not be sold. Even so, the site is public on GitHub Pages,
so we only use sources whose owners allow free reuse, and we credit them.

Researched October 2026.

## The choice

| What | Source | Why |
|---|---|---|
| **Dictionary** | **English Wiktionary**, downloaded as ready-made files from [kaikki.org](https://kaikki.org/dictionary/Hebrew/) | Written by people, large enough, and nearly every Hebrew entry already has nikkud. |
| **Frequency ranks** | **Film and TV subtitle word counts** ([Hermit Dave's OpenSubtitles lists](https://github.com/hermitdave/FrequencyWords)), for Hebrew and English | Close to everyday spoken language, which suits a speaking app. |
| **Missing nikkud** | **Dicta's nikkud model** ([DictaBERT-menaked](https://huggingface.co/dicta-il/dictabert-large-char-menaked)), checked by a person | Free, made for modern Hebrew. |

**What we owe in return:** a Credits line in the app naming Wiktionary, the OpenSubtitles lists
and Dicta. Because Wiktionary uses the CC BY-SA license, the dictionary files we build are shared
under the same license. Since they sit in a public repository anyway, this changes nothing for us.

## What we measured in the Wiktionary data

We downloaded the kaikki.org Hebrew file and compared it with the 5,000 most common Hebrew words
in film subtitles:

- It has 18,182 entries (14,397 different words): mostly nouns (9,373), verbs (3,720) and
  adjectives (1,710). The file is 57 MB before we trim it.
- 94% of entries have nikkud, for example כֶּלֶב (plural כְּלָבִים).
- Each entry lists the word's forms (plurals, verb forms and so on). With these, and after removing
  a leading ו, ה, ב, ל, מ, כ or ש, about **98% of the top 1,000** and **93% of the top 5,000**
  common words can be linked to a dictionary entry. This is a rough count; removing the leading
  letter sometimes matches the wrong word.
- The English → Hebrew direction comes from the "translations" sections of English entries. These
  often have nikkud, but not always.

## What the build step still has to do

Wiktionary does not fit the structure in `SPEC.md` section 3.3 by itself. Build step 6 must:

1. form the synonym groups and pair each English group with one Hebrew group,
2. add labels for words that sound the same, such as "bat (animal)" and "bat (sports)",
3. add nikkud where it is missing,
4. give each word a frequency rank by adding up the counts of all its forms
   (for example בַּיִת = בית + הבית + בבית + …),
5. have a person check at least the most common few thousand words.

## Other sources we looked at

| Source | Why not the main choice |
|---|---|
| Wikidata Lexemes | Free, but most Hebrew words there have no English meaning yet. Possible supplement. |
| WikDict / FreeDict | A simplified copy of Wiktionary; using Wiktionary directly is better. |
| MUSE (Facebook), PanLex | Machine-made word lists with no nikkud; lower quality. |
| Hebrew WordNet (University of Haifa) | Small (about 5,000 meaning groups) and old. |
| MILA lexicon (Technion) | Built for computer word analysis, not for learners. |
| wordfreq | Good alternative for English frequency; mixes several kinds of text. Frozen since 2021, which is fine. |
| Morfix, Pealim, Milog, Even-Shoshan | Good for looking up a word by hand, but their owners do not allow copying their data. |

## Sources

- kaikki.org Hebrew data (from English Wiktionary): https://kaikki.org/dictionary/Hebrew/
- Wiktionary license: https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- FrequencyWords: https://github.com/hermitdave/FrequencyWords
- wordfreq: https://github.com/rspeer/wordfreq
- DictaBERT-large-char-menaked: https://huggingface.co/dicta-il/dictabert-large-char-menaked
- Wikidata lexeme statistics: https://www.wikidata.org/wiki/Wikidata:Lexicographical_data/Statistics
- MUSE: https://github.com/facebookresearch/MUSE
- PanLex: https://panlex.org/
- Hebrew WordNet: https://cl.haifa.ac.il/projects/mwn/index.shtml
- Hebrew NLP resource list: https://github.com/NLPH/NLPH_Resources
