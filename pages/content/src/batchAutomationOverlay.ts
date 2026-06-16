import type { MondayBoardDetails } from '@extension/shared';
import type { PendingAutomationItem, PendingBoardAutomation } from './pendingAutomationTypes';

export type BatchOverlayProgress = {
  total: number;
  completed: number;
} | null;

export type BatchOverlayResult = {
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
} | null;

export type BatchOverlayModel = {
  boardId: string;
  boardName?: string;
  boardDetails?: MondayBoardDetails;
  boardAutomation: PendingBoardAutomation;
  progress: BatchOverlayProgress;
  result: BatchOverlayResult;
};

export type BatchOverlayActions = {
  onMoveAll: () => void;
  onCancelAll: () => void;
  onMapStatusGroup: (columnId: string, statusIndex: string, groupId: string) => void;
  onRetryFailed: () => void;
  onCancelFailed: () => void;
  onClose: () => void;
};

type RenderedOverlay = {
  update: (model: BatchOverlayModel) => void;
  remove: () => void;
};

let renderedOverlay: RenderedOverlay | null = null;

function createStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      color: #1b1f24;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      width: min(420px, calc(100vw - 36px));
      max-height: min(620px, calc(100vh - 36px));
      border: 1px solid #cfd8e3;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 18px 40px rgba(27, 31, 36, 0.22);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header, .footer {
      padding: 14px;
      flex: 0 0 auto;
    }

    .body {
      padding: 0 14px 14px;
      overflow: auto;
    }

    h2, h3, p {
      margin: 0;
    }

    h2 {
      font-size: 15px;
      line-height: 1.35;
    }

    h3 {
      margin: 12px 0 7px;
      font-size: 13px;
    }

    p, summary, li, label, select {
      font-size: 13px;
      line-height: 1.4;
    }

    .muted {
      color: #5e6b78;
      margin-top: 4px;
    }

    details {
      border: 1px solid #dce3ea;
      border-radius: 7px;
      background: #f9fafb;
      margin-top: 7px;
      padding: 8px;
    }

    summary {
      cursor: pointer;
      font-weight: 700;
    }

    ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    select {
      width: 100%;
      margin-top: 6px;
      border: 1px solid #c7d0da;
      border-radius: 7px;
      background: #ffffff;
      padding: 7px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    button {
      border: 1px solid #c7d0da;
      border-radius: 7px;
      background: #ffffff;
      color: #20262d;
      cursor: pointer;
      font: inherit;
      min-height: 34px;
      padding: 7px 11px;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .primary {
      border-color: #176b87;
      background: #176b87;
      color: #ffffff;
    }

    .danger {
      border-color: #d5a7a0;
      color: #8d2f22;
    }
  `;
  return style;
}

function groupItems(items: PendingAutomationItem[]): Array<{ key: string; title: string; items: PendingAutomationItem[] }> {
  const groups = new Map<string, { key: string; title: string; items: PendingAutomationItem[] }>();

  for (const item of items) {
    const key = `${item.columnId}|${item.statusIndex}|${item.statusName}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        key,
        title: item.statusName,
        items: [item],
      });
    }
  }

  return [...groups.values()].sort((left, right) => left.title.localeCompare(right.title));
}

function appendText(parent: HTMLElement, tagName: 'p' | 'h2' | 'h3', text: string, className?: string): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  parent.append(element);
  return element;
}

function renderItemGroup(parent: HTMLElement, title: string, items: PendingAutomationItem[]): void {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `${title} — ${items.length} task`;
  details.append(summary);

  const list = document.createElement('ul');
  for (const item of items) {
    const row = document.createElement('li');
    row.textContent = item.itemName;
    list.append(row);
  }
  details.append(list);
  parent.append(details);
}

function renderReadySection(parent: HTMLElement, readyItems: PendingAutomationItem[]): void {
  if (readyItems.length === 0) {
    return;
  }

  appendText(parent, 'h3', 'Sẵn sàng chuyển');
  for (const group of groupItems(readyItems)) {
    renderItemGroup(parent, group.title, group.items);
  }
}

function renderNeedsMappingSection(parent: HTMLElement, items: PendingAutomationItem[], model: BatchOverlayModel, actions: BatchOverlayActions): void {
  if (items.length === 0) {
    return;
  }

  appendText(parent, 'h3', 'Cần cấu hình');
  const groups = groupItems(items);
  const boardGroups = model.boardDetails?.groups ?? [];

  for (const group of groups) {
    const first = group.items[0];
    const wrapper = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${group.title} — ${group.items.length} task`;
    wrapper.append(summary);

    const select = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Chọn group';
    select.append(placeholder);

    for (const boardGroup of boardGroups) {
      const option = document.createElement('option');
      option.value = boardGroup.id;
      option.textContent = boardGroup.title;
      select.append(option);
    }

    select.addEventListener('change', () => {
      if (select.value) {
        actions.onMapStatusGroup(first.columnId, first.statusIndex, select.value);
      }
    });
    wrapper.append(select);

    const list = document.createElement('ul');
    for (const item of group.items) {
      const row = document.createElement('li');
      row.textContent = item.itemName;
      list.append(row);
    }
    wrapper.append(list);
    parent.append(wrapper);
  }
}

function renderFailedSection(parent: HTMLElement, failedItems: PendingAutomationItem[]): void {
  if (failedItems.length === 0) {
    return;
  }

  appendText(parent, 'h3', 'Task thất bại');
  for (const group of groupItems(failedItems)) {
    renderItemGroup(parent, group.title, group.items);
  }
}

function hasVisibleItems(model: BatchOverlayModel): boolean {
  return Object.keys(model.boardAutomation.pendingItems).length > 0 || Object.keys(model.boardAutomation.nextBatchItems).length > 0 || Boolean(model.result);
}

function render(root: ShadowRoot, model: BatchOverlayModel, actions: BatchOverlayActions): void {
  root.textContent = '';
  root.append(createStyles());

  const pendingItems = Object.values(model.boardAutomation.pendingItems);
  const nextBatchItems = Object.values(model.boardAutomation.nextBatchItems);
  const readyItems = pendingItems.filter(item => item.state === 'ready');
  const needsMappingItems = pendingItems.filter(item => item.state === 'needs_mapping');
  const failedItems = pendingItems.filter(item => item.state === 'failed');
  const isProcessing = model.boardAutomation.isProcessing;

  const panel = document.createElement('section');
  panel.className = 'panel';

  const header = document.createElement('div');
  header.className = 'header';
  appendText(header, 'h2', `Task đang chờ chuyển: ${pendingItems.length}`);
  appendText(header, 'p', model.boardName ? `Board: ${model.boardName}` : `Board: ${model.boardId}`, 'muted');

  if (model.progress) {
    appendText(header, 'p', `Đang chuyển ${model.progress.completed}/${model.progress.total} task...`, 'muted');
  } else if (isProcessing) {
    appendText(header, 'p', `Đang chuyển: ${pendingItems.length} task`, 'muted');
  }

  if (nextBatchItems.length > 0) {
    appendText(header, 'p', `Đợt tiếp theo: ${nextBatchItems.length} task`, 'muted');
  }

  if (model.result) {
    appendText(header, 'p', `Đã chuyển thành công: ${model.result.succeededCount} task. Thất bại: ${model.result.failedCount} task.`, 'muted');
  }

  panel.append(header);

  const body = document.createElement('div');
  body.className = 'body';
  renderReadySection(body, readyItems);
  renderNeedsMappingSection(body, needsMappingItems, model, actions);
  renderFailedSection(body, failedItems);
  panel.append(body);

  const footer = document.createElement('div');
  footer.className = 'footer';
  const actionRow = document.createElement('div');
  actionRow.className = 'actions';

  const moveButton = document.createElement('button');
  moveButton.className = 'primary';
  moveButton.textContent = 'Chuyển tất cả';
  moveButton.disabled = isProcessing || readyItems.length === 0;
  moveButton.addEventListener('click', actions.onMoveAll);
  actionRow.append(moveButton);

  const cancelButton = document.createElement('button');
  cancelButton.className = 'danger';
  cancelButton.textContent = 'Hủy tất cả';
  cancelButton.disabled = isProcessing || pendingItems.length === 0;
  cancelButton.addEventListener('click', actions.onCancelAll);
  actionRow.append(cancelButton);

  if (failedItems.length > 0) {
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Thử lại task lỗi';
    retryButton.disabled = isProcessing;
    retryButton.addEventListener('click', actions.onRetryFailed);
    actionRow.append(retryButton);

    const cancelFailedButton = document.createElement('button');
    cancelFailedButton.textContent = 'Hủy task lỗi';
    cancelFailedButton.disabled = isProcessing;
    cancelFailedButton.addEventListener('click', actions.onCancelFailed);
    actionRow.append(cancelFailedButton);
  }

  if (!isProcessing && pendingItems.length === 0 && nextBatchItems.length === 0 && model.result) {
    const closeButton = document.createElement('button');
    closeButton.className = 'primary';
    closeButton.textContent = 'Đóng';
    closeButton.addEventListener('click', actions.onClose);
    actionRow.append(closeButton);
  }

  footer.append(actionRow);
  panel.append(footer);
  root.append(panel);
}

export function showBatchAutomationOverlay(model: BatchOverlayModel, actions: BatchOverlayActions): RenderedOverlay {
  if (renderedOverlay) {
    renderedOverlay.update(model);
    return renderedOverlay;
  }

  const host = document.createElement('div');
  host.setAttribute('data-monday-board-assistant-batch', 'true');
  const root = host.attachShadow({ mode: 'open' });
  const overlay: RenderedOverlay = {
    update(nextModel) {
      render(root, nextModel, actions);
    },
    remove() {
      host.remove();
      if (renderedOverlay === overlay) {
        renderedOverlay = null;
      }
    },
  };

  document.documentElement.append(host);
  renderedOverlay = overlay;
  overlay.update(model);
  return overlay;
}

export function shouldShowBatchAutomationOverlay(model: BatchOverlayModel): boolean {
  return hasVisibleItems(model);
}
