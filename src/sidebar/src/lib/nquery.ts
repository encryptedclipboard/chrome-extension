import type { NQuery } from "../types/nquery.type";

function nQuery(selector: string | HTMLElement | Document): NQuery {
  let element: HTMLElement | Document | null;

  if (typeof selector === "string") {
    element = document.querySelector<HTMLElement>(selector);
  } else if (selector instanceof HTMLElement || selector instanceof Document) {
    element = selector;
  } else {
    element = null;
  }

  const inner = {} as NQuery;

  inner.on = (
    event: string,
    handler: EventListenerOrEventListenerObject,
  ): NQuery => {
    if (element) {
      element.addEventListener(event, handler);
    }

    return inner;
  };

  inner.off = (event: string, handler: EventListenerOrEventListenerObject) => {
    if (element) {
      element.removeEventListener(event, handler);
    }

    return inner;
  };

  inner.get = () => element;

  inner.attr = (name: string | Record<string, string>, value?: string) => {
    if (!element || !(element instanceof HTMLElement)) return null;

    if (typeof name === "string") {
      if (value === undefined) {
        return element.getAttribute(name);
      } else {
        element.setAttribute(name, value);
        return inner;
      }
    } else {
      Object.entries(name).forEach(([key, val]) => {
        if (element instanceof HTMLElement) {
          element.setAttribute(key, val);
        }
      });
      return inner;
    }
  };

  inner.css = (key: string | Partial<CSSStyleDeclaration>, value?: string) => {
    if (!element || !(element instanceof HTMLElement)) return null;

    if (typeof key === "string") {
      if (value === undefined) {
        return element.style[key as any];
      } else {
        if (value !== undefined) {
          element.style[key as any] = value;
        }
        return inner;
      }
    } else if (typeof key === "object") {
      Object.entries(key).forEach(([k, v]) => {
        if (element instanceof HTMLElement) {
          (element.style as any)[k] = v;
        }
      });
    }

    return inner;
  };

  return inner;
}

export const Q = nQuery;

export default nQuery;
