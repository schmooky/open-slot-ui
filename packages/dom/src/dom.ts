/** Tiny DOM helpers — enough to bind a tree without pulling in a framework. */

export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, id: string): T | null =>
  root.querySelector<T>(`#${CSS.escape(id)}`);

/** Add a listener and get its remover back, so every binding is disposable. */
export function on<K extends keyof HTMLElementEventMap>(
  el: EventTarget | null,
  type: K | string,
  fn: (e: Event) => void,
  opts?: AddEventListenerOptions,
): () => void {
  if (!el) return () => {};
  el.addEventListener(type, fn as EventListener, opts);
  return () => el.removeEventListener(type, fn as EventListener, opts);
}

/** Set `text` only when it actually changed (avoids layout churn every frame). */
export function text(el: HTMLElement | null, value: string): void {
  if (el && el.textContent !== value) el.textContent = value;
}

export function toggleClass(el: Element | null, cls: string, on: boolean): void {
  if (el) el.classList.toggle(cls, on);
}

/** The reference marks visibility with `.is-visible`, and disables with `.is-disabled`. */
export function setVisible(el: Element | null, on: boolean): void {
  toggleClass(el, 'is-visible', on);
}

export function setDisabled(el: Element | null, on: boolean): void {
  toggleClass(el, 'is-disabled', on);
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) el.disabled = on;
}

/** Swap an `icon-*` class (the markup keys its glyphs off the class name). */
export function setIcon(el: Element | null, icon: string): void {
  if (!el) return;
  for (const c of Array.from(el.classList)) if (c.startsWith('icon-')) el.classList.remove(c);
  el.classList.add(icon);
}

export function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}
