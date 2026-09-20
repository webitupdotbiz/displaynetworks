import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authAdminGuard } from './auth-admin.guard';
import { AuthService } from './auth.service';

describe('authAdminGuard', () => {
  let authServiceMock: jest.Mocked<Partial<AuthService>>;
  let routerMock: jest.Mocked<Partial<Router>>;

  beforeEach(() => {
    authServiceMock = {
      loggedIn: false,
      isAdmin: false,
      isGroupAdmin: false
    };

    routerMock = {
      parseUrl: jest.fn((url: string) => ({
        toString: () => url
      } as unknown as UrlTree))
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    });
  });

  it('should redirect to /_login if user is not logged in', () => {
    authServiceMock.loggedIn = false;

    const result = TestBed.runInInjectionContext(() => authAdminGuard({} as any, {} as any));

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/_login');
    expect((result as UrlTree).toString()).toBe('/_login');
  });

  it('should redirect to /_channels if user is logged in but neither admin nor group admin', () => {
    authServiceMock.loggedIn = true;
    authServiceMock.isAdmin = false;
    authServiceMock.isGroupAdmin = false;

    const result = TestBed.runInInjectionContext(() => authAdminGuard({} as any, {} as any));

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/_channels');
    expect((result as UrlTree).toString()).toBe('/_channels');
  });

  it('should allow access if user is logged in and an admin', () => {
    authServiceMock.loggedIn = true;
    authServiceMock.isAdmin = true;
    authServiceMock.isGroupAdmin = false;

    const result = TestBed.runInInjectionContext(() => authAdminGuard({} as any, {} as any));

    expect(result).toBe(true);
  });

  it('should allow access if user is logged in and a group admin', () => {
    authServiceMock.loggedIn = true;
    authServiceMock.isAdmin = false;
    authServiceMock.isGroupAdmin = true;

    const result = TestBed.runInInjectionContext(() => authAdminGuard({} as any, {} as any));

    expect(result).toBe(true);
  });
});
