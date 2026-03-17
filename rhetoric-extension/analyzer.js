const PATTERN_LABELS = {
  people_vs_elite: 'People vs. elite',
  demonization: 'Demonization',
  overgeneralization: 'Overgeneralization',
  fear_appeal: 'Fear appeal',
  apocalyptic_language: 'Apocalyptic language',
  moral_purity: 'Moral purity',
  certainty_over_complexity: 'Certainty over complexity',
  scapegoating: 'Scapegoating'
};

const PATTERN_KEYS = Object.keys(PATTERN_LABELS);

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'main_page_score',
    'quoted_rhetoric_score',
    'article_stance',
    'confidence',
    'main_page_patterns',
    'quoted_patterns',
    'issue_topic',
    'issue_stance',
    'issue_stance_confidence',
    'quoted_issue_stance',
    'quoted_issue_stance_confidence',
    'flagged_segments',
    'short_explanation'
  ],
  properties: {
    main_page_score: { type: 'number', minimum: 0, maximum: 100 },
    quoted_rhetoric_score: { type: 'number', minimum: 0, maximum: 100 },
    article_stance: { type: 'string', enum: ['critical', 'neutral', 'supportive'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },

    main_page_patterns: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: PATTERN_KEYS }
    },

    quoted_patterns: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: PATTERN_KEYS }
    },

    issue_topic: { type: 'string' },
    issue_stance: { type: 'string' },
    issue_stance_confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    quoted_issue_stance: { type: 'string' },
    quoted_issue_stance_confidence: { type: 'string', enum: ['low', 'medium', 'high'] },

    flagged_segments: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'pattern', 'source_type', 'affects_main_score', 'stance'],
        properties: {
          text: { type: 'string' },
          pattern: { type: 'string', enum: PATTERN_KEYS },
          source_type: { type: 'string', enum: ['authorial', 'quoted', 'paraphrased'] },
          affects_main_score: { type: 'boolean' },
          stance: { type: 'string', enum: ['endorsed', 'neutral_reporting', 'challenged'] }
        }
      }
    },

    short_explanation: { type: 'string' },
    neutral_rewrite: { type: 'string' }
  }
};

function clampScore(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function uniqPatterns(items) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (PATTERN_KEYS.includes(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function normalizeConfidence(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'low';
}

function normalizeIssueText(value) {
  return String(value || '').trim();
}

function normalizeFlaggedSegments(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 5)
    .map((item) => ({
      text: String(item?.text || '').trim(),
      pattern: PATTERN_KEYS.includes(item?.pattern) ? item.pattern : 'overgeneralization',
      source_type: ['authorial', 'quoted', 'paraphrased'].includes(item?.source_type)
        ? item.source_type
        : 'quoted',
      affects_main_score: Boolean(item?.affects_main_score),
      stance: ['endorsed', 'neutral_reporting', 'challenged'].includes(item?.stance)
        ? item.stance
        : 'neutral_reporting'
    }))
    .filter((item) => item.text);
}

function normalizeAnalysis(parsed, includeRewrite) {
  return {
    main_page_score: clampScore(parsed?.main_page_score),
    quoted_rhetoric_score: clampScore(parsed?.quoted_rhetoric_score),
    article_stance: ['critical', 'neutral', 'supportive'].includes(parsed?.article_stance)
      ? parsed.article_stance
      : 'neutral',
    confidence: normalizeConfidence(parsed?.confidence),
    main_page_patterns: uniqPatterns(parsed?.main_page_patterns).slice(0, 4),
    quoted_patterns: uniqPatterns(parsed?.quoted_patterns).slice(0, 4),

    issue_topic: normalizeIssueText(parsed?.issue_topic),
    issue_stance: normalizeIssueText(parsed?.issue_stance),
    issue_stance_confidence: normalizeConfidence(parsed?.issue_stance_confidence),
    quoted_issue_stance: normalizeIssueText(parsed?.quoted_issue_stance),
    quoted_issue_stance_confidence: normalizeConfidence(parsed?.quoted_issue_stance_confidence),

    flagged_segments: normalizeFlaggedSegments(parsed?.flagged_segments),
    short_explanation: String(parsed?.short_explanation || '').trim(),
    neutral_rewrite: includeRewrite ? String(parsed?.neutral_rewrite || '').trim() : ''
  };
}

async function createLanguageDetector() {
  if (!('LanguageDetector' in self)) return null;
  const availability = await LanguageDetector.availability();
  if (availability === 'unavailable') return null;
  return LanguageDetector.create();
}

async function detectLanguage(text) {
  const detector = await createLanguageDetector();
  if (!detector) return { language: 'unknown', confidence: 0 };

  const results = await detector.detect(text.slice(0, 1200));
  const top = results?.[0];
  detector.destroy?.();

  return {
    language: top?.detectedLanguage || 'unknown',
    confidence: top?.confidence || 0
  };
}

async function maybeTranslateToEnglish(text, sourceLanguage) {
  if (!sourceLanguage || sourceLanguage === 'en' || sourceLanguage === 'unknown') {
    return { englishText: text, viaTranslation: false };
  }

  if (!('Translator' in self)) {
    throw new Error('Translator API is not available in this Chrome build.');
  }

  const availability = await Translator.availability({
    sourceLanguage,
    targetLanguage: 'en'
  });

  if (availability === 'unavailable') {
    throw new Error(`Translation from ${sourceLanguage} to English is not available on this device.`);
  }

  const translator = await Translator.create({
    sourceLanguage,
    targetLanguage: 'en'
  });

  const englishText = await translator.translate(text);
  translator.destroy?.();

  return {
    englishText,
    viaTranslation: true
  };
}

async function analyzeTextInEnglish(englishText, includeRewrite) {
  if (!('LanguageModel' in self)) {
    throw new Error('Prompt API is not available in this Chrome build or extension context.');
  }

  const promptConfig = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
  };

  const availability = await LanguageModel.availability(promptConfig);
  if (availability === 'unavailable') {
    throw new Error('Gemini Nano Prompt API is unavailable on this device.');
  }

  const session = await LanguageModel.create(promptConfig);

  const taskPrompt = [
    'You are a structured rhetoric analysis system.',
    '',
    'Analyze the text and distinguish between:',
    '1. rhetoric used by the page itself (authorial/editorial framing)',
    '2. rhetoric appearing in quoted or attributed speech',
    '',
    'Important rules:',
    '- Do NOT confuse quoted speech with the page\'s own rhetoric.',
    '- Quoted rhetoric should NOT increase main_page_score unless it is clearly endorsed or adopted by the page.',
    '- If unsure whether language is authorial or quoted, treat it as quoted/paraphrased and keep main_page_score conservative.',
    '- Headline and subheadline framing count strongly toward main_page_score.',
    '- Evaluate rhetorical style only. Do not evaluate factual truth.',
    '',
    'Issue stance rules:',
    '- Detect the main issue or topic only if it is reasonably clear.',
    '- issue_topic should be a short topic label such as "immigration", "judicial reform", "ceasefire", "tax policy".',
    '- issue_stance should describe the page\'s stance on that issue, not a broad left/right ideology.',
    '- quoted_issue_stance should describe the quoted speaker\'s stance on that same issue when clear.',
    '- Use concrete stance labels like "pro-judicial-reform", "anti-judicial-reform", "restriction-leaning", "pro-ceasefire", "hawkish", "dovish", "anti-government", "pro-government".',
    '- If issue stance is unclear, return empty strings for issue_topic and stance fields and use confidence "low".',
    '- Only use medium or high confidence for issue stance when the stance is genuinely clear from the text.',
    '',
    'Use only these pattern labels:',
    PATTERN_KEYS.join(', '),
    '',
    'Return JSON with these meanings:',
    '- main_page_score: 0-100 based only on rhetoric of the page itself',
    '- quoted_rhetoric_score: 0-100 based only on rhetoric inside quoted or attributed speech',
    '- article_stance: critical | neutral | supportive',
    '- confidence: low | medium | high',
    '- main_page_patterns: only patterns used by the page itself',
    '- quoted_patterns: only patterns used in quoted or attributed speech',
    '- issue_topic: short issue/topic string, or empty string if unclear',
    '- issue_stance: page stance on the issue, or empty string if unclear',
    '- issue_stance_confidence: low | medium | high',
    '- quoted_issue_stance: quoted speaker stance on the same issue, or empty string if unclear',
    '- quoted_issue_stance_confidence: low | medium | high',
    '- flagged_segments: up to 5 items with text, pattern, source_type (authorial|quoted|paraphrased), affects_main_score (true|false), stance (endorsed|neutral_reporting|challenged)',
    '- short_explanation: 2-3 sentences max',
    includeRewrite
      ? '- neutral_rewrite: provide a short, more neutral rewrite of the main authorial claim or framing'
      : '- neutral_rewrite: return an empty string',
    '',
    'TEXT TO ANALYZE:',
    englishText
  ].join('\n');

  const response = await session.prompt(taskPrompt, {
    responseConstraint: ANALYSIS_SCHEMA,
    omitResponseConstraintInput: true
  });

  try {
    return normalizeAnalysis(JSON.parse(response), includeRewrite);
  } catch {
    throw new Error(`The model returned invalid JSON: ${response}`);
  } finally {
    session.destroy?.();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'RUN_ANALYSIS') return;

  (async () => {
    const text = message.payload?.text || '';
    const includeRewrite = Boolean(message.payload?.includeRewrite);

    const detected = await detectLanguage(text);
    const { englishText, viaTranslation } = await maybeTranslateToEnglish(text, detected.language);
    const analysis = await analyzeTextInEnglish(englishText, includeRewrite);

    return {
      ok: true,
      analysis,
      detectedLanguage: detected.language,
      viaTranslation,
      englishText
    };
  })()
    .then(sendResponse)
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error.message || String(error)
      })
    );

  return true;
});
const PATTERN_LABELS = {
  people_vs_elite: 'People vs. elite',
  demonization: 'Demonization',
  overgeneralization: 'Overgeneralization',
  fear_appeal: 'Fear appeal',
  apocalyptic_language: 'Apocalyptic language',
  moral_purity: 'Moral purity',
  certainty_over_complexity: 'Certainty over complexity',
  scapegoating: 'Scapegoating'
};

const PATTERN_KEYS = Object.keys(PATTERN_LABELS);

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'main_page_score',
    'quoted_rhetoric_score',
    'article_stance',
    'confidence',
    'main_page_patterns',
    'quoted_patterns',
    'flagged_segments',
    'short_explanation'
  ],
  properties: {
    main_page_score: { type: 'number', minimum: 0, maximum: 100 },
    quoted_rhetoric_score: { type: 'number', minimum: 0, maximum: 100 },
    article_stance: { type: 'string', enum: ['critical', 'neutral', 'supportive'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    main_page_patterns: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: PATTERN_KEYS }
    },
    quoted_patterns: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: PATTERN_KEYS }
    },
    flagged_segments: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'pattern', 'source_type', 'affects_main_score', 'stance'],
        properties: {
          text: { type: 'string' },
          pattern: { type: 'string', enum: PATTERN_KEYS },
          source_type: { type: 'string', enum: ['authorial', 'quoted', 'paraphrased'] },
          affects_main_score: { type: 'boolean' },
          stance: { type: 'string', enum: ['endorsed', 'neutral_reporting', 'challenged'] }
        }
      }
    },
    short_explanation: { type: 'string' },
    neutral_rewrite: { type: 'string' }
  }
};

function clampScore(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function uniqPatterns(items) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (PATTERN_KEYS.includes(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function normalizeFlaggedSegments(items) {
  return (Array.isArray(items) ? items : []).slice(0, 5).map((item) => ({
    text: String(item?.text || '').trim(),
    pattern: PATTERN_KEYS.includes(item?.pattern) ? item.pattern : 'overgeneralization',
    source_type: ['authorial', 'quoted', 'paraphrased'].includes(item?.source_type) ? item.source_type : 'quoted',
    affects_main_score: Boolean(item?.affects_main_score),
    stance: ['endorsed', 'neutral_reporting', 'challenged'].includes(item?.stance)
      ? item.stance
      : 'neutral_reporting'
  })).filter((item) => item.text);
}

function normalizeAnalysis(parsed, includeRewrite) {
  return {
    main_page_score: clampScore(parsed?.main_page_score),
    quoted_rhetoric_score: clampScore(parsed?.quoted_rhetoric_score),
    article_stance: ['critical', 'neutral', 'supportive'].includes(parsed?.article_stance)
      ? parsed.article_stance
      : 'neutral',
    confidence: ['low', 'medium', 'high'].includes(parsed?.confidence) ? parsed.confidence : 'low',
    main_page_patterns: uniqPatterns(parsed?.main_page_patterns).slice(0, 4),
    quoted_patterns: uniqPatterns(parsed?.quoted_patterns).slice(0, 4),
    flagged_segments: normalizeFlaggedSegments(parsed?.flagged_segments),
    short_explanation: String(parsed?.short_explanation || '').trim(),
    neutral_rewrite: includeRewrite ? String(parsed?.neutral_rewrite || '').trim() : ''
  };
}

async function createLanguageDetector() {
  if (!('LanguageDetector' in self)) return null;
  const availability = await LanguageDetector.availability();
  if (availability === 'unavailable') return null;
  return LanguageDetector.create();
}

async function detectLanguage(text) {
  const detector = await createLanguageDetector();
  if (!detector) return { language: 'unknown', confidence: 0 };
  const results = await detector.detect(text.slice(0, 1200));
  const top = results?.[0];
  detector.destroy?.();
  return {
    language: top?.detectedLanguage || 'unknown',
    confidence: top?.confidence || 0
  };
}

async function maybeTranslateToEnglish(text, sourceLanguage) {
  if (!sourceLanguage || sourceLanguage === 'en' || sourceLanguage === 'unknown') {
    return { englishText: text, viaTranslation: false };
  }

  if (!('Translator' in self)) {
    throw new Error('Translator API is not available in this Chrome build.');
  }

  const availability = await Translator.availability({
    sourceLanguage,
    targetLanguage: 'en'
  });

  if (availability === 'unavailable') {
    throw new Error(`Translation from ${sourceLanguage} to English is not available on this device.`);
  }

  const translator = await Translator.create({
    sourceLanguage,
    targetLanguage: 'en'
  });

  const englishText = await translator.translate(text);
  translator.destroy?.();
  return { englishText, viaTranslation: true };
}

async function analyzeTextInEnglish(englishText, includeRewrite) {
  if (!('LanguageModel' in self)) {
    throw new Error('Prompt API is not available in this Chrome build or extension context.');
  }

  const promptConfig = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
  };

  const availability = await LanguageModel.availability(promptConfig);
  if (availability === 'unavailable') {
    throw new Error('Gemini Nano Prompt API is unavailable on this device.');
  }

  const session = await LanguageModel.create(promptConfig);
  const taskPrompt = [
    'You are a structured rhetoric analysis system.',
    'Analyze the text and distinguish between:',
    '1. rhetoric used by the page itself (authorial/editorial framing)',
    '2. rhetoric appearing in quoted or attributed speech',
    '',
    'Important rules:',
    '- Do NOT confuse quoted speech with the page\'s own rhetoric.',
    '- Quoted rhetoric should NOT increase main_page_score unless it is clearly endorsed or adopted by the page.',
    '- If unsure whether language is authorial or quoted, treat it as quoted/paraphrased and keep main_page_score conservative.',
    '- Headline and subheadline framing count strongly toward main_page_score.',
    '- Evaluate rhetorical style only. Do not evaluate factual truth.',
    '',
    'Use only these pattern labels:',
    PATTERN_KEYS.join(', '),
    '',
    'Return JSON with these meanings:',
    '- main_page_score: 0-100 based only on rhetoric of the page itself',
    '- quoted_rhetoric_score: 0-100 based only on rhetoric inside quoted or attributed speech',
    '- article_stance: critical | neutral | supportive',
    '- confidence: low | medium | high',
    '- main_page_patterns: only patterns used by the page itself',
    '- quoted_patterns: only patterns used in quoted or attributed speech',
    '- flagged_segments: up to 5 items with text, pattern, source_type (authorial|quoted|paraphrased), affects_main_score (true|false), stance (endorsed|neutral_reporting|challenged)',
    '- short_explanation: 2-3 sentences max',
    includeRewrite
      ? '- neutral_rewrite: provide a short, more neutral rewrite of the main authorial claim or framing'
      : '- neutral_rewrite: return an empty string',
    '',
    'TEXT TO ANALYZE:',
    englishText
  ].join('\n');

  const response = await session.prompt(taskPrompt, {
    responseConstraint: ANALYSIS_SCHEMA,
    omitResponseConstraintInput: true
  });

  try {
    return normalizeAnalysis(JSON.parse(response), includeRewrite);
  } catch {
    throw new Error(`The model returned invalid JSON: ${response}`);
  } finally {
    session.destroy?.();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'RUN_ANALYSIS') return;

  (async () => {
    const text = message.payload?.text || '';
    const includeRewrite = Boolean(message.payload?.includeRewrite);
    const detected = await detectLanguage(text);
    const { englishText, viaTranslation } = await maybeTranslateToEnglish(text, detected.language);
    const analysis = await analyzeTextInEnglish(englishText, includeRewrite);
    return {
      ok: true,
      analysis,
      detectedLanguage: detected.language,
      viaTranslation,
      englishText
    };
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});
