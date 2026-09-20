import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authLandingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin) {
    return router.parseUrl('/_admin');
  }

  if (auth.loggedIn) {
    return router.parseUrl('/_channels');
  }

  return router.parseUrl('/_login');
};
