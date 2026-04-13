// src/utils/questionParser.js
// ─────────────────────────────────────────────────────────────────────
// Supports ALL these formats:
//
// FORMAT A — Inline answer:
//   1. Question?
//   A. Option   B. Option   C. Option   D. Option
//   Answer: C
//
// FORMAT B — Separate answer key (paste in second textarea):
//   1. C    or    1. C  2. A  3. D ...
//   2. A
//
// FORMAT C — Options on separate lines:
//   1. Question?
//   A) Option one
//   B) Option two
//   C) Option three
//   D) Option four
//   ANS: B
//
// FORMAT D — Inline options on same line:
//   1. Question? A. Opt1 B. Opt2 C. Opt3 D. Opt4
//
// FORMAT E — Mixed short options (2 per line):
//   A. Sympathy   C. Socialism
//   B. Criticism  D. Empathy
//
// ─────────────────────────────────────────────────────────────────────

// ── Shuffle Utilities ─────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle — returns a NEW array, does not mutate original.
 */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffles the options of a single parsed question and
 * updates correctIndex to point to wherever the correct
 * answer landed after the shuffle.
 *
 * Expects question shape:
 *   { options: string[], correctIndex: number, ... }
 */
export function shuffleQuestionOptions(question) {
  const options = question.options.map(o =>
    typeof o === 'string' ? o : (o.text || '')
  );

  if (options.length < 2) return question;

  const correctText = options[question.correctIndex] ?? options[0];
  const shuffled    = shuffleArray(options);
  const newIndex    = shuffled.indexOf(correctText);

  return {
    ...question,
    options:      shuffled,
    correctIndex: newIndex >= 0 ? newIndex : 0,
  };
}

/**
 * Shuffles options for every question in an array.
 * Call this on the parsed result before uploading to Firestore.
 */
export function shuffleAllQuestionsOptions(questions) {
  return questions.map(shuffleQuestionOptions);
}

// ── Answer Key Parser ─────────────────────────────────────────────────

export function parseAnswerKey(answerText) {
  if (!answerText?.trim()) return {};

  const normalized = answerText
    .replace(/\r/g, '')
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, ' ');

  const map = {};

  // Universal pattern — handles: "1. B", "1) B", "1: B", "1 B", "1.B",
  //   "Q1: B", "Q1. B", "Q1. Answer: B" and packed "Q1: B    Q2: A" on one line.
  const pattern = /Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?([A-Ea-e])\b/gi;
  let m;
  while ((m = pattern.exec(normalized)) !== null) {
    map[parseInt(m[1], 10)] = m[2].toUpperCase();
  }

  // Fallback: letter-only lines with implied sequence (e.g. "B\nA\nC\nD")
  if (Object.keys(map).length === 0) {
    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const single = line.match(/^([A-Ea-e])\s*$/i);
      if (single) map[i + 1] = single[1].toUpperCase();
    });
  }

  return map;
}

// Parses rationales from answer key textarea (e.g. "Q1. Answer: B\nRationale: ...")
export function parseRationaleKey(answerText) {
  if (!answerText?.trim()) return {};

  const rationaleMap = {};
  const lines = answerText.replace(/\r/g, '').split('\n');
  let currentNum = null;
  let currentRationale = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect Q1. Answer: B or Q1. B lines
    const qLine = trimmed.match(/^Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?[A-Ea-e]\b/i);
    if (qLine) {
      if (currentNum !== null && currentRationale) {
        rationaleMap[currentNum] = currentRationale.trim();
      }
      currentNum = parseInt(qLine[1], 10);
      currentRationale = '';
      continue;
    }

    // Detect Rationale: / Explanation: lines
    const ratLine = trimmed.match(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i);
    if (ratLine && currentNum !== null) {
      currentRationale = trimmed.replace(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i, '').trim();
      continue;
    }

    // Continuation of rationale text
    if (currentNum !== null && currentRationale && trimmed) {
      currentRationale += ' ' + trimmed;
    }
  }

  // Save last one
  if (currentNum !== null && currentRationale) {
    rationaleMap[currentNum] = currentRationale.trim();
  }

  return rationaleMap;
}

// ── Main Parser ───────────────────────────────────────────────────────

export function parseQuestionsFromText(rawText, answerKeyText = '') {
  const answerKey    = parseAnswerKey(answerKeyText);
  const rationaleMap = parseRationaleKey(answerKeyText);
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];
  let current = null;

  // ── FIX: Use a monotonically-increasing sequential counter instead of
  // relying on the label number in the text.  This means duplicate question
  // numbers (e.g. multiple questions labelled "84" in the source file) are
  // treated as distinct questions and none are silently dropped.
  // _qNumber still stores the *label* number for answer-key look-up; the
  // deduplication guard has been removed from saveQuestion() so every parsed
  // block is kept.
  let seqCounter = 0;

  const optLetters = ['A', 'B', 'C', 'D', 'E'];

  const isQuestionLine = (line) =>
    /^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i.test(line);

  const isOptionLine = (line) =>
    /^([A-Ea-e][\.\)\-:]|\([A-Ea-e]\))\s*.+/i.test(line);

  const isAnswerLine = (line) =>
    /^(answer|ans|correct|key|solution)[\s\.\:\-]*/i.test(line);

  const isExplanationLine = (line) =>
    /^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i.test(line);

  // Extract [image: URL] tag from any line
  const extractImageTag = (text) => {
    const m = text.match(/\[image:\s*(https?:\/\/[^\]]+)\]/i);
    return m ? { url: m[1].trim(), text: text.replace(m[0], '').trim() } : { url: '', text };
  };

  const getQuestionNumber = (line) => {
    const m = line.match(/^(\d+)/);
    return m ? parseInt(m[1]) : null;
  };

  const extractOptionLetter = (line) => {
    const m = line.match(/^([A-Ea-e])[\.\)\-:]|\(([A-Ea-e])\)/i);
    return m ? (m[1] || m[2]).toUpperCase() : null;
  };

  const extractOptionText = (line) => {
    return line.replace(/^([A-Ea-e][\.\)\-:]|\([A-Ea-e]\))\s*/i, '').trim();
  };

  const extractAnswerLetter = (line) => {
    const cleaned = line.replace(/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i, '').trim();
    const m = cleaned.match(/^([A-Ea-e])\b/i);
    return m ? m[1].toUpperCase() : null;
  };

  // Try to detect inline options on same line as question
  // e.g. "1. Question text? A. Opt1 B. Opt2 C. Opt3 D. Opt4"
  const extractInlineOptions = (line) => {
    const optPattern = /\b([A-D])\.\s*([^A-D\.]{2,}?)(?=\s+[A-D]\.|$)/g;
    const opts = [];
    let m;
    while ((m = optPattern.exec(line)) !== null) {
      opts.push({ letter: m[1].toUpperCase(), text: m[2].trim() });
    }
    return opts.length >= 2 ? opts : null;
  };

  // Detect two options on same line (short format):
  // "A. Sympathy   C. Socialism"
  const extractDoubleOptions = (line) => {
    const m = line.match(
      /^([A-Ea-e])[\.\)]\s*(.+?)\s{2,}([A-Ea-e])[\.\)]\s*(.+)$/i
    );
    if (m) {
      return [
        { letter: m[1].toUpperCase(), text: m[2].trim() },
        { letter: m[3].toUpperCase(), text: m[4].trim() },
      ];
    }
    return null;
  };

  const saveQuestion = () => {
    if (!current) return;
    if (current.question && current.options.length >= 2) {
      // Always sort options into A→B→C→D order so array index == letter index.
      const sortedOpts = [...current.options].sort(
        (a, b) => optLetters.indexOf(a.letter) - optLetters.indexOf(b.letter)
      );

      // Resolve correct answer — inline answer in text takes priority
      let correctLetter = null;
      if (current.answerLetter) {
        correctLetter = current.answerLetter;
      } else if (answerKey[current.qNumber] !== undefined) {
        correctLetter = answerKey[current.qNumber];
      }

      const correctIdx = correctLetter !== null
        ? sortedOpts.findIndex(o => o.letter === correctLetter)
        : -1;

      questions.push({
        question:       current.question.trim(),
        options:        sortedOpts.map(o => o.text),
        correctIndex:   correctIdx >= 0 ? correctIdx : -1,
        explanation:    current.explanation || '',
        imageUrl:       current.imageUrl || '',
        explanationImageUrl: current.explanationImageUrl || '',
        _seq:           current.seq,        // stable sequential position (1-based)
        _qNumber:       current.qNumber,    // label number from the source text
        _hasAnswer:     correctIdx >= 0,
        _sortedLetters: sortedOpts.map(o => o.letter),
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isQuestionLine(line)) {
      saveQuestion();
      seqCounter++;                                          // always increment
      const labelNum = getQuestionNumber(line) || seqCounter;

      // Strip question number prefix
      let qText = line.replace(/^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i, '').trim();

      // Extract image tag from question line
      const qImg = extractImageTag(qText);
      qText = qImg.text;

      // Check if options are inline on same line
      const inlineOpts = extractInlineOptions(qText);
      if (inlineOpts && inlineOpts.length >= 2) {
        const firstOptPos = qText.search(/\b[A-D]\.\s/);
        if (firstOptPos > 0) qText = qText.substring(0, firstOptPos).trim();
        current = {
          question: qText, options: inlineOpts, answerLetter: null,
          explanation: '', seq: seqCounter, qNumber: labelNum,
          imageUrl: qImg.url, explanationImageUrl: '',
        };
      } else {
        current = {
          question: qText, options: [], answerLetter: null,
          explanation: '', seq: seqCounter, qNumber: labelNum,
          imageUrl: qImg.url, explanationImageUrl: '',
        };
      }
      continue;
    }

    if (!current) continue;

    // Double options on one line (e.g. "A. Sympathy   C. Socialism")
    if (!isAnswerLine(line) && !isExplanationLine(line)) {
      const double = extractDoubleOptions(line);
      if (double) {
        double.forEach(o => {
          if (!current.options.find(x => x.letter === o.letter)) {
            current.options.push(o);
          }
        });
        continue;
      }
    }

    // Single option line
    if (isOptionLine(line)) {
      const letter = extractOptionLetter(line);
      const text   = extractOptionText(line);
      if (letter && text && !current.options.find(o => o.letter === letter)) {
        current.options.push({ letter, text });
      }
      continue;
    }

    // Answer line
    if (isAnswerLine(line)) {
      current.answerLetter = extractAnswerLetter(line);
      continue;
    }

    // Explanation line
    if (isExplanationLine(line)) {
      let explText = line.replace(/^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i, '').trim();
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (isQuestionLine(next) || isOptionLine(next) || isAnswerLine(next)) break;
        explText += ' ' + next;
        i++;
      }
      const explImg = extractImageTag(explText);
      current.explanation = explImg.text;
      if (explImg.url) current.explanationImageUrl = explImg.url;
      continue;
    }

    // Continuation of question text (before any options)
    if (current.options.length === 0 && !isOptionLine(line)) {
      current.question += ' ' + line;
    }
  }

  saveQuestion();

  // Sort by sequential position (not label number) to preserve original order
  // even when label numbers repeat or are out of order.
  questions.sort((a, b) => (a._seq || 0) - (b._seq || 0));

  // Apply separate answer key.
  // Strategy:
  //   1. Try strict label-number match (answerKey[labelNum] → question with _qNumber === labelNum).
  //   2. Positional fallback: answer-key position i → questions[i].
  //      This is the most robust when numbering is non-unique.
  if (Object.keys(answerKey).length > 0) {
    // Build a positionally-ordered array of answer letters from the key
    const positionalAnswers = Object.entries(answerKey)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([, letter]) => letter);

    questions.forEach((q, posIdx) => {
      // Apply rationale from answer key when question has no inline explanation
      if (!q.explanation && rationaleMap[q._qNumber]) {
        q.explanation = rationaleMap[q._qNumber];
      }

      if (q._hasAnswer) return; // inline answer already resolved — keep it

      // 1. Try strict label-number match
      let letter = answerKey[q._qNumber];

      // 2. Positional fallback
      if (letter === undefined && posIdx < positionalAnswers.length) {
        letter = positionalAnswers[posIdx];
      }

      if (letter !== undefined) {
        const idx = q._sortedLetters
          ? q._sortedLetters.indexOf(letter)
          : optLetters.indexOf(letter);
        q.correctIndex = idx >= 0 ? idx : 0;
        q._hasAnswer   = true;
      } else {
        q.correctIndex = 0;
      }
    });
  } else {
    questions.forEach(q => { if (q.correctIndex < 0) q.correctIndex = 0; });
  }

  return questions;
}

export function validateQuestion(q) {
  const errors = [];
  if (!q.question || q.question.trim().length < 5) errors.push('Question text too short.');
  if (!q.options || q.options.length < 2) errors.push('Need at least 2 options.');
  if (q.correctIndex === undefined || q.correctIndex < 0) errors.push('No correct answer marked.');
  if (q.options && q.correctIndex >= q.options.length) errors.push('Correct index out of range.');
  return errors;
}

export function formatQuestionForFirestore(q, meta = {}) {
  const options = Array.isArray(q.options)
    ? q.options.map(o => (typeof o === 'string' ? o : o.text || '').trim())
    : [];
  return {
    question:     q.question.trim(),
    options,
    correctIndex: (q.correctIndex !== undefined && q.correctIndex >= 0) ? q.correctIndex : 0,
    explanation:  q.explanation?.trim() || '',
    imageUrl:     q.imageUrl || '',
    explanationImageUrl: q.explanationImageUrl || '',
    category:     meta.category     || 'general_nursing',
    examType:     meta.examType     || 'past_questions',
    year:         meta.year         || '2024',
    subject:      meta.subject      || '',
    difficulty:   meta.difficulty   || 'medium',
    tags:         meta.tags         || [],
    source:       meta.source       || '',
    course:       meta.course       || '',
    topic:        meta.topic        || '',
    active:       true,
    createdAt:    new Date().toISOString(),
  };
}
