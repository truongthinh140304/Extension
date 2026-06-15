import { MESSAGE_TYPES, type ScanResponse } from '@extension/shared';
import { getAutomationSettings } from './automationSettingsStorage';
import { parseBoardData, parseLeftPaneWorkspaceData } from './boardCatalogParser';
import { getBoardCatalog, mergeBoardDetails, mergeWorkspaceData } from './boardCatalogStorage';
import { enqueueConfirmationRequest } from './confirmationQueue';
import { scanMondayBoard } from './mondayScraper';
import type { MondayNetworkEventMessage } from './networkTypes';
import { parseStatusChangeEvent, type MondayStatusChangeEvent } from './statusChangeParser';

const BOARD_DATA_PATH_RE = /^\/boards\/([^/]+)\/board_data$/;

function isMondayNetworkEventMessage(data: unknown): data is MondayNetworkEventMessage {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const candidate = data as Partial<MondayNetworkEventMessage>;
  return candidate.source === 'MONDAY_BOARD_ASSISTANT' && candidate.type === 'MONDAY_NETWORK_EVENT' && Boolean(candidate.payload);
}

function getSafePathname(url: string): string | null {
  try {
    return new URL(url, window.location.href).pathname;
  } catch {
    return null;
  }
}

function isBoardDataPath(pathname: string): boolean {
  return BOARD_DATA_PATH_RE.test(pathname);
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

async function handleCatalogNetworkEvent(message: MondayNetworkEventMessage, pathname: string | null): Promise<void> {
  if (!pathname || !message.payload.responseBody) {
    return;
  }

  if (pathname.includes('/boards/leftpane_workspace_data')) {
    const workspaceData = parseLeftPaneWorkspaceData(message.payload.responseBody);
    if (!workspaceData) {
      return;
    }

    const catalog = await mergeWorkspaceData(workspaceData);
    if (!catalog) {
      return;
    }

    console.log('Monday catalog updated', {
      source: 'workspace',
      workspaceCount: catalog.workspaces.length,
      boardCount: catalog.boards.length,
    });
    return;
  }

  if (isBoardDataPath(pathname)) {
    const boardDetails = parseBoardData(message.payload.responseBody);
    if (!boardDetails) {
      return;
    }

    const catalog = await mergeBoardDetails(boardDetails);
    if (!catalog) {
      return;
    }

    console.log('Monday catalog updated', {
      source: 'board',
      boardId: boardDetails.id,
      boardName: boardDetails.name,
      workspaceCount: catalog.workspaces.length,
      boardCount: catalog.boards.length,
      groupCount: boardDetails.groups.length,
      statusColumnCount: boardDetails.statusColumns.length,
      statusLabelCount: boardDetails.statusColumns.reduce((count, column) => count + column.labels.length, 0),
    });
  }
}

async function handleStatusChangeNetworkEvent(message: MondayNetworkEventMessage, pathname: string | null): Promise<void> {
  const statusChange = parseStatusChangeEvent(pathname, message.payload.requestBody, message.payload.status);
  if (!statusChange) {
    return;
  }

  const [settings, catalog] = await Promise.all([getAutomationSettings(), getBoardCatalog()]);
  if (!settings.enabledBoardIds.includes(statusChange.boardId)) {
    return;
  }

  const boardDetails = catalog.boardDetailsById[statusChange.boardId];
  if (!boardDetails) {
    console.warn('Monday board details unavailable for status change.');
    return;
  }

  const statusColumn = boardDetails.statusColumns.find(column => column.id === statusChange.columnId);
  if (!statusColumn) {
    return;
  }

  const statusLabel = statusColumn.labels.find(label => label.index === statusChange.statusIndex);
  if (!statusLabel) {
    console.warn('Monday status label not found.');
    return;
  }

  const normalizedStatusName = normalizeName(statusLabel.name);
  const matchedGroups = boardDetails.groups.filter(group => normalizeName(group.title) === normalizedStatusName);

  console.log('Monday status change detected', {
    boardId: statusChange.boardId,
    itemCount: statusChange.itemIds.length,
    columnId: statusChange.columnId,
    statusIndex: statusChange.statusIndex,
    statusName: statusLabel.name,
    groupMatchCount: matchedGroups.length,
  });

  enqueueConfirmationRequest(toConfirmationRequest(statusChange, statusLabel.name, matchedGroups));
}

function toConfirmationRequest(
  statusChange: MondayStatusChangeEvent,
  statusName: string,
  matchedGroups: Array<{ id: string; title: string }>,
) {
  const baseRequest = {
    id: [statusChange.boardId, [...statusChange.itemIds].sort().join(','), statusChange.columnId, statusChange.statusIndex, statusChange.occurredAt].join('|'),
    boardId: statusChange.boardId,
    itemIds: statusChange.itemIds,
    columnId: statusChange.columnId,
    statusIndex: statusChange.statusIndex,
    statusName,
  };

  if (matchedGroups.length === 1) {
    return {
      ...baseRequest,
      targetGroupId: matchedGroups[0].id,
      targetGroupTitle: matchedGroups[0].title,
    };
  }

  return {
    ...baseRequest,
    message:
      matchedGroups.length === 0
        ? `Không tìm thấy group phù hợp với Status '${statusName}'.`
        : `Có nhiều group tên '${statusName}'. Hãy cấu hình group đích trong Side Panel.`,
  };
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin || !isMondayNetworkEventMessage(event.data)) {
    return;
  }

  const { method, url, status, requestBody, responseBody } = event.data.payload;
  const pathname = getSafePathname(url);

  console.log('Monday network event', {
    method,
    pathname,
    status,
    hasRequestBody: requestBody !== null,
    hasResponseBody: responseBody !== null,
  });

  void handleCatalogNetworkEvent(event.data, pathname).catch(() => {
    console.warn('Unable to update monday board catalog.');
  });

  void handleStatusChangeNetworkEvent(event.data, pathname).catch(() => {
    console.warn('Unable to handle monday status change.');
  });
});

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

console.log('Side Panel content script ready.');
