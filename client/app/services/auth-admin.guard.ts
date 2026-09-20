import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.loggedIn) {
    return router.parseUrl('/_login');
  }

  if (!auth.isAdmin && !auth.isGroupAdmin) {
    return router.parseUrl('/_channels');
  }

  return true;
};
