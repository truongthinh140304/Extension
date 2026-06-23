function cssEscape(value: string): string {
  return CSS.escape(value);
}

function compactText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || null;
}

function findCandidateElement(itemId: string): Element | null {
  const escapedId = cssEscape(itemId);
  const directSelectors = [
    `[data-item-id="${escapedId}"]`,
    `[data-pulse-id="${escapedId}"]`,
    `[data-id="${escapedId}"]`,
    `a[href*="/pulses/${escapedId}"]`,
    `a[href*="/items/${escapedId}"]`,
  ];

  for (const selector of directSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  const dataCandidates = document.querySelectorAll('[data-testid], [data-item-id], [data-pulse-id], [data-id], [aria-label]');
  for (const element of dataCandidates) {
    const attributes = Array.from(element.attributes);
    if (attributes.some(attribute => attribute.value.includes(itemId))) {
      return element;
    }
  }

  return null;
}

function findRow(element: Element): Element {
  return element.closest('[role="row"], [data-testid*="row" i], [data-testid*="pulse" i], [data-testid*="item" i], tr') ?? element;
}

function getNameFromRow(row: Element): string | null {
  const selectors = [
    '[data-testid*="name" i]',
    '[data-testid*="title" i]',
    'a[href*="/pulses/"]',
    'a[href*="/items/"]',
    '[role="gridcell"]',
    '[role="cell"]',
  ];

  for (const selector of selectors) {
    const element = row.querySelector(selector);
    const text = compactText(element?.textContent);
    if (text) {
      return text;
    }

    const ariaLabel = compactText(element?.getAttribute('aria-label'));
    if (ariaLabel) {
      return ariaLabel;
    }
  }

  return compactText(row.getAttribute('aria-label')) ?? compactText(row.textContent)?.slice(0, 80) ?? null;
}

export function resolveMondayItemName(itemId: string): string {
  try {
    const candidate = findCandidateElement(itemId);
    if (!candidate) {
      return `Task #${itemId}`;
    }

    return getNameFromRow(findRow(candidate)) ?? `Task #${itemId}`;
  } catch {
    return `Task #${itemId}`;
  }
}
