(() => {
  function cleanText(value) {
    return (value || "")
      .replace(/\s+/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
  }

  function uniqueNonEmpty(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const cleaned = cleanText(value);
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      result.push(cleaned);
    }
    return result;
  }

  const headlineCandidates = [
    document.querySelector('meta[property="og:title"]')?.content,
    document.querySelector('h1')?.innerText,
    document.title
  ];

  const subheadCandidates = [
    document.querySelector('meta[name="description"]')?.content,
    document.querySelector('h2')?.innerText,
    document.querySelector('[data-testid*="sub" i]')?.innerText
  ];

  const paragraphNodes = Array.from(document.querySelectorAll('article p, main p, p'));
  const paragraphs = uniqueNonEmpty(
    paragraphNodes
      .map((node) => node.innerText)
      .filter((text) => text && text.trim().length >= 60)
      .slice(0, 4)
  );

  const pieces = uniqueNonEmpty([
    ...headlineCandidates,
    ...subheadCandidates,
    ...paragraphs
  ]).slice(0, 8);

  const combined = pieces.join('\n\n').slice(0, 5000);
  return {
    url: location.href,
    title: cleanText(document.title),
    extractedText: combined,
    pieceCount: pieces.length
  };
})();
