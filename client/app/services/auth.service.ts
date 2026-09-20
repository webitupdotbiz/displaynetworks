import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { fromEvent, merge, Subscription, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserService } from '../services/user.service';
import { ObjectId } from 'bson';

export interface SavedUser {
  id: ObjectId | undefined;
  // Optional compatibility field when other parts use `_id`
  _id?: ObjectId | undefined;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  token?: string;
}

const isAuthTokens = (value: unknown): value is AuthTokens => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.accessToken === 'string';
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly REFRESH_BUFFER_SECONDS = 60;
  private static readonly LAST_ACTIVITY_KEY = 'lastActivityAt';

  loggedIn = false;
  isAdmin = false;
  isGroupAdmin = false;

  jwtHelper: JwtHelperService = new JwtHelperService();

  currentUser: SavedUser = { id: undefined, email: '', role: '' };
  private userService = inject(UserService);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);
  private refreshPromise: Promise<string | null> | null = null;
  private timerSub?: Subscription;
  private activitySub?: Subscription;
  private lastActivityAt = 0;
  private idleTimeout = 0;
  private sessionToken?: string;

  constructor() {
    this.watchActivity();
    const token = localStorage.getItem('token');
    if (token) {
      if (this.jwtHelper.isTokenExpired(token)) {
        this.restoreLastActivity();
        if (!this.initializeSessionTiming(token) || this.isSessionIdle()) {
          this.logout();
        } else {
          void this.refreshAccessToken();
        }
      } else {
        const decodedUser = this.decodeUserFromToken(token);
        this.setCurrentUser(decodedUser);
        this.restoreLastActivity();
        this.scheduleSessionCheck(token);
      }
    }

    this.destroyRef.onDestroy(() => {
      this.clearSessionTimer();
      this.activitySub?.unsubscribe();
    });
  }

  shouldRefreshAccessToken(): boolean {
    const token = localStorage.getItem('token');
    if (!token) {
      return false;
    }

    try {
      return this.jwtHelper.isTokenExpired(token, AuthService.REFRESH_BUFFER_SECONDS);
    } catch (error) {
      return false;
    }
  }

  login(emailAndPassword: { email: string; password: string }) {
    return this.userService.login(emailAndPassword).pipe(
      map((res: LoginResponse | null | undefined) => {
        const accessToken = res?.accessToken ?? res?.token;
        const refreshToken = res?.refreshToken;

        if (!accessToken) {
          this.logout();
          return false;
        }

        localStorage.setItem('token', accessToken);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }

        const decodedUser = this.decodeUserFromToken(accessToken);
        this.setCurrentUser(decodedUser);
        this.startSession(accessToken);

        return this.loggedIn;
      })
    );
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      this.logout();
      return null;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await this.userService.refresh(refreshToken).toPromise();
        if (!isAuthTokens(response)) {
          this.logout();
          return null;
        }

        const nextAccessToken = response.accessToken;
        const nextRefreshToken = response.refreshToken;
        if (!nextAccessToken) {
          this.logout();
          return null;
        }

        localStorage.setItem('token', nextAccessToken);
        if (nextRefreshToken) {
          localStorage.setItem('refreshToken', nextRefreshToken);
        }

        const decodedUser = this.decodeUserFromToken(nextAccessToken);
        this.setCurrentUser(decodedUser);
        if (this.lastActivityAt === 0) {
          this.startSession(nextAccessToken);
        } else {
          this.scheduleSessionCheck(nextAccessToken);
        }

        return nextAccessToken;
      } catch (error) {
        this.logout();
        return null;
      }
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  logout() {
    this.clearSessionTimer();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem(AuthService.LAST_ACTIVITY_KEY);
    this.lastActivityAt = 0;
    this.idleTimeout = 0;
    this.loggedIn = false;
    this.isAdmin = false;
    this.isGroupAdmin = false;
    this.currentUser = { id: undefined, email: '', role: '' };
    this.router.navigate(['/_login']);
  }

  decodeUserFromToken(token: string) {
    if (!token) return undefined;
    return this.jwtHelper.decodeToken(token).user;
  }

  setCurrentUser(decodedUser: SavedUser) {
    if (!decodedUser) return;
    this.loggedIn = true;
    this.currentUser.id = decodedUser.id;
    this.currentUser._id = decodedUser.id;
    this.currentUser.email = decodedUser.email;
    this.currentUser.role = decodedUser.role;
    this.isAdmin = decodedUser.role === 'admin' ? true : false;
    this.isGroupAdmin = decodedUser.role === 'groupadmin' ? true : false;
  }

  private startSession(token: string): void {
    this.lastActivityAt = Date.now();
    sessionStorage.setItem(AuthService.LAST_ACTIVITY_KEY, String(this.lastActivityAt));
    this.scheduleSessionCheck(token);
  }

  private watchActivity(): void {
    this.activitySub = merge(
      fromEvent(this.document, 'pointerdown'),
      fromEvent(this.document, 'keydown'),
      fromEvent(this.document, 'touchstart'),
      fromEvent(this.document, 'scroll'),
      fromEvent(this.document, 'focusin'),
      fromEvent(this.document, 'visibilitychange')
    ).subscribe(() => this.handleActivity());
  }

  private handleActivity(): void {
    if (this.document.visibilityState === 'hidden' || !localStorage.getItem('token')) {
      return;
    }

    if (this.isSessionIdle()) {
      this.logout();
      return;
    }

    this.lastActivityAt = Date.now();
    sessionStorage.setItem(AuthService.LAST_ACTIVITY_KEY, String(this.lastActivityAt));
    const token = localStorage.getItem('token');
    if (token) {
      this.scheduleSessionCheck(token);
    }
  }

  private restoreLastActivity(): void {
    const stored = Number(sessionStorage.getItem(AuthService.LAST_ACTIVITY_KEY));
    this.lastActivityAt = Number.isFinite(stored) && stored > 0 ? stored : Date.now();
  }

  private scheduleSessionCheck(token: string): void {
    this.clearSessionTimer();

    try {
      const expirationDate = this.jwtHelper.getTokenExpirationDate(token);
      if (!expirationDate) {
        this.logout();
        return;
      }

      const expiresAt = expirationDate.getTime();
      if (!this.initializeSessionTiming(token, expiresAt)) {
        this.logout();
        return;
      }
      const idleDeadline = this.lastActivityAt + this.idleTimeout;
      const timeout = Math.min(expiresAt, idleDeadline) - Date.now();
      if (timeout <= 0) {
        this.handleSessionDeadline();
        return;
      }

      this.timerSub = timer(timeout).subscribe(() => {
        this.handleSessionDeadline();
      });
    } catch (error) {
      this.logout();
    }
  }

  private getTokenLifetime(token: string, expiresAt: number): number {
    const decoded = this.jwtHelper.decodeToken(token) as { iat?: number } | null;
    if (typeof decoded?.iat === 'number') {
      return Math.max(0, expiresAt - decoded.iat * 1000);
    }
    return Math.max(0, expiresAt - Date.now());
  }

  private initializeSessionTiming(token: string, expiresAt?: number): boolean {
    const expirationTime = expiresAt ?? this.jwtHelper.getTokenExpirationDate(token)?.getTime();
    if (!expirationTime) {
      return false;
    }

    this.idleTimeout = this.sessionToken === token && this.idleTimeout > 0
      ? this.idleTimeout
      : this.getTokenLifetime(token, expirationTime);
    this.sessionToken = token;
    return this.idleTimeout > 0;
  }

  private isSessionIdle(): boolean {
    return this.idleTimeout > 0 && Date.now() >= this.lastActivityAt + this.idleTimeout;
  }

  private handleSessionDeadline(): void {
    if (this.isSessionIdle()) {
      this.logout();
      return;
    }

    void this.refreshAccessToken();
  }

  private clearSessionTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = undefined;
  }
}