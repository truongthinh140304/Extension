const INVISIBLE_STYLE_SELECTOR = 'script, style, noscript, svg';

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

export function getVisibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(INVISIBLE_STYLE_SELECTOR).forEach(node => node.remove());
  return normalizeText(clone.textContent);
}

export function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const rect = htmlElement.getBoundingClientRect();
  const style = window.getComputedStyle(htmlElement);

  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
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
