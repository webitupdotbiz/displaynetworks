import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AppComponent } from './app.component';
import { ThemeService } from './services/theme.service';

describe('Component: App', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ AppComponent ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ThemeService,
          useValue: {
            currentTheme: 'light',
            toggleTheme: jest.fn()
          }
        }
      ]
    });
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the app container', () => {
    const compiled = fixture.nativeElement;
    expect(compiled).toBeTruthy();
  });

});
