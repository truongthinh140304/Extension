import type { MondayBoardCatalog } from '@extension/shared';
import { getLocalValue } from '@extension/storage';

export const MONDAY_BOARD_CATALOG_STORAGE_KEY = 'mondayBoardCatalogV1';

function createEmptyCatalog(): MondayBoardCatalog {
  return {
    workspaces: [],
    boards: [],
    boardDetailsById: {},
    lastUpdatedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBoardCatalog(value: unknown): value is MondayBoardCatalog {
  if (!isRecord(value)) {
    return false;
  }

  return Array.isArray(value.workspaces) && Array.isArray(value.boards) && isRecord(value.boardDetailsById) && typeof value.lastUpdatedAt === 'string';
}

export async function getBoardCatalog(): Promise<MondayBoardCatalog> {
  try {
    const catalog = await getLocalValue<unknown>(MONDAY_BOARD_CATALOG_STORAGE_KEY, null);
    return isBoardCatalog(catalog) ? catalog : createEmptyCatalog();
  } catch {
    return createEmptyCatalog();
  }
}

export function readBoardCatalogFromChange(newValue: unknown): MondayBoardCatalog {
  return isBoardCatalog(newValue) ? newValue : createEmptyCatalog();
}
