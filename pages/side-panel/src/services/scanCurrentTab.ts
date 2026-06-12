import { MESSAGE_TYPES, type ScanResponse } from '@extension/shared';

export type CurrentTabScan = {
  tab?: chrome.tabs.Tab;
  response: ScanResponse;
};

const MONDAY_HOST_RE = /(^|\.)monday\.com$/i;

export function isMondayUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    return MONDAY_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function sendScanMessage(tabId: number): Promise<ScanResponse> {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.MONDAY_SCAN_BOARD }, response => {
      const lastError = chrome.runtime.lastError;

      if (lastError) {
        resolve({
          ok: false,
          error: 'Please open a monday.com board and reload the page once.',
        });
        return;
      }

      resolve(response as ScanResponse);
    });
  });
}

export async function scanCurrentTab(): Promise<CurrentTabScan> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !isMondayUrl(tab.url)) {
    return {
      tab,
      response: {
        ok: false,
        error: 'The active tab is not a monday.com board.',
      },
    };
  }

  return {
    tab,
    response: await sendScanMessage(tab.id),
  };
}
