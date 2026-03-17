
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
const stanceValue = document.getElementById('stanceValue');
const confidenceValue = document.getElementById('confidenceValue');
const languageValue = document.getElementById('languageValue');
const translationValue = document.getElementById('translationValue');
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
    container.innerHTML = `<span class="chip">${emptyText}</span>`;
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
      parts.push('affects main score');
    }
    li.textContent = parts.join(' — ');
    container.appendChild(li);
  }
}

function renderAnalysis(record) {
  const result = record.analysis;
  const sourceText = record.extraction?.extractedText || '';
  const englishText = record.englishText || sourceText;
  const detectedLanguage = record.detectedLanguage || 'unknown';
  const viaTranslation = Boolean(record.viaTranslation);

  resultCard.classList.remove('hidden');
  clearScoreClasses(mainScoreValue, mainScoreBadge);
  clearScoreClasses(quotedScoreValue, quotedScoreBadge, 'score-value secondary-score', 'badge badge-secondary');

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
  confidenceValue.textContent = normalizeConfidence(result.confidence, viaTranslation);
  languageValue.textContent = detectedLanguage;
  translationValue.textContent = viaTranslation ? 'yes' : 'no';

  renderPatternChips(mainPatternsList, result.main_page_patterns, 'No strong authorial pattern');
  renderPatternChips(quotedPatternsList, result.quoted_patterns, 'No strong quoted pattern');

  explanationText.textContent = result.short_explanation || 'No explanation returned.';

  const authorialSegments = (result.flagged_segments || []).filter((item) => item.source_type === 'authorial' || item.affects_main_score);
  const quotedSegments = (result.flagged_segments || []).filter((item) => item.source_type !== 'authorial' && !item.affects_main_score);
  renderSegments(authorSegmentsList, authorialSegments, 'No main-page segment was highlighted.');
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
  hideStatus();
}

function renderError(record) {
  resultCard.classList.add('hidden');
  setStatus('Analysis failed', record.error || 'Unknown error');
  autoStatus.textContent = record.updatedAt ? `Last attempt ${timeAgo(record.updatedAt)}.` : 'Auto-analysis failed.';
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
  const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ANALYSIS', tabId: tab.id });
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
    setStatus('Analyzing current page', 'A new page is loading in this tab. The previous result is being replaced.');
    autoStatus.textContent = 'Auto-analysis pending.';
    return;
  }

  if (record.error) {
    renderError(record);
    return;
  }

  if (record.analysis) {
    renderAnalysis(record);
    return;
  }

  setStatus('Waiting for auto-analysis', 'The current tab is still being analyzed.');
  autoStatus.textContent = 'Auto-analysis pending.';
}

async function rerunAnalysis() {
  analyzeBtn.disabled = true;
  resultCard.classList.add('hidden');
  setStatus('Re-running analysis', 'Running a fresh local analysis for the current tab.');
  autoStatus.textContent = 'Manual refresh in progress.';

  try {
    const tab = await getActiveTab();
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_TAB_NOW',
      tabId: tab.id,
      includeRewrite: neutralRewriteToggle.checked
    });

    if (response?.error) throw new Error(response.error);
    const record = response?.record;
    if (!record) throw new Error('No analysis result returned.');
    if (record.error) {
      renderError(record);
    } else {
      renderAnalysis(record);
    }
  } catch (error) {
    setStatus('Analysis failed', error.message || String(error));
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener('click', rerunAnalysis);
loadExistingAnalysis().catch((error) => {
  setStatus('Could not initialize popup', error.message || String(error));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'ANALYSIS_UPDATED') return;
  if (message.tabId !== activeTabId) return;

  const record = message.record;
  if (record?.url && activeTabUrl && record.url !== activeTabUrl) return;

  if (record?.error) {
    renderError(record);
  } else if (record?.analysis) {
    renderAnalysis(record);
  }
});
