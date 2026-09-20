import { TestBed } from '@angular/core/testing';
import { HttpHandlerFn, HttpRequest, HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let authServiceMock: jest.Mocked<Partial<AuthService>>;
  let routerMock: jest.Mocked<Partial<Router>>;
  let nextMock: jest.Mock;
  let localStorageStore: Record<string, string>;

  beforeEach(() => {
    localStorageStore = {};

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => localStorageStore[key] || null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      localStorageStore[key] = value;
    });

    authServiceMock = {
      shouldRefreshAccessToken: jest.fn(),
      refreshAccessToken: jest.fn(),
      logout: jest.fn()
    };

    routerMock = {
      navigate: jest.fn().mockResolvedValue(true)
    };

    nextMock = jest.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const runInterceptor = (req: HttpRequest<unknown>): ReturnType<typeof authInterceptor> => {
    return TestBed.runInInjectionContext(() => authInterceptor(req, nextMock as HttpHandlerFn));
  };

  it('should pass request through without x-access-token header if no token in local storage', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    nextMock.mockReturnValue(of({} as HttpEvent<unknown>));

    runInterceptor(req).subscribe(() => {
      expect(nextMock).toHaveBeenCalledWith(req);
      done();
    });
  });

  it('should attach x-access-token header to request when token exists in local storage', (done) => {
    localStorageStore['token'] = 'valid-token';
    const req = new HttpRequest('GET', '/api/test');
    nextMock.mockReturnValue(of({} as HttpEvent<unknown>));

    runInterceptor(req).subscribe(() => {
      const clonedReq = nextMock.mock.calls[0][0] as HttpRequest<unknown>;
      expect(clonedReq.headers.get('x-access-token')).toBe('valid-token');
      done();
    });
  });

  it('should pass through non-401 HTTP errors directly', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    const errorResponse = new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error' });
    nextMock.mockReturnValue(throwError(() => errorResponse));

    runInterceptor(req).subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(500);
        expect(authServiceMock.shouldRefreshAccessToken).not.toHaveBeenCalled();
        done();
      }
    });
  });

  it('should handle auth failure and navigate to login when shouldRefreshAccessToken returns false', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    const errorResponse = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });
    nextMock.mockReturnValue(throwError(() => errorResponse));
    authServiceMock.shouldRefreshAccessToken = jest.fn().mockReturnValue(false);

    runInterceptor(req).subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(401);
        expect(authServiceMock.logout).toHaveBeenCalled();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
        done();
      }
    });
  });

  it('should not attach an access token or refresh again when the refresh request returns 401', (done) => {
    localStorageStore['token'] = 'expired-access-token';
    const req = new HttpRequest('POST', '/_api/refresh', { refreshToken: 'invalid-refresh-token' });
    const errorResponse = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });
    nextMock.mockReturnValue(throwError(() => errorResponse));

    runInterceptor(req).subscribe({
      error: (error: HttpErrorResponse) => {
        const sentRequest = nextMock.mock.calls[0][0] as HttpRequest<unknown>;
        expect(error).toBe(errorResponse);
        expect(sentRequest.headers.has('x-access-token')).toBe(false);
        expect(authServiceMock.shouldRefreshAccessToken).not.toHaveBeenCalled();
        expect(authServiceMock.refreshAccessToken).not.toHaveBeenCalled();
        done();
      }
    });
  });

  it('should retry original request with new token on successful token refresh', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    const errorResponse = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });

    nextMock
      .mockReturnValueOnce(throwError(() => errorResponse))
      .mockReturnValueOnce(of({} as HttpEvent<unknown>));

    authServiceMock.shouldRefreshAccessToken = jest.fn().mockReturnValue(true);
    authServiceMock.refreshAccessToken = jest.fn().mockResolvedValue('new-refreshed-token');

    runInterceptor(req).subscribe(() => {
      expect(nextMock).toHaveBeenCalledTimes(2);
      const retriedReq = nextMock.mock.calls[1][0] as HttpRequest<unknown>;
      expect(retriedReq.headers.get('x-access-token')).toBe('new-refreshed-token');
      done();
    });
  });

  it('should handle auth failure when refreshed token is empty', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    const errorResponse = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });

    nextMock.mockReturnValue(throwError(() => errorResponse));
    authServiceMock.shouldRefreshAccessToken = jest.fn().mockReturnValue(true);
    authServiceMock.refreshAccessToken = jest.fn().mockResolvedValue(null as unknown as string);

    runInterceptor(req).subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(401);
        expect(authServiceMock.logout).toHaveBeenCalled();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
        done();
      }
    });
  });

  it('should handle auth failure when refreshAccessToken throws an error', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    const errorResponse = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });
    const refreshError = new Error('Refresh failed');

    nextMock.mockReturnValue(throwError(() => errorResponse));
    authServiceMock.shouldRefreshAccessToken = jest.fn().mockReturnValue(true);
    authServiceMock.refreshAccessToken = jest.fn().mockRejectedValue(refreshError);

    runInterceptor(req).subscribe({
      error: (err: unknown) => {
        expect(err).toBe(refreshError);
        expect(authServiceMock.logout).toHaveBeenCalled();
        expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
        done();
      }
    });
  });
});
