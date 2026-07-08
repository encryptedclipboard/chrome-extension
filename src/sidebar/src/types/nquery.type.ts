export interface NQuery {
  on(event: string, handler: EventListenerOrEventListenerObject): NQuery;
  off(event: string, handler: EventListenerOrEventListenerObject): NQuery;
  get(): HTMLElement | Document | null;
  attr(
    name: string | Record<string, string>,
    value?: string,
  ): string | NQuery | null;
  css(
    styles: Partial<CSSStyleDeclaration> | string,
    value?: string,
  ): string | NQuery | null;
}
