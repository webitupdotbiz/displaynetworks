import { Injectable } from '@angular/core';
import { LocationChangeListener, LocationStrategy } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class StaticPathLocationStrategy extends LocationStrategy {
  private readonly baseHref: string = '/';

  override path(includeHash: boolean = false): string {
    const pathname: string = window.location.pathname;
    const search: string = window.location.search;
    const hash: string = window.location.hash;
    return `${pathname}${search}${includeHash ? hash : ''}`;
  }

  override prepareExternalUrl(internal: string): string {
    if (internal.startsWith('/')) {
      return internal;
    }
    return `${this.baseHref}${internal}`;
  }

  override pushState(state: unknown, title: string, url: string, queryParams: string): void {
    const externalUrl: string = this.prepareExternalUrl(url + (queryParams ? `?${queryParams}` : ''));
    window.history.pushState(state, title, externalUrl);
  }

  override replaceState(state: unknown, title: string, url: string, queryParams: string): void {
    const externalUrl: string = this.prepareExternalUrl(url + (queryParams ? `?${queryParams}` : ''));
    window.history.replaceState(state, title, externalUrl);
  }

  override forward(): void {
    window.history.forward();
  }

  override back(): void {
    window.history.back();
  }

  override onPopState(fn: LocationChangeListener): void {
    window.addEventListener('popstate', (e: PopStateEvent) => fn({ type: e.type, state: e.state }));
  }

  override getBaseHref(): string {
    return this.baseHref;
  }

  override getState(): unknown {
    return window.history.state;
  }
}
