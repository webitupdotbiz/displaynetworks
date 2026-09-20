// client/app/services/auth-landing-guard.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authLandingGuard } from './auth-landing-guard';
import { AuthService } from './auth.service';

describe('authLandingGuard', () => {
  let authServiceMock: jest.Mocked<Partial<AuthService>>;
  let routerMock: jest.Mocked<Partial<Router>>;

  beforeEach(() => {
    authServiceMock = {
      isAdmin: false,
      loggedIn: false
    };

    routerMock = {
      parseUrl: jest.fn((url: string) => ({ toString: () => url } as unknown as UrlTree))
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    });
  });

  it('should redirect to /_admin if user is admin', () => {
    authServiceMock.isAdmin = true;

    const result = TestBed.runInInjectionContext(() => authLandingGuard({} as any, {} as any));

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/_admin');
    expect((result as UrlTree).toString()).toBe('/_admin');
  });

  it('should redirect to /_channels if user is logged in but not admin', () => {
    authServiceMock.isAdmin = false;
    authServiceMock.loggedIn = true;

    const result = TestBed.runInInjectionContext(() => authLandingGuard({} as any, {} as any));

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/_channels');
    expect((result as UrlTree).toString()).toBe('/_channels');
  });

  it('should redirect to /_login if user is not logged in', () => {
    authServiceMock.isAdmin = false;
    authServiceMock.loggedIn = false;

    const result = TestBed.runInInjectionContext(() => authLandingGuard({} as any, {} as any));

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/_login');
    expect((result as UrlTree).toString()).toBe('/_login');
  });
});
