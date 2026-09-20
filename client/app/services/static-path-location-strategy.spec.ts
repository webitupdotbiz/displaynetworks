import { TestBed } from '@angular/core/testing';
import { StaticPathLocationStrategy } from './static-path-location-strategy';

describe('StaticPathLocationStrategy', () => {
  let strategy: StaticPathLocationStrategy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StaticPathLocationStrategy]
    });

    strategy = TestBed.inject(StaticPathLocationStrategy);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be created', () => {
    expect(strategy).toBeTruthy();
  });

  it('should return baseHref', () => {
    expect(strategy.getBaseHref()).toBe('/');
  });

  it('should construct path without hash by default', () => {
    window.history.pushState({}, '', '/dashboard?id=1#section');

    expect(strategy.path()).toBe('/dashboard?id=1');
  });

  it('should construct path with hash when includeHash is true', () => {
    window.history.pushState({}, '', '/dashboard?id=1#section');

    expect(strategy.path(true)).toBe('/dashboard?id=1#section');
  });

  it('should handle prepareExternalUrl with absolute path', () => {
    expect(strategy.prepareExternalUrl('/profile')).toBe('/profile');
  });

  it('should handle prepareExternalUrl with relative path', () => {
    expect(strategy.prepareExternalUrl('profile')).toBe('/profile');
  });

  it('should push state with external url and query parameters', () => {
    const spy = jest.spyOn(window.history, 'pushState').mockImplementation();

    strategy.pushState({ page: 1 }, 'Title', 'details', 'ref=123');

    expect(spy).toHaveBeenCalledWith({ page: 1 }, 'Title', '/details?ref=123');
  });

  it('should push state with external url without query parameters', () => {
    const spy = jest.spyOn(window.history, 'pushState').mockImplementation();

    strategy.pushState({ page: 1 }, 'Title', '/details', '');

    expect(spy).toHaveBeenCalledWith({ page: 1 }, 'Title', '/details');
  });

  it('should replace state with external url and query parameters', () => {
    const spy = jest.spyOn(window.history, 'replaceState').mockImplementation();

    strategy.replaceState({ page: 1 }, 'Title', 'details', 'ref=123');

    expect(spy).toHaveBeenCalledWith({ page: 1 }, 'Title', '/details?ref=123');
  });

  it('should forward window history', () => {
    const spy = jest.spyOn(window.history, 'forward').mockImplementation();

    strategy.forward();

    expect(spy).toHaveBeenCalled();
  });

  it('should navigate back in window history', () => {
    const spy = jest.spyOn(window.history, 'back').mockImplementation();

    strategy.back();

    expect(spy).toHaveBeenCalled();
  });

  it('should get history state', () => {
    const mockState = { id: 99 };
    Object.defineProperty(window.history, 'state', {
      value: mockState,
      configurable: true
    });

    expect(strategy.getState()).toBe(mockState);
  });

  it('should attach listener on popstate', () => {
    const callback = jest.fn();
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'popstate') {
        (listener as EventListener)({ type: 'popstate', state: { key: 'val' } } as unknown as PopStateEvent);
      }
    });

    strategy.onPopState(callback);

    expect(addEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
    expect(callback).toHaveBeenCalledWith({ type: 'popstate', state: { key: 'val' } });
  });
});
