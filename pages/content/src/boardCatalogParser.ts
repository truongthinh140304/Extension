import type {
  MondayBoardDetails,
  MondayBoardSummary,
  MondayGroupSummary,
  MondayStatusColumn,
  MondayStatusLabel,
  MondayWorkspaceData,
  MondayWorkspaceSummary,
} from '@extension/shared';

type PlainObject = Record<string, unknown>;
type BoardEnvelope = {
  envelope: PlainObject;
  dataSource: PlainObject;
};

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toSafeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function toSafeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getStringValue(object: PlainObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = toSafeString(object[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getObjectValue(object: PlainObject, keys: string[]): PlainObject | undefined {
  for (const key of keys) {
    const value = object[key];
    if (isPlainObject(value)) {
      return value;
    }
  }

  return undefined;
}

function getArrayValue(object: PlainObject, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function collectArraysByKey(value: unknown, keyName: string, result: unknown[][] = [], depth = 0): unknown[][] {
  if (depth > 8) {
    return result;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectArraysByKey(item, keyName, result, depth + 1));
    return result;
  }

  if (!isPlainObject(value)) {
    return result;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === keyName && Array.isArray(item)) {
      result.push(item);
    }

    if (isPlainObject(item) || Array.isArray(item)) {
      collectArraysByKey(item, keyName, result, depth + 1);
    }
  }

  return result;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();

  for (const item of items) {
    byId.set(item.id, item);
  }

  return [...byId.values()];
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function parseWorkspace(value: unknown): MondayWorkspaceSummary | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = getStringValue(value, ['id', 'workspace_id']);
  const name = getStringValue(value, ['name', 'title']);

  return id && name ? { id, name } : null;
}

function parseBoardSummary(value: unknown): MondayBoardSummary | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = getStringValue(value, ['id', 'board_id']);
  const name = getStringValue(value, ['name', 'title']);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    workspaceId: getStringValue(value, ['workspace_id', 'workspaceId']),
    kind: getStringValue(value, ['board_kind', 'kind']),
    archived: value.archived === true,
    deleted: value.deleted === true,
  };
}

export function parseLeftPaneWorkspaceData(responseBody: unknown): MondayWorkspaceData | null {
  try {
    const workspaces = uniqueById(collectArraysByKey(responseBody, 'workspaces').flatMap(items => items.map(parseWorkspace).filter(isDefined)));
    const boards = uniqueById(collectArraysByKey(responseBody, 'boards').flatMap(items => items.map(parseBoardSummary).filter(isDefined)));

    if (workspaces.length === 0 && boards.length === 0) {
      return null;
    }

    return { workspaces, boards };
  } catch {
    return null;
  }
}

function hasBoardEnvelopeSignal(value: PlainObject): boolean {
  return value.id !== undefined || value.name !== undefined || value.board_data !== undefined;
}

function hasBoardDataSignal(value: PlainObject): boolean {
  return Array.isArray(value.groups) || Array.isArray(value.columns);
}

function findBoardEnvelope(value: unknown, depth = 0): BoardEnvelope | null {
  if (depth > 6) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findBoardEnvelope(item, depth + 1);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const boardData = value.board_data;
  if (isPlainObject(boardData) && hasBoardEnvelopeSignal(value)) {
    return {
      envelope: value,
      dataSource: boardData,
    };
  }

  if (hasBoardEnvelopeSignal(value) && hasBoardDataSignal(value)) {
    return {
      envelope: value,
      dataSource: value,
    };
  }

  const preferredWrappers = ['data', 'result', 'results', 'board', 'boards'];
  for (const key of preferredWrappers) {
    const candidate = findBoardEnvelope(value[key], depth + 1);
    if (candidate) {
      return candidate;
    }
  }

  for (const [key, item] of Object.entries(value)) {
    if (preferredWrappers.includes(key)) {
      continue;
    }

    const candidate = findBoardEnvelope(item, depth + 1);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function parseGroup(value: unknown): MondayGroupSummary | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = getStringValue(value, ['id']);
  const title = getStringValue(value, ['title', 'name']);

  if (!id || !title) {
    return null;
  }

  const position = toSafeNumber(value.pos ?? value.position);
  return position === undefined ? { id, title } : { id, title, position };
}

function isStatusColumn(object: PlainObject, title: string, type: string): boolean {
  const normalizedTitle = title.trim().toLocaleLowerCase();
  const normalizedType = type.trim().toLocaleLowerCase();

  return normalizedTitle === 'status' && ['color', 'status', 'color_picker', 'status_column', 'status-v2'].includes(normalizedType);
}

function parseSettingsString(value: unknown): PlainObject | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseLabels(value: unknown): MondayStatusLabel[] {
  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value)
    .map(([index, label]) => {
      const name = typeof label === 'string' ? label.trim() : '';
      return name ? { index, name } : null;
    })
    .filter((label): label is MondayStatusLabel => Boolean(label));
}

function parseStatusColumn(value: unknown): MondayStatusColumn | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = getStringValue(value, ['id']);
  const title = getStringValue(value, ['title']);
  const type = getStringValue(value, ['type']);

  if (!id || !title || !type || !isStatusColumn(value, title, type)) {
    return null;
  }

  const settings = getObjectValue(value, ['settings']) ?? parseSettingsString(value.settings_str);
  const labels = parseLabels(value.labels ?? settings?.labels);

  return {
    id,
    title,
    type,
    labels,
  };
}

function getTopLevelKeys(value: unknown): string[] {
  const firstObject = Array.isArray(value) ? value.find(isPlainObject) : value;
  return isPlainObject(firstObject) ? Object.keys(firstObject).slice(0, 15) : [];
}

function logBoardParseSkipped(responseBody: unknown): void {
  console.warn('Monday board parse skipped', {
    responseType: typeof responseBody,
    isArray: Array.isArray(responseBody),
    topLevelKeys: getTopLevelKeys(responseBody),
  });
}

export function parseBoardData(responseBody: unknown): MondayBoardDetails | null {
  try {
    const candidate = findBoardEnvelope(responseBody);
    if (!candidate) {
      logBoardParseSkipped(responseBody);
      return null;
    }

    const { envelope, dataSource } = candidate;
    const id = getStringValue(envelope, ['id', 'board_id']);
    const name = getStringValue(envelope, ['name', 'title']);

    if (!id || !name) {
      logBoardParseSkipped(responseBody);
      return null;
    }

    const groupSource = getArrayValue(dataSource, ['groups']) ?? getArrayValue(envelope, ['groups']) ?? [];
    const columnSource = getArrayValue(dataSource, ['columns']) ?? getArrayValue(envelope, ['columns']) ?? [];
    const groups = groupSource.map(parseGroup).filter((group): group is MondayGroupSummary => Boolean(group));
    const statusColumns = columnSource
      .map(parseStatusColumn)
      .filter((column): column is MondayStatusColumn => Boolean(column));

    return {
      id,
      name,
      workspaceId: getStringValue(envelope, ['workspace_id', 'workspaceId']),
      groups: uniqueById(groups),
      statusColumns: uniqueById(statusColumns),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    logBoardParseSkipped(responseBody);
    return null;
  }
}
