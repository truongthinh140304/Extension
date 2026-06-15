export type ConfirmationRequest = {
  id: string;
  boardId: string;
  itemIds: string[];
  columnId: string;
  statusIndex: string;
  statusName: string;
  targetGroupId?: string;
  targetGroupTitle?: string;
  message?: string;
};

export type ConfirmationOverlayAction = 'confirm' | 'cancel';

export type ConfirmationOverlayView =
  | {
      state: 'idle';
    }
  | {
      state: 'processing';
    }
  | {
      state: 'success' | 'partial' | 'failure' | 'timeout';
      message: string;
    };

type RenderedOverlay = {
  host: HTMLDivElement;
  update: (request: ConfirmationRequest, view?: ConfirmationOverlayView) => void;
  remove: () => void;
};

let renderedOverlay: RenderedOverlay | null = null;

function taskCountText(count: number, statusName: string): string {
  return count === 1 ? `1 task vừa đổi Status thành ${statusName}.` : `${count} task vừa đổi Status thành ${statusName}.`;
}

function processingText(count: number): string {
  return count === 1 ? 'Đang chuyển 1 task...' : `Đang chuyển ${count} task...`;
}

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
      width: min(340px, calc(100vw - 36px));
      border: 1px solid #cfd8e3;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 18px 40px rgba(27, 31, 36, 0.22);
      padding: 14px;
      box-sizing: border-box;
    }

    h2 {
      margin: 0 0 8px;
      color: #1b1f24;
      font-size: 15px;
      line-height: 1.3;
    }

    p {
      margin: 5px 0;
      color: #394653;
      font-size: 13px;
      line-height: 1.4;
    }

    .message {
      margin-top: 8px;
      color: #6a3d00;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
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
      opacity: 0.6;
    }

    .primary {
      border-color: #176b87;
      background: #176b87;
      color: #ffffff;
    }
  `;
  return style;
}

function appendMessage(panel: HTMLElement, text: string): void {
  const message = document.createElement('p');
  message.className = 'message';
  message.textContent = text;
  panel.append(message);
}

function renderContent(root: ShadowRoot, request: ConfirmationRequest, view: ConfirmationOverlayView, onAction: (action: ConfirmationOverlayAction) => void): void {
  const canConfirm = Boolean(request.targetGroupId && request.targetGroupTitle);
  root.textContent = '';
  root.append(createStyles());

  const panel = document.createElement('section');
  panel.className = 'panel';

  const title = document.createElement('h2');
  title.textContent = taskCountText(request.itemIds.length, request.statusName);
  panel.append(title);

  if (view.state === 'processing') {
    appendMessage(panel, processingText(request.itemIds.length));
  } else if (view.state !== 'idle') {
    appendMessage(panel, view.message);
  } else if (canConfirm) {
    const statusLine = document.createElement('p');
    statusLine.textContent = `Status vừa đổi: ${request.statusName}`;
    panel.append(statusLine);

    const groupLine = document.createElement('p');
    groupLine.textContent = `Group đích: ${request.targetGroupTitle}`;
    panel.append(groupLine);

    const countLine = document.createElement('p');
    countLine.textContent = `Số task: ${request.itemIds.length}`;
    panel.append(countLine);
  } else if (request.message) {
    appendMessage(panel, request.message);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';

  if (view.state === 'processing') {
    const confirmButton = document.createElement('button');
    confirmButton.className = 'primary';
    confirmButton.textContent = 'Chuyển';
    confirmButton.disabled = true;
    actions.append(confirmButton);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Hủy';
    cancelButton.disabled = true;
    actions.append(cancelButton);
  } else if (view.state === 'failure' || view.state === 'timeout') {
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Đóng';
    closeButton.addEventListener('click', () => onAction('cancel'));
    actions.append(closeButton);
  } else if (view.state === 'idle') {
    if (canConfirm) {
      const confirmButton = document.createElement('button');
      confirmButton.className = 'primary';
      confirmButton.textContent = 'Chuyển';
      confirmButton.addEventListener('click', () => onAction('confirm'));
      actions.append(confirmButton);
    }

    const cancelButton = document.createElement('button');
    cancelButton.textContent = canConfirm ? 'Hủy' : 'Đóng';
    cancelButton.addEventListener('click', () => onAction('cancel'));
    actions.append(cancelButton);
  }

  panel.append(actions);
  root.append(panel);
}

export function showConfirmationOverlay(request: ConfirmationRequest, onAction: (action: ConfirmationOverlayAction) => void): RenderedOverlay {
  if (renderedOverlay) {
    renderedOverlay.update(request);
    return renderedOverlay;
  }

  const host = document.createElement('div');
  host.setAttribute('data-monday-board-assistant-confirmation', 'true');
  const root = host.attachShadow({ mode: 'open' });

  const overlay: RenderedOverlay = {
    host,
    update(nextRequest, view = { state: 'idle' }) {
      renderContent(root, nextRequest, view, onAction);
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
  overlay.update(request);
  return overlay;
}
