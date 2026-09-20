import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { APP_BASE_HREF, DOCUMENT } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { JwtHelperService, JWT_OPTIONS, JwtModuleOptions } from '@auth0/angular-jwt';

import { authInterceptor } from './services/auth.interceptor';
import { routes } from './routing.module';
import { environment } from '../environments/environment';

export function tokenGetter(): string | null {
  return localStorage.getItem('token');
}

function getDocumentFactory(): unknown {
  if (typeof document !== 'undefined' && document) {
    if (!document.querySelector('base')) {
      const baseEl = document.createElement('base');
      baseEl.href = '/';
      document.head?.appendChild(baseEl);
    }
    return document;
  }
  return {
    querySelector: (selector: string) => {
      if (selector === 'base') return { getAttribute: () => '/' };
      return null;
    },
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => {} }),
    head: { appendChild: () => {} }
  };
}

const jwtConfig: JwtModuleOptions['config'] = {
  tokenGetter,
  allowedDomains: ['localhost:3000', 'localhost:4200'],
  disallowedRoutes: []
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled'
    })),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: DOCUMENT, useFactory: getDocumentFactory },
    { provide: APP_BASE_HREF, useValue: '/' },
    provideServiceWorker('ngsw-worker.js', { enabled: environment.production }),
    {
      provide: JWT_OPTIONS,
      useValue: jwtConfig
    },
    JwtHelperService
  ]
};
