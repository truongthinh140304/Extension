import type { StatusGroupMapping, StatusGroupMappingStore } from './pendingAutomationTypes';

export const STATUS_GROUP_MAPPING_STORAGE_KEY = 'mondayStatusGroupMappingsV1';

function now(): string {
  return new Date().toISOString();
}

function mappingKey(boardId: string, columnId: string, statusIndex: string): string {
  return `${boardId}|${columnId}|${statusIndex}`;
}

function emptyStore(): StatusGroupMappingStore {
  return {
    mappingsByKey: {},
    updatedAt: now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMapping(value: unknown): value is StatusGroupMapping {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.boardId === 'string' &&
    typeof value.columnId === 'string' &&
    typeof value.statusIndex === 'string' &&
    typeof value.statusName === 'string' &&
    typeof value.groupId === 'string' &&
    typeof value.groupTitle === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function sanitizeStore(value: unknown): StatusGroupMappingStore {
  if (!isRecord(value) || !isRecord(value.mappingsByKey)) {
    return emptyStore();
  }

  const mappingsByKey: Record<string, StatusGroupMapping> = {};
  for (const [key, mapping] of Object.entries(value.mappingsByKey)) {
    if (isMapping(mapping) && key === mappingKey(mapping.boardId, mapping.columnId, mapping.statusIndex)) {
      mappingsByKey[key] = mapping;
    }
  }

  return {
    mappingsByKey,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now(),
  };
}

async function getMappingStore(): Promise<StatusGroupMappingStore> {
  try {
    const result = await chrome.storage.local.get(STATUS_GROUP_MAPPING_STORAGE_KEY);
    return sanitizeStore(result[STATUS_GROUP_MAPPING_STORAGE_KEY]);
  } catch {
    console.warn('Unable to read monday status group mappings.');
    return emptyStore();
  }
}

async function saveMappingStore(store: StatusGroupMappingStore): Promise<void> {
  await chrome.storage.local.set({ [STATUS_GROUP_MAPPING_STORAGE_KEY]: store });
}

export async function getStatusGroupMapping(boardId: string, columnId: string, statusIndex: string): Promise<StatusGroupMapping | null> {
  const store = await getMappingStore();
  return store.mappingsByKey[mappingKey(boardId, columnId, statusIndex)] ?? null;
}

export async function saveStatusGroupMapping(mapping: Omit<StatusGroupMapping, 'updatedAt'>): Promise<StatusGroupMapping | null> {
  const store = await getMappingStore();
  const nextMapping: StatusGroupMapping = {
    ...mapping,
    updatedAt: now(),
  };
  const nextStore: StatusGroupMappingStore = {
    mappingsByKey: {
      ...store.mappingsByKey,
      [mappingKey(mapping.boardId, mapping.columnId, mapping.statusIndex)]: nextMapping,
    },
    updatedAt: now(),
  };

  try {
    await saveMappingStore(nextStore);
    return nextMapping;
  } catch {
    console.warn('Unable to save monday status group mapping.');
    return null;
  }
}
