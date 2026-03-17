const analyzeBtn = document.getElementById('analyzeBtn');
const neutralRewriteToggle = document.getElementById('neutralRewriteToggle');

const statusCard = document.getElementById('statusCard');
const statusTitle = document.getElementById('statusTitle');
const statusText = document.getElementById('statusText');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');

const resultCard = document.getElementById('resultCard');

const mainScoreValue = document.getElementById('mainScoreValue');
const mainScoreBadge = document.getElementById('mainScoreBadge');
const quotedScoreValue = document.getElementById('quotedScoreValue');
const quotedScoreBadge = document.getElementById('quotedScoreBadge');

const articleIssueStance = document.getElementById('articleIssueStance');
const quotedIssueStance = document.getElementById('quotedIssueStance');

const stanceValue = document.getElementById('stanceValue');
const confidenceValue = document.getElementById('confidenceValue');

const mainPatternsList = document.getElementById('mainPatternsList');
const quotedPatternsList = document.getElementById('quotedPatternsList');
const explanationText = document.getElementById('explanationText');
const authorSegmentsList = document.getElementById('authorSegmentsList');
const quotedSegmentsList = document.getElementById('quotedSegmentsList');

const rewriteBlock = document.getElementById('rewriteBlock');
const rewriteText = document.getElementById('rewriteText');

const rawText = document.getElementById('rawText');
const translatedText = document.getElementById('translatedText');
const autoStatus = document.getElementById('autoStatus');

const feedbackButtonsWrap = document.getElementById('feedbackButtons');
const feedbackThanks = document.getElementById('feedbackThanks');

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

let activeTabId = null;
let activeTabUrl = null;
let activeRecord = null;

function setStatus(title, text = '', progress = null) {
  statusCard.classList.remove('hidden');
  statusTitle.textContent = title;
  statusText.textContent = text;

  if (typeof progress === 'number') {
    progressWrap.classList.remove('hidden');
    progressFill.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  } else {
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
  }
}

function hideStatus() {
  statusCard.classList.add('hidden');
}

function normalizeConfidence(value, viaTranslation) {
  if (!viaTranslation) return value;
  if (value === 'high') return 'medium';
  if (value === 'medium') return 'low';
  return value;
}

function scoreBand(score) {
  if (score < 30) return ['Green', 'score-green', 'badge-green'];
  if (score < 65) return ['Yellow', 'score-yellow', 'badge-yellow'];
  return ['Red', 'score-red', 'badge-red'];
}

function clearScoreClasses(el, badgeEl, extraClass = 'score-value', extraBadgeClass = 'badge') {
  el.className = extraClass;
  badgeEl.className = extraBadgeClass;
}

function titleCase(value) {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function patternListText(pattern) {
  return PATTERN_LABELS[pattern] || pattern;
}

function renderPatternChips(container, patterns, emptyText) {
  container.innerHTML = '';
  if (!patterns?.length) {
    container.textContent = emptyText;
    return;
  }

  for (const pattern of patterns) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = patternListText(pattern);
    container.appendChild(chip);
  }
}

function renderSegments(container, items, emptyText) {
  container.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = emptyText;
    container.appendChild(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    const parts = [`“${item.text}”`, patternListText(item.pattern)];

    if (item.source_type === 'quoted' || item.source_type === 'paraphrased') {
      const stanceMap = {
        endorsed: 'endorsed',
        neutral_reporting: 'reported neutrally',
        challenged: 'challenged'
      };
      parts.push(stanceMap[item.stance] || item.stance);
    } else if (item.affects_main_score) {
      parts.push('affects article score');
    }

    li.textContent = parts.join(' — ');
    container.appendChild(li);
  }
}

function shouldShowIssueStance(confidence) {
  return confidence === 'medium' || confidence === 'high';
}

function renderIssueStance(el, topic, stance, confidence, prefix) {
  const hasTopic = Boolean(topic && topic.trim());
  const hasStance = Boolean(stance && stance.trim());

  if (!hasTopic || !hasStance || !shouldShowIssueStance(confidence)) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }

  el.textContent = `${prefix} on ${topic}: ${stance}`;
  el.classList.remove('hidden');
}

function resetFeedbackUi() {
  feedbackButtonsWrap.classList.remove('hidden');
  feedbackThanks.classList.add('hidden');
}

async function saveFeedback(feedbackType) {
  if (!activeRecord || !activeRecord.analysis) return;

  const manifest = chrome.runtime.getManifest();
  const existing = await chrome.storage.local.get('rhetoricFeedbackLog');
  const log = Array.isArray(existing.rhetoricFeedbackLog) ? existing.rhetoricFeedbackLog : [];

  const payload = {
    timestamp: Date.now(),
    feedback_type: feedbackType,
    url: activeRecord.url || activeTabUrl || '',
    domain: (() => {
      try {
        return new URL(activeRecord.url || activeTabUrl || '').hostname;
      } catch {
        return '';
      }
    })(),
    page_title: activeRecord.extraction?.title || '',
    tab_id: activeTabId,
    extension_version: manifest.version,
    analysis_version: 'issue-stance-v1',
    prompt_version: 'issue-stance-v1',
    detected_language: activeRecord.detectedLanguage || 'unknown',
    via_translation: Boolean(activeRecord.viaTranslation),
    extracted_text: activeRecord.extraction?.extractedText || '',
    translated_text: activeRecord.englishText || '',
    extraction_meta: {
      title: activeRecord.extraction?.title || '',
      url: activeRecord.extraction?.url || '',
      quote_count_estimate: activeRecord.extraction?.quoteCount ?? null,
      extraction_length: (activeRecord.extraction?.extractedText || '').length
    },
    model_output: activeRecord.analysis
  };

  log.unshift(payload);
  const trimmed = log.slice(0, 500);

  await chrome.storage.local.set({
    rhetoricFeedbackLog: trimmed
  });
}

function renderAnalysis(record) {
  activeRecord = record;

  const result = record.analysis;
  const sourceText = record.extraction?.extractedText || '';
  const englishText = record.englishText || sourceText;
  const viaTranslation = Boolean(record.viaTranslation);
  const normalizedConfidence = normalizeConfidence(result.confidence, viaTranslation);

  resultCard.classList.remove('hidden');

  clearScoreClasses(mainScoreValue, mainScoreBadge);
  clearScoreClasses(
    quotedScoreValue,
    quotedScoreBadge,
    'score-value secondary-score',
    'badge badge-secondary'
  );

  const [mainBand, mainScoreClass, mainBadgeClass] = scoreBand(result.main_page_score);
  mainScoreValue.textContent = `${Math.round(result.main_page_score)}`;
  mainScoreValue.classList.add(mainScoreClass);
  mainScoreBadge.textContent = mainBand;
  mainScoreBadge.classList.add(mainBadgeClass);

  const [quotedBand, quotedScoreClass, quotedBadgeClass] = scoreBand(result.quoted_rhetoric_score);
  quotedScoreValue.textContent = `${Math.round(result.quoted_rhetoric_score)}`;
  quotedScoreValue.classList.add(quotedScoreClass);
  quotedScoreBadge.textContent = quotedBand;
  quotedScoreBadge.classList.add(quotedBadgeClass);

  stanceValue.textContent = titleCase(result.article_stance);
  confidenceValue.textContent = normalizedConfidence;

  renderIssueStance(
    articleIssueStance,
    result.issue_topic,
    result.issue_stance,
    result.issue_stance_confidence,
    'Stance'
  );

  renderIssueStance(
    quotedIssueStance,
    result.issue_topic,
    result.quoted_issue_stance,
    result.quoted_issue_stance_confidence,
    'Quoted stance'
  );

  renderPatternChips(mainPatternsList, result.main_page_patterns, 'No strong article pattern');
  renderPatternChips(quotedPatternsList, result.quoted_patterns, 'No strong quoted pattern');

  explanationText.textContent = result.short_explanation || 'No explanation returned.';

  const authorialSegments = (result.flagged_segments || []).filter(
    (item) => item.source_type === 'authorial' || item.affects_main_score
  );

  const quotedSegments = (result.flagged_segments || []).filter(
    (item) => item.source_type !== 'authorial' && !item.affects_main_score
  );

  renderSegments(authorSegmentsList, authorialSegments, 'No article segment was highlighted.');
  renderSegments(quotedSegmentsList, quotedSegments, 'No quoted or attributed segment was highlighted.');

  const rewrite = (result.neutral_rewrite || '').trim();
  if (rewrite) {
    rewriteBlock.classList.remove('hidden');
    rewriteText.textContent = rewrite;
  } else {
    rewriteBlock.classList.add('hidden');
    rewriteText.textContent = '';
  }

  rawText.textContent = sourceText;
  translatedText.textContent = englishText;

  autoStatus.textContent = `Auto-analyzed ${timeAgo(record.updatedAt)}.`;
  resetFeedbackUi();
  hideStatus();
}

function renderError(record) {
  activeRecord = record || null;
  resultCard.classList.add('hidden');
  setStatus('Analysis failed', record?.error || 'Unknown error');
  autoStatus.textContent = record?.updatedAt
    ? `Last attempt ${timeAgo(record.updatedAt)}.`
    : 'Auto-analysis failed.';
}

function timeAgo(timestamp) {
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  activeTabId = tab.id;
  activeTabUrl = tab.url || '';
  return tab;
}

async function loadExistingAnalysis() {
  const tab = await getActiveTab();
  const response = await chrome.runtime.sendMessage({
    type: 'GET_TAB_ANALYSIS',
    tabId: tab.id
  });

  const record = response?.record;

  if (!record) {
    setStatus('Waiting for auto-analysis', 'The page should analyze automatically a moment after load.');
    autoStatus.textContent = 'Auto-analysis pending.';
    return;
  }

  if (record.status === 'loading' || record.status === 'pending' || record.status === 'analyzing') {
    setStatus('Analyzing current page', 'The current tab is loading or being analyzed locally.');
    autoStatus.textContent = 'Auto-analysis pending.';
    return;
  }

  if (record.url && activeTabUrl && record.url !== activeTabUrl) {
    setStatus('Analyzing current page', 'A new page is loading in this tab. Reload the popup in a moment.');
    autoStatus.textContent = 'Current page analysis pending.';
    return;
  }

  if (record.status === 'error') {
    renderError(record);
    return;
  }

  if (record.status === 'ready' && record.analysis) {
    renderAnalysis(record);
    return;
  }

  setStatus('Waiting for current page', 'A previous page analysis is cached. Reload the popup in a moment.');
}

async function rerunAnalysis() {
  try {
    analyzeBtn.disabled = true;
    setStatus('Starting analysis', 'Extracting page content...');
    const tab = await getActiveTab();

    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_ACTIVE_TAB',
      tabId: tab.id,
      includeRewrite: Boolean(neutralRewriteToggle.checked),
      force: true
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Analysis failed.');
    }

    renderAnalysis(response.record);
  } catch (error) {
    renderError({
      error: error.message || String(error),
      updatedAt: Date.now()
    });
  } finally {
    analyzeBtn.disabled = false;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'TAB_ANALYSIS_UPDATED') return;

  if (message.tabId !== activeTabId) return;
  if (message.record?.url && activeTabUrl && message.record.url !== activeTabUrl) return;

  if (message.record?.status === 'ready') {
    renderAnalysis(message.record);
  } else if (message.record?.status === 'error') {
    renderError(message.record);
  } else if (['loading', 'pending', 'analyzing'].includes(message.record?.status)) {
    setStatus('Analyzing current page', 'The current tab is loading or being analyzed locally.');
  }
});

analyzeBtn.addEventListener('click', rerunAnalysis);

document.querySelectorAll('.feedback-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const feedbackType = btn.dataset.feedback;
    try {
      await saveFeedback(feedbackType);
      feedbackButtonsWrap.classList.add('hidden');
      feedbackThanks.classList.remove('hidden');
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }
  });
});

loadExistingAnalysis().catch((error) => {
  renderError({
    error: error.message || String(error),
    updatedAt: Date.now()
  });
});
