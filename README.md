# Speaking App

A voice-first web app for training spoken English (for Hebrew speakers), with Levantine Arabic planned next.
The user talks with an AI tutor and drills words and sentences out loud.

## Current state

`index.html` is Demo v2: a single-page prototype of the Chat screen
(tap to talk, tutor replies with English, Hebrew and word breakdown, Phonon English voice,
subtitle toggles, tap-to-flag, "How do I say it?"). Its code is split into a few plain files:

| File | What it does |
| --- | --- |
| `app.js` | The Chat screen: buttons, messages, My words, Settings |
| `services.js` | The swappable services: AI model (Groq or Gemini), speaking (Phonon or the browser voice), listening (browser speech recognition) |
| `tutor.js` | Builds the tutor's instructions and checks its replies; tested by `tutor.test.mjs` |
| `words.js` | My words: each saved word with its two scores; tested by `words.test.mjs` |
| `dictionary.js` | Links words from the tutor's replies to dictionary entries; tested by `dictionary.test.mjs` |
| `store.js` | Saves My words on the device (IndexedDB) |
| `packs/en-he/pack.js` | The English-for-Hebrew-speakers language pack: languages, voices, tutor instructions, Drills files |

`drills.js` is the Drills logic (spec sections 3.3, 6 and 8) as plain code, not yet connected
to the page. Its automated tests are in `drills.test.mjs`; run them with `node --test`.

## Important

- **Never put API keys in this repository.** The demo asks each user to type their own key
  in Settings, and it is stored only in that user's browser.
- The full project spec is [SPEC.md](SPEC.md) (v3.8). It is the source of truth.
- Rules for working on the project are in [CLAUDE.md](CLAUDE.md).

## Done: build order step 1

- Hebrew play button uses the browser's Hebrew voice.
- Speed dial uses Phonon's speaking rate (`duration_delta`). Phonon can only slow down by about 12%
  on its own, so "Slow" adds a little browser slowdown on top. Settings has an option to use
  only the browser's playback speed instead.
- "How do I say it?" shows the user's Hebrew live while they speak.

## Started early: Drills content format (part of build order step 6)

- The data format for the two Drills dictionaries and the tagged sentences (spec section 3.3) is
  described in [docs/drills-data-format.md](docs/drills-data-format.md).
- A starter set lives in `packs/en-he/drills/`: the 300 most common English words with their Hebrew
  partners, and 60 tagged sentences. It is hand-written test data, to be replaced in step 6.
- A checker tests every rule: `node tools/validate-drills.js`, or open
  `tools/validate-drills.html` in a browser.

## Done: build order step 2 (without the backend)

- The services sit behind generic, swappable parts (`services.js`).
- A proper tutor prompt (spec 5.11), built from the language pack and the learner profile: it
  matches the learner's level, steers toward words in My words, recasts mistakes, reads through
  speech-recognition errors, and marks words the learner struggled with (added to My words).
- A basic English language pack (`packs/en-he/pack.js`).
- "Start a conversation" lets the tutor open the session (spec 5.3).
- **Not done yet: the backend.** API keys are still typed into Settings by each user. A small free
  backend that holds the key is planned (spec 3.2); adding it means one more provider in `services.js`.

## Done: build order step 4 (profile storage on the device)

- My words is saved in IndexedDB, the browser's built-in database. The old list from the first
  demo is carried over automatically.
- Each word has two scores, "understands" and "can say", plus its next review time (spec 8).
  Tapping a word flags "understands"; "How do I say it?" flags "can say". Scores rise in Drills
  (build step 7).
- Each word or phrase in a tutor reply carries its dictionary form, and the app links it to the
  dictionary in code (spec 3.2). The AI is asked only when a tapped word has several entries and
  the code cannot tell which is meant. Only dictionary words are saved; others are shown in the
  chat only. Dictionary phrases ("give up", "take care") are one tappable unit.
- "How do I say it?" saves the dictionary words inside the English answer as "can't say yet".

## Next step (build order step 3)

Chat mode completed: transcription, subtitles, replay and slower controls, corrections setting.
(Step 4 was built before step 3, at the owner's request.)
