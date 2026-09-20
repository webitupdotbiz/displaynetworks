import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { of, throwError } from 'rxjs';
import { AuthService, SavedUser } from './auth.service';
import { UserService } from '../services/user.service';
import { ObjectId } from 'bson';

describe('AuthService', () => {
  let service: AuthService;
  let userServiceMock: {
    login: jest.Mock;
    refresh: jest.Mock;
  };
  let routerMock: jest.Mocked<Partial<Router>>;
  let localStorageStore: Record<string, string>;

  const mockObjectId = new ObjectId('60c72b2f9b1d8b2bad123456');
  const mockUserPayload: SavedUser = {
    id: mockObjectId,
    _id: mockObjectId,
    email: 'engineer@displaynet.works',
    role: 'user'
  };

  beforeEach(() => {
    localStorageStore = {};

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => localStorageStore[key] || null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      localStorageStore[key] = value;
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      delete localStorageStore[key];
    });

    jest.spyOn(JwtHelperService.prototype, 'decodeToken').mockImplementation(() => ({
      user: mockUserPayload
    }));

    userServiceMock = {
      login: jest.fn(),
      refresh: jest.fn()
    };

    routerMock = {
      navigate: jest.fn().mockResolvedValue(true)
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = (): void => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    });
    service = TestBed.inject(AuthService);
  };

  describe('Constructor Initialization', () => {
    it('should initialize with default unauthenticated parameters when no token exists', () => {
      createService();
      expect(service).toBeTruthy();
      expect(service.loggedIn).toBe(false);
      expect(service.isAdmin).toBe(false);
      expect(service.isGroupAdmin).toBe(false);
      expect(service.currentUser.id).toBeUndefined();
    });

    it('should auto-authenticate on construction if valid non-expired token exists', () => {
      localStorageStore['token'] = 'valid-token';
      // Cast through unknown to resolve Jest overload ambiguity for synchronous return
      (jest.spyOn(JwtHelperService.prototype, 'isTokenExpired') as unknown as jest.SpyInstance<boolean>).mockReturnValue(false);
      jest.spyOn(JwtHelperService.prototype, 'getTokenExpirationDate').mockReturnValue(new Date(Date.now() + 10000));

      createService();

      expect(service.loggedIn).toBe(true);
      expect(service.currentUser.email).toBe('engineer@displaynet.works');
    });

    it('should logout on construction if pre-existing token is already expired', () => {
      localStorageStore['token'] = 'expired-token';
      (jest.spyOn(JwtHelperService.prototype, 'isTokenExpired') as unknown as jest.SpyInstance<boolean>).mockReturnValue(true);

      createService();

      expect(service.loggedIn).toBe(false);
      expect(localStorageStore['token']).toBeUndefined();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });
  });

  describe('shouldRefreshAccessToken', () => {
    it('should return false when no token exists in local storage', () => {
      createService();
      expect(service.shouldRefreshAccessToken()).toBe(false);
    });

    it('should return token expiration status using REFRESH_BUFFER_SECONDS', () => {
      createService();
      localStorageStore['token'] = 'active-token';

      (jest.spyOn(JwtHelperService.prototype, 'isTokenExpired') as unknown as jest.SpyInstance<boolean>).mockReturnValue(true);
      expect(service.shouldRefreshAccessToken()).toBe(true);

      (jest.spyOn(JwtHelperService.prototype, 'isTokenExpired') as unknown as jest.SpyInstance<boolean>).mockReturnValue(false);
      expect(service.shouldRefreshAccessToken()).toBe(false);
    });

    it('should catch underlying decoding errors and return false safely', () => {
      createService();
      localStorageStore['token'] = 'malformed-token';
      jest.spyOn(service.jwtHelper, 'isTokenExpired').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(service.shouldRefreshAccessToken()).toBe(false);
    });
  });

  describe('login', () => {
    it('should authenticate user and set tokens when login API returns accessToken', (done: jest.DoneCallback) => {
      createService();
      const credentials = { email: 'engineer@displaynet.works', password: 'securePassword123' };
      userServiceMock.login.mockReturnValue(of({ accessToken: 'access-123', refreshToken: 'refresh-123' }));
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockReturnValue(new Date(Date.now() + 10000));

      service.login(credentials).subscribe((result: boolean) => {
        expect(result).toBe(true);
        expect(localStorageStore['token']).toBe('access-123');
        expect(localStorageStore['refreshToken']).toBe('refresh-123');
        expect(service.loggedIn).toBe(true);
        done();
      });
    });

    it('should fallback to token field if accessToken is not present', (done: jest.DoneCallback) => {
      createService();
      const credentials = { email: 'engineer@displaynet.works', password: 'securePassword123' };
      userServiceMock.login.mockReturnValue(of({ token: 'legacy-token' }));
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockReturnValue(new Date(Date.now() + 10000));

      service.login(credentials).subscribe((result: boolean) => {
        expect(result).toBe(true);
        expect(localStorageStore['token']).toBe('legacy-token');
        done();
      });
    });

    it('should trigger logout and return false if response contains no tokens', (done: jest.DoneCallback) => {
      createService();
      userServiceMock.login.mockReturnValue(of(null));

      service.login({ email: 'test@test.com', password: 'pass' }).subscribe((result: boolean) => {
        expect(result).toBe(false);
        expect(service.loggedIn).toBe(false);
        expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
        done();
      });
    });
  });

  describe('refreshAccessToken', () => {
    it('should trigger logout and return null if no refresh token exists', async () => {
      createService();
      const result = await service.refreshAccessToken();

      expect(result).toBeNull();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });

    it('should trigger logout if refresh API response is not AuthTokens format', async () => {
      createService();
      localStorageStore['refreshToken'] = 'valid-refresh';
      userServiceMock.refresh.mockReturnValue(of('invalid-response'));

      const result = await service.refreshAccessToken();

      expect(result).toBeNull();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });

    it('should trigger logout if refresh API returns missing accessToken', async () => {
      createService();
      localStorageStore['refreshToken'] = 'valid-refresh';
      userServiceMock.refresh.mockReturnValue(of({ accessToken: '' }));

      const result = await service.refreshAccessToken();

      expect(result).toBeNull();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });

    it('should refresh tokens, re-schedule auto logout, and return new token on success', async () => {
      createService();
      localStorageStore['refreshToken'] = 'valid-refresh';
      userServiceMock.refresh.mockReturnValue(of({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      }));
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockReturnValue(new Date(Date.now() + 10000));

      const result = await service.refreshAccessToken();

      expect(result).toBe('new-access-token');
      expect(localStorageStore['token']).toBe('new-access-token');
      expect(localStorageStore['refreshToken']).toBe('new-refresh-token');
      expect(service.loggedIn).toBe(true);
    });

    it('should share single in-flight refresh promise for concurrent callers', async () => {
      createService();
      localStorageStore['refreshToken'] = 'valid-refresh';
      userServiceMock.refresh.mockReturnValue(of({
        accessToken: 'shared-token',
        refreshToken: 'shared-refresh'
      }));

      const [res1, res2] = await Promise.all([
        service.refreshAccessToken(),
        service.refreshAccessToken()
      ]);

      expect(res1).toBe('shared-token');
      expect(res2).toBe('shared-token');
      expect(userServiceMock.refresh).toHaveBeenCalledTimes(1);
    });

    it('should trigger logout and return null when refresh API call fails', async () => {
      createService();
      localStorageStore['refreshToken'] = 'valid-refresh';
      userServiceMock.refresh.mockReturnValue(throwError(() => new Error('Network error')));

      const result = await service.refreshAccessToken();

      expect(result).toBeNull();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });
  });

  describe('decodeUserFromToken & setCurrentUser', () => {
    it('should return undefined if token string is empty', () => {
      createService();
      expect(service.decodeUserFromToken('')).toBeUndefined();
    });

    it('should return undefined if decodedUser passed to setCurrentUser is null', () => {
      createService();
      service.setCurrentUser(null as unknown as SavedUser);
      expect(service.loggedIn).toBe(false);
    });

    it('should set admin flags correctly for admin role', () => {
      createService();
      service.setCurrentUser({ id: mockObjectId, email: 'admin@test.com', role: 'admin' });

      expect(service.loggedIn).toBe(true);
      expect(service.isAdmin).toBe(true);
      expect(service.isGroupAdmin).toBe(false);
    });

    it('should set groupadmin flags correctly for groupadmin role', () => {
      createService();
      service.setCurrentUser({ id: mockObjectId, email: 'group@test.com', role: 'groupadmin' });

      expect(service.loggedIn).toBe(true);
      expect(service.isAdmin).toBe(false);
      expect(service.isGroupAdmin).toBe(true);
    });
  });

  describe('Auto Logout Scheduling', () => {
    it('should refresh at access token expiry when the user was active', fakeAsync(() => {
      createService();
      const now = Date.now();
      userServiceMock.login.mockReturnValue(of({ accessToken: 'active-token', refreshToken: 'refresh-token' }));
      const refreshSpy = jest.spyOn(service, 'refreshAccessToken').mockResolvedValue('renewed-token');
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockImplementation((token: string) => {
        return new Date(now + (token === 'renewed-token' ? 10000 : 5000));
      });

      service.login({ email: 'test@test.com', password: 'pass' }).subscribe();
      tick(1000);
      document.dispatchEvent(new Event('pointerdown'));
      tick(4000);

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(service.loggedIn).toBe(true);
      expect(routerMock.navigate).not.toHaveBeenCalledWith(['/_login']);
    }));

    it('should logout immediately if token expiration date is in the past', () => {
      createService();
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockReturnValue(new Date(Date.now() - 5000));

      localStorageStore['token'] = 'expired-token';
      userServiceMock.login.mockReturnValue(of({ accessToken: 'expired-token' }));
      service.login({ email: 'test@test.com', password: 'pass' }).subscribe();

      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });

    it('should logout when token expiration timer elapses', fakeAsync(() => {
      createService();
      const expirationDate = new Date(Date.now() + 5000);
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockReturnValue(expirationDate);

      localStorageStore['token'] = 'active-token';
      userServiceMock.login.mockReturnValue(of({ accessToken: 'active-token' }));

      service.login({ email: 'test@test.com', password: 'pass' }).subscribe();
      expect(service.loggedIn).toBe(true);

      tick(5000);

      expect(service.loggedIn).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    }));

    it('should trigger logout when getTokenExpirationDate throws an error during scheduling', () => {
      createService();
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockImplementation(() => {
        throw new Error('Parsing failed');
      });

      userServiceMock.login.mockReturnValue(of({ accessToken: 'corrupted-token' }));
      service.login({ email: 'test@test.com', password: 'pass' }).subscribe();

      expect(service.loggedIn).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });

    it('should logout when getTokenExpirationDate returns null', () => {
      createService();
      jest.spyOn(service.jwtHelper, 'getTokenExpirationDate').mockReturnValue(null);

      userServiceMock.login.mockReturnValue(of({ accessToken: 'no-exp-token' }));
      service.login({ email: 'test@test.com', password: 'pass' }).subscribe();

      expect(service.loggedIn).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/_login']);
    });
  });
});
