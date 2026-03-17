
const ANALYSIS_DEBOUNCE_MS = 1200;
const pendingTimers = new Map();

function scoreBand(score) {
  if (score < 30) return { label: 'Green', color: '#3fb950' };
  if (score < 65) return { label: 'Yellow', color: '#d4a72c' };
  return { label: 'Red', color: '#f85149' };
}

async function setIdleBadge(tabId) {
  await chrome.action.setBadgeText({ tabId, text: '…' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4b5563' });
}

async function clearBadge(tabId) {
  await chrome.action.setBadgeText({ tabId, text: '' });
}

async function setErrorBadge(tabId) {
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#6b7280' });
}

async function setResultBadge(tabId, score) {
  const { label, color } = scoreBand(score);
  await chrome.action.setBadgeText({ tabId, text: String(Math.round(score)) });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setTitle({
    tabId,
    title: `Rhetoric Lens — main page score ${Math.round(score)} (${label})`
  });
}

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('analyzer.html')]
  });

  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'analyzer.html',
    reasons: ['DOM_PARSER'],
    justification: 'Run built-in AI APIs for local rhetoric analysis in the background.'
  });
}

async function runAnalyzer(payload) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ type: 'RUN_ANALYSIS', payload });
}

async function extractTabText(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['extractor.js']
  });
  return result;
}

async function analyzeTab(tabId, options = {}) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
      await clearBadge(tabId);
      return;
    }

    await chrome.storage.local.set({
      [`analysis:${tabId}`]: {
        tabId,
        url: tab.url,
        status: 'analyzing',
        updatedAt: Date.now()
      }
    });
    await setIdleBadge(tabId);
    const extraction = await extractTabText(tabId);
    if (!extraction?.extractedText) {
      throw new Error('Not enough page text to analyze.');
    }

    const includeRewrite = Boolean(options.includeRewrite);
    const response = await runAnalyzer({
      text: extraction.extractedText,
      includeRewrite
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Background analysis failed.');
    }

    const record = {
      tabId,
      url: tab.url,
      title: extraction.title,
      extraction,
      status: 'ready',
      analysis: response.analysis,
      detectedLanguage: response.detectedLanguage,
      viaTranslation: response.viaTranslation,
      englishText: response.englishText,
      includeRewrite,
      updatedAt: Date.now()
    };

    await chrome.storage.local.set({ [`analysis:${tabId}`]: record });
    await setResultBadge(tabId, response.analysis.main_page_score);
    await chrome.runtime.sendMessage({ type: 'ANALYSIS_UPDATED', tabId, record }).catch(() => {});
  } catch (error) {
    await chrome.storage.local.set({
      [`analysis:${tabId}`]: {
        tabId,
        url: (await chrome.tabs.get(tabId).catch(() => null))?.url || '',
        status: 'error',
        error: error.message || String(error),
        updatedAt: Date.now()
      }
    });
    await setErrorBadge(tabId);
    await chrome.runtime.sendMessage({
      type: 'ANALYSIS_UPDATED',
      tabId,
      record: { tabId, error: error.message || String(error), updatedAt: Date.now() }
    }).catch(() => {});
  }
}

async function markPending(tabId, url) {
  await chrome.storage.local.set({
    [`analysis:${tabId}`]: {
      tabId,
      url: url || '',
      status: 'pending',
      updatedAt: Date.now()
    }
  });
}

function scheduleTabAnalysis(tabId, url) {
  const existing = pendingTimers.get(tabId);
  if (existing) clearTimeout(existing);
  markPending(tabId, url).catch(() => {});
  setIdleBadge(tabId).catch(() => {});
  const timer = setTimeout(() => {
    pendingTimers.delete(tabId);
    analyzeTab(tabId);
  }, ANALYSIS_DEBOUNCE_MS);
  pendingTimers.set(tabId, timer);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    const existing = pendingTimers.get(tabId);
    if (existing) clearTimeout(existing);
    pendingTimers.delete(tabId);
    chrome.storage.local.set({
      [`analysis:${tabId}`]: {
        tabId,
        url: tab?.url || '',
        status: 'loading',
        updatedAt: Date.now()
      }
    }).catch(() => {});
    clearBadge(tabId).catch(() => {});
    return;
  }

  if (changeInfo.status === 'complete' && /^https?:/i.test(tab?.url || '')) {
    scheduleTabAnalysis(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const stored = await chrome.storage.local.get(`analysis:${tabId}`);
  const record = stored[`analysis:${tabId}`];
  if (record?.analysis?.main_page_score !== undefined) {
    await setResultBadge(tabId, record.analysis.main_page_score);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingTimers.delete(tabId);
  chrome.storage.local.remove(`analysis:${tabId}`).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_TAB_ANALYSIS') {
    const tabId = message.tabId;
    chrome.storage.local.get(`analysis:${tabId}`).then((data) => {
      sendResponse({ record: data[`analysis:${tabId}`] || null });
    });
    return true;
  }

  if (message?.type === 'ANALYZE_TAB_NOW') {
    analyzeTab(message.tabId, { includeRewrite: Boolean(message.includeRewrite) })
      .then(() => chrome.storage.local.get(`analysis:${message.tabId}`))
      .then((data) => sendResponse({ record: data[`analysis:${message.tabId}`] || null }))
      .catch((error) => sendResponse({ error: error.message || String(error) }));
    return true;
  }
});
