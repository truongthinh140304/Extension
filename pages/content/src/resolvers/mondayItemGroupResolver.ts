import type { MondayBoardCatalog, MondayGroupSummary } from '@extension/shared';

export type ResolvedItemGroup = {
  groupId?: string;
  groupTitle?: string;
};

function cssEscape(value: string): string {
  return CSS.escape(value);
}

function compactText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || null;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function findCandidateElement(itemId: string): Element | null {
  const escapedId = cssEscape(itemId);
  const selectors = [
    `[data-item-id="${escapedId}"]`,
    `[data-pulse-id="${escapedId}"]`,
    `[data-id="${escapedId}"]`,
    `a[href*="/pulses/${escapedId}"]`,
    `a[href*="/items/${escapedId}"]`,
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  const dataCandidates = document.querySelectorAll('[data-testid], [data-item-id], [data-pulse-id], [data-id], [aria-label]');
  for (const element of dataCandidates) {
    if (Array.from(element.attributes).some(attribute => attribute.value.includes(itemId))) {
      return element;
    }
  }

  return null;
}

function findRow(element: Element): Element {
  return element.closest('[role="row"], [data-testid*="row" i], [data-item-id], [data-pulse-id], [data-testid*="pulse" i], [data-testid*="item" i], tr') ?? element;
}

function groupFromId(groupId: string, groups: MondayGroupSummary[]): ResolvedItemGroup | null {
  const group = groups.find(candidate => candidate.id === groupId);
  return group ? { groupId: group.id, groupTitle: group.title } : null;
}

function getDirectGroupId(element: Element): string | null {
  return compactText(element.getAttribute('data-group-id')) ?? compactText(element.getAttribute('data-groupid'));
}

function findGroupIdInAttributes(element: Element, groups: MondayGroupSummary[]): string | null {
  const directGroupId = getDirectGroupId(element);
  if (directGroupId) {
    return directGroupId;
  }

  const attributeValues = Array.from(element.attributes).map(attribute => attribute.value);
  const matches = groups.filter(group => attributeValues.some(value => value === group.id || value.includes(group.id)));

  return matches.length === 1 ? matches[0].id : null;
}

function resolveTitleToGroup(title: string, groups: MondayGroupSummary[]): ResolvedItemGroup | null {
  const normalizedTitle = normalizeName(title);
  const matches = groups.filter(group => normalizeName(group.title) === normalizedTitle);

  return matches.length === 1 ? { groupId: matches[0].id, groupTitle: matches[0].title } : null;
}

function getGroupTitleCandidate(element: Element): string | null {
  const selectors = [
    '[data-testid*="group-title" i]',
    '[data-testid*="group_header" i]',
    '[data-testid*="group-header" i]',
    '[role="heading"]',
    'h2',
    'h3',
  ];

  for (const selector of selectors) {
    const titleElement = element.querySelector(selector);
    const text = compactText(titleElement?.textContent) ?? compactText(titleElement?.getAttribute('aria-label'));
    if (text) {
      return text;
    }
  }

  return compactText(element.getAttribute('aria-label')) ?? compactText(element.getAttribute('title'));
}

function resolveFromAncestors(row: Element, groups: MondayGroupSummary[]): ResolvedItemGroup | null {
  let current: Element | null = row;

  for (let depth = 0; current && depth < 14; depth += 1) {
    const groupId = findGroupIdInAttributes(current, groups);
    if (groupId) {
      return groupFromId(groupId, groups);
    }

    const title = getGroupTitleCandidate(current);
    if (title) {
      const resolved = resolveTitleToGroup(title, groups);
      if (resolved) {
        return resolved;
      }
    }

    current = current.parentElement;
  }

  return null;
}

function resolveFromNearbyHeaders(row: Element, groups: MondayGroupSummary[]): ResolvedItemGroup | null {
  let current: Element | null = row;

  for (let depth = 0; current && depth < 8; depth += 1) {
    let sibling = current.previousElementSibling;
    for (let siblingDepth = 0; sibling && siblingDepth < 12; siblingDepth += 1) {
      const groupId = findGroupIdInAttributes(sibling, groups);
      if (groupId) {
        return groupFromId(groupId, groups);
      }

      const title = getGroupTitleCandidate(sibling);
      if (title) {
        const resolved = resolveTitleToGroup(title, groups);
        if (resolved) {
          return resolved;
        }
      }

      sibling = sibling.previousElementSibling;
    }

    current = current.parentElement;
  }

  return null;
}

function isInsideItemRow(element: Element): boolean {
  return Boolean(element.closest('[role="row"], [data-item-id], [data-pulse-id], [data-testid*="row" i], [data-testid*="pulse" i], [data-testid*="item" i], tr'));
}

function isBefore(left: Element, right: Element): boolean {
  return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function collectGroupHeaders(groups: MondayGroupSummary[]): Array<{ element: Element; group: MondayGroupSummary }> {
  const selectors = [
    '[data-group-id]',
    '[data-groupid]',
    '[data-testid*="group" i]',
    '[aria-label*="group" i]',
    '[role="heading"]',
    'h2',
    'h3',
  ].join(',');
  const headers: Array<{ element: Element; group: MondayGroupSummary }> = [];

  for (const element of document.querySelectorAll(selectors)) {
    if (isInsideItemRow(element)) {
      continue;
    }

    const groupId = findGroupIdInAttributes(element, groups);
    const byId = groupId ? groups.find(group => group.id === groupId) : undefined;
    if (byId) {
      headers.push({ element, group: byId });
      continue;
    }

    const title = getGroupTitleCandidate(element);
    if (!title) {
      continue;
    }

    const normalizedTitle = normalizeName(title);
    const matches = groups.filter(group => normalizeName(group.title) === normalizedTitle);
    if (matches.length === 1) {
      headers.push({ element, group: matches[0] });
    }
  }

  return headers.sort((left, right) => (isBefore(left.element, right.element) ? -1 : 1));
}

function resolveFromGroupContainers(row: Element, groups: MondayGroupSummary[]): ResolvedItemGroup | null {
  const candidates = document.querySelectorAll('[data-group-id], [data-groupid], [data-testid], [id], [aria-label]');

  for (const group of groups) {
    for (const element of candidates) {
      if (!element.contains(row)) {
        continue;
      }

      const values = Array.from(element.attributes).map(attribute => attribute.value);
      if (values.some(value => value === group.id || value.includes(group.id))) {
        return {
          groupId: group.id,
          groupTitle: group.title,
        };
      }
    }
  }

  return null;
}

function resolveFromHeaderRanges(row: Element, groups: MondayGroupSummary[]): ResolvedItemGroup | null {
  const headers = collectGroupHeaders(groups);

  for (const [index, header] of headers.entries()) {
    const nextHeader = headers[index + 1]?.element;
    const rowAfterHeader = isBefore(header.element, row);
    const rowBeforeNextHeader = nextHeader ? isBefore(row, nextHeader) : true;

    if (rowAfterHeader && rowBeforeNextHeader) {
      return {
        groupId: header.group.id,
        groupTitle: header.group.title,
      };
    }
  }

  return null;
}

export function resolveMondayItemCurrentGroup(itemId: string, boardId: string, catalog: MondayBoardCatalog): ResolvedItemGroup | null {
  try {
    const groups = catalog.boardDetailsById[boardId]?.groups ?? [];
    if (groups.length === 0) {
      return null;
    }

    const candidate = findCandidateElement(itemId);
    if (!candidate) {
      return null;
    }

    const row = findRow(candidate);
    return resolveFromAncestors(row, groups) ?? resolveFromGroupContainers(row, groups) ?? resolveFromHeaderRanges(row, groups) ?? resolveFromNearbyHeaders(row, groups);
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

export async function resolveMondayItemCurrentGroupWithRetry(itemId: string, boardId: string, catalog: MondayBoardCatalog): Promise<ResolvedItemGroup | null> {
  const delays = [0, 100, 300, 700];

  for (const waitMs of delays) {
    if (waitMs > 0) {
      await delay(waitMs);
    }

    const result = resolveMondayItemCurrentGroup(itemId, boardId, catalog);
    if (result?.groupId) {
      return result;
    }
  }

  return null;
}
