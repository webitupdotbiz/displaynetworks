import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const handleAuthFailure = (): void => {
    auth.logout();
    router.navigate(['/_login']);
  };

  if (req.url.includes('/_api/refresh')) {
    return next(req);
  }

  const token = localStorage.getItem('token');
  const authReq = token
    ? req.clone({ setHeaders: { 'x-access-token': token } })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      if (!auth.shouldRefreshAccessToken()) {
        handleAuthFailure();
        return throwError(() => error);
      }

      return from(auth.refreshAccessToken()).pipe(
        switchMap((nextToken: string | null) => {
          if (!nextToken) {
            handleAuthFailure();
            return throwError(() => error);
          }

          const retryReq = req.clone({
            setHeaders: { 'x-access-token': nextToken }
          });
          return next(retryReq);
        }),
        catchError((refreshError: unknown) => {
          handleAuthFailure();
          return throwError(() => refreshError);
        })
      );
    })
  );
};
