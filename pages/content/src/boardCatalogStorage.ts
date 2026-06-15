import type { MondayBoardCatalog, MondayBoardDetails, MondayWorkspaceData } from './boardCatalogTypes';

export const MONDAY_BOARD_CATALOG_STORAGE_KEY = 'mondayBoardCatalogV1';

function createEmptyCatalog(): MondayBoardCatalog {
  const now = new Date().toISOString();

  return {
    workspaces: [],
    boards: [],
    boardDetailsById: {},
    lastUpdatedAt: now,
  };
}

function isBoardCatalog(value: unknown): value is MondayBoardCatalog {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as Partial<MondayBoardCatalog>).workspaces);
}

function mergeById<T extends { id: string }>(currentItems: T[], nextItems: T[]): T[] {
  const byId = new Map<string, T>();

  for (const item of currentItems) {
    byId.set(item.id, item);
  }

  for (const item of nextItems) {
    byId.set(item.id, item);
  }

  return [...byId.values()];
}

async function getStorageValue(): Promise<unknown> {
  return new Promise(resolve => {
    chrome.storage.local.get(MONDAY_BOARD_CATALOG_STORAGE_KEY, result => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }

      resolve(result[MONDAY_BOARD_CATALOG_STORAGE_KEY]);
    });
  });
}

export async function getBoardCatalog(): Promise<MondayBoardCatalog> {
  try {
    const stored = await getStorageValue();
    return isBoardCatalog(stored) ? stored : createEmptyCatalog();
  } catch {
    console.warn('Unable to read monday board catalog.');
    return createEmptyCatalog();
  }
}

export async function saveBoardCatalog(catalog: MondayBoardCatalog): Promise<boolean> {
  try {
    await chrome.storage.local.set({ [MONDAY_BOARD_CATALOG_STORAGE_KEY]: catalog });
    return true;
  } catch {
    console.warn('Unable to save monday board catalog.');
    return false;
  }
}

export async function mergeWorkspaceData(workspaceData: MondayWorkspaceData): Promise<MondayBoardCatalog | null> {
  try {
    const current = await getBoardCatalog();
    const next: MondayBoardCatalog = {
      ...current,
      workspaces: mergeById(current.workspaces, workspaceData.workspaces),
      boards: mergeById(current.boards, workspaceData.boards),
      boardDetailsById: { ...current.boardDetailsById },
      lastUpdatedAt: new Date().toISOString(),
    };

    return (await saveBoardCatalog(next)) ? next : null;
  } catch {
    console.warn('Unable to merge monday workspace catalog.');
    return null;
  }
}

export async function mergeBoardDetails(boardDetails: MondayBoardDetails): Promise<MondayBoardCatalog | null> {
  try {
    const current = await getBoardCatalog();
    const next: MondayBoardCatalog = {
      ...current,
      boardDetailsById: {
        ...current.boardDetailsById,
        [boardDetails.id]: boardDetails,
      },
      lastUpdatedAt: new Date().toISOString(),
    };

    return (await saveBoardCatalog(next)) ? next : null;
  } catch {
    console.warn('Unable to merge monday board details.');
    return null;
  }
}
