# Dictionary and word-frequency sources

Research for the open question in `SPEC.md` (section 11 step 6 and Open questions): which free
English–Hebrew dictionary and which word-frequency lists we could use. The app might be sold
later, so each source's license has to allow commercial use.

Researched October 2026. This is not legal advice. Before a commercial release, check the current
license of each source again.

## Short answer

- **Dictionary:** use **English Wiktionary**, downloaded as ready-made files from
  [kaikki.org](https://kaikki.org/dictionary/Hebrew/). It allows commercial use, it is large
  enough, and nearly all of its Hebrew entries already have nikkud.
- **Frequency ranks:** use the **OpenSubtitles frequency lists** by Hermit Dave for Hebrew, and
  either the same lists or **wordfreq** for English. Both allow commercial use.
- **Missing nikkud:** fill gaps with **DictaBERT-menaked**, a free Hebrew nikkud model, and have a
  person check the result.
- **Avoid:** MUSE, PanLex, MILA, Morfix, Pealim and Milog. Their licenses do not allow commercial
  use, or don't clearly allow it.

The main catch: most good free sources use a **share-alike** license (CC BY-SA). We can still
sell the app, but the dictionary files we build must be published under the same license, with
credit, so anyone could reuse our dictionary. The app's own code is not affected.

## License words in plain language

| License | What it means for us |
|---|---|
| **CC0** | No conditions. Use it any way you like. |
| **CC BY** | Commercial use allowed. We must credit the source (for example on an "About" screen). |
| **CC BY-SA** ("share-alike") | Like CC BY, but the data we build from it must be shared under CC BY-SA too. We can still sell the app. Other people could legally copy our dictionary file. |
| **CC BY-NC** ("non-commercial") | **Not allowed** in an app that is sold or earns money. |
| **GPL / AGPL** | Licenses written for software. Using them for data in a paid app is unclear, and they can require us to publish our code. Best avoided. |

## Dictionary sources compared

| Source | License | Commercial use | Size (Hebrew) | Nikkud | Quality and notes |
|---|---|---|---|---|---|
| **English Wiktionary via kaikki.org** | CC BY-SA 4.0 (also GFDL) | Yes, share-alike | 18,182 entries (14,397 distinct words), 57 MB file | **Yes**, in 94% of entries (measured) | Good. Hand-written by volunteers. Each entry has a part of speech, English meanings, plural, gender and verb forms. Most entries are nouns (9,373), verbs (3,720) and adjectives (1,710). Updated monthly. |
| **Wikidata Lexemes** | CC0 | Yes, no conditions | About 29,600 Hebrew lexemes (not verified), but only about 7,500 have meanings | Partly | Most free license, but many entries have no English meaning attached yet. Useful as a supplement, not as the main source. |
| **WikDict / FreeDict** (en–he) | CC BY-SA (built from Wiktionary) | Yes, share-alike | Smaller than Wiktionary | Mostly no | Built from the same Wiktionary data, but simplified. Using Wiktionary directly is better. |
| **Hebrew WordNet** (University of Haifa) | Unclear (listed as GPL in one study, "open" in another) | Unclear | About 5,000 meaning groups (2006) | No | Small and old. Its meaning groups would match our "groups" idea well, but the license could not be confirmed. |
| **MUSE** (Facebook) | CC BY-NC 4.0 | **No** | Large (machine-made) | No | Non-commercial. The project is also archived. |
| **PanLex** | CC BY-NC-SA 4.0 on its license page (download pages say CC0) | **No**, without written permission | Large | No | The two pages disagree. Its official license page wins, and it forbids commercial use. |
| **MILA lexicon** (Technion) | GPLv3, non-profit wording | Unclear | Large (morphology) | Partly | Built for computer word analysis, not for learners. License is unclear for a paid app. |
| **Morfix, Pealim, Milog, Even-Shoshan** | Copyrighted | **No** | Large | Yes | Good to look things up by hand, but we may not copy their data. |

### What we measured in the Wiktionary data

We downloaded the kaikki.org Hebrew file and compared it with the 5,000 most common Hebrew words
in film subtitles:

- 94% of entries have nikkud, for example כֶּלֶב (plural כְּלָבִים).
- Wiktionary lists the forms of each word (plurals, verb forms, and so on). With these forms, and
  after removing a leading ו, ה, ב, ל, מ, כ or ש, about **98% of the top 1,000** and **93% of the
  top 5,000** common words can be linked back to a dictionary entry. This is a rough count;
  removing the leading letter sometimes matches the wrong word.
- The English → Hebrew direction comes from the "translations" sections of English Wiktionary
  entries. They often have nikkud, but not always, so some will need nikkud added.

### What Wiktionary does not give us ready-made

Wiktionary does not fit the structure in `SPEC.md` section 3.3 by itself. A build step will still
need to:

- form the synonym groups and pair each English group with one Hebrew group,
- add labels for words that sound the same, such as "bat (animal)" and "bat (sports)",
- add nikkud where it is missing,
- check the result, at least for the most common few thousand words.

## Frequency lists compared

| Source | License | Commercial use | Languages | Notes |
|---|---|---|---|---|
| **Hermit Dave's FrequencyWords** (OpenSubtitles 2018) | Data CC BY-SA 4.0, code MIT | Yes, share-alike | Hebrew and English (50,000 words each, plus full lists) | Made from film and TV subtitles, so it is close to everyday spoken language, which suits a speaking app. Words are counted as written (for example "והבית" counts separately from "בית"), so they must be linked to dictionary forms. No updates since 2018. |
| **wordfreq** | Data CC BY-SA 4.0, code Apache/MIT | Yes, share-alike, plus credit to the SUBTLEX authors | Hebrew and English | Combines 5 sources for Hebrew (Wikipedia, subtitles, books, web, Twitter), so it is less biased toward one kind of text. Frozen since 2021, which is fine for common words. |
| **SUBTLEX-US** (English) | No written license; its authors allow any use with credit (as reported by wordfreq) | Probably yes, with credit | English only | Respected English list from subtitles. Already included in wordfreq. |
| **Leipzig Corpora Collection** | Reported as CC BY 4.0, but some pages say non-commercial | Unclear | Hebrew and English | We could not open the official terms page. Use only after confirming the license. |
| **BYU Hebrew frequency dictionary** | Copyrighted | No | Hebrew | Do not use. |

## Adding missing nikkud

| Tool | License | Notes |
|---|---|---|
| **DictaBERT-large-char-menaked** (Dicta) | CC BY 4.0 | Free model that adds nikkud to modern Hebrew. Commercial use is allowed with credit. Best on whole sentences; on single words it can pick the wrong reading, so a person should check. |
| **Phonikud** | Code CC BY 4.0; model weights not confirmed | Built on the Dicta model. Check its license file before using it. |
| **Dicta Nakdan website** | Terms not found | Good for checking words by hand. Do not run the whole dictionary through it until the terms are confirmed. |

## Recommendation

1. **Main dictionary:** English Wiktionary from kaikki.org (CC BY-SA 4.0). It is the only source
   that is free for commercial use, large enough, of good quality, and already has nikkud.
2. **Frequency ranks:** Hebrew from Hermit Dave's OpenSubtitles list, because it reflects spoken
   language. English from the same project for consistency, or from wordfreq. Rank dictionary
   words by adding up the counts of all their forms (for example, בית + הבית + בבית + …).
3. **Nikkud gaps:** fill them with DictaBERT-menaked, then check by hand.
4. **Optional:** Wikidata Lexemes (CC0) for extra words or checks.
5. **Credits:** add an "About / Credits" screen naming Wiktionary, the OpenSubtitles frequency
   lists (and SUBTLEX if wordfreq is used) and Dicta, and state that the dictionary data is
   CC BY-SA 4.0.

**One decision for you:** with CC BY-SA sources, our finished dictionary must be shared under
CC BY-SA. A competitor could legally copy it, but not our app, its code or the sentences we write
ourselves. Fully closed dictionary data would mean building almost everything by hand, or buying
a commercial dictionary license. For this project, share-alike looks like a fair price.

## Suggested change to SPEC.md (not made)

If you agree, the Open questions entry "Which free dictionary source to use, and where the
frequency ranks come from" could be answered with the recommendation above, and the CC BY-SA
credit requirement could be added to the spec.

## Sources

- kaikki.org Hebrew data (from English Wiktionary): https://kaikki.org/dictionary/Hebrew/
- Wiktionary license: https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- Wikidata lexeme statistics and CC0 license: https://www.wikidata.org/wiki/Wikidata:Lexicographical_data/Statistics
- FrequencyWords: https://github.com/hermitdave/FrequencyWords
- wordfreq and its sunset note: https://github.com/rspeer/wordfreq
- SUBTLEX-US: https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus
- MUSE (license file: CC BY-NC 4.0): https://github.com/facebookresearch/MUSE
- PanLex license: https://panlex.org/license/
- Hebrew WordNet: https://cl.haifa.ac.il/projects/mwn/index.shtml and the 2012 wordnet license study https://bond-lab.github.io/pdf/2012-gwc-wn-license.pdf
- Hebrew NLP resource list (MILA license notes): https://github.com/NLPH/NLPH_Resources
- Leipzig Corpora Collection: https://wortschatz.uni-leipzig.de/en/download
- DictaBERT-large-char-menaked: https://huggingface.co/dicta-il/dictabert-large-char-menaked
- Phonikud: https://pypi.org/project/phonikud/
- FreeDict / WikDict: https://freedict.org/
