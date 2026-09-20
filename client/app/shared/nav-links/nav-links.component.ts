import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-nav-links',
  templateUrl: './nav-links.component.html',
  styleUrls: ['./nav-links.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive]
})
export class NavLinksComponent {
  public auth = inject(AuthService);
  private themeService = inject(ThemeService);
  getName(): string {
    return this.themeService.currentTheme === 'light' ? 'Dark Mode': 'Light Mode';
  }
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
