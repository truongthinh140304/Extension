# Monday Board Assistant

Monday Board Assistant is a Chrome/Edge MV3 extension that watches monday.com Status changes and automatically moves items to matching groups using the current logged-in browser session.

It does not store cookies, auth headers, or CSRF tokens in extension storage. The CSRF token is kept only in page memory when needed for move requests.

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

1. Run `pnpm install`.
2. Run `pnpm build`.
3. Load `dist` in Chrome or Edge.
4. Open a monday.com board.
5. Reload the board once so the content scripts are present.
6. Open the extension side panel.
7. Enable automation for the board.
8. Change an item's Status.
9. The item moves automatically to the matching group.

## Side Panel

The side panel shows boards discovered from monday.com network data and lets you enable or disable automation per board.

Board catalog data and automation settings are stored in `chrome.storage.local`. Pending mapping and failed move state are kept only for the automation workflow.

## Limits

monday.com is a complex web app and can change network payloads or DOM structure at any time. The extension depends on board, group, and Status data loaded by the current monday.com page, so the catalog may require a board reload or hard reload after board structure changes.

Use the official monday GraphQL API when you need reliable full-board data, hidden rows, all columns, pagination, or production-grade reporting.
