import type { MondayBoardCatalog, MondayBoardDetails } from '@extension/shared';
import { getBoardCatalog } from './boardCatalogStorage';
import { requestMoveItems } from './moveItemsBridge';
import { resolveMondayItemCurrentGroupWithRetry } from './mondayItemGroupResolver';
import { resolveMondayItemName } from './mondayItemNameResolver';
import {
  countBoardAutomation,
  getPendingBoardAutomation,
  updatePendingBoardAutomation,
} from './pendingAutomationStorage';
import type { PendingAutomationItem, PendingBoardAutomation } from './pendingAutomationTypes';
import { saveStatusGroupMapping, getStatusGroupMapping } from './statusGroupMappingStorage';
import { showBatchAutomationOverlay, shouldShowBatchAutomationOverlay, type BatchOverlayResult, type BatchOverlayProgress } from './batchAutomationOverlay';
import type { MondayStatusChangeEvent } from './statusChangeParser';

type GroupTarget = {
  groupId: string;
  groupTitle: string;
};

type AddStatusChangeInput = {
  statusChange: MondayStatusChangeEvent;
  catalog: MondayBoardCatalog;
  boardDetails: MondayBoardDetails;
  statusName: string;
};

const boardResults = new Map<string, BatchOverlayResult>();
const boardProgress = new Map<string, BatchOverlayProgress>();

let currentBoardId: string | null = null;
let overlay: ReturnType<typeof showBatchAutomationOverlay> | null = null;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function getCurrentBoardId(): string | null {
  const match = /\/boards\/(\d+)/.exec(window.location.pathname);
  return match?.[1] ?? null;
}

function getBoardName(boardId: string, details?: MondayBoardDetails): string | undefined {
  return details?.name;
}

async function findTargetGroup(input: AddStatusChangeInput): Promise<GroupTarget | null> {
  const { statusChange, boardDetails, statusName } = input;
  const savedMapping = await getStatusGroupMapping(statusChange.boardId, statusChange.columnId, statusChange.statusIndex);

  if (savedMapping) {
    const mappedGroup = boardDetails.groups.find(group => group.id === savedMapping.groupId);
    if (mappedGroup) {
      return {
        groupId: mappedGroup.id,
        groupTitle: mappedGroup.title,
      };
    }

    return null;
  }

  const normalizedStatusName = normalizeName(statusName);
  const matchedGroups = boardDetails.groups.filter(group => normalizeName(group.title) === normalizedStatusName);

  if (matchedGroups.length !== 1) {
    return null;
  }

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
    groupId: group.id,
    groupTitle: group.title,
  };
}

function createPendingItem(input: AddStatusChangeInput, itemId: string, target: GroupTarget | null): PendingAutomationItem {
  return {
    boardId: input.statusChange.boardId,
    itemId,
    itemName: resolveMondayItemName(itemId),
    columnId: input.statusChange.columnId,
    statusIndex: input.statusChange.statusIndex,
    statusName: input.statusName,
    targetGroupId: target?.groupId,
    targetGroupTitle: target?.groupTitle,
    state: target ? 'ready' : 'needs_mapping',
    updatedAt: new Date().toISOString(),
  };
}

function logPendingUpdate(board: PendingBoardAutomation): void {
  console.log('Monday pending batch updated', {
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

async function isItemAlreadyInTargetGroup(item: {
  boardId: string;
  itemId: string;
  targetGroupId?: string;
}, catalog: MondayBoardCatalog): Promise<boolean> {
  if (!item.targetGroupId) {
    return false;
  }

  const currentGroup = await resolveMondayItemCurrentGroupWithRetry(item.itemId, item.boardId, catalog);
  return currentGroup?.groupId === item.targetGroupId;
}

async function revalidateBoardAutomation(boardId: string, catalog: MondayBoardCatalog): Promise<PendingBoardAutomation> {
  const board = await getPendingBoardAutomation(boardId);
  if (board.isProcessing) {
    return board;
  }

  const staleItemIds = new Set<string>();
  const candidates = [...Object.values(board.pendingItems), ...Object.values(board.nextBatchItems)];

  for (const item of candidates) {
    if (await isItemAlreadyInTargetGroup(item, catalog)) {
      staleItemIds.add(item.itemId);
      logAlreadyInTargetGroup(item.boardId, item.itemId, item.targetGroupId ?? '');
    }
  }

  if (staleItemIds.size === 0) {
    return board;
  }

  return updatePendingBoardAutomation(boardId, current => ({
    ...current,
    pendingItems: Object.fromEntries(Object.entries(current.pendingItems).filter(([itemId]) => !staleItemIds.has(itemId))),
    nextBatchItems: Object.fromEntries(Object.entries(current.nextBatchItems).filter(([itemId]) => !staleItemIds.has(itemId))),
  }));
}

async function renderCurrentBoardOverlay(): Promise<void> {
  const boardId = getCurrentBoardId();
  currentBoardId = boardId;

  if (!boardId) {
    overlay?.remove();
    overlay = null;
    return;
  }

  const [catalog, boardAutomation] = await Promise.all([getBoardCatalog(), getPendingBoardAutomation(boardId)]);
  const boardDetails = catalog.boardDetailsById[boardId];
  const currentBoardAutomation = boardAutomation.isProcessing ? boardAutomation : await revalidateBoardAutomation(boardId, catalog);
  const model = {
    boardId,
    boardName: getBoardName(boardId, boardDetails),
    boardDetails,
    boardAutomation: currentBoardAutomation,
    progress: boardProgress.get(boardId) ?? null,
    result: boardResults.get(boardId) ?? null,
  };

  if (!shouldShowBatchAutomationOverlay(model)) {
    overlay?.remove();
    overlay = null;
    return;
  }

  overlay = showBatchAutomationOverlay(model, {
    onMoveAll: () => void processReadyItems(boardId, false),
    onCancelAll: () => void cancelAll(boardId),
    onMapStatusGroup: (columnId, statusIndex, groupId) => void mapStatusGroup(boardId, columnId, statusIndex, groupId),
    onRetryFailed: () => void processReadyItems(boardId, true),
    onCancelFailed: () => void cancelFailed(boardId),
    onClose: () => {
      boardResults.delete(boardId);
      overlay?.remove();
      overlay = null;
    },
  });
}

export async function addStatusChangeToPendingAutomation(input: AddStatusChangeInput): Promise<void> {
  const target = await findTargetGroup(input);
  const items: PendingAutomationItem[] = [];
  const skippedItemIds = new Set<string>();

  for (const itemId of input.statusChange.itemIds) {
    if (target && (await isItemAlreadyInTargetGroup({ boardId: input.statusChange.boardId, itemId, targetGroupId: target.groupId }, input.catalog))) {
      skippedItemIds.add(itemId);
      logAlreadyInTargetGroup(input.statusChange.boardId, itemId, target.groupId);
      continue;
    }

    items.push(createPendingItem(input, itemId, target));
  }

  if (skippedItemIds.size > 0) {
    await updatePendingBoardAutomation(input.statusChange.boardId, board => ({
      ...board,
      pendingItems: Object.fromEntries(Object.entries(board.pendingItems).filter(([itemId]) => !skippedItemIds.has(itemId))),
      nextBatchItems: Object.fromEntries(Object.entries(board.nextBatchItems).filter(([itemId]) => !skippedItemIds.has(itemId))),
    }));
  }

  if (items.length === 0) {
    await renderCurrentBoardOverlay();
    return;
  }

  const updatedBoard = await updatePendingBoardAutomation(input.statusChange.boardId, board => {
    const targetCollection = board.isProcessing ? { ...board.nextBatchItems } : { ...board.pendingItems };
    for (const item of items) {
      targetCollection[item.itemId] = item;
    }

    return board.isProcessing
      ? {
          ...board,
          nextBatchItems: targetCollection,
        }
      : {
          ...board,
          pendingItems: targetCollection,
        };
  });

  boardResults.delete(input.statusChange.boardId);
  logPendingUpdate(updatedBoard);
  await renderCurrentBoardOverlay();
}

async function mapStatusGroup(boardId: string, columnId: string, statusIndex: string, groupId: string): Promise<void> {
  const catalog = await getBoardCatalog();
  const boardDetails = catalog.boardDetailsById[boardId];
  const group = boardDetails?.groups.find(candidate => candidate.id === groupId);
  if (!boardDetails || !group) {
    return;
  }

  const matchingItem = Object.values((await getPendingBoardAutomation(boardId)).pendingItems).find(
    item => item.columnId === columnId && item.statusIndex === statusIndex,
  );
  const statusName = matchingItem?.statusName ?? statusIndex;

  await saveStatusGroupMapping({
    boardId,
    columnId,
    statusIndex,
    statusName,
    groupId: group.id,
    groupTitle: group.title,
  });

  const updatedBoard = await updatePendingBoardAutomation(boardId, board => {
    const updateItems = (items: Record<string, PendingAutomationItem>): Record<string, PendingAutomationItem> =>
      Object.fromEntries(
        Object.entries(items).map(([itemId, item]) => [
          itemId,
          item.columnId === columnId && item.statusIndex === statusIndex
            ? {
                ...item,
                targetGroupId: group.id,
                targetGroupTitle: group.title,
                state: 'ready' as const,
                failureReason: undefined,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ]),
      );

    return {
      ...board,
      pendingItems: updateItems(board.pendingItems),
      nextBatchItems: updateItems(board.nextBatchItems),
    };
  });

  logPendingUpdate(updatedBoard);
  await renderCurrentBoardOverlay();
}

async function cancelAll(boardId: string): Promise<void> {
  const updatedBoard = await updatePendingBoardAutomation(boardId, board => ({
    ...board,
    pendingItems: {},
    nextBatchItems: {},
  }));
  boardResults.delete(boardId);
  logPendingUpdate(updatedBoard);
  await renderCurrentBoardOverlay();
}

async function cancelFailed(boardId: string): Promise<void> {
  const updatedBoard = await updatePendingBoardAutomation(boardId, board => ({
    ...board,
    pendingItems: Object.fromEntries(Object.entries(board.pendingItems).filter(([, item]) => item.state !== 'failed')),
  }));
  logPendingUpdate(updatedBoard);
  await renderCurrentBoardOverlay();
}

async function processReadyItems(boardId: string, includeFailed: boolean): Promise<void> {
  const catalog = await getBoardCatalog();
  const board = await revalidateBoardAutomation(boardId, catalog);
  if (board.isProcessing) {
    return;
  }

  const snapshot = Object.values(board.pendingItems).filter(item => (includeFailed ? item.state === 'failed' : item.state === 'ready') && item.targetGroupId);
  if (snapshot.length === 0) {
    return;
  }

  await updatePendingBoardAutomation(boardId, current => ({
    ...current,
    isProcessing: true,
  }));
  boardProgress.set(boardId, { total: snapshot.length, completed: 0 });
  boardResults.delete(boardId);

  console.log('Monday batch processing started', {
    boardId,
    itemCount: snapshot.length,
  });
  await renderCurrentBoardOverlay();

  let succeededCount = 0;
  const failedByItemId = new Map<string, string>();

  for (const item of snapshot) {
    try {
      const result = await requestMoveItems({
        boardId,
        itemIds: [item.itemId],
        targetGroupId: item.targetGroupId ?? '',
      });

      if (result.succeededItemIds.includes(item.itemId)) {
        succeededCount += 1;
      } else {
        failedByItemId.set(item.itemId, result.failedItems[0]?.reason ?? 'NETWORK_ERROR');
      }
    } catch {
      failedByItemId.set(item.itemId, 'TIMEOUT');
    }

    const progress = boardProgress.get(boardId);
    if (progress) {
      boardProgress.set(boardId, { ...progress, completed: progress.completed + 1 });
    }
    await renderCurrentBoardOverlay();
  }

  const updatedBoard = await updatePendingBoardAutomation(boardId, current => {
    const pendingItems = { ...current.pendingItems };
    for (const item of snapshot) {
      if (failedByItemId.has(item.itemId)) {
        pendingItems[item.itemId] = {
          ...item,
          state: 'failed',
          failureReason: failedByItemId.get(item.itemId),
          updatedAt: new Date().toISOString(),
        };
      } else {
        delete pendingItems[item.itemId];
      }
    }

    const promotedItems = {
      ...pendingItems,
      ...current.nextBatchItems,
    };

    return {
      ...current,
      pendingItems: promotedItems,
      nextBatchItems: {},
      isProcessing: false,
    };
  });

  const failedCount = failedByItemId.size;
  boardProgress.delete(boardId);
  boardResults.set(boardId, {
    requestedCount: snapshot.length,
    succeededCount,
    failedCount,
  });

  console.log('Monday batch processing completed', {
    boardId,
    requestedCount: snapshot.length,
    succeededCount,
    failedCount,
    nextBatchCount: Object.keys(updatedBoard.nextBatchItems).length,
  });

  logPendingUpdate(updatedBoard);
  await renderCurrentBoardOverlay();
}

export function initializeBatchAutomationController(): void {
  void renderCurrentBoardOverlay();

  window.setInterval(() => {
    const nextBoardId = getCurrentBoardId();
    if (nextBoardId !== currentBoardId) {
      void renderCurrentBoardOverlay();
    }
  }, 1_000);
}
