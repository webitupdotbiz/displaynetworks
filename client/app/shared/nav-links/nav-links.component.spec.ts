import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NavLinksComponent } from './nav-links.component';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';

describe('NavLinksComponent', () => {
  let component: NavLinksComponent;
  let fixture: ComponentFixture<NavLinksComponent>;
  let themeService: { currentTheme: string; toggleTheme: jest.Mock };

  beforeEach(async () => {
    themeService = {
      currentTheme: 'light',
      toggleTheme: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [NavLinksComponent],
      providers: [
        provideRouter([]),
        { provide: ThemeService, useValue: themeService },
        { provide: AuthService, useValue: {} }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(NavLinksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return Dark Mode when the current theme is light', () => {
    themeService.currentTheme = 'light';

    expect(component.getName()).toBe('Dark Mode');
  });

  it('should return Light Mode when the current theme is not light', () => {
    themeService.currentTheme = 'dark';

    expect(component.getName()).toBe('Light Mode');
  });

  it('should toggle the theme', () => {
    component.toggleTheme();

    expect(themeService.toggleTheme).toHaveBeenCalled();
  });
});
