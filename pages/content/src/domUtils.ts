const INVISIBLE_STYLE_SELECTOR = 'script, style, noscript, svg';
const HIDDEN_ELEMENT_SELECTOR = '[hidden], [aria-hidden="true"], [inert]';

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function uniqueTexts(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = normalizeText(value);
    const key = text.toLocaleLowerCase();

    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);
  }

  return result;
}

function isTextNodeVisible(node: Node): boolean {
  const parent = node.parentElement;

  if (!parent || parent.closest(`${INVISIBLE_STYLE_SELECTOR}, ${HIDDEN_ELEMENT_SELECTOR}`)) {
    return false;
  }

  let current: Element | null = parent;
  while (current) {
    const style = window.getComputedStyle(current);

    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    current = current.parentElement;
  }

  return true;
}

export function getVisibleText(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  let node = walker.nextNode();

  while (node) {
    if (isTextNodeVisible(node)) {
      texts.push(node.textContent ?? '');
    }

    node = walker.nextNode();
  }

  return normalizeText(texts.join(' '));
}

export function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const rect = htmlElement.getBoundingClientRect();
  const style = window.getComputedStyle(htmlElement);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    !htmlElement.closest(HIDDEN_ELEMENT_SELECTOR) &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    style.opacity !== '0'
  );
}

export function queryVisible(selector: string, root: ParentNode = document): Element[] {
  return Array.from(root.querySelectorAll(selector)).filter(isVisible);
}

export function firstText(selectors: string[], root: ParentNode = document): string | undefined {
  for (const selector of selectors) {
    const element = queryVisible(selector, root)[0];
    const text = element ? getVisibleText(element) : '';

    if (text) {
      return text;
    }
  }

  return undefined;
}

export function extractIdFromElement(element: Element): string | undefined {
  const directId =
    element.getAttribute('data-item-id') ??
    element.getAttribute('data-pulse-id') ??
    element.getAttribute('data-id') ??
    undefined;

  if (directId) {
    return directId;
  }

  const link = element.matches('a[href]') ? element : element.querySelector('a[href*="/pulses/"], a[href*="/items/"]');
  const href = link?.getAttribute('href') ?? '';
  const match = href.match(/(?:pulses|items)\/(\d+)/i) ?? href.match(/[?&](?:pulseId|itemId)=(\d+)/i);

  return match?.[1];
}

export function compactRawText(text: string, maxLength = 240): string {
  const normalized = normalizeText(text);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}
