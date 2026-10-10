export function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
  type: new () => T
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type))
    throw new Error(`Required page control is unavailable: ${selector}`);
  return element;
}

export function listenAsync<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  status: HTMLElement,
  listener: (event: HTMLElementEventMap[K]) => Promise<void>
): void {
  const guarded = (event: Event) =>
    listener(event as HTMLElementEventMap[K]).catch(() => {
      status.textContent = "The local action could not be completed. Please try again.";
    });
  // DOM dispatch ignores returned promises. Retain the promise for observers,
  // while ensuring even an unexpected handler rejection reaches local feedback.
  target.addEventListener(type, guarded as EventListener);
}
