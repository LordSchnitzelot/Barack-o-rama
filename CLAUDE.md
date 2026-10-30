# CLAUDE.md – standing rules for this project

## The spec is the source of truth
- `SPEC.md` is the source of truth for what the app does and in what order it is built
  (section 11, Build order).
- Read the relevant sections of `SPEC.md` before changing anything. If a request conflicts with
  the spec, or the spec is unclear, say so and ask before building.
- Do not change `SPEC.md` unless the user asks. If something you learn should change it
  (for example a test result from section 12, Risks), suggest the change and let the user decide.

## The user is not a programmer
- Explain every change in plain language: what changed, what the user will notice, and what to
  test. Avoid jargon; when a technical word is needed, explain it in one short sentence.
- When work is done, give simple, step-by-step instructions for testing it on a phone.

## Never put API keys in the repository
- No API keys, tokens or passwords in any file, commit, comment or example.
- The demo asks each user to type their own key in Settings, and it is stored only in that
  user's browser. Keys move to a small backend later (spec section 3.2).

## Hosting
- The site is hosted on GitHub Pages from the `main` branch. What is on `main` is what people see.
- Changes on other branches are not live until they are merged into `main`. Say this clearly when
  work is on a different branch.
- The app must keep working as plain static files (no build step) unless the spec says otherwise.

## Project notes
- `index.html` is the demo page (plain HTML and CSS). Its code: `app.js` (the screen), `services.js`
  (AI model, speaking and listening behind swappable providers), `tutor.js` (tutor instructions and
  reply checking, tested by `tutor.test.mjs`), `words.js` (My words records and scores),
  `dictionary.js` (links chat words to dictionary entries), `store.js` (IndexedDB) and
  `packs/en-he/pack.js` (the language pack).
  These are ES modules, so the page must be opened over http(s), not as a local file.
- `drills.js` is the Drills logic (no screen yet); `drills.test.mjs` tests it. Run `node --test`
  after any change to it or to any other file with a `.test.mjs` partner. Choices for the spec's open questions are marked `DEFAULT (open question)`.
- English voice: Phonon (`phonon-tts`, pinned to an exact version) running in the browser.
  Hebrew voice and speech recognition: the browser's own.
- Phonon's speaking rate (`duration_delta`) is fixed when the model loads, so changing speed
  reloads it (from the browser cache, about 1 second on a laptop). Measured on the 31m model:
  0.2 ≈ 0.89× speed, 0.3 ≈ 0.875×, larger values barely slow it further.
