import { Component, ViewChild, OnInit, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { UntypedFormGroup, UntypedFormControl, Validators, UntypedFormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { AppInfoModal } from '../shared/info-modal/info-modal.component';
import { NavbarBrandComponent } from '../shared/navbar-brand/navbar-brand.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule, ToastComponent, AppInfoModal, NavbarBrandComponent]
})
export class LoginComponent implements OnInit {
  @ViewChild('successmodal') modal!: AppInfoModal;
  @ViewChild('loginEmail') loginEmail: ElementRef | undefined;
  @ViewChild('forgotEmail') forgotEmail: ElementRef | undefined;

  emailInput = "";
  loginMessage = "Please Log In"
  showExpired = false;
  showLoginScreen = true;
  loginForm: UntypedFormGroup = new UntypedFormGroup({});
  private auth = inject(AuthService);
  private formBuilder = inject(UntypedFormBuilder);
  private userService = inject(UserService);
  private router = inject(Router);
  @ViewChild(ToastComponent, { static: true }) public toast!: ToastComponent;
  forgotFormGroup: UntypedFormGroup = new UntypedFormGroup({});
  email = new UntypedFormControl('', [Validators.required,
                                       Validators.minLength(3),
                                       Validators.maxLength(100)]);
  password = new UntypedFormControl('', [Validators.required,
                                          Validators.minLength(6)]);
  showForgotPassword = false;

  ngOnInit() {
    this.loginForm = this.formBuilder.group({
      email: this.email,
      password: this.password
    });
    this.forgotFormGroup = this.formBuilder.group({
      email: this.email
    });
  }

  setClassEmail() {
    return { 'has-danger': !this.email.pristine && !this.email.valid };
  }
  setClassPassword() {
    return { 'has-danger': !this.password.pristine && !this.password.valid };
  }
  showLogin() {
    this.showLoginScreen = true;
    this.showForgotPassword = false;
  }
  forgotForm() {
    console.log('forgotForm')
    if (!this.forgotEmail) return;
    this.userService.initiateReset(this.forgotEmail.nativeElement.value).subscribe();
  }
  forgotPassword() {
    if (!this.loginEmail) return;
    if (this.loginEmail.nativeElement.value) this.emailInput = this.loginEmail.nativeElement.value;
    this.showLoginScreen = false;
    this.showForgotPassword = true;
    setTimeout(() => {
      if (!this.forgotEmail) return;
      if (this.emailInput) this.forgotEmail.nativeElement.value = this.emailInput;
    });
  }

  login(): void {
    const loginData = this.loginForm.value;
    this.auth.login(loginData).subscribe({
      next: (res) => {
        const targetRoute = this.auth.isAdmin ? '/_admin' : '/_channels';
        this.router.navigate([targetRoute]);
      },
      error: (error) => {
        console.log("Login error:", error);
  
        if (error.status === 401) {
          if (this.loginEmail?.nativeElement) {
            this.emailInput = this.loginEmail.nativeElement.value;
          }
          this.showExpired = true;
          this.showLoginScreen = false;
        } else {
          this.toast.setMessage('Invalid email or password', 'danger');
        }
      }
    });
  }
}
