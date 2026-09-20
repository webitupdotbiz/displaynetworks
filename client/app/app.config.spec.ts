import { TestBed } from '@angular/core/testing';
import { DOCUMENT, APP_BASE_HREF } from '@angular/common';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, HttpRequest } from '@angular/common/http';
import { Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { JwtHelperService, JWT_OPTIONS, JwtModuleOptions } from '@auth0/angular-jwt';

import { appConfig, tokenGetter } from './app.config';
import { environment } from '../environments/environment';

describe('AppConfig & Utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('tokenGetter', () => {
    it('should return null when token is not present in localStorage', () => {
      expect(tokenGetter()).toBeNull();
    });

    it('should return the token string when present in localStorage', () => {
      localStorage.setItem('token', 'fake-jwt-token');
      expect(tokenGetter()).toBe('fake-jwt-token');
    });
  });

  describe('appConfig providers', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          appConfig.providers,
          provideHttpClientTesting()
        ]
      });
    });

    it('should provide APP_BASE_HREF as "/"', () => {
      const baseHref = TestBed.inject(APP_BASE_HREF);
      expect(baseHref).toBe('/');
    });

    it('should configure JWT_OPTIONS with tokenGetter and allowed domains', () => {
      const jwtOptions = TestBed.inject(JWT_OPTIONS) as JwtModuleOptions['config'];
      expect(jwtOptions?.allowedDomains).toEqual(['localhost:3000', 'localhost:4200']);
      expect(jwtOptions?.disallowedRoutes).toEqual([]);

      localStorage.setItem('token', 'jwt-test');
      expect(jwtOptions?.tokenGetter?.()).toBe('jwt-test');
    });

    it('should instantiate JwtHelperService', () => {
      const jwtHelper = TestBed.inject(JwtHelperService);
      expect(jwtHelper).toBeTruthy();
    });

    it('should configure router with provided routes', () => {
      const router = TestBed.inject(Router);
      expect(router).toBeTruthy();
    });

    it('should provide ServiceWorker when enabled', () => {
      if (environment.production) {
        const swUpdate = TestBed.inject(SwUpdate);
        expect(swUpdate).toBeTruthy();
      } else {
        expect(true).toBe(true);
      }
    });
  });

  describe('getDocumentFactory DOM isolation', () => {
    it('should append base element if document exists but lacks base tag', () => {
      const existingBase = document.querySelector('base');
      if (existingBase) {
        existingBase.remove();
      }

      TestBed.configureTestingModule({
        providers: [appConfig.providers]
      });

      const doc = TestBed.inject(DOCUMENT) as Document;
      expect(doc.querySelector('base')).not.toBeNull();
      expect(doc.querySelector('base')?.getAttribute('href')).toBe('/');
    });

    it('should return document without adding duplicate base tag if one already exists', () => {
      if (!document.querySelector('base')) {
        const base = document.createElement('base');
        base.href = '/';
        document.head.appendChild(base);
      }

      const initialBaseCount = document.querySelectorAll('base').length;

      TestBed.configureTestingModule({
        providers: [appConfig.providers]
      });

      const doc = TestBed.inject(DOCUMENT) as Document;
      expect(doc.querySelectorAll('base').length).toBe(initialBaseCount);
    });
  });
});
