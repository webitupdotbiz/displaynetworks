import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarBrandComponent } from '../shared/navbar-brand/navbar-brand.component';

@Component({
    selector: 'app-not-found',
    templateUrl: './not-found.component.html',
    standalone: true,
  imports: [CommonModule, NavbarBrandComponent]
})
export class NotFoundComponent {

  constructor() { }

}
