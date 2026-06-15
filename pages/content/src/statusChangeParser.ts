import type { JsonValue } from './networkTypes';

export type MondayStatusChangeEvent = {
  boardId: string;
  itemIds: string[];
  columnId: string;
  statusIndex: string;
  occurredAt: string;
};

const STATUS_CHANGE_PATH_RE = /^\/boards\/([^/]+)\/batch_change_column_value$/;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseMaybeJsonObject(value: unknown): PlainObject | null {
  if (isPlainObject(value)) {
    return value;
  }

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

function toSafeString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function parseItemIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value.map(toSafeString).filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export function parseStatusChangeEvent(pathname: string | null, requestBody: JsonValue | null, status: number | null): MondayStatusChangeEvent | null {
  try {
    if (!pathname || status === null || status < 200 || status > 299) {
      return null;
    }

    const match = STATUS_CHANGE_PATH_RE.exec(pathname);
    if (!match?.[1]) {
      return null;
    }

    const body = parseMaybeJsonObject(requestBody);
    if (!body) {
      return null;
    }

    const itemIds = parseItemIds(body.pulseIds);
    const columnId = toSafeString(body.columnId);
    const columnValue = parseMaybeJsonObject(body.columnValue);
    const statusIndex = columnValue ? toSafeString(columnValue.index) : null;

    if (itemIds.length === 0 || !columnId || !statusIndex) {
      return null;
    }

    return {
      boardId: match[1],
      itemIds,
      columnId,
      statusIndex,
      occurredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
