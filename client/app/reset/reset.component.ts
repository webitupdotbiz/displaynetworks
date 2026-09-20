import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { NavbarBrandComponent } from '../shared/navbar-brand/navbar-brand.component';

export interface ResetPasswordForm {
  password: FormControl<string>;
  confirm: FormControl<string>;
}

export const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirm = control.get('confirm')?.value;
  return password && confirm && password === confirm ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-reset',
  templateUrl: './reset.component.html',
  styleUrls: ['./reset.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, RouterLinkActive, NavbarBrandComponent]
})
export class ResetComponent implements OnInit {
  public auth = inject(AuthService);
  private formBuilder = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);

  public loading = true;
  public showForm = false;
  public showError = false;
  public showSuccess = false;

  public resetForm: FormGroup<ResetPasswordForm> = this.formBuilder.group(
    {
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] })
    },
    { validators: passwordMatchValidator }
  );

  public get passwordControl(): FormControl<string> {
    return this.resetForm.controls.password;
  }

  public get confirmControl(): FormControl<string> {
    return this.resetForm.controls.confirm;
  }

  public ngOnInit(): void {
    if (!this.route.paramMap) return;

    this.route.paramMap
      .pipe(
        switchMap((params) =>
          this.userService.verifyReset(params.get('token') ?? '')
        )
      )
      .subscribe({
        next: () => {
          this.loading = false;
          this.showForm = true;
        },
        error: () => {
          this.loading = false;
          this.showForm = false;
          this.showError = true;
        }
      });
  }

  public isFieldInvalid(control: FormControl): boolean {
    return control.touched && control.invalid;
  }

  public isConfirmInvalid(): boolean {
    return (this.confirmControl.touched && this.confirmControl.invalid) || 
           (this.confirmControl.touched && this.resetForm.hasError('passwordMismatch'));
  }

  public submitResetPassword(): void {
    if (this.resetForm.invalid || !this.route.paramMap) return;

    this.loading = true;
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const token = params.get('token') ?? '';
          const paramObj = { ...this.resetForm.getRawValue(), origin: window.location.origin };
          return this.userService.submitResetPassword(token, paramObj);
        })
      )
      .subscribe({
        next: () => {
          this.loading = false;
          this.showForm = false;
          this.showSuccess = true;
        },
        error: () => {
          this.loading = false;
          this.showError = true;
        }
      });
  }
}
