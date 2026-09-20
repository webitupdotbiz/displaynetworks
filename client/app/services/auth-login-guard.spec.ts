import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authLoginGuard } from './auth-login.guard';
import { AuthService } from './auth.service';

describe('authLoginGuard', () => {
  let authServiceMock: jest.Mocked<Partial<AuthService>>;
  let routerMock: jest.Mocked<Partial<Router>>;

  beforeEach(() => {
    authServiceMock = {
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

  it('should redirect to /_login if not logged in', () => {
    authServiceMock.loggedIn = false;

    const result = TestBed.runInInjectionContext(() => authLoginGuard({} as any, {} as any));

    expect(routerMock.parseUrl).toHaveBeenCalledWith('/_login');
    expect((result as UrlTree).toString()).toBe('/_login');
  });

  it('should allow access if logged in', () => {
    authServiceMock.loggedIn = true;

    const result = TestBed.runInInjectionContext(() => authLoginGuard({} as any, {} as any));

    expect(result).toBe(true);
  });
});
