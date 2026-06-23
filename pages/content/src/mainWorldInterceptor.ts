import type {
  JsonObject,
  JsonValue,
  MondayMoveItemFailure,
  MondayMoveItemsRequestMessage,
  MondayMoveItemsRequestPayload,
  MondayMoveItemsResultMessage,
  MondayNetworkEventMessage,
  MondayNetworkEventPayload,
} from './types/networkTypes';

const MESSAGE_SOURCE = 'MONDAY_BOARD_ASSISTANT' as const;
const MESSAGE_TYPE = 'MONDAY_NETWORK_EVENT' as const;
const MONDAY_HOST_RE = /(^|\.)monday\.com$/i;
const INTERESTING_URL_PARTS = ['leftpane_workspace_data', '/board_data', 'batch_change_column_value', '/position'];
const SENSITIVE_FIELD_RE = /(authorization|cookie|csrf|xsrf|token|password|secret|credential)/i;
const CSRF_HEADER_NAME = 'x-csrf-token';
const APPEND_POSITION_BASE = 1_000_000_000;
const MAX_MOVE_ITEMS = 100;
const MOVE_ITEM_RETRY_DELAY_MS = 1_000;
const ID_RE = /^\d+$/;
const GROUP_ID_RE = /^[A-Za-z0-9_-]+$/;

type InterceptorWindow = Window &
  typeof globalThis & {
    __mondayBoardAssistantNetworkInterceptorInstalled?: boolean;
  };

type XhrMetadata = {
  method: string;
  url: string;
  requestBody: Promise<JsonValue | null>;
};

type XhrOpen = (method: string, url: string | URL, async: boolean, username?: string | null, password?: string | null) => void;

let csrfToken: string | null = null;

function isCurrentMondayHost(): boolean {
  return MONDAY_HOST_RE.test(window.location.hostname);
}

function toInterestingUrl(rawUrl: string | URL): URL | null {
  if (!isCurrentMondayHost()) {
    return null;
  }

  try {
    const url = new URL(String(rawUrl), window.location.href);

    if (url.hostname !== window.location.hostname) {
      return null;
    }

    return INTERESTING_URL_PARTS.some(part => url.href.includes(part)) ? url : null;
  } catch {
    return null;
  }
}

function rememberCsrfToken(value: string | null): void {
  const token = value?.trim();
  if (token) {
    csrfToken = token;
  }
}

function captureCsrfFromHeaders(headers: HeadersInit | undefined): void {
  if (!headers) {
    return;
  }

  try {
    if (headers instanceof Headers) {
      rememberCsrfToken(headers.get(CSRF_HEADER_NAME));
      return;
    }

    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        if (key.toLocaleLowerCase() === CSRF_HEADER_NAME) {
          rememberCsrfToken(value);
        }
      }
      return;
    }

    for (const [key, value] of Object.entries(headers)) {
      if (key.toLocaleLowerCase() === CSRF_HEADER_NAME) {
        rememberCsrfToken(value);
      }
    }
  } catch {
    // Keep monday request behavior unchanged if header inspection is unavailable.
  }
}

function captureCsrfFromFetchInput(input: RequestInfo | URL, init?: RequestInit): void {
  if (input instanceof Request) {
    rememberCsrfToken(input.headers.get(CSRF_HEADER_NAME));
  }

  captureCsrfFromHeaders(init?.headers);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (valueType === 'object') {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }

  return false;
}

function sanitizeJsonValue(value: JsonValue): JsonValue | undefined {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeJsonValue(item)).filter((item): item is JsonValue => item !== undefined);
  }

  const sanitized: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_FIELD_RE.test(key)) {
      continue;
    }

    const sanitizedItem = sanitizeJsonValue(item);
    if (sanitizedItem !== undefined) {
      sanitized[key] = sanitizedItem;
    }
  }

  return sanitized;
}

function parseJsonText(text: string): JsonValue | null {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isJsonValue(parsed)) {
      return null;
    }

    return sanitizeJsonValue(parsed) ?? null;
  } catch {
    return null;
  }
}

function formDataToSafeJson(formData: FormData): JsonObject | null {
  const safeEntries: JsonObject = {};

  for (const [key, value] of formData.entries()) {
    if (SENSITIVE_FIELD_RE.test(key) || typeof value !== 'string') {
      continue;
    }

    const existing = safeEntries[key];
    if (existing === undefined) {
      safeEntries[key] = value;
      continue;
    }

    safeEntries[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return Object.keys(safeEntries).length > 0 ? safeEntries : null;
}

function bodyToSafeJson(body: unknown): Promise<JsonValue | null> {
  if (typeof body === 'string') {
    return Promise.resolve(parseJsonText(body));
  }

  if (body instanceof FormData) {
    return Promise.resolve(formDataToSafeJson(body));
  }

  return Promise.resolve(null);
}

async function requestToSafeJson(request: Request): Promise<JsonValue | null> {
  try {
    return parseJsonText(await request.clone().text());
  } catch {
    return null;
  }
}

function getFetchUrl(input: RequestInfo | URL): string | URL {
  return input instanceof Request ? input.url : input;
}

function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  return input instanceof Request ? input.method.toUpperCase() : 'GET';
}

function getFetchRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<JsonValue | null> {
  if (init && 'body' in init) {
    return bodyToSafeJson(init.body);
  }

  return input instanceof Request ? requestToSafeJson(input) : Promise.resolve(null);
}

async function responseToSafeJson(response: Response): Promise<JsonValue | null> {
  try {
    return parseJsonText(await response.clone().text());
  } catch {
    return null;
  }
}

function xhrResponseToSafeJson(xhr: XMLHttpRequest): JsonValue | null {
  try {
    if (xhr.responseType === 'json') {
      return isJsonValue(xhr.response) ? xhr.response : null;
    }

    if (xhr.responseType === '' || xhr.responseType === 'text') {
      return parseJsonText(xhr.responseText);
    }
  } catch {
    return null;
  }

  return null;
}

function postNetworkEvent(payload: MondayNetworkEventPayload): void {
  const message: MondayNetworkEventMessage = {
    source: MESSAGE_SOURCE,
    type: MESSAGE_TYPE,
    payload,
  };

  window.postMessage(message, window.location.origin);
}

function hookFetch(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    captureCsrfFromFetchInput(input, init);

    const interestingUrl = toInterestingUrl(getFetchUrl(input));
    const method = getFetchMethod(input, init);
    const requestBody = interestingUrl ? getFetchRequestBody(input, init) : Promise.resolve(null);
    const responsePromise = originalFetch(input, init);

    if (interestingUrl) {
      void responsePromise
        .then(async response => {
          postNetworkEvent({
            transport: 'fetch',
            url: interestingUrl.href,
            method,
            requestBody: await requestBody,
            responseBody: await responseToSafeJson(response),
            status: response.status,
            timestamp: Date.now(),
          });
        })
        .catch(() => undefined);
    }

    return responsePromise;
  };
}

function hookXhr(): void {
  const metadata = new WeakMap<XMLHttpRequest, XhrMetadata>();
  const originalOpen = XMLHttpRequest.prototype.open as XhrOpen;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  const patchedOpen: XhrOpen = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null,
  ): void {
    metadata.set(this, {
      method: method.toUpperCase(),
      url: String(url),
      requestBody: Promise.resolve(null),
    });

    originalOpen.call(this, method, url, async, username ?? undefined, password ?? undefined);
  };

  XMLHttpRequest.prototype.open = patchedOpen as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(this: XMLHttpRequest, name: string, value: string): void {
    if (name.toLocaleLowerCase() === CSRF_HEADER_NAME) {
      rememberCsrfToken(value);
    }

    originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function patchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    const current = metadata.get(this);
    const interestingUrl = current ? toInterestingUrl(current.url) : null;

    if (current && interestingUrl) {
      metadata.set(this, {
        ...current,
        url: interestingUrl.href,
        requestBody: bodyToSafeJson(body),
      });

      this.addEventListener('loadend', () => {
        const finalMetadata = metadata.get(this);
        if (!finalMetadata) {
          return;
        }

        void finalMetadata.requestBody
          .then(requestBody => {
            postNetworkEvent({
              transport: 'xhr',
              url: finalMetadata.url,
              method: finalMetadata.method,
              requestBody,
              responseBody: xhrResponseToSafeJson(this),
              status: this.status || null,
              timestamp: Date.now(),
            });
          })
          .catch(() => undefined);
      });
    }

    originalSend.call(this, body);
  };
}

function createAppendPosition(index: number): number {
  return APPEND_POSITION_BASE + index;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateMoveItemsRequestPayload(value: unknown): MondayMoveItemsRequestPayload | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const requestId = typeof value.requestId === 'string' && value.requestId.trim() ? value.requestId : null;
  const boardId = typeof value.boardId === 'string' && ID_RE.test(value.boardId) ? value.boardId : null;
  const targetGroupId = typeof value.targetGroupId === 'string' && GROUP_ID_RE.test(value.targetGroupId) ? value.targetGroupId : null;

  if (!requestId || !boardId || !targetGroupId || !Array.isArray(value.itemIds)) {
    return null;
  }

  const itemIds = [...new Set(value.itemIds.filter((itemId): itemId is string => typeof itemId === 'string' && ID_RE.test(itemId)))].slice(0, MAX_MOVE_ITEMS);
  if (itemIds.length === 0) {
    return null;
  }

  return {
    requestId,
    boardId,
    itemIds,
    targetGroupId,
  };
}

function isMoveItemsRequestMessage(value: unknown): value is MondayMoveItemsRequestMessage {
  if (!isPlainObject(value)) {
    return false;
  }

  return value.source === MESSAGE_SOURCE && value.type === 'MONDAY_MOVE_ITEMS_REQUEST' && validateMoveItemsRequestPayload(value.payload) !== null;
}

function failureReason(status: number, hadCsrfToken: boolean): MondayMoveItemFailure['reason'] {
  if (!hadCsrfToken && status === 403) {
    return 'CSRF_TOKEN_UNAVAILABLE';
  }

  if (status === 403) {
    return 'HTTP_403';
  }

  return 'HTTP_500';
}

async function moveOneItem(boardId: string, itemId: string, targetGroupId: string, position: number): Promise<MondayMoveItemFailure | null> {
  const hadCsrfToken = Boolean(csrfToken);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (csrfToken) {
    headers[CSRF_HEADER_NAME] = csrfToken;
  }

  try {
    const response = await window.fetch(`${window.location.origin}/projects/${itemId}/position`, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        group_id: targetGroupId,
        board_id: Number(boardId),
        pos: position,
      }),
    });

    if (response.ok) {
      return null;
    }

    return {
      itemId,
      status: response.status,
      reason: failureReason(response.status, hadCsrfToken),
    };
  } catch {
    return {
      itemId,
      status: null,
      reason: 'NETWORK_ERROR',
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

async function moveItems(payload: MondayMoveItemsRequestPayload): Promise<void> {
  const succeededItemIds: string[] = [];
  const failedItems: MondayMoveItemFailure[] = [];

  for (const [index, itemId] of payload.itemIds.entries()) {
    const position = createAppendPosition(index);
    const firstFailure = await moveOneItem(payload.boardId, itemId, payload.targetGroupId, position);

    if (!firstFailure) {
      succeededItemIds.push(itemId);
      continue;
    }

    await delay(MOVE_ITEM_RETRY_DELAY_MS);
    const secondFailure = await moveOneItem(payload.boardId, itemId, payload.targetGroupId, position);

    if (!secondFailure) {
      succeededItemIds.push(itemId);
      continue;
    }

    failedItems.push(secondFailure);
  }

  const result: MondayMoveItemsResultMessage = {
    source: MESSAGE_SOURCE,
    type: 'MONDAY_MOVE_ITEMS_RESULT',
    payload: {
      requestId: payload.requestId,
      boardId: payload.boardId,
      targetGroupId: payload.targetGroupId,
      succeededItemIds,
      failedItems,
    },
  };

  window.postMessage(result, window.location.origin);
}

function listenForMoveItemsCommands(): void {
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin || !isMoveItemsRequestMessage(event.data)) {
      return;
    }

    const payload = validateMoveItemsRequestPayload(event.data.payload);
    if (!payload) {
      return;
    }

    void moveItems(payload).catch(() => undefined);
  });
}

function installInterceptor(): void {
  const interceptedWindow = window as InterceptorWindow;
  if (interceptedWindow.__mondayBoardAssistantNetworkInterceptorInstalled) {
    return;
  }

  interceptedWindow.__mondayBoardAssistantNetworkInterceptorInstalled = true;

  try {
    hookFetch();
    hookXhr();
    listenForMoveItemsCommands();
  } catch {
    interceptedWindow.__mondayBoardAssistantNetworkInterceptorInstalled = false;
  }
}

installInterceptor();
