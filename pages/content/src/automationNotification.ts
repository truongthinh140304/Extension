import type { MondayBoardDetails } from '@extension/shared';
import type { PendingAutomationItem } from './pendingAutomationTypes';

type NotificationAction = {
  label: string;
  variant?: 'primary' | 'danger';
  onClick: () => void;
};

type Toast = {
  key: string;
  title: string;
  message?: string;
  persistent?: boolean;
  actions?: NotificationAction[];
  renderBody?: (parent: HTMLElement) => void;
};

type MappingToastInput = {
  key: string;
  title: string;
  statusName: string;
  boardDetails: MondayBoardDetails;
  items: PendingAutomationItem[];
  onApply: (groupId: string) => void;
  onDismiss?: () => void;
};

type FailedToastInput = {
  key: string;
  title: string;
  message?: string;
  onRetry: () => void;
  onDismiss: () => void;
};

type RenderedHost = {
  host: HTMLDivElement;
  root: ShadowRoot;
};

const toasts = new Map<string, Toast>();
let renderedHost: RenderedHost | null = null;

function ensureHost(): RenderedHost {
  if (renderedHost) {
    return renderedHost;
  }

  const host = document.createElement('div');
  host.setAttribute('data-monday-board-assistant-notifications', 'true');
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.append(host);
  renderedHost = { host, root };
  return renderedHost;
}

function createStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      color: #1b1f24;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .stack {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      display: flex;
      width: min(340px, calc(100vw - 32px));
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }

    .toast {
      border: 1px solid #cfd8e3;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 12px 28px rgba(27, 31, 36, 0.18);
      box-sizing: border-box;
      padding: 11px;
      pointer-events: auto;
    }

    h2, p {
      margin: 0;
    }

    h2 {
      font-size: 13px;
      line-height: 1.35;
    }

    p, label, select, li {
      font-size: 12px;
      line-height: 1.4;
    }

    .message {
      color: #5e6b78;
      margin-top: 4px;
    }

    .body {
      margin-top: 8px;
    }

    select {
      width: 100%;
      margin-top: 5px;
      border: 1px solid #c7d0da;
      border-radius: 7px;
      background: #ffffff;
      color: #20262d;
      padding: 7px;
    }

    ul {
      margin: 7px 0 0;
      max-height: 86px;
      overflow: auto;
      padding-left: 17px;
    }

    .actions {
      display: flex;
      gap: 7px;
      justify-content: flex-end;
      margin-top: 9px;
      flex-wrap: wrap;
    }

    button {
      border: 1px solid #c7d0da;
      border-radius: 7px;
      background: #ffffff;
      color: #20262d;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      min-height: 30px;
      padding: 5px 9px;
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

function removeToast(key: string): void {
  toasts.delete(key);
  render();
}

function render(): void {
  if (toasts.size === 0) {
    renderedHost?.host.remove();
    renderedHost = null;
    return;
  }

  const { root } = ensureHost();
  root.textContent = '';
  root.append(createStyles());

  const stack = document.createElement('section');
  stack.className = 'stack';

  for (const toast of toasts.values()) {
    const item = document.createElement('article');
    item.className = 'toast';

    const title = document.createElement('h2');
    title.textContent = toast.title;
    item.append(title);

    if (toast.message) {
      const message = document.createElement('p');
      message.className = 'message';
      message.textContent = toast.message;
      item.append(message);
    }

    if (toast.renderBody) {
      const body = document.createElement('div');
      body.className = 'body';
      toast.renderBody(body);
      item.append(body);
    }

    if (toast.actions?.length) {
      const actions = document.createElement('div');
      actions.className = 'actions';

      for (const action of toast.actions) {
        const button = document.createElement('button');
        if (action.variant) {
          button.className = action.variant;
        }
        button.textContent = action.label;
        button.addEventListener('click', action.onClick);
        actions.append(button);
      }

      item.append(actions);
    }

    stack.append(item);
  }

  root.append(stack);
}

export function dismissAutomationNotification(key: string): void {
  removeToast(key);
}

export function showAutomationNotification(toast: Toast): void {
  toasts.set(toast.key, toast);
  render();

  if (!toast.persistent) {
    window.setTimeout(() => {
      if (toasts.get(toast.key) === toast) {
        removeToast(toast.key);
      }
    }, 4_500);
  }
}

export function showMappingNotification(input: MappingToastInput): void {
  let selectedGroupId = input.boardDetails.groups[0]?.id ?? '';

  showAutomationNotification({
    key: input.key,
    title: input.title,
    message: `Status: ${input.statusName}`,
    persistent: true,
    renderBody(parent) {
      const label = document.createElement('label');
      label.textContent = 'Group đích';
      const select = document.createElement('select');

      for (const group of input.boardDetails.groups) {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.title;
        select.append(option);
      }

      select.value = selectedGroupId;
      select.addEventListener('change', () => {
        selectedGroupId = select.value;
      });
      label.append(select);
      parent.append(label);

      const list = document.createElement('ul');
      for (const item of input.items.slice(0, 6)) {
        const row = document.createElement('li');
        row.textContent = item.itemName;
        list.append(row);
      }
      parent.append(list);
    },
    actions: [
      {
        label: 'Áp dụng',
        variant: 'primary',
        onClick: () => {
          if (selectedGroupId) {
            removeToast(input.key);
            input.onApply(selectedGroupId);
          }
        },
      },
      {
        label: 'Bỏ qua',
        onClick: () => {
          removeToast(input.key);
          input.onDismiss?.();
        },
      },
    ],
  });
}

export function showFailedNotification(input: FailedToastInput): void {
  showAutomationNotification({
    key: input.key,
    title: input.title,
    message: input.message,
    persistent: true,
    actions: [
      {
        label: 'Thử lại',
        variant: 'primary',
        onClick: input.onRetry,
      },
      {
        label: 'Bỏ qua',
        variant: 'danger',
        onClick: () => {
          removeToast(input.key);
          input.onDismiss();
        },
      },
    ],
  });
}
