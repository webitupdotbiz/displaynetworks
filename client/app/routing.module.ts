import { Routes, UrlSegment } from '@angular/router';
import { ChannelsComponent } from './channels/channels.component';
import { ResetComponent } from './reset/reset.component';
import { IFrameComponent } from './iframe/iframe.component';
import { LoginComponent } from './login/login.component';
import { LogoutComponent } from './logout/logout.component';
import { AdminComponent } from './admin/admin.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { RulesComponent } from './rules/rules.component';
import { authLoginGuard } from './services/auth-login.guard';
import { authAdminGuard } from './services/auth-admin.guard';
import { authLandingGuard } from './services/auth-landing-guard';

export const routes: Routes = [
  { path: '', canActivate: [authLandingGuard], component: LogoutComponent },
  { path: '_channels/new', component: ChannelsComponent, canActivate: [authLoginGuard], data: { view: 'add' } },
  { path: '_channels/:id/edit', component: ChannelsComponent, canActivate: [authLoginGuard], data: { view: 'edit' } },
  { path: '_channels', component: ChannelsComponent, canActivate: [authLoginGuard] },
  { path: '_rules/new', component: RulesComponent, canActivate: [authLoginGuard], data: { view: 'add' } },
  { path: '_rules/:id/edit', component: RulesComponent, canActivate: [authLoginGuard], data: { view: 'edit' } },
  { path: '_rules', component: RulesComponent, canActivate: [authLoginGuard] },
  { path: '_login', component: LoginComponent },
  { path: '_logout', component: LogoutComponent },
  { path: '_reset/:token', component: ResetComponent },
  { path: '_admin/new', component: AdminComponent, canActivate: [authAdminGuard], data: { view: 'add' } },
  { path: '_admin/:id/edit', component: AdminComponent, canActivate: [authAdminGuard], data: { view: 'edit' } },
  { path: '_admin', component: AdminComponent, canActivate: [authAdminGuard] },
  { path: '_notfound', component: NotFoundComponent },
  // Catch undefined routes starting with _
  { 
    matcher: (url: UrlSegment[]) => {
      if (url.length > 0 && url[0].path.startsWith('_')) {
        return { consumed: url };
      }
      return null;
    },
    component: NotFoundComponent
  },
  { path: ':name', component: IFrameComponent },
  { path: '**', component: NotFoundComponent }
];
