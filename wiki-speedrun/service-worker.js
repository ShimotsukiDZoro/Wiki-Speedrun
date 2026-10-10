const WIKIPEDIA_HOST_SUFFIX = "wikipedia.org";
const GOOGLE_HOST_SUFFIX = "google.com";

function normalizeTitle(title) {
  return title.replaceAll("_", " ").trim().replace(/\s+/g, " ").toLowerCase();
}

function articleTitleFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isWikipedia =
    host === WIKIPEDIA_HOST_SUFFIX || host.endsWith(`.${WIKIPEDIA_HOST_SUFFIX}`);
  if (!isWikipedia || !parsed.pathname.startsWith("/wiki/")) {
    return null;
  }

  try {
    return decodeURIComponent(parsed.pathname.slice("/wiki/".length)).replaceAll(
      "_",
      " ",
    );
  } catch {
    return null;
  }
}

function isCountedSite(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  return (
    host === WIKIPEDIA_HOST_SUFFIX ||
    host.endsWith(`.${WIKIPEDIA_HOST_SUFFIX}`) ||
    host === GOOGLE_HOST_SUFFIX ||
    host.endsWith(`.${GOOGLE_HOST_SUFFIX}`)
  );
}

function articleUrl(title) {
  const slug = encodeURIComponent(title.trim().replaceAll(" ", "_")).replaceAll(
    "%28",
    "(",
  ).replaceAll("%29", ")");
  return `https://en.wikipedia.org/wiki/${slug}`;
}

async function verifyArticleExists(title) {
  const params = new URLSearchParams({
    action: "query",
    prop: "info",
    titles: title,
    redirects: "1",
    format: "json",
    formatversion: "2",
  });

  let response;
  try {
    response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  } catch {
    throw new Error(
      `Could not verify "${title}" with Wikipedia. Check your connection and try again.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Wikipedia could not verify "${title}" (HTTP ${response.status}). Try again.`,
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Wikipedia returned an invalid response for "${title}".`);
  }

  if (data?.error) {
    throw new Error(
      `Wikipedia could not verify "${title}": ${data.error.info || "API error"}`,
    );
  }

  const pages = data?.query?.pages;
  if (!Array.isArray(pages) || pages.length !== 1) {
    throw new Error(`Wikipedia returned an invalid response for "${title}".`);
  }
  if (pages[0].missing !== undefined) {
    throw new Error(`Wikipedia article "${title}" does not exist.`);
  }
}

async function getRandomArticle() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/` +
    `en.wikipedia/all-access/${year}/${month}/${day}`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      "Could not get popular articles from Wikipedia. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Wikipedia could not provide popular articles (HTTP ${response.status}). Try again.`,
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Wikipedia returned an invalid popular-articles response.");
  }

  const articles = data?.items?.[0]?.articles;
  if (!Array.isArray(articles)) {
    throw new Error("Wikipedia returned an invalid popular-articles response.");
  }

  const candidates = articles
    .slice(0, 100)
    .filter(
      (article) =>
        typeof article.article === "string" &&
        article.article !== "Main_Page" &&
        !article.article.includes(":"),
    )
    .map((article) => decodeURIComponent(article.article).replaceAll("_", " "));

  if (candidates.length === 0) {
    throw new Error("Wikipedia did not return any eligible popular articles.");
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function startChallenge(startTitle, goalTitle) {
  if (typeof startTitle !== "string" || typeof goalTitle !== "string") {
    throw new Error("Enter both a starting article and a goal article.");
  }

  const start = startTitle.trim();
  const goal = goalTitle.trim();
  if (!start || !goal) {
    throw new Error("Enter both a starting article and a goal article.");
  }
  if (normalizeTitle(start) === normalizeTitle(goal)) {
    throw new Error("The starting article and goal must be different.");
  }

  await verifyArticleExists(goal);
  await verifyArticleExists(start);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    throw new Error("Could not find the active browser tab.");
  }

  const challenge = {
    active: true,
    tabId: tab.id,
    startTitle: start,
    goalTitle: goal,
    goalKey: normalizeTitle(goal),
    steps: 0,
    startedAt: null,
    startPending: true,
    wonAt: null,
  };
  await chrome.storage.local.set({ challenge });

  try {
    await chrome.tabs.update(tab.id, { url: articleUrl(start) });
  } catch (error) {
    await chrome.storage.local.remove("challenge");
    throw new Error(`Could not open the starting article: ${error.message}`);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getRandomArticle") {
    getRandomArticle()
      .then((title) => sendResponse({ ok: true, title }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "startChallenge") {
    startChallenge(message.startTitle, message.goalTitle)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "endChallenge") {
    chrome.storage.local
      .remove("challenge")
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) {
    return;
  }

  const { challenge } = await chrome.storage.local.get("challenge");
  if (
    !challenge?.active ||
    challenge.tabId !== details.tabId ||
    challenge.wonAt
  ) {
    return;
  }

  if (challenge.startPending) {
    challenge.startPending = false;
    challenge.startedAt = Date.now();
    await chrome.storage.local.set({ challenge });
    return;
  }

  if (!isCountedSite(details.url)) {
    return;
  }

  challenge.steps += 1;
  const title = articleTitleFromUrl(details.url);
  if (title && normalizeTitle(title) === challenge.goalKey) {
    challenge.wonAt = Date.now();
    challenge.active = false;
  }
  await chrome.storage.local.set({ challenge });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove("challenge");
});
