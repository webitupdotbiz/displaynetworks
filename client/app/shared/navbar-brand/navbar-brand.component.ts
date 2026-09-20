import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-navbar-brand',
  template: '<span class="navbar-brand"><i class="fa fa-cube xxmore-space"></i> <span class="custom-size">{{ appName }}</span></span>',
  standalone: true
})
export class NavbarBrandComponent {
  appName = 'Display Networks';
}