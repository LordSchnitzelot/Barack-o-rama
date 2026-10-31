/* Language pack: English for Hebrew speakers (spec 3.2, Language packs).
   Everything about this language pair lives here, so adding a language means adding a pack like
   this one, not changing app code. The app reads it as plain data; tutor.js turns it into the
   instructions sent to the AI model.

   "target" is the language being learned, "native" is the learner's own (spec section 2). */

export default {
  id: 'en-he',
  target: {
    code: 'en', name: 'English', speech: 'en-US', dir: 'ltr',
    voice: 'phonon', // the high-quality on-device voice (spec 3.1)
    /* The small words that finish a phrasal verb ("give up", "find out"). Used to join a phrase
       the AI split in two by mistake (see joinSplitPhrases in tutor.js). */
    particles: ['up', 'down', 'out', 'off', 'on', 'in', 'away', 'back', 'over', 'through', 'along', 'around', 'about', 'by', 'for', 'with', 'into', 'after', 'across', 'apart', 'ahead', 'forward', 'together'],
    /* The tutor voices to choose from in Settings (spec 9): Phonon's US and UK English voices,
       from its voice catalog (Apache 2.0), pinned to one version of the catalog (spec 12, risk 3).
       A voice file is about 250 KB and is downloaded the first time the voice is used. */
    voices: {
      base: 'https://huggingface.co/gradium/phonon-voices/resolve/0ee17205f254b5abc43b266c8a0f215565c352f7/',
      list: [
        { name: 'Harper', accent: 'US', gender: 'female', file: 'voices/4SZHfMpw-p46Ywgs.safetensors' },
        { name: 'Zoey', accent: 'US', gender: 'female', file: 'voices/NbpkqMVS3CJeq2j8.safetensors' },
        { name: 'Juniper', accent: 'US', gender: 'female', file: 'voices/NIWIOv5vTi5eRMj8.safetensors' },
        { name: 'Everly', accent: 'US', gender: 'female', file: 'voices/vjFyp2BcCyTlUmYb.safetensors' },
        { name: 'Hadley', accent: 'US', gender: 'female', file: 'voices/bXwrkHhURL1VFJdG.safetensors' },
        { name: 'Delia', accent: 'US', gender: 'female', file: 'voices/nGzMHMPAWGaJFHOo.safetensors' },
        { name: 'Easton', accent: 'US', gender: 'male', file: 'voices/LMDIYE0Oa377Qh6Z.safetensors' },
        { name: 'Micah', accent: 'US', gender: 'male', file: 'voices/40QrMVgAxFiUnP9f.safetensors' },
        { name: 'Trevor', accent: 'US', gender: 'male', file: 'voices/0zLApsZfVLLNaEGl.safetensors' },
        { name: 'Russell', accent: 'US', gender: 'male', file: 'voices/_6Aslh2DxfmnRLmP.safetensors' },
        { name: 'Preston', accent: 'US', gender: 'male', file: 'voices/qIxlZ7Ei8KvWlyQH.safetensors' },
        { name: 'Miles', accent: 'US', gender: 'male', file: 'voices/d9XCyhjo4JhkHF1d.safetensors' },
        { name: 'Maeve', accent: 'UK', gender: 'female', file: 'voices/6PWnV0Nq4wu7RVBT.safetensors' },
        { name: 'Freya', accent: 'UK', gender: 'female', file: 'voices/GgfEkEJtxZR7gnpy.safetensors' },
        { name: 'Pippa', accent: 'UK', gender: 'female', file: 'voices/uem82D50GRv2Dwma.safetensors' },
        { name: 'Elodie-Rose', accent: 'UK', gender: 'female', file: 'voices/y9bQqIDnyxwqK01t.safetensors' },
        { name: 'Imogen', accent: 'UK', gender: 'female', file: 'voices/gDT1nz7Ie36ZhL-C.safetensors' },
        { name: 'Lottie', accent: 'UK', gender: 'female', file: 'voices/m9MxpY6IUGXtWp76.safetensors' },
        { name: 'Bryony', accent: 'UK', gender: 'female', file: 'voices/gfP44RlHwr2kEwk7.safetensors' },
        { name: 'Alfie', accent: 'UK', gender: 'male', file: 'voices/X6NceqF285Gr04gb.safetensors' },
        { name: 'Hugh', accent: 'UK', gender: 'male', file: 'voices/YyKcxPG7iIgS3jsK.safetensors' },
        { name: 'Edwin', accent: 'UK', gender: 'male', file: 'voices/zUCxzrOrugTSis03.safetensors' },
        { name: 'Spencer', accent: 'UK', gender: 'male', file: 'voices/JOW0vchyswkQUMDS.safetensors' },
        { name: 'Toby', accent: 'UK', gender: 'male', file: 'voices/dME3IWyZBvmh1n1q.safetensors' },
        { name: 'Teddy', accent: 'UK', gender: 'male', file: 'voices/Zn7g6NxLqXlJb7Qi.safetensors' },
      ],
      /* Played by "Try this voice" in Settings. */
      sample: 'Hi! I am your English tutor. Shall we talk for a few minutes?',
    },
  },
  native: {
    code: 'he', name: 'Hebrew', speech: 'he-IL', dir: 'rtl',
    voice: 'browser', // the browser's own voice is enough for the native language
  },

  /* Drills content (spec 3.3), described in docs/drills-data-format.md. */
  drills: {
    dictionaries: { en: 'packs/en-he/drills/dictionary-en.json', he: 'packs/en-he/drills/dictionary-he.json' },
    sentences: 'packs/en-he/drills/sentences.json',
  },

  /* The tutor (spec 5.11). Each line is one instruction; tutor.js adds the learner profile,
     the corrections setting and the reply format. */
  tutor: {
    role: 'You are a warm, patient English tutor talking with a Hebrew speaker who is learning spoken English. ' +
      'This is a spoken conversation: everything you write is read aloud, and the learner answers by voice.',
    rules: [
      'Speak English only. Never switch to Hebrew in the conversation; the app shows a Hebrew translation under each of your sentences.',
      'Keep replies short: 1 to 3 short sentences. End with a question or a prompt that invites the learner to speak.',
      'Match vocabulary and sentence length to the learner. New learners get short, common words and simple sentences; stronger learners get longer sentences, phrasal verbs and idioms.',
      'If the learner seems to struggle (very short answers, confusion, many mistakes, asking what something means), simplify your English, but stay in English.',
      'Steer the conversation, naturally and without announcing it, toward situations where the learner needs their weak words and weak spots.',
      'Now and then check understanding (for example ask them to explain something back) or ask for their opinion.',
      'The learner\'s words come from speech recognition and may contain errors (for example "sheep" for "ship"). Silently read through obvious ones. If a mistake is plausible and changes the meaning, ask "Did you mean ...?".',
      'Write for the ear: no lists, no emoji, no markdown, no stage directions, no abbreviations a voice would misread.',
      'Be encouraging but not gushing. Do not praise every answer.',
    ],
    levels: {
      beginner: 'The learner is a beginner: use the most common words, present tense where possible, and sentences of under 8 words.',
      intermediate: 'The learner is intermediate: everyday vocabulary, all common tenses, sentences of up to about 15 words.',
      advanced: 'The learner is advanced: natural native-speed English, idioms and phrasal verbs, and more complex sentences.',
    },
    corrections: {
      live: 'When the learner makes a grammar or word mistake, first use the correct form naturally in your reply. If the mistake matters, also add one short, friendly sentence that points out the better way to say it, then carry on.',
      end: 'Do not point out mistakes during the conversation; just use the correct form naturally in your reply. Mistakes are reviewed at the end of the session.',
      off: 'Do not point out mistakes. Only use the correct form naturally in your reply.',
    },
    /* How words are written in the "d" field of a reply, so the app can find them in the
       dictionary (spec 3.3: Dictionary forms, Phrases, Verbs). */
    dictionaryForm: 'nouns singular ("cigarette"); adjectives and adverbs plain ("last"); a verb in the simple past stays in the simple past ("gave", "gave up"); every other verb form becomes "to" + the base form ("runs", "running" and "run" all become "to run"; "giving up" becomes "to give up"). ' +
      'The Hebrew meaning follows the same rule: a noun in the singular without ה or other attached letters, a past verb in the masculine singular past (וִיתֵּר), any other verb as an infinitive (לְוַתֵּר).',
    /* A worked example of one sentence in a reply. Models follow an example more reliably than a
       rule: phrases stay one item, even when split by another word ("give it up"). */
    example: {
      en: 'My friend gave up smoking last year, but now she wants to give it up again.',
      he: 'חברה שלי הפסיקה לעשן בשנה שעברה, אבל עכשיו היא רוצה לוותר על זה שוב.',
      words: [
        { w: 'friend', d: 'friend', m: 'חָבֵר' },
        { w: 'gave up', d: 'gave up', m: 'וִיתֵּר' },
        { w: 'smoking', d: 'to smoke', m: 'לְעַשֵּׁן' },
        { w: 'last', d: 'last', m: 'שֶׁעָבַר' },
        { w: 'year', d: 'year', m: 'שָׁנָה' },
        { w: 'wants', d: 'to want', m: 'לִרְצוֹת' },
        { w: 'give it up', d: 'to give up', m: 'לְוַתֵּר' },
        { w: 'again', d: 'again', m: 'שׁוּב' },
      ],
    },
    /* The opening line when the learner starts a session without saying anything yet. */
    opener: 'Start the conversation: greet the learner briefly and ask one easy, open question, picked to suit their level and weak spots.',
  },

  /* Guide mode (spec 5.1): a teacher-style lesson built around exercises. The tutor moves freely
     between the exercise types while keeping one conversation going.
     DEFAULT (open question: the exact list of Guide exercise types): the five named in the spec. */
  guide: {
    role: 'This session is a Guide lesson: talk like a teacher. Pick one subject (favor the learner\'s weak spots and practice words), tell the learner briefly what you will practice, and run short exercises on it. Keep one continuous conversation: move naturally from one exercise to the next, and give a short, friendly reaction to each answer before moving on.',
    exercises: [
      { name: 'Opinion question', how: 'ask what the learner thinks about something and why.' },
      { name: 'Comprehension', how: 'tell a very short story or piece of information (3 to 5 sentences), then ask one or two questions about it.' },
      { name: 'Answering questions', how: 'ask direct questions about the learner\'s life that need the subject\'s words to answer.' },
      { name: 'Describe or explain', how: 'ask the learner to describe something (a place, a picture in their mind, a routine) or explain how something works.' },
      { name: 'Role-play', how: 'set up a short everyday scene (a shop, a doctor, a phone call), say who each of you is, and play your part.' },
    ],
    rules: [
      'One exercise step per reply: give the task or the question, then stop and let the learner answer.',
      'Use each exercise type at most twice in a row, then switch.',
    ],
    opener: 'Start the Guide lesson: greet the learner in one short sentence, name today\'s subject, and begin the first exercise.',
  },

  /* "How do I say it?" (spec 5.9): the learner says something in Hebrew and gets the English. */
  howDoISay: 'The learner said this in Hebrew because they do not know how to say it in English. ' +
    'Give one natural, simple spoken English phrase they can say in the conversation. ' +
    'The Hebrew comes from speech recognition, so it has no nikkud and may contain small errors.',
};
