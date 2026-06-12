import { MESSAGE_TYPES, type ScanResponse } from '@extension/shared';
import { scanMondayBoard } from './mondayScraper';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse: (response: ScanResponse) => void) => {
  if (message?.type !== MESSAGE_TYPES.MONDAY_SCAN_BOARD) {
    return false;
  }

  try {
    sendResponse({
      ok: true,
      data: scanMondayBoard(),
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to scan monday.com board.',
    });
  }

  return true;
});

console.log('Monday Board Assistant content script ready.');
