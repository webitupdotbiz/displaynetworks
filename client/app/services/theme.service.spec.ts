import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let store: Record<string, string>;
  let matchMediaResult: boolean;
  let metaThemeColor: HTMLMetaElement;

  beforeEach(() => {
    store = {};
    matchMediaResult = false;
    document.head.innerHTML = '';
    metaThemeColor = document.createElement('meta');
    metaThemeColor.setAttribute('name', 'theme-color');
    metaThemeColor.setAttribute('content', '#FFFFFF');
    document.head.appendChild(metaThemeColor);

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store[key] || null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      store[key] = value;
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: matchMediaResult,
        media: query
      }))
    });

    jest.spyOn(document.documentElement, 'setAttribute');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize with light theme by default if no localStorage context or system query match exists', () => {
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);

    expect(service.currentTheme).toBe('light');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bs-theme', 'light');
    expect(metaThemeColor.getAttribute('content')).toBe('#FFFFFF');
  });

  it('should initialize with dark theme if media query verification signals dark user preference', () => {
    matchMediaResult = true;
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);

    expect(service.currentTheme).toBe('dark');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bs-theme', 'dark');
    expect(metaThemeColor.getAttribute('content')).toBe('#0d0f12');
  });

  it('should prioritize stored configurations inside local cache boundaries during constructor phases', () => {
    store['theme'] = 'dark';
    matchMediaResult = false; // System preference contradicts storage
    
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);

    expect(service.currentTheme).toBe('dark');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bs-theme', 'dark');
  });

  it('should ignore invalid localStorage values and use system preference', () => {
    store['theme'] = 'system';
    matchMediaResult = true;

    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);

    expect(service.currentTheme).toBe('dark');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bs-theme', 'dark');
  });

  it('should toggle layout modes sequentially and keep storage records valid', () => {
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);
    expect(service.currentTheme).toBe('light');

    service.toggleTheme();
    expect(service.currentTheme).toBe('dark');
    expect(store['theme']).toBe('dark');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bs-theme', 'dark');
    expect(metaThemeColor.getAttribute('content')).toBe('#0d0f12');

    service.toggleTheme();
    expect(service.currentTheme).toBe('light');
    expect(store['theme']).toBe('light');
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-bs-theme', 'light');
    expect(metaThemeColor.getAttribute('content')).toBe('#FFFFFF');
  });
});
