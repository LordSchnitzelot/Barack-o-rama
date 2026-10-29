Speaking App – Project Spec (v3)
A voice-first web app for training spoken language skills (speaking and listening). Version 3 puts what is decided first, followed by the plan, the tests still needed, and the open questions.
1. Vision and principles
What it is: a voice-first language trainer. The user talks with an AI tutor and drills vocabulary and sentences out loud.
• Speaking and listening. The app trains the spoken language. Text on screen serves as subtitles and hints.
• Comprehension and speaking are equally important (50/50). The user understands spoken English as well as produces it.
• A tutor, not a generic chatbot. The tutor knows the learner, steers toward their weak spots, and uses educational techniques.
• On-screen tools. How do I say it, replay, translate, tap-to-flag.
• Three modes, few choices. The home screen has three modes: Chat, Guide and Drills. Inside a mode, the tutor (or the drill algorithm) decides what comes next, and the controls live inside the session.
• AI only where it is needed. The conversation modes use the AI model. Drills run mostly in plain code on stored data (see section 7).
2. Languages and users
The target language is the language being learned. The native language is the learner's own.
1. English for Hebrew speakers (first build).
2. Levantine spoken Arabic for Hebrew or English speakers (second build, after a quality test).
Users and scale: about 3 users at first. The architecture allows switching providers later without rewriting the app.
UI language: English first. A later setting lets Hebrew speakers switch the interface itself to Hebrew (see Settings).
3. Technology
3.1 Voices and services
The app talks to generic services, and the provider behind each is a setting, so any of them can be replaced later.
Service
Job
Current choice
Speak (English)
text, voice, speed in; audio out
Phonon (by Gradium). It runs on the user's device in the browser, with no server, no API key and no per-use cost. The model is Phonon 31m under the Apache 2.0 license. It downloads once (about 65 MB) and is then cached.
Speak (Hebrew)
text in; audio out
Browser text-to-speech. Hebrew voice quality matters little: it only reads translations to native Hebrew speakers.
Listen
audio in; text out, streaming
Browser speech recognition in the demo. Final choice open (see Open questions).
AI model
conversation, analysis, sentence checking, content generation
Groq or Gemini in the demo.
Voice of the target language: the most important one. For Hebrew speakers learning English, the English parts are read by a high-quality model, so the English voice is Phonon. Phonon's voice catalog (Apache 2.0) offers about 25 US and UK English voices to choose from.
Voice of the native language: less important. The learner speaks it fluently, so the browser's built-in voice is enough. The same applies to English-speaking learners of Levantine Arabic, whose English audio can come from the browser's voice.
Speed: the speed dial uses Phonon's speaking-rate setting (called duration_delta). Testing it is part of the first build step.
Arabic voice and recognition: to be decided after the quality test (see Risks). ElevenLabs is one candidate.
3.2 Architecture
• Web app (PWA), mobile-first. Installable to the home screen, which also helps iPhone keep stored data.
• Small backend (serverless functions) for anything that needs secret API keys (the AI model, and any paid speech service later). The demo keeps keys in the browser for testing; see Open questions for the real app.
• Language packs. Each language is a config bundle: language and dialect codes, voices, the word and sentence content for Drills, tutor prompts, Guide exercise types, and optional course content (for example the Arabic course PDF). Adding a language means adding a pack, not changing app code.
• Structured model replies. Every tutor reply comes back as data: for each sentence, the English text, the Hebrew translation, and a word breakdown (each word with its meaning). This makes tap-to-flag reliable, especially in Arabic where prefixes attach to words.
• Streaming by sentence. Phonon streams audio as it generates, sentence by sentence, so the first sentence plays while the rest is prepared.
• Localized UI. All interface text lives in a string table per UI language, with right-to-left layout support for Hebrew.
3.3 Drill content (stored data)
Drills run mostly on stored data, so the AI model is not needed to supply words, to check word answers, or to choose the next exercise.
• Source: free dictionary data with a license that allows our use, copied and sorted into the structure below. The specific source is chosen at build time (see Open questions).
• Two dictionaries: English to Hebrew and Hebrew to English.
• Unique entries: every entry is distinct. When one spelling has several meanings that sound the same, each meaning is its own entry with a label in brackets: "bat (animal)" and "bat (sports)"; קֶרֶן (light), קֶרֶן (animal horn), קֶרֶן (finance) and קֶרֶן (geometry). The same applies when one word covers two words in the other language: "know (a fact)" points at יָדַע and "know (a person)" points at הִכִּיר. Words spelled differently, such as "bare" and "bear", need no label. Labels are in English and written in brackets, such as "bat (sports)" or "read (past tense)". The same text is shown on screen and sent to Phonon as is, and Phonon reads the brackets naturally (tested: "bat (sports)" is read as "bat, sports").
• Nikkud: every Hebrew entry is written with nikkud. Nikkud separates words with the same letters but a different pronunciation: אֵלָה (goddess), אַלָּה (bat, as in sports) and אֵלֶּה (these). Nikkud is shown to the learner, and it may also help the browser voice read Hebrew correctly.
• Groups: each entry belongs to exactly one group. A group is an object in the dictionary that holds a set of synonyms, one word or more, such as {"big", "large"} or {"עֲטַלֵּף"}. Every group points at exactly one group in the other language, in both directions, so both dictionaries have the same number of groups. Paired groups share one ID, so the English group and its Hebrew partner have the same ID. (In this spec, notation such as 201[0] is illustrative only: 201 is an arbitrary ID, the words are arbitrary examples, and the brackets are shorthand for "word 0 of group 201". How groups, IDs and words are actually stored is an implementation choice.) For example: "bat (animal)" points at עֲטַלֵּף only; "bat (sports)" points at אַלָּה; אֵלָה points at "goddess"; and {"אֵלֶּה"} points at {"these", "those"}, which points back at it. In Drills, the algorithm picks a group, then picks one word from it for the prompt. The answer is correct if it matches any word in the group that the prompt's group points at. Progress is tracked per word inside its group. For example, if group 201 is {"big", "large"}, the learner may know 201[0] ("big") but not 201[1] ("large"), so 201[1] can come up as a weak word while 201[0] comes up as a known one. When the algorithm picks a new item, any group and any word in it can come up.
• Dictionary forms: each entry is in its basic dictionary form. Nouns are singular and carry no attached particles: in Hebrew, no ו (and), ה (the), prepositions such as ב, ל, מ and כ, ש (that), plural endings or the dual ending (as in עֵינַיִם).
• Verbs: two entries per verb, tested separately: the past form (Hebrew masculine past, הָלַךְ; English simple past, "went") and the infinitive (Hebrew לָלֶכֶת; English "to go"). Each translates only to its matching form: הָלַךְ is "went", and לָלֶכֶת is "to go" ("go" is also accepted). Saying "go" or "to go" for הָלַךְ is wrong, and knowing one form does not count for the other.
• Accepted forms: an entry also lists the inflected forms accepted in answers. A Hebrew past verb accepts every person and gender (הָלַךְ, הָלְכָה, הָלַכְתִּי, הָלַכְתָּ, הָלְכוּ, and so on). A Hebrew adjective accepts every gender and number (נֶחְמָד, נֶחְמָדָה, נֶחְמָדִים, נֶחְמָדוֹת).
• Frequency: every entry has a frequency rank. New words are introduced from the most common down, with an occasional less common word mixed in.
• Word answers: checked by code, with no AI, against the accepted forms of every word in the target group. The answer is normalized first: lowercase, punctuation removed, and nikkud removed, because speech recognition returns Hebrew without nikkud.
• Sentences: English sentences and Hebrew sentences are generated in advance in chunks and stored as text, without translations, because many translations can be right. Sentence answers are checked by the AI model, by meaning.
• Sentence tags: each sentence is tagged with the words it contains, each linked to its exact entry (with its label or nikkud). The tags power tap-to-flag, crediting each word when a sentence is answered correctly, choosing sentences that fit the learner's profile, and rating difficulty.
• Sentence difficulty: each sentence is rated by the frequency of its words and by its structure (tense, length, clauses).
• Audio: generated on the device when needed. Phonon reads English and the browser voice reads Hebrew, so no audio files are stored. Words spelled alike but pronounced differently, such as "read (past tense)", get an optional "say as" field ("red"). Only the entries that need it have the field: before speaking, the app uses the "say as" text if the entry has one, and the word itself otherwise. Sentences need nothing extra, because Phonon picks the right pronunciation from context (tested: "Yesterday I read a book" is read correctly).
• Size: the dictionaries are text, so they are expected to stay small even with all the accepted forms (a rough estimate is a few MB to a few dozen MB; to be confirmed with real data).
4. Screens
The home screen has three modes and a Settings button.
1. Chat: free conversation with the tutor (section 5).
2. Guide: a teacher-style conversation built around exercises (section 5).
3. Drills: spoken translation drills for words and sentences, in both directions, including the list of flagged words and weak spots (section 6).
4. Settings (section 9).
5. Conversation modes: Chat and Guide
5.1 Modes
Chat and Guide share one screen and the same tools (subtitles, replay, translate, How do I say it, tap-to-flag, speed). In both, the tutor and the user speak English. Hebrew is heard only when the user taps the play button next to a Hebrew translation, and the user speaks Hebrew only when pressing "How do I say it?".
• Chat: free talk. The user speaks and their words appear as a text message. The tutor answers, and each of its sentences appears as a message, shown or hidden according to the subtitle settings, with a play button next to the English and the Hebrew sentence. Corrections follow the corrections setting.
• Guide: like Chat, but built for focused practice. It gets more specific instructions and talks like a teacher: it focuses on subjects and runs exercises. The exercise types are defined in advance (for example opinion questions, comprehension questions after a short story or information, answering questions, describing or explaining something, role-play), and the model moves freely between them while keeping a conversation going. Its screen looks somewhat different from Chat so the two are easy to tell apart. Guide is built after Chat.
5.2 Layout
A chat-style view: a scrolling conversation. The user's words appear as text messages, and the tutor's sentences appear as messages with their play buttons.
5.3 Starting a session
One button starts a session in the chosen mode. The tutor reads the learner profile and decides how to run it. In Chat: natural conversation, steering toward weak spots, occasionally asking for opinions or checking understanding. In Guide: it picks a subject and an exercise type from the predefined list, favoring weak spots, all while maintaining a continuous conversation.
5.4 Talking modes (setting)
• Tap to talk (default): tap to start, tap to finish.
• Hands-free: the app detects when the user stops speaking. Best with headphones, since it can pick up the tutor's own voice. Will not be in the first build.
5.5 While the user speaks
Their words are transcribed live on screen. The tutor handles transcription errors: it sees through obvious ones (for example "sheep" for "ship"), and when a mistake is plausible and relevant it asks "Did you mean...?" in the conversation. The transcription will not stop until the user taps to finish talking, to avoid the tutor from taking over while the user is struggling.
5.6 While the tutor speaks
Each sentence shows:
• the English subtitle with a replay button,
• the Hebrew translation with a play button (read with the browser's Hebrew voice),
• slower and repeat controls.
Subtitles are a setting, per language. One setting is for the target language (English) and one for the native language (Hebrew). Each is Show or Hide. A hidden line can be revealed by tapping it, and the replay and play buttons stay available either way. Both are shown by default.
5.7 Speed control
A speed dial in the Chat and Guide screens and in Settings changes how fast the tutor speaks English, using Phonon's speaking-rate setting. Speed is separate from difficulty: the tutor adapts vocabulary and sentence length to what the learner knows (from the profile), and a slower voice does not make a complex sentence easier.
5.8 Tap-to-flag
Tapping a word in the English subtitles:
1. Asks the user "Show translation?".
2. If the user agrees, shows its meaning and a pronunciation button, and flags it for practice.
5.9 "How do I say it?"
1. The user taps the button. The conversation pauses.
2. The user speaks in Hebrew what they want to say. Their Hebrew words appear live on screen while they speak.
3. The app then shows the English phrase with a play button.
4. The phrase is flagged automatically and logged as "can't say yet".
5. The user returns to the conversation.
5.10 Corrections (setting)
Correct as we go, at the end of the session, or off. The tutor can also suggest better wording. Correct as we go is set to be the default.
5.11 Tutor behavior
The tutor, in both Chat and Guide mode, behaves like a tutor, not a regular chatbot. Its instructions come from the language pack and the learner profile and cover:
• speaking English, with vocabulary and sentence length matched to what the learner knows (short common words for new learners, longer sentences and idioms as they progress);
• short replies that end with a question or prompt;
• steering toward the learner's weak words and weak spots;
• using the correct form naturally when the learner makes a grammar mistake, and honoring the corrections setting;
• reading through transcription errors and asking "Did you mean...?" when needed;
• occasionally checking understanding or asking for opinions;
• marking words it noticed the learner struggled with, so they can be flagged.
5.12 Help for struggling learners
The tutor speaks English. Learners who need help get it from the Hebrew translation under each sentence (shown or hidden by the subtitle settings), the "How do I say it?" button, and tap-to-flag hints. The tutor simplifies its English when the profile and the conversation show the learner is struggling, and stays in English while doing so.
5.13 End of session
A short summary of new words and things to work on. The transcript is then discarded, and only the learner profile is updated.
6. Drills
Drills is a full spoken vocabulary course, not only a repair tool. It always teaches new words and always reviews old ones. It also holds the My Words list of flagged words and weak spots, with their scores. All exercises are spoken. Prompts are played as audio (English by Phonon, Hebrew by the browser voice), with subtitles shown according to the subtitle settings.
6.1 Exercise types
1. Hear an English word, say it in Hebrew (comprehension).
2. Hear a Hebrew word, say it in English (speaking).
3. Hear an English sentence, say it in Hebrew (comprehension).
4. Hear a Hebrew sentence, say it in English (speaking).
Comprehension and speaking are weighted equally. Optional selector: Mixed (default), Words only, Sentences only, Comprehension only, Speaking only.
6.2 Checking answers
• Words: the answer is matched by code against the stored list of accepted translations. No AI is used.
• Sentences: the AI model checks the answer by meaning, because many translations can be right.
6.3 Choosing the next drill
The next drill is chosen by an algorithm in code, with no AI. It first picks the exercise type: word or sentence, and the language direction (random or repetitive, see Open questions). It then picks the item using the weights in 6.4 and spaced repetition.
6.4 Item selection
Every session (about 10 items) mixes three sources. The percentages are starting values that can be tuned.
• New words (about 40%): taken in order of frequency from the language pack's dictionary, most common first, with an occasional less common word mixed in. A new word starts with a short intro: the user hears it, sees the translation and repeats it.
• Weak words (about 40%): words missed in Drills, plus words flagged or caught in Chat and Guide. They appear more often until the user gets them right.
• Known words (about 20%): spaced-repetition reviews of words the user already got right.
6.5 Progression
A new word is tested alone first. Once the user gets it right, it appears inside stored sentences whose other words the learner already knows (found through the sentence tags). Success in a sentence counts for each word inside it. A word answered correctly every time appears less and less often, but still gets a rare check occasionally instead of being retired.
6.6 Rules
• Push-to-talk: recording starts only when the user presses a button.
• Before recording: the user can tap any word in the sentence, Hebrew or English, to see its meaning, hear it, and flag it. A word the user needed a hint for counts as not fully known, even if the sentence is then said correctly.
6.7 Feedback
• Clearly right: green mark.
• Likely misheard: "Did you mean...?" with the closest option and two buttons, "Yes, that's what I said" and "No, retry".
• Real mistake: show and play the correct version, and add the gap to the profile.
7. Where the AI model is used
Where
AI model?
Chat and Guide conversation
Yes
Session summary and weak-spot notes
Yes, once at the end of a session
Drills: playing words and sentences
No (Phonon and the browser voice)
Drills: checking word answers
No (dictionary lookup in code)
Drills: checking sentence answers
Yes (meaning check)
Drills: choosing the next exercise and item
No (algorithm in code)
Drills: supplying sentences
Generated ahead of time in chunks, then stored
8. Learner profile and progress
Only learning progress is stored, on the device. The conversation transcript is discarded at the end of each session.
• Flagged words: word, language, meaning, example sentence, source (tapped, how-do-I-say-it, model-detected, missed in Drills), two scores ("understands" and "can say"), and the next review time.
• Weak spots: notes the model writes after each session, such as a grammar pattern, a missing word, or a topic to avoid. Each note records whether the problem was understanding or speaking.
• Settings.
• Later, optional: preferences and hobbies for more personal conversations.
Storage: IndexedDB on the device, with no accounts. (The demo used localStorage; the real app moves to IndexedDB.) Every item gets an ID and a last-modified time so cloud sync can be added later. A backup export and import button is included, because browser data can be cleared.
Spaced repetition: tracked per word and per direction (understanding vs. speaking), never per sentence. Words the user knows appear less often, and difficult words come back sooner.
Scope of feedback: the tutor works from the speech-to-text transcript, so it judges vocabulary and grammar well. Pronunciation judgments are limited.
9. Settings
• Target language and native language.
• Subtitles: one setting for the target language (English) and one for the native language (Hebrew), each Show or Hide. A hidden line can be revealed by tapping it. Both are shown by default.
• Corrections: as we go (default), end of session, off.
• Talking mode: tap to talk (hands-free is added after the first build).
• Tutor speed and voice (the voice is chosen from Phonon's English voices; lower priority).
• UI language (later): English or Hebrew. Switching to Hebrew flips the interface to right-to-left and translates all labels and buttons. It changes only the interface; the learning content is unaffected.
• Backup export and import.
10. Demo v2 status
Demo v2 is a single-page prototype of the conversation (Chat) screen. It proved the core loop and is a good first step.
Works:
• Tap to talk with live transcription of the user's English.
• Structured tutor replies with English, Hebrew and word breakdown.
• English audio through Phonon.
• Independent English and Hebrew subtitle toggles.
• Tap-to-flag with a My Words list.
• "How do I say it?" produces the English phrase and saves it.
• Chat-style layout.
To fix or build:
• Hebrew play button: connect it to the browser's Hebrew voice.
• Speed dial: a dropdown exists but is not connected to the audio; connect it to Phonon's speaking-rate setting.
• "How do I say it?": show the user's Hebrew live while they speak.
• Tutor behavior: add tutor instructions, the learner profile, weak-spot steering and the corrections setting.
• Progress: save scores, spaced repetition, the session summary and weak-spot notes (the demo saves a simple word list).
• Controls: hands-free mode, slower and repeat buttons, topic cards, backup.
• Keys and language: move API keys to the backend and add the Hebrew UI.
11. Build order
1. Fix the demo basics: the Hebrew play button, a working speed dial (first test Phonon's speaking-rate setting), and live Hebrew text in "How do I say it?".
2. Backend and real tutor: the services behind generic interfaces, plus a proper tutor prompt and a basic English language pack.
3. Chat mode completed: transcription, subtitles, replay and slower controls, corrections setting.
4. Profile storage on the device (IndexedDB): tap-to-flag and "How do I say it?" saved with scores.
5. Session summary and weak-spot detection.
6. Drills content: choose a free dictionary source, build the two dictionaries in the structure of section 3.3 (dictionary forms, meaning groups, frequency ranks), and generate and tag the first chunk of sentences.
7. Drills mode: the next-drill algorithm, the four exercise types, answer checking and spaced repetition.
8. Settings, backup export and import, PWA install, and the string table for a Hebrew UI.
9. Levantine Arabic quality test, then the Arabic language pack (using the course PDF).
10. Guide mode: teacher-style exercises from a predefined list (opinion questions, comprehension questions, answering questions, and so on).
12. Risks and early tests
1. Phonon speed control. Phonon documents a speaking-rate setting (duration_delta), but it is not yet confirmed that the 31m model supports it, what its values mean in speed terms, or whether changing it requires reloading the model. The fallback is slowing the audio in the browser, which may sound less natural.
2. Phonon on phones. The first load downloads about 65 MB. iPhone browsers use a Phonon build without Relaxed SIMD, which can be slower. Test speed and waiting time on the target phones.
3. Phonon is new. Pin exact versions of the package and the model. The demo loads them from public hosts (a code CDN and Hugging Face); the real app can serve the files itself.
4. Speech recognition for accented English. Test with a Hebrew speaker's English before building Drills around "Did you mean...?".
5. Matching Hebrew and English answers by code. Speech recognition may return a form that is not in the stored list, for example with an article ("the book") or a different spelling. Answers are normalized in code first; what happens when there is still no match is an open question.
6. Dictionary and sentence sources. Where the two dictionaries and the sentences come from, and their licenses (see Open questions).
7. Levantine Arabic quality. Check whether voices sound natural in a Levantine dialect and whether recognition handles a learner's speech. Test before starting the Arabic pack, and decide which voice and recognition services to use.
8. Mixed text direction. Hebrew and Arabic (right-to-left) and English (left-to-right) share one screen, and a Hebrew UI adds more mixing, so layout needs care.
9. Arabic word flagging. Prefixes and suffixes attach to words, so the model's word breakdown must handle them.
10. iPhone storage. Safari can clear site data after about a week of non-use unless the app is installed as a PWA.
11. Browser speech support. Browser recognition works well in Chrome and Edge but not everywhere, which matters for iPhone users. Also test whether the browser's Hebrew voice reads text with nikkud more accurately, and whether Phonon reads respellings such as "red" naturally (context inside sentences already works).
13. Open questions
• Which speech recognition to use in the real app, for English and for Hebrew: browser recognition, ElevenLabs Scribe, Whisper or another.
• Which free dictionary source to use, and where the frequency ranks come from (both need licenses that allow our use).
• How the algorithm picks a new group and a word inside it: randomly or in some order.
• Articles in answers: whether "a book" or "the book" is accepted for ספר, and whether הספר is accepted for "book".
• When speech recognition returns a form that is not in the stored list, whether the AI is asked as a fallback, or the answer goes straight to "Did you mean...?".
• Fallback for any word a respelling can't fix: recording those few words once and storing them.
• How the exercise type and direction are chosen: random or repetitive.
• How many sentences to generate, the chunk size, and who triggers a new chunk: the owner by command, the model when the bank runs low, or both.
• Whether API keys stay in the browser for a 3-person app or move to the backend right away.
• The default hands-free sensitivity, for when it is added.
• Topic cards: whether to suggest 2 to 3 cards plus "surprise me" at the start of a session, how many, and where they come from.
• The exact list of Guide exercise types (opinion questions, comprehension questions, answering questions, describing or explaining, role-play, and others).
• Whether to offer a focus view (two lines at the bottom showing only the sentence being spoken, with no history) as an alternative to the chat view.
• Which voice and recognition services to use for Arabic.
• Whether to add more conversation modes later, beyond Chat and Guide.
• The default subtitle settings for a new user (proposed: both shown).
14. Decisions log
• Only the learner profile is saved; the conversation is discarded at the end of a session.
• Storage is on the device with no accounts, structured for future sync.
• The app trains speaking and listening, weighted 50/50.
• The home screen has three modes: Chat, Guide and Drills. The controls (How do I say it, replay, translate, tap-to-flag) live inside the session.
• In Chat and Guide, the tutor and the user speak English. Hebrew appears through the translation buttons and "How do I say it?".
• Guide uses predefined exercise types that the model navigates freely during a conversation. Guide is built after Chat.
• Drills is one mode with mixed exercises and push-to-talk. It is a full vocabulary course that always introduces new words; weak words from Drills, Chat and Guide get extra weight, and known words return less often.
• Drills run on stored data: two word dictionaries with all accepted translations, and sentences stored as text. Word answers are checked in code; sentence answers are checked by the AI.
• The next drill is chosen by an algorithm in code, not by the AI.
• AI usage is kept to the conversation modes, sentence-answer checking, and generating content ahead of time.
• Spaced repetition applies to flagged words and is mixed with new words.
• The tutor handles transcription errors, so the user does not edit transcripts.
• Subtitles are a Show or Hide setting for the target language and for the native language.
• English voice: Phonon 31m, which runs free on the device. No audio files are stored.
• Hebrew voice: the browser's text-to-speech; low quality is acceptable.
• The Chat and Guide screens use a chat-style view.
• The Hebrew UI language is a planned setting, after the first build.
• Arabic voice and recognition providers are decided after the quality test.
• Tap to talk is the default; hands-free is added after the first build. Transcription continues until the user taps to finish.
• Corrections default to "as we go".
• Dictionary words are stored in their basic dictionary form. Verbs have two entries, past and infinitive, tested separately.
• Every dictionary entry is unique: same-sounding homonyms get labels in brackets, Hebrew entries carry nikkud, and each entry belongs to one group of synonyms that points at exactly one group in the other language. Hebrew past verbs accept every person and gender, and adjectives every gender and number.
• Every word has a frequency rank, and new words come in order of frequency.
• Sentences are tagged with their words and rated for difficulty.
• Labels are in English and in brackets ("bat (sports)"); the same text is shown on screen and sent to Phonon.
• Nikkud is shown to the learner.
• Words spelled alike but pronounced differently get an optional "say as" field, only where needed; recording them is only a fallback. Groups are objects holding one or more words. The algorithm picks a group, then one word from it, and an answer matching any word in the target group is correct. Progress is tracked per word inside its group.
15. Changelog
• v1: original spec from the planning chat.
• v2: reorganized into one structure; added technology table, tutor behavior, Settings section, demo status, and build step 1; replaced the ElevenLabs default with Phonon and browser voices; added the live Hebrew text in "How do I say it?", the speed dial requirement, and the Hebrew UI option.
• v3: defined the three modes (Chat, Guide, Drills) and renamed Practice to Drills; replaced levels with a Show or Hide subtitle setting per language; Drills now run on stored word dictionaries and sentences with a code-based next-drill algorithm, using the AI only to check sentence answers; verified Phonon 31m is free on-device and commercially licensed, so stored audio was dropped; reorganized so decided items come first and uncertain items sit in Risks and Open questions.
• v3.1: added dictionary forms and the verb rule, meaning groups, frequency ranks, and sentence tags and difficulty to the Drill content; set hands-free after the first build and corrections to "as we go" by default; updated build step 6, risks and open questions.
• v3.2: made every dictionary entry unique (labels for same-sounding homonyms, nikkud on all Hebrew entries), one group of synonyms per entry pointing at exactly one group in the other language, and accepted inflected forms for Hebrew past verbs and adjectives.
• v3.3: split entries when one word covers two words in the other language ("know"); labels shown and spoken; nikkud shown to the learner; respellings for words spelled alike but pronounced differently.
• v3.4: labels stay in English and in brackets, sent to Phonon as written; optional "say as" field only on entries that need it; sentences rely on Phonon's context (tested); one word per prompt from multi-word groups.
• v3.5: labels written in brackets and sent to Phonon as written; groups described as objects holding one or more words; progress tracked per word inside its group (for example 201[0] and 201[1]).
