import type { PendingAutomationItem, PendingAutomationStore, PendingBoardAutomation } from './pendingAutomationTypes';

export const PENDING_AUTOMATION_STORAGE_KEY = 'mondayPendingAutomationV1';

function now(): string {
  return new Date().toISOString();
}

function emptyStore(): PendingAutomationStore {
  return {
    boardsById: {},
    updatedAt: now(),
  };
}

function emptyBoard(boardId: string): PendingBoardAutomation {
  return {
    boardId,
    pendingItems: {},
    nextBatchItems: {},
    isProcessing: false,
    updatedAt: now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPendingItem(value: unknown): value is PendingAutomationItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.boardId === 'string' &&
    typeof value.itemId === 'string' &&
    typeof value.itemName === 'string' &&
    typeof value.columnId === 'string' &&
    typeof value.statusIndex === 'string' &&
    typeof value.statusName === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.state === 'ready' || value.state === 'needs_mapping' || value.state === 'failed')
  );
}

function sanitizeItems(value: unknown): Record<string, PendingAutomationItem> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, PendingAutomationItem> = {};
  for (const [itemId, item] of Object.entries(value)) {
    if (isPendingItem(item) && item.itemId === itemId) {
      result[itemId] = item;
    }
  }

  return result;
}

function isPendingBoard(value: unknown): value is PendingBoardAutomation {
  return isRecord(value) && typeof value.boardId === 'string';
}

function sanitizeStore(value: unknown): PendingAutomationStore {
  if (!isRecord(value) || !isRecord(value.boardsById)) {
    return emptyStore();
  }

  const boardsById: Record<string, PendingBoardAutomation> = {};
  for (const [boardId, board] of Object.entries(value.boardsById)) {
    if (!isPendingBoard(board) || board.boardId !== boardId) {
      continue;
    }

    boardsById[boardId] = {
      boardId,
      pendingItems: sanitizeItems(board.pendingItems),
      nextBatchItems: sanitizeItems(board.nextBatchItems),
      isProcessing: board.isProcessing === true,
      updatedAt: typeof board.updatedAt === 'string' ? board.updatedAt : now(),
    };
  }

  return {
    boardsById,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now(),
  };
}

async function savePendingAutomationStore(store: PendingAutomationStore): Promise<void> {
  await chrome.storage.session.set({ [PENDING_AUTOMATION_STORAGE_KEY]: store });
}

export async function getPendingAutomationStore(): Promise<PendingAutomationStore> {
  try {
    const result = await chrome.storage.session.get(PENDING_AUTOMATION_STORAGE_KEY);
    return sanitizeStore(result[PENDING_AUTOMATION_STORAGE_KEY]);
  } catch {
    console.warn('Unable to read monday pending automation.');
    return emptyStore();
  }
}

export async function updatePendingBoardAutomation(
  boardId: string,
  updater: (board: PendingBoardAutomation) => PendingBoardAutomation,
): Promise<PendingBoardAutomation> {
  const store = await getPendingAutomationStore();
  const current = store.boardsById[boardId] ?? emptyBoard(boardId);
  const updatedBoard = {
    ...updater(current),
    boardId,
    updatedAt: now(),
  };
  const nextStore: PendingAutomationStore = {
    boardsById: {
      ...store.boardsById,
      [boardId]: updatedBoard,
    },
    updatedAt: now(),
  };

  try {
    await savePendingAutomationStore(nextStore);
  } catch {
    console.warn('Unable to save monday pending automation.');
  }

  return updatedBoard;
}

export async function getPendingBoardAutomation(boardId: string): Promise<PendingBoardAutomation> {
  const store = await getPendingAutomationStore();
  return store.boardsById[boardId] ?? emptyBoard(boardId);
}

export function countBoardAutomation(board: PendingBoardAutomation): {
  pendingCount: number;
  readyCount: number;
  needsMappingCount: number;
  failedCount: number;
  nextBatchCount: number;
} {
  const pendingItems = Object.values(board.pendingItems);
  return {
    pendingCount: pendingItems.length,
    readyCount: pendingItems.filter(item => item.state === 'ready').length,
    needsMappingCount: pendingItems.filter(item => item.state === 'needs_mapping').length,
    failedCount: pendingItems.filter(item => item.state === 'failed').length,
    nextBatchCount: Object.keys(board.nextBatchItems).length,
  };
}
