# Monday Board Assistant

Chrome Extension MV3 for scanning the current monday.com board into a side panel and showing board statistics.

## Install

```bash
pnpm install
```

## Build

```bash
pnpm build
```

The extension output is generated in `dist`.

## Load In Chrome Or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist` folder.

## Test On monday.com

1. Open a monday.com board.
2. Reload the board once after installing the extension so the content script is present.
3. Click the extension icon. Chrome opens the side panel.
4. Click Scan current board.

## Side Panel

The side panel shows connection status, scan actions, and board statistics.

The scan result is stored in `chrome.storage.local` so the most recent statistics can be restored when the side panel opens again. Board data is processed locally in your browser and is not sent to an external service.

## DOM Scraping Limits

monday.com is a complex web app and can change DOM structure at any time. The scraper avoids hashed class names and prefers roles, aria labels, data attributes, links, and visible text, but it may still miss hidden rows, virtualized rows, custom columns, or layouts that are not rendered on screen.

## When To Use monday API

Use the official monday GraphQL API when you need reliable full-board data, hidden rows, all columns, automations, pagination, or production-grade reporting. This extension does not read tokens/cookies/session data from monday.com.
