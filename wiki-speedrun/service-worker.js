const WIKIPEDIA_HOST_SUFFIX = "wikipedia.org";
const GOOGLE_HOST_SUFFIX = "google.com";
const disqualifiedTabs = new Set();

function normalizeTitle(title) {
  return title.replaceAll("_", " ").trim().replace(/\s+/g, " ").toLowerCase();
}

function titleMatchKeys(title) {
  const normalized = normalizeTitle(title);
  const words = normalized.split(" ");
  const lastWord = words[words.length - 1];
  const keys = new Set([normalized]);

  if (lastWord.length > 3 && lastWord.endsWith("ies")) {
    words[words.length - 1] = `${lastWord.slice(0, -3)}y`;
    keys.add(words.join(" "));
  }

  if (
    lastWord.length > 3 &&
    lastWord.endsWith("s") &&
    !lastWord.endsWith("ss") &&
    !lastWord.endsWith("us") &&
    !lastWord.endsWith("is")
  ) {
    words[words.length - 1] = lastWord.slice(0, -1);
    keys.add(words.join(" "));
  }

  if (/(?:s|x|z|ch|sh)es$/.test(lastWord)) {
    words[words.length - 1] = lastWord.slice(0, -2);
    keys.add(words.join(" "));
  }

  return [...keys];
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

function isWikipediaSearchUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const isWikipedia =
    host === WIKIPEDIA_HOST_SUFFIX || host.endsWith(`.${WIKIPEDIA_HOST_SUFFIX}`);
  if (!isWikipedia) {
    return false;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    pathname = parsed.pathname.toLowerCase();
  }

  const title = parsed.searchParams
    .get("title")
    ?.replaceAll("_", " ")
    .toLowerCase();
  return (
    /^\/wiki\/special:search(?:\/|$)/.test(pathname) ||
    title === "special:search" ||
    parsed.searchParams.has("search") ||
    parsed.searchParams.has("fulltext")
  );
}

async function disqualifySearch(tabId) {
  disqualifiedTabs.add(tabId);
  const { challenge } = await chrome.storage.local.get("challenge");
  if (challenge?.tabId !== tabId) {
    return false;
  }

  if (challenge.active) {
    challenge.active = false;
    challenge.disqualifiedAt = Date.now();
    await chrome.storage.local.set({ challenge });
  }
  return Boolean(challenge.disqualifiedAt);
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
  return pages[0].title;
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

  const verifiedGoalTitle = await verifyArticleExists(goal);
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
    goalKeys: titleMatchKeys(verifiedGoalTitle),
    steps: 0,
    startedAt: null,
    startPending: true,
    wonAt: null,
  };
  disqualifiedTabs.delete(tab.id);
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

  if (message?.type === "wikipediaSearchSubmitted") {
    if (_sender.tab?.id === undefined) {
      sendResponse({ ok: false });
      return false;
    }
    disqualifySearch(_sender.tab.id)
      .then((disqualified) => sendResponse({ ok: true, disqualified }))
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
    challenge.wonAt ||
    disqualifiedTabs.has(details.tabId)
  ) {
    return;
  }

  if (challenge.startPending) {
    challenge.startPending = false;
    challenge.startedAt = Date.now();
    await chrome.storage.local.set({ challenge });
    return;
  }

  if (isWikipediaSearchUrl(details.url)) {
    await disqualifySearch(details.tabId);
    return;
  }

  if (!isCountedSite(details.url)) {
    return;
  }

  challenge.steps += 1;
  const title = articleTitleFromUrl(details.url);
  const goalKeys = challenge.goalKeys || titleMatchKeys(challenge.goalTitle);
  if (
    title &&
    titleMatchKeys(title).some((key) => goalKeys.includes(key))
  ) {
    challenge.wonAt = Date.now();
    challenge.active = false;
  }
  await chrome.storage.local.set({ challenge });
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (
    details.frameId === 0 &&
    isWikipediaSearchUrl(details.url)
  ) {
    await disqualifySearch(details.tabId);
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove("challenge");
});
