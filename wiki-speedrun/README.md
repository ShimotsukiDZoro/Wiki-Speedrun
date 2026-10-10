# Wikipedia Speedrun

A small Chrome and Microsoft Edge extension for racing between articles on the
real Wikipedia website. It works in your normal browser; it does not create or
host a separate wiki, and it needs no Python, Node.js, or build step.

## Install from a GitHub download

1. On GitHub, select **Code → Download ZIP**, then extract the ZIP.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted `wiki-speedrun` folder
   (the folder containing `manifest.json`).
5. Pin the extension if you want quick access from the browser toolbar.

## Play

1. Select the extension icon.
2. Enter the starting and goal article titles, then select **Start challenge**.
3. The current tab opens the starting article on English Wikipedia. Continue
   browsing Wikipedia and Google in that same tab.

The starting page is not counted. Each later page load on Wikipedia or Google,
including Back and Forward navigation, counts as one step. Other websites and
pages opened in a different tab are not counted. The extension only requests
access to Wikipedia, Google, the active tab, local extension storage, and
navigation events; it does not collect or transmit browsing data.
