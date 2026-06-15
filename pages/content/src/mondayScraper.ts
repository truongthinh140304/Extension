import { KNOWN_STATUSES, type MondayBoardScanResult, type MondayColumnValue, type MondayItem } from '@extension/shared';
import { compactRawText, extractIdFromElement, firstText, getVisibleText, normalizeText, queryVisible, uniqueTexts } from './domUtils';

const BOARD_NAME_SELECTORS = [
  '[data-testid*="board-name" i]',
  '[aria-label*="board" i] h1',
  'h1[title]',
  'h1',
  '[role="heading"][aria-level="1"]',
  '[data-testid*="board-header" i]',
];

const ROW_SELECTORS = [
  '[role="row"][data-testid]',
  '[role="row"]',
  '[data-testid*="pulse" i]',
  '[data-testid*="item" i]',
  '[data-testid*="row" i]',
  'tr',
];

const FALLBACK_CARD_SELECTORS = [
  '[role="listitem"]',
  '[data-testid*="card" i]',
  '[data-testid*="item" i]',
  'article',
];

const GROUP_SELECTORS = [
  '[data-testid*="group-title" i]',
  '[aria-label*="group" i]',
  '[role="heading"][aria-level="2"]',
  'h2',
  'h3',
];

const PLACEHOLDER_TEXT_RE = /^\+?\s*add item$/i;
const TABLE_HEADER_RE = /\bitem\b.*\b(status|owner|person|priority|date)\b/i;
const CONTROL_TEXT_RE = /\b(search|filter|sort|hide|group by|new item|invite|automate|integrate)\b/i;

function detectStatus(text: string): string | undefined {
  const lowered = normalizeText(text).toLocaleLowerCase();
  return KNOWN_STATUSES.find(status => lowered.includes(status.toLocaleLowerCase()));
}

function isMondayItem(item: MondayItem | undefined): item is MondayItem {
  return Boolean(item);
}

function extractColumns(row: Element): MondayColumnValue[] {
  const candidates = queryVisible(
    [
      '[role="gridcell"]',
      '[role="cell"]',
      '[data-testid*="cell" i]',
      '[data-testid*="column" i]',
      '[aria-label*="Status" i]',
      '[aria-label*="Person" i]',
      '[aria-label*="Date" i]',
    ].join(','),
    row,
  );

  const texts = uniqueTexts(
    candidates.map(candidate => {
      const label = candidate.getAttribute('aria-label') ?? candidate.getAttribute('data-testid') ?? '';
      const text = getVisibleText(candidate);
      return normalizeText([label, text].filter(Boolean).join(': '));
    }),
  );

  return texts.map((text, index) => {
    const [label, ...rest] = text.split(': ');
    const value = rest.length > 0 ? rest.join(': ') : text;

    return {
      id: `column-${index + 1}`,
      title: rest.length > 0 ? label : `Column ${index + 1}`,
      text: value,
      type: detectStatus(text) ? 'status' : undefined,
    };
  });
}

function findNearbyGroupName(row: Element): string | undefined {
  let current: Element | null = row;

  for (let index = 0; index < 8 && current; index += 1) {
    const previous: Element | null = current.previousElementSibling;
    if (!previous) {
      current = current.parentElement;
      continue;
    }

    const groupName = firstText(GROUP_SELECTORS, previous);
    if (groupName) {
      return groupName;
    }

    current = previous;
  }

  return undefined;
}

function extractItemName(row: Element, rawText: string): string {
  const bySelectors = firstText(
    [
      '[data-testid*="name" i]',
      '[data-testid*="title" i]',
      '[aria-label*="name" i]',
      '[aria-label*="item" i]',
      'a[href*="/pulses/"]',
      'a[href*="/items/"]',
      '[role="gridcell"]',
      '[role="cell"]',
    ],
    row,
  );

  if (bySelectors) {
    return bySelectors;
  }

  return rawText.split(/\s{2,}| - | \| /)[0]?.trim() || rawText.slice(0, 80) || 'Untitled item';
}

function hasItemSignal(row: Element, rawText: string): boolean {
  return Boolean(
    extractIdFromElement(row) ||
      detectStatus(rawText) ||
      row.querySelector('input[type="checkbox"], [role="checkbox"]') ||
      row.querySelector('a[href*="/pulses/"], a[href*="/items/"]') ||
      row.querySelector('[role="gridcell"], [role="cell"], [data-testid*="cell" i]'),
  );
}

function isPlaceholderOrHeader(row: Element, rawText: string): boolean {
  if (row.matches('[role="heading"], h1, h2, h3')) {
    return true;
  }

  if (PLACEHOLDER_TEXT_RE.test(rawText)) {
    return true;
  }

  if (CONTROL_TEXT_RE.test(rawText) && !detectStatus(rawText) && !extractIdFromElement(row)) {
    return true;
  }

  return TABLE_HEADER_RE.test(rawText) && !extractIdFromElement(row);
}

function elementToItem(row: Element): MondayItem | undefined {
  const rawText = getVisibleText(row);

  if (!rawText || rawText.length < 2) {
    return undefined;
  }

  if (!hasItemSignal(row, rawText) || isPlaceholderOrHeader(row, rawText)) {
    return undefined;
  }

  const columns = extractColumns(row);
  const status = detectStatus(rawText) ?? columns.find(column => column.type === 'status')?.text;
  const name = extractItemName(row, rawText);

  return {
    id: extractIdFromElement(row),
    name,
    groupName: findNearbyGroupName(row),
    status,
    columns,
    rawText: compactRawText(rawText),
  };
}

function dedupeItems(items: MondayItem[]): MondayItem[] {
  const seen = new Set<string>();
  const result: MondayItem[] = [];

  for (const item of items) {
    const key = [item.id, item.name, item.rawText].filter(Boolean).join('|').toLocaleLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function getBoardName(): string | undefined {
  const title = firstText(BOARD_NAME_SELECTORS);
  if (title) {
    return title;
  }

  const documentTitle = normalizeText(document.title.replace(/\|.*$/, ''));
  return documentTitle || undefined;
}

export function scanMondayBoard(): MondayBoardScanResult {
  const rowItems = ROW_SELECTORS.flatMap(selector => queryVisible(selector).map(elementToItem).filter(isMondayItem));
  const items = dedupeItems(rowItems);

  const fallbackItems =
    items.length > 0
      ? items
      : dedupeItems(FALLBACK_CARD_SELECTORS.flatMap(selector => queryVisible(selector).map(elementToItem).filter(isMondayItem)));

  return {
    boardName: getBoardName(),
    boardUrl: window.location.href,
    scannedAt: new Date().toISOString(),
    items: fallbackItems,
  };
}
