// Wikara background service worker.
//
// This runs behind the scenes, separate from any web page. In later phases
// it will make all the Wikipedia, ORES, Wayback, and Claude API calls,
// because content scripts are blocked from calling those directly (CORS).
// For now it just logs when the extension is installed.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Wikara] Extension installed.');
});
