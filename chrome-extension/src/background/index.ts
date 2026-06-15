chrome.runtime.onInstalled.addListener(() => {
  console.log('Side Panel installed and ready.');
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => {
    console.log('Side Panel opens on action click.');
  })
  .catch(error => {
    console.error('Failed to configure side panel behavior.', error);
  });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'PING_MONDAY_BOARD_ASSISTANT') {
    return false;
  }

  sendResponse({
    ok: true,
    tabId: sender.tab?.id,
  });
  return true;
});

console.log('Side Panel background service worker ready.');
