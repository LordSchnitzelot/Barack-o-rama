# Speaking App

A voice-first web app for training spoken English (for Hebrew speakers), with Levantine Arabic planned next.
The user talks with an AI tutor and drills words and sentences out loud.

## Important

- **Never put API keys in this repository.** The app asks each user to type their own key
  in Settings, and it is stored only in that user's browser.
- The full project spec is [SPEC.md](SPEC.md) (v3.10). It is the source of truth.
- Rules for working on the project are in [CLAUDE.md](CLAUDE.md).

## Current state

The home screen has the three modes from the spec: **Chat**, **Guide** and **Drills**, plus
**My words** and **Settings**. Everything is plain files with no build step, so GitHub Pages serves it as is.

| File | What it does |
| --- | --- |
| `index.html` | The page and its look |
| `app.js` | Home screen, Settings, My words |
| `shell.js` | What every screen shares: settings, voices, the dictionary, My words, tap-to-flag |
| `talk.js` | The Chat and Guide screen, with the end-of-session summary |
| `drill-screen.js` | The Drills screen |
| `drills.js` | The Drills logic: choosing the next drill, checking word answers, spaced repetition; tested by `drills.test.mjs` |
| `drill-data.js` | Connects Drills to the dictionary files and to My words; tested by `drill-data.test.mjs` |
| `services.js` | The swappable services: AI model (Groq or Gemini), speaking (Phonon or the browser voice), listening (browser speech recognition) |
| `tutor.js` | The tutor's instructions, the summary and the sentence check, and reading the AI's replies; tested by `tutor.test.mjs` |
| `words.js` | My words records and their two scores; tested by `words.test.mjs` |
| `dictionary.js` | Links words in the chat to dictionary entries, in code; tested by `dictionary.test.mjs` |
| `store.js` | Saves My words and weak-spot notes on the device (IndexedDB) |
| `packs/en-he/pack.js` | The English-for-Hebrew-speakers language pack: languages, voices, tutor and Guide instructions, Drills files |

Run all the automated tests with `node --test`.

## The dictionary and sentences

`packs/en-he/drills/` holds the Drills content: about 2,100 English entries in 1,855 meaning groups,
and 128 tagged sentences. They are built from the readable files in `packs/en-he/drills/source/` by
`tools/build-dictionary.py` and `tools/build-sentences.py`; see
[docs/drills-data-format.md](docs/drills-data-format.md). Entries a person should check are listed in
[docs/dictionary-review.md](docs/dictionary-review.md).

## Build order (spec section 11)

| Step | State |
| --- | --- |
| 1. Demo basics | Done |
| 2. Services and real tutor | Done, without the backend: keys are still typed in Settings |
| 3. Chat mode | Done: Show/Hide subtitles, replay and slower buttons, corrections setting, "Show translation?" |
| 4. Profile on the device | Done: My words with scores in IndexedDB |
| 5. Session summary and weak spots | Done |
| 6. Drills content | Done: real dictionary (first version) and a first chunk of sentences |
| 7. Drills mode | Done |
| 8. Settings, backup, PWA, Hebrew UI | Not yet (Settings has the spec's options except backup and voice choice) |
| 9. Levantine Arabic | Not yet (needs a listening test by a person first) |
| 10. Guide mode | Done |
