import type { MondayMoveItemFailure, MondayMoveItemsRequestMessage, MondayMoveItemsResultMessage, MondayMoveItemsResultPayload } from './networkTypes';

const MESSAGE_SOURCE = 'MONDAY_BOARD_ASSISTANT' as const;
const MOVE_REQUEST_TIMEOUT_MS = 30_000;

type PendingMoveRequest = {
  resolve: (payload: MondayMoveItemsResultPayload) => void;
  reject: () => void;
  timeoutId: number;
};

export type MoveItemsInput = {
  boardId: string;
  itemIds: string[];
  targetGroupId: string;
};

const pendingRequests = new Map<string, PendingMoveRequest>();

function createRequestId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function isMoveItemsResultMessage(value: unknown): value is MondayMoveItemsResultMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MondayMoveItemsResultMessage>;
  return candidate.source === MESSAGE_SOURCE && candidate.type === 'MONDAY_MOVE_ITEMS_RESULT' && Boolean(candidate.payload);
}

function isMoveFailure(value: unknown): value is MondayMoveItemFailure {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MondayMoveItemFailure>;
  return typeof candidate.itemId === 'string' && (typeof candidate.status === 'number' || candidate.status === null) && typeof candidate.reason === 'string';
}

function isResultPayload(value: unknown): value is MondayMoveItemsResultPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MondayMoveItemsResultPayload>;
  return (
    typeof candidate.requestId === 'string' &&
    typeof candidate.boardId === 'string' &&
    typeof candidate.targetGroupId === 'string' &&
    Array.isArray(candidate.succeededItemIds) &&
    candidate.succeededItemIds.every(itemId => typeof itemId === 'string') &&
    Array.isArray(candidate.failedItems) &&
    candidate.failedItems.every(isMoveFailure)
  );
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin || !isMoveItemsResultMessage(event.data) || !isResultPayload(event.data.payload)) {
    return;
  }

  const pending = pendingRequests.get(event.data.payload.requestId);
  if (!pending) {
    return;
  }

  window.clearTimeout(pending.timeoutId);
  pendingRequests.delete(event.data.payload.requestId);
  pending.resolve(event.data.payload);
});

export function requestMoveItems(input: MoveItemsInput): Promise<MondayMoveItemsResultPayload> {
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(requestId);
      reject();
    }, MOVE_REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, {
      resolve,
      reject,
      timeoutId,
    });

    const message: MondayMoveItemsRequestMessage = {
      source: MESSAGE_SOURCE,
      type: 'MONDAY_MOVE_ITEMS_REQUEST',
      payload: {
        requestId,
        boardId: input.boardId,
        itemIds: input.itemIds,
        targetGroupId: input.targetGroupId,
      },
    };

    window.postMessage(message, window.location.origin);
  });
}
