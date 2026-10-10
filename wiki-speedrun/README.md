# Wikipedia Speedrun

A small Chrome and Microsoft Edge extension for racing between articles on the
Wikipedia website. It works in your normal browser.

## Install from a GitHub download

1. On GitHub, select **Code → Download ZIP**, then extract the ZIP.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted `wiki-speedrun` folder
   (the folder containing `manifest.json`).
5. Pin the extension if you want quick access from the browser toolbar. The
   extension's logo appears in the extensions list and on the toolbar.

## Play

1. Select the extension icon.
2. Enter the starting and goal article titles, or select **Random** beside
   either field to fill it with an article randomly selected from English
   Wikipedia's 100 most-viewed pages from the previous UTC day.
3. Select **Start challenge**. The extension checks that both titles have
   articles on English Wikipedia, following redirects. If Wikipedia cannot be
   reached for the check, the challenge does not start; retry when you are
   online.
4. The current tab opens the starting article on English Wikipedia. Continue
   browsing Wikipedia and Google in that same tab.

The starting page is not counted. Each later page load on Wikipedia or Google,
including Back and Forward navigation, counts as one step. Submitting a query
in Wikipedia's search bar immediately disqualifies the challenge and displays a
warning on the page. Goal matching accepts common singular/plural forms (for
example, **Pancakes** and **Pancake**). Other websites and pages opened in a
different tab are not counted. The extension requests access to Wikipedia and
Wikimedia for article checks and popular-article rankings, Google, the active
tab, local extension storage, and navigation events. It does not collect or
transmit browsing data.
