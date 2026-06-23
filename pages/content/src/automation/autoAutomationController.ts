import type { MondayBoardCatalog, MondayBoardDetails } from '@extension/shared';
import {
  dismissAutomationNotification,
  showFailedNotification,
  showMappingNotification,
} from './automationNotification';
import { requestMoveItems } from './moveItemsBridge';
import type { MondayStatusChangeEvent } from '../parsers/statusChangeParser';
import { resolveMondayItemCurrentGroupWithRetry } from '../resolvers/mondayItemGroupResolver';
import { resolveMondayItemName } from '../resolvers/mondayItemNameResolver';
import { getBoardCatalog } from '../storage/boardCatalogStorage';
import {
  countBoardAutomation,
  getPendingBoardAutomation,
  updatePendingBoardAutomation,
} from '../storage/pendingAutomationStorage';
import {
  getStatusGroupMapping,
  removeStatusGroupMapping,
  saveStatusGroupMapping,
} from '../storage/statusGroupMappingStorage';
import type { PendingAutomationItem, PendingBoardAutomation } from '../types/pendingAutomationTypes';

type GroupTarget = {
  groupId: string;
  groupTitle: string;
};

type MappingReason = 'missing_mapping' | 'duplicate_groups' | 'stale_mapping';

type TargetResolution =
  | {
    kind: 'target';
    target: GroupTarget;
  }
  | {
    kind: 'needs_mapping';
    reason: MappingReason;
  };

type AddStatusChangeInput = {
  statusChange: MondayStatusChangeEvent;
  catalog: MondayBoardCatalog;
  boardDetails: MondayBoardDetails;
  statusName: string;
};

type ScheduledMove = {
  input: AddStatusChangeInput;
  itemId: string;
  target: GroupTarget;
};

const AUTO_MOVE_DEBOUNCE_MS = 50;
const pendingMoveTimers = new Map<string, number>();
const latestMoves = new Map<string, ScheduledMove>();
const inFlightMoves = new Set<string>();

let currentBoardId: string | null = null;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function getCurrentBoardId(): string | null {
  const match = /\/boards\/(\d+)/.exec(window.location.pathname);
  return match?.[1] ?? null;
}

function itemKey(boardId: string, itemId: string): string {
  return `${boardId}:${itemId}`;
}

function moveKey(boardId: string, itemId: string, targetGroupId: string): string {
  return `${boardId}:${itemId}:${targetGroupId}`;
}

function mappingKey(boardId: string, columnId: string, statusIndex: string): string {
  return `${boardId}:${columnId}:${statusIndex}`;
}

function createPendingItem(input: AddStatusChangeInput, itemId: string, target?: GroupTarget): PendingAutomationItem {
  return {
    boardId: input.statusChange.boardId,
    itemId,
    itemName: resolveMondayItemName(itemId),
    columnId: input.statusChange.columnId,
    statusIndex: input.statusChange.statusIndex,
    statusName: input.statusName,
    targetGroupId: target?.groupId,
    targetGroupTitle: target?.groupTitle,
    state: target ? 'failed' : 'needs_mapping',
    updatedAt: new Date().toISOString(),
  };
}

function logPendingUpdate(board: PendingBoardAutomation): void {
  console.log('Monday pending automation updated', {
    boardId: board.boardId,
    ...countBoardAutomation(board),
  });
}

function logAlreadyInTargetGroup(boardId: string, itemId: string, groupId: string): void {
  console.info('Monday automation skipped item already in target group', {
    boardId,
    itemId,
    groupId,
  });
}

async function removePendingItems(boardId: string, itemIds: Set<string>): Promise<PendingBoardAutomation> {
  const updatedBoard = await updatePendingBoardAutomation(boardId, board => ({
    ...board,
    pendingItems: Object.fromEntries(Object.entries(board.pendingItems).filter(([itemId]) => !itemIds.has(itemId))),
  }));
  logPendingUpdate(updatedBoard);
  return updatedBoard;
}

async function resolveTargetGroup(input: AddStatusChangeInput): Promise<TargetResolution> {
  const { statusChange, boardDetails, statusName } = input;
  const savedMapping = await getStatusGroupMapping(statusChange.boardId, statusChange.columnId, statusChange.statusIndex);

  if (savedMapping) {
    const mappedGroup = boardDetails.groups.find(group => group.id === savedMapping.groupId);
    if (mappedGroup) {
      return {
        kind: 'target',
        target: {
          groupId: mappedGroup.id,
          groupTitle: mappedGroup.title,
        },
      };
    }

    await removeStatusGroupMapping(statusChange.boardId, statusChange.columnId, statusChange.statusIndex);
    return {
      kind: 'needs_mapping',
      reason: 'stale_mapping',
    };
  }

  const normalizedStatusName = normalizeName(statusName);
  const matchedGroups = boardDetails.groups.filter(group => normalizeName(group.title) === normalizedStatusName);

  if (matchedGroups.length === 1) {
    const [group] = matchedGroups;
    void saveStatusGroupMapping({
      boardId: statusChange.boardId,
      columnId: statusChange.columnId,
      statusIndex: statusChange.statusIndex,
      statusName,
      groupId: group.id,
      groupTitle: group.title,
    });

    return {
      kind: 'target',
      target: {
        groupId: group.id,
        groupTitle: group.title,
      },
    };
  }

  return {
    kind: 'needs_mapping',
    reason: matchedGroups.length > 1 ? 'duplicate_groups' : 'missing_mapping',
  };
}

async function isItemAlreadyInTargetGroup(boardId: string, itemId: string, targetGroupId: string, catalog: MondayBoardCatalog): Promise<boolean> {
  const currentGroup = await resolveMondayItemCurrentGroupWithRetry(itemId, boardId, catalog);
  if (currentGroup?.groupId === targetGroupId) {
    return true;
  }

  if (!currentGroup?.groupId) {
    console.info('Monday automation moving item without resolved current group', {
      boardId,
      itemId,
      targetGroupId,
    });
  }

  return false;
}

function mappingTitle(statusName: string, reason: MappingReason): string {
  if (reason === 'duplicate_groups') {
    return `Có nhiều group trùng với Status "${statusName}"`;
  }

  if (reason === 'stale_mapping') {
    return `Cần cấu hình lại group cho Status "${statusName}"`;
  }

  return `Không tìm thấy group cho Status "${statusName}"`;
}

async function showNeedsMapping(boardId: string, boardDetails: MondayBoardDetails, reason: MappingReason): Promise<void> {
  const board = await getPendingBoardAutomation(boardId);
  const groupsByMapping = new Map<string, PendingAutomationItem[]>();

  for (const item of Object.values(board.pendingItems)) {
    if (item.state !== 'needs_mapping') {
      continue;
    }

    const key = mappingKey(item.boardId, item.columnId, item.statusIndex);
    groupsByMapping.set(key, [...(groupsByMapping.get(key) ?? []), item]);
  }

  for (const [key, items] of groupsByMapping) {
    const first = items[0];
    showMappingNotification({
      key: `mapping:${key}`,
      title: mappingTitle(first.statusName, reason),
      statusName: first.statusName,
      boardDetails,
      items,
      onApply: groupId => void mapStatusGroup(boardId, first.columnId, first.statusIndex, groupId),
      onDismiss: () => void removePendingItems(boardId, new Set(items.map(item => item.itemId))),
    });
  }
}

async function storeNeedsMappingItems(input: AddStatusChangeInput, reason: MappingReason): Promise<void> {
  const items = input.statusChange.itemIds.map(itemId => createPendingItem(input, itemId));
  const updatedBoard = await updatePendingBoardAutomation(input.statusChange.boardId, board => {
    const pendingItems = { ...board.pendingItems };
    for (const item of items) {
      pendingItems[item.itemId] = item;
    }

    return {
      ...board,
      pendingItems,
    };
  });

  logPendingUpdate(updatedBoard);
  await showNeedsMapping(input.statusChange.boardId, input.boardDetails, reason);
}

async function saveFailedItem(item: PendingAutomationItem, reason: string): Promise<void> {
  const updatedBoard = await updatePendingBoardAutomation(item.boardId, board => ({
    ...board,
    pendingItems: {
      ...board.pendingItems,
      [item.itemId]: {
        ...item,
        state: 'failed',
        failureReason: reason,
        updatedAt: new Date().toISOString(),
      },
    },
  }));

  logPendingUpdate(updatedBoard);
}

async function processMoveNow(input: AddStatusChangeInput, itemId: string, target: GroupTarget): Promise<void> {
  const key = moveKey(input.statusChange.boardId, itemId, target.groupId);
  if (inFlightMoves.has(key)) {
    return;
  }

  inFlightMoves.add(key);

  try {
    if (await isItemAlreadyInTargetGroup(input.statusChange.boardId, itemId, target.groupId, input.catalog)) {
      await removePendingItems(input.statusChange.boardId, new Set([itemId]));
      logAlreadyInTargetGroup(input.statusChange.boardId, itemId, target.groupId);
      return;
    }

    const result = await requestMoveItems({
      boardId: input.statusChange.boardId,
      itemIds: [itemId],
      targetGroupId: target.groupId,
    });

    if (result.succeededItemIds.includes(itemId)) {
      await removePendingItems(input.statusChange.boardId, new Set([itemId]));
      return;
    }

    const failureReason = result.failedItems[0]?.reason ?? 'NETWORK_ERROR';
    const failedItem = createPendingItem(input, itemId, target);
    await saveFailedItem(failedItem, failureReason);
    showFailedItems(input.statusChange.boardId);
  } catch {
    const failedItem = createPendingItem(input, itemId, target);
    await saveFailedItem(failedItem, 'TIMEOUT');
    showFailedItems(input.statusChange.boardId);
  } finally {
    inFlightMoves.delete(key);
  }
}

function scheduleAutoMove(input: AddStatusChangeInput, itemId: string, target: GroupTarget): void {
  const key = itemKey(input.statusChange.boardId, itemId);
  const existingTimer = pendingMoveTimers.get(key);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  latestMoves.set(key, { input, itemId, target });
  const timer = window.setTimeout(() => {
    pendingMoveTimers.delete(key);
    const latest = latestMoves.get(key);
    latestMoves.delete(key);
    if (latest) {
      void processMoveNow(latest.input, latest.itemId, latest.target);
    }
  }, AUTO_MOVE_DEBOUNCE_MS);

  pendingMoveTimers.set(key, timer);
}

function cancelScheduledMove(boardId: string, itemId: string): void {
  const key = itemKey(boardId, itemId);
  const existingTimer = pendingMoveTimers.get(key);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  pendingMoveTimers.delete(key);
  latestMoves.delete(key);
}

export async function handleStatusChangeAutoMove(input: AddStatusChangeInput): Promise<void> {
  const resolution = await resolveTargetGroup(input);

  if (resolution.kind === 'needs_mapping') {
    for (const itemId of input.statusChange.itemIds) {
      cancelScheduledMove(input.statusChange.boardId, itemId);
    }
    await storeNeedsMappingItems(input, resolution.reason);
    return;
  }

  for (const itemId of input.statusChange.itemIds) {
    scheduleAutoMove(input, itemId, resolution.target);
  }
}

async function mapStatusGroup(boardId: string, columnId: string, statusIndex: string, groupId: string): Promise<void> {
  const catalog = await getBoardCatalog();
  const boardDetails = catalog.boardDetailsById[boardId];
  const group = boardDetails?.groups.find(candidate => candidate.id === groupId);
  if (!boardDetails || !group) {
    return;
  }

  const board = await getPendingBoardAutomation(boardId);
  const matchingItems = Object.values(board.pendingItems).filter(
    item => item.columnId === columnId && item.statusIndex === statusIndex && item.state === 'needs_mapping',
  );
  const statusName = matchingItems[0]?.statusName ?? statusIndex;

  await saveStatusGroupMapping({
    boardId,
    columnId,
    statusIndex,
    statusName,
    groupId: group.id,
    groupTitle: group.title,
  });

  dismissAutomationNotification(`mapping:${mappingKey(boardId, columnId, statusIndex)}`);
  await removePendingItems(boardId, new Set(matchingItems.map(item => item.itemId)));

  for (const item of matchingItems) {
    scheduleAutoMove(
      {
        statusChange: {
          boardId,
          itemIds: [item.itemId],
          columnId,
          statusIndex,
          occurredAt: new Date().toISOString(),
        },
        catalog,
        boardDetails,
        statusName,
      },
      item.itemId,
      {
        groupId: group.id,
        groupTitle: group.title,
      },
    );
  }
}

async function cancelFailed(boardId: string): Promise<void> {
  const board = await getPendingBoardAutomation(boardId);
  const failedItemIds = new Set(Object.values(board.pendingItems).filter(item => item.state === 'failed').map(item => item.itemId));
  await removePendingItems(boardId, failedItemIds);
  dismissAutomationNotification(`failed:${boardId}`);
}

async function retryFailed(boardId: string): Promise<void> {
  const [catalog, board] = await Promise.all([getBoardCatalog(), getPendingBoardAutomation(boardId)]);
  const boardDetails = catalog.boardDetailsById[boardId];
  if (!boardDetails) {
    return;
  }

  const failedItems = Object.values(board.pendingItems).filter(item => item.state === 'failed' && item.targetGroupId);
  await removePendingItems(boardId, new Set(failedItems.map(item => item.itemId)));
  dismissAutomationNotification(`failed:${boardId}`);

  for (const item of failedItems) {
    scheduleAutoMove(
      {
        statusChange: {
          boardId,
          itemIds: [item.itemId],
          columnId: item.columnId,
          statusIndex: item.statusIndex,
          occurredAt: new Date().toISOString(),
        },
        catalog,
        boardDetails,
        statusName: item.statusName,
      },
      item.itemId,
      {
        groupId: item.targetGroupId ?? '',
        groupTitle: item.targetGroupTitle ?? item.targetGroupId ?? '',
      },
    );
  }
}

async function showFailedItems(boardId: string): Promise<void> {
  const board = await getPendingBoardAutomation(boardId);
  const failedItems = Object.values(board.pendingItems).filter(item => item.state === 'failed');
  if (failedItems.length === 0) {
    dismissAutomationNotification(`failed:${boardId}`);
    return;
  }

  const first = failedItems[0];
  showFailedNotification({
    key: `failed:${boardId}`,
    title: failedItems.length === 1 ? `Không thể chuyển task "${first.itemName}"` : `Không thể chuyển ${failedItems.length} task`,
    message: failedItems.length === 1 ? first.failureReason : undefined,
    onRetry: () => void retryFailed(boardId),
    onDismiss: () => void cancelFailed(boardId),
  });
}

async function migrateLegacyPendingStorage(boardId: string): Promise<void> {
  // Temporary cleanup for users who had old batch pending storage.
  await updatePendingBoardAutomation(boardId, board => board);
}

export function initializeAutoAutomationController(): void {
  const boardId = getCurrentBoardId();
  currentBoardId = boardId;

  if (boardId) {
    void migrateLegacyPendingStorage(boardId);
    void showFailedItems(boardId);
  }

  window.setInterval(() => {
    const nextBoardId = getCurrentBoardId();
    if (nextBoardId === currentBoardId) {
      return;
    }

    currentBoardId = nextBoardId;
    if (nextBoardId) {
      void migrateLegacyPendingStorage(nextBoardId);
      void showFailedItems(nextBoardId);
    }
  }, 1_000);
}
