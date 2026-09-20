import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { LoginComponent } from './login.component';
import { ToastComponent } from '../shared/toast/toast.component';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { Router } from '@angular/router';

const mockToastComponent = {
  message: { body: '', type: '' },
  setMessage: jest.fn()
};

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: { login: jest.Mock; isAdmin: boolean };
  let userService: { initiateReset: jest.Mock };
  let router: { navigate: jest.Mock };

  beforeEach(() => {
    authService = {
      login: jest.fn(),
      isAdmin: false
    };
    userService = {
      initiateReset: jest.fn().mockReturnValue(of({}))
    };
    router = {
      navigate: jest.fn()
    };

    TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule, FormsModule, ToastComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastComponent, useValue: mockToastComponent },
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: Router, useValue: router }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    component.toast = mockToastComponent as any;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the login form', () => {
    const form = fixture.debugElement.query(By.css('form'));
    expect(form).toBeTruthy();
  });

  it('should have email and password input fields', () => {
    const inputs = fixture.debugElement.queryAll(By.css('input'));
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('should display submit button', () => {
    const button = fixture.debugElement.query(By.css('button'));
    expect(button).toBeTruthy();
  });

  it('should initialize the login and forgot forms', () => {
    expect(component.loginForm).toBeDefined();
    expect(component.forgotFormGroup).toBeDefined();
  });

  it('should toggle the login view and preserve the email input', () => {
    component.showLoginScreen = false;
    component.showForgotPassword = true;
    component.loginEmail = { nativeElement: { value: 'user@example.com' } } as any;

    component.forgotPassword();

    expect(component.showLoginScreen).toBe(false);
    expect(component.showForgotPassword).toBe(true);
    expect(component.emailInput).toBe('user@example.com');
  });

  it('should cover the forgot password branches without a login email and without a forgot email', () => {
    component.loginEmail = undefined;
    component.forgotEmail = undefined;

    component.forgotPassword();
    component.forgotForm();

    expect(component.showLoginScreen).toBe(true);
    expect(component.showForgotPassword).toBe(false);
    expect(component.emailInput).toBe('');
  });

  it('should populate the forgot-email field after the timeout branch', fakeAsync(() => {
    component.loginEmail = { nativeElement: { value: 'user@example.com' } } as any;
    component.forgotEmail = { nativeElement: { value: '' } } as any;

    component.forgotPassword();
    tick();

    expect(component.forgotEmail.nativeElement.value).toBe('user@example.com');
  }));

  it('should reset the view back to login', () => {
    component.showLoginScreen = false;
    component.showForgotPassword = true;

    component.showLogin();

    expect(component.showLoginScreen).toBe(true);
    expect(component.showForgotPassword).toBe(false);
  });

  it('should initiate forgot password flow', () => {
    component.forgotEmail = { nativeElement: { value: 'user@example.com' } } as any;

    component.forgotForm();

    expect(userService.initiateReset).toHaveBeenCalledWith('user@example.com');
  });

  it('should navigate to the admin route for admins after a successful login', () => {
    authService.login.mockReturnValue(of({ success: true }));
    authService.isAdmin = true;
    component.loginForm.patchValue({ email: 'a@b.com', password: '123456' });

    component.login();

    expect(router.navigate).toHaveBeenCalledWith(['/_admin']);
  });

  it('should navigate to the channels route for non-admins after a successful login', () => {
    authService.login.mockReturnValue(of({ success: true }));
    authService.isAdmin = false;
    component.loginForm.patchValue({ email: 'a@b.com', password: '123456' });

    component.login();

    expect(router.navigate).toHaveBeenCalledWith(['/_channels']);
  });

  it('should show the expired login state on 401 errors', () => {
    authService.login.mockReturnValue(throwError(() => ({ status: 401 })));
    component.loginEmail = { nativeElement: { value: 'user@example.com' } } as any;
    component.loginForm.patchValue({ email: 'a@b.com', password: '123456' });

    component.login();

    expect(component.showExpired).toBe(true);
    expect(component.showLoginScreen).toBe(false);
    expect(component.emailInput).toBe('user@example.com');
  });

  it('should show a toast on other login errors', () => {
    authService.login.mockReturnValue(throwError(() => ({ status: 500 })));
    component.loginForm.patchValue({ email: 'a@b.com', password: '123456' });

    component.login();

    expect(mockToastComponent.setMessage).toHaveBeenCalledWith('Invalid email or password', 'danger');
  });

  it('should cover the 401 branch with no login-email element', () => {
    authService.login.mockReturnValue(throwError(() => ({ status: 401 })));
    component.loginEmail = undefined;
    component.loginForm.patchValue({ email: 'a@b.com', password: '123456' });

    component.login();

    expect(component.showExpired).toBe(true);
    expect(component.showLoginScreen).toBe(false);
  });
});
