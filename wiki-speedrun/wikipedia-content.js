const DISQUALIFICATION_MESSAGE =
  "You are disqualified for searching in the Wikipedia search bar.";

function isSearchResultsPage() {
  let pathname;
  try {
    pathname = decodeURIComponent(window.location.pathname).toLowerCase();
  } catch {
    pathname = window.location.pathname.toLowerCase();
  }

  const title = new URLSearchParams(window.location.search)
    .get("title")
    ?.replaceAll("_", " ")
    .toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return (
    /^\/wiki\/special:search(?:\/|$)/.test(pathname) ||
    title === "special:search" ||
    params.has("search") ||
    params.has("fulltext")
  );
}

function showDisqualificationWarning() {
  if (document.getElementById("wiki-speedrun-disqualified")) {
    return;
  }

  const warning = document.createElement("div");
  warning.id = "wiki-speedrun-disqualified";
  warning.setAttribute("role", "alert");
  warning.textContent = DISQUALIFICATION_MESSAGE;
  warning.setAttribute("style", [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:2147483647",
    "padding:14px 20px",
    "background:#a12622",
    "color:#fff",
    "font:bold 16px/1.4 sans-serif",
    "text-align:center",
    "box-shadow:0 2px 8px #0006",
  ].join(";"));
  document.documentElement.append(warning);
}

let searchDisqualificationReported = false;

function reportSearchDisqualification() {
  if (searchDisqualificationReported) {
    return;
  }
  searchDisqualificationReported = true;
  chrome.runtime
    .sendMessage({ type: "wikipediaSearchSubmitted" })
    .then((response) => {
      if (response?.disqualified) {
        showDisqualificationWarning();
      }
    })
    .catch((error) => {
      console.error("Wikipedia Speedrun could not report the search:", error);
    });
}

function isWikipediaSearchControl(target) {
  return (
    target instanceof Element &&
    target.closest(
      '#searchInput, input[name="search"], input[name="searchInput"], input[type="search"], [role="search"] input',
    ) !== null
  );
}

document.addEventListener(
  "input",
  (event) => {
    if (isWikipediaSearchControl(event.target)) {
      reportSearchDisqualification();
    }
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter" && isWikipediaSearchControl(event.target)) {
      reportSearchDisqualification();
    }
  },
  true,
);

document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        '#searchButton, button[type="submit"], input[type="submit"]',
      )?.form?.querySelector(
        '#searchInput, input[name="search"], input[name="searchInput"], input[type="search"]',
      )
    ) {
      reportSearchDisqualification();
    }
  },
  true,
);

if (isSearchResultsPage()) {
  reportSearchDisqualification();
}
