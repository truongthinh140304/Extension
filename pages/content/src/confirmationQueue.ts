import { showConfirmationOverlay, type ConfirmationOverlayAction, type ConfirmationRequest } from './confirmationOverlay';
import { requestMoveItems } from './moveItemsBridge';

const DUPLICATE_WINDOW_MS = 3_000;
const SUCCESS_RELOAD_DELAY_MS = 1_200;
const PARTIAL_RELOAD_DELAY_MS = 1_800;
const recentEvents = new Map<string, number>();
const pendingRequests: ConfirmationRequest[] = [];

let activeRequest: ConfirmationRequest | null = null;
let activeOverlay: ReturnType<typeof showConfirmationOverlay> | null = null;
let isProcessingActiveRequest = false;
let activeResultAwaitingClose = false;
let reloadScheduled = false;

function eventKey(request: Pick<ConfirmationRequest, 'boardId' | 'columnId' | 'itemIds' | 'statusIndex'>): string {
  return [request.boardId, [...request.itemIds].sort().join(','), request.columnId, request.statusIndex].join('|');
}

function isDuplicate(request: ConfirmationRequest): boolean {
  const key = eventKey(request);
  const now = Date.now();
  const lastSeen = recentEvents.get(key);

  for (const [recentKey, seenAt] of recentEvents) {
    if (now - seenAt > DUPLICATE_WINDOW_MS) {
      recentEvents.delete(recentKey);
    }
  }

  if (lastSeen && now - lastSeen < DUPLICATE_WINDOW_MS) {
    return true;
  }

  recentEvents.set(key, now);
  return false;
}

function removeItemsFromRequest(request: ConfirmationRequest, changedItemIds: Set<string>): ConfirmationRequest | null {
  const itemIds = request.itemIds.filter(itemId => !changedItemIds.has(itemId));
  return itemIds.length > 0 ? { ...request, itemIds } : null;
}

function removeStaleItems(newRequest: ConfirmationRequest): void {
  const changedItemIds = new Set(newRequest.itemIds);

  if (activeRequest && !isProcessingActiveRequest) {
    activeRequest = removeItemsFromRequest(activeRequest, changedItemIds);
    if (!activeRequest) {
      activeOverlay?.remove();
      activeOverlay = null;
    } else {
      activeOverlay?.update(activeRequest);
    }
  }

  for (let index = pendingRequests.length - 1; index >= 0; index -= 1) {
    const updated = removeItemsFromRequest(pendingRequests[index], changedItemIds);
    if (updated) {
      pendingRequests[index] = updated;
    } else {
      pendingRequests.splice(index, 1);
    }
  }
}

function logCancel(request: ConfirmationRequest): void {
  console.log('Monday automation cancelled', {
    boardId: request.boardId,
    itemCount: request.itemIds.length,
    statusName: request.statusName,
  });
}

function scheduleReload(delayMs: number): void {
  if (reloadScheduled) {
    return;
  }

  //   reloadScheduled = true;
  //   window.setTimeout(() => {
  //     window.location.reload();
  //   }, delayMs);
}

function closeActiveAndShowNext(): void {
  activeOverlay?.remove();
  activeOverlay = null;
  activeRequest = null;
  isProcessingActiveRequest = false;
  activeResultAwaitingClose = false;
  showNextRequest();
}

async function confirmMove(request: ConfirmationRequest): Promise<void> {
  if (!request.targetGroupId || !request.targetGroupTitle || isProcessingActiveRequest) {
    return;
  }

  isProcessingActiveRequest = true;
  activeResultAwaitingClose = false;
  activeOverlay?.update(request, { state: 'processing' });

  try {
    const result = await requestMoveItems({
      boardId: request.boardId,
      itemIds: request.itemIds,
      targetGroupId: request.targetGroupId,
    });

    const requestedCount = request.itemIds.length;
    const succeededCount = result.succeededItemIds.length;
    const failedCount = result.failedItems.length;

    if (succeededCount > 0) {
      console.log('Monday automation completed', {
        boardId: request.boardId,
        requestedCount,
        succeededCount,
        failedCount,
        targetGroupId: request.targetGroupId,
        targetGroupTitle: request.targetGroupTitle,
      });

      activeOverlay?.update(request, {
        state: failedCount === 0 ? 'success' : 'partial',
        message:
          failedCount === 0
            ? `Đã chuyển thành công ${succeededCount} task.`
            : `Đã chuyển ${succeededCount}/${requestedCount} task. Thất bại ${failedCount} task.`,
      });

      scheduleReload(failedCount === 0 ? SUCCESS_RELOAD_DELAY_MS : PARTIAL_RELOAD_DELAY_MS);
      return;
    }

    console.log('Monday automation failed', {
      boardId: request.boardId,
      requestedCount,
      failedCount,
      reasons: [...new Set(result.failedItems.map(item => item.reason))],
    });

    activeOverlay?.update(request, {
      state: 'failure',
      message: 'Không thể chuyển task. Vui lòng thử lại.',
    });
    activeResultAwaitingClose = true;
  } catch {
    activeOverlay?.update(request, {
      state: 'timeout',
      message: 'Không thể chuyển task. Vui lòng thử lại.',
    });
    activeResultAwaitingClose = true;
  } finally {
    if (!reloadScheduled) {
      isProcessingActiveRequest = false;
    }
  }
}

function showNextRequest(): void {
  if (activeRequest || pendingRequests.length === 0) {
    return;
  }

  activeRequest = pendingRequests.shift() ?? null;
  if (!activeRequest) {
    return;
  }

  activeOverlay = showConfirmationOverlay(activeRequest, action => {
    const handledRequest = activeRequest;
    if (!handledRequest) {
      return;
    }

    if (action === 'confirm') {
      void confirmMove(handledRequest);
      return;
    }

    if (activeResultAwaitingClose) {
      closeActiveAndShowNext();
      return;
    }

    if (!isProcessingActiveRequest) {
      logCancel(handledRequest);
      closeActiveAndShowNext();
    }
  });
}

export function enqueueConfirmationRequest(request: ConfirmationRequest): void {
  if (isDuplicate(request)) {
    return;
  }

  removeStaleItems(request);
  pendingRequests.push(request);
  showNextRequest();
}
