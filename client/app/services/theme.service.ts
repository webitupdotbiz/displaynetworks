import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly storageKey = 'theme';
  private theme: 'light' | 'dark' = 'light';

  constructor() {
    const savedTheme = this.getStoredTheme();
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    this.theme = savedTheme ?? sys;
    this.applyTheme();
  }

  toggleTheme(): void {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    this.applyTheme();
    localStorage.setItem(this.storageKey, this.theme);
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-bs-theme', this.theme);
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.theme === 'dark' ? '#0d0f12' : '#FFFFFF');
  }

  private getStoredTheme(): 'light' | 'dark' | null {
    const value = localStorage.getItem(this.storageKey);
    return value === 'light' || value === 'dark' ? value : null;
  }

  get currentTheme(): 'light' | 'dark' {
    return this.theme;
  }
}
