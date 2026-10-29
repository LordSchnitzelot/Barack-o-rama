# Speaking App

A voice-first web app for training spoken English (for Hebrew speakers), with Levantine Arabic planned next.
The user talks with an AI tutor and drills words and sentences out loud.

## Current state

`index.html` is Demo v2: a single-page prototype of the Chat screen
(tap to talk, tutor replies with English, Hebrew and word breakdown, Phonon English voice,
subtitle toggles, tap-to-flag, "How do I say it?").

## Important

- **Never put API keys in this repository.** The demo asks each user to type their own key
  in Settings, and it is stored only in that user's browser.
- The full project spec is [SPEC.md](SPEC.md) (v3.5). It is the source of truth.
- Rules for working on the project are in [CLAUDE.md](CLAUDE.md).

## Done: build order step 1

- Hebrew play button uses the browser's Hebrew voice.
- Speed dial uses Phonon's speaking rate (`duration_delta`). Phonon can only slow down by about 12%
  on its own, so "Slow" adds a little browser slowdown on top. Settings has an option to use
  only the browser's playback speed instead.
- "How do I say it?" shows the user's Hebrew live while they speak.

## Next step (build order step 2)

Backend and real tutor: the services behind generic interfaces, a proper tutor prompt and a basic
English language pack.
