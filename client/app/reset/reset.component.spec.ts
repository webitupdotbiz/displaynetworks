import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { UserService } from '../services/user.service';
import { ResetComponent } from './reset.component';

const mockActivatedRoute = {
  paramMap: of(convertToParamMap({ token: 'abc123' }))
};

describe('ResetComponent', () => {
  let component: ResetComponent;
  let fixture: ComponentFixture<ResetComponent>;
  let userService: { verifyReset: jest.Mock; submitResetPassword: jest.Mock };

  beforeEach(() => {
    userService = {
      verifyReset: jest.fn().mockReturnValue(of({})),
      submitResetPassword: jest.fn().mockReturnValue(of({}))
    };

    TestBed.configureTestingModule({
      imports: [ResetComponent, ReactiveFormsModule, FormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: UserService, useValue: userService }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    fixture = TestBed.createComponent(ResetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display reset form', () => {
    const form = fixture.nativeElement.querySelector('form');
    expect(form).toBeTruthy();
  });

  it('should render reset component', () => {
    const compiled = fixture.nativeElement;
    expect(compiled).toBeTruthy();
  });

  it('should show the form when reset verification succeeds', () => {
    expect(component.loading).toBe(false);
    expect(component.showForm).toBe(true);
    expect(component.showError).toBe(false);
  });

  it('should show the error state when reset verification fails', () => {
    component.loading = true;
    component.showForm = false;
    component.showError = false;
    userService.verifyReset.mockReturnValue(throwError(() => new Error('bad token')));

    component.ngOnInit();

    expect(component.loading).toBe(false);
    expect(component.showForm).toBe(false);
    expect(component.showError).toBe(true);
  });

  it('should use an empty token when the route params omit one during verification', () => {
    Object.defineProperty(component, 'route', {
      value: { paramMap: of(convertToParamMap({})) } as ActivatedRoute,
      writable: true
    });

    component.ngOnInit();

    expect(userService.verifyReset).toHaveBeenCalledWith('');
  });

  it('should skip verification when the route param map is missing', () => {
    component.loading = true;
    component.showForm = false;
    component.showError = false;
    Object.defineProperty(component, 'route', {
      value: { paramMap: null } as unknown as ActivatedRoute,
      writable: true
    });

    component.ngOnInit();

    expect(component.loading).toBe(true);
    expect(component.showForm).toBe(false);
    expect(component.showError).toBe(false);
  });

  it('should validate invalid input field state', () => {
    component.passwordControl.setValue('abc');
    component.passwordControl.markAsTouched();

    expect(component.isFieldInvalid(component.passwordControl)).toBe(true);
  });

  it('should validate valid input field state', () => {
    component.passwordControl.setValue('abcdef');
    component.passwordControl.markAsTouched();

    expect(component.isFieldInvalid(component.passwordControl)).toBe(false);
  });

  it('should flag mismatched confirmation values', () => {
    component.passwordControl.setValue('abcdef');
    component.confirmControl.setValue('123456');
    component.confirmControl.markAsTouched();

    expect(component.resetForm.hasError('passwordMismatch')).toBe(true);
    expect(component.isConfirmInvalid()).toBe(true);
  });

  it('should clear the confirmation error when values match', () => {
    component.passwordControl.setValue('abcdef');
    component.confirmControl.setValue('abcdef');
    component.confirmControl.markAsTouched();

    expect(component.resetForm.hasError('passwordMismatch')).toBe(false);
    expect(component.isConfirmInvalid()).toBe(false);
  });

  it('should submit the reset request and show success', () => {
    component.resetForm.setValue({ password: 'abcdef', confirm: 'abcdef' });
    Object.defineProperty(component, 'route', {
      value: { paramMap: of(convertToParamMap({ token: 'abc123' })) } as ActivatedRoute,
      writable: true
    });

    component.submitResetPassword();

    expect(userService.submitResetPassword).toHaveBeenCalledWith('abc123', {
      password: 'abcdef',
      confirm: 'abcdef',
      origin: window.location.origin
    });
    expect(component.loading).toBe(false);
    expect(component.showForm).toBe(false);
    expect(component.showSuccess).toBe(true);
  });

  it('should skip submission if the form is invalid', () => {
    component.resetForm.setValue({ password: 'abcdef', confirm: '123456' });

    component.submitResetPassword();

    expect(userService.submitResetPassword).not.toHaveBeenCalled();
  });

  it('should show the error state when the reset submit request fails', () => {
    component.resetForm.setValue({ password: 'abcdef', confirm: 'abcdef' });
    Object.defineProperty(component, 'route', {
      value: { paramMap: of(convertToParamMap({ token: 'abc123' })) } as ActivatedRoute,
      writable: true
    });
    userService.submitResetPassword.mockReturnValue(throwError(() => new Error('submit failed')));

    component.submitResetPassword();

    expect(component.loading).toBe(false);
    expect(component.showError).toBe(true);
  });

  it('should use an empty token when the route params omit one during submission', () => {
    component.resetForm.setValue({ password: 'abcdef', confirm: 'abcdef' });
    Object.defineProperty(component, 'route', {
      value: { paramMap: of(convertToParamMap({})) } as ActivatedRoute,
      writable: true
    });

    component.submitResetPassword();

    expect(userService.submitResetPassword).toHaveBeenCalledWith('', {
      password: 'abcdef',
      confirm: 'abcdef',
      origin: window.location.origin
    });
  });

  it('should skip submission when the route param map is missing', () => {
    component.resetForm.setValue({ password: 'abcdef', confirm: 'abcdef' });
    Object.defineProperty(component, 'route', {
      value: { paramMap: null } as unknown as ActivatedRoute,
      writable: true
    });

    component.submitResetPassword();

    expect(userService.submitResetPassword).not.toHaveBeenCalled();
  });
});
