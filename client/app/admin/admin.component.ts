import { Component, ViewChild, ElementRef, inject, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { UntypedFormGroup, UntypedFormControl, Validators, UntypedFormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';

import { AuthService } from '../services/auth.service';
import { UserData, UserService } from '../services/user.service';
import { UserType, UserPayloadType } from '../user';
import { ToastComponent } from '../shared/toast/toast.component';
import { TagsComponent } from '../shared/tags/tags.component';
import { LoadingComponent } from '../shared/loading/loading.component';
import { NavLinksComponent } from '../shared/nav-links/nav-links.component';
import { NavbarBrandComponent } from '../shared/navbar-brand/navbar-brand.component';
import { AppConfirmModal } from '../shared/confirm-modal/confirm-modal.component';
import { firstValueFrom } from 'rxjs';
import { ObjectId } from 'bson';
import { ThemeService } from '../services/theme.service';
import { BaseTableComponent } from '../shared/base-table.component';

@Component({
    selector: 'app-admin',
    templateUrl: './admin.component.html',
    styleUrls: ['./admin.component.scss'],
  standalone: true,
    imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule, ToastComponent, TagsComponent, LoadingComponent, NavLinksComponent, NavbarBrandComponent, AppConfirmModal]
})
export class AdminComponent extends BaseTableComponent<UserType> {
  @ViewChild('vpanelDiv') vpanelDiv: ElementRef | undefined;
  @ViewChild('infoSpan') infoSpan: ElementRef | undefined;
  @ViewChild('color') color: ElementRef | undefined;
  @ViewChild('bgcolor') bgcolor: ElementRef | undefined;

  origin = window.location.origin;
  host = window.location.host;
  tags: String[] = [];
  fullscreen = undefined;
  savedUser: UserType | undefined;
  savedTags: String[] = [];
  user: UserType | undefined;
  viewId = new ObjectId();
  private userService = inject(UserService);
  public auth = inject(AuthService);
  private formBuilder = inject(UntypedFormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute, { optional: true });
  private location = inject(Location, { optional: true });
  @ViewChild(ToastComponent, { static: true }) public toast!: ToastComponent;
  private themeService = inject(ThemeService);
  playlist: string[] | undefined = undefined;
  currentFrameId = 0;
  viewPosition = 0;
  scrollAmount = {step: 1, mod: 0};
  settingsUpdated = false;
  colorType = "";
  viewLoading = undefined;
  viewerEntry = undefined;
  viewerValue = undefined;
  addUserForm: UntypedFormGroup = new UntypedFormGroup({});
  addEmail= new UntypedFormControl('', [Validators.required, Validators.email]);
  addNotes = new UntypedFormControl('');
  editUserForm: UntypedFormGroup = new UntypedFormGroup({});
  editList = new UntypedFormControl('');
  editNotes = new UntypedFormControl('');
  urlInputAdd = 'url';
  textAreaAdd = '';
  textAreaEdit = '';
  urlInputEdit = 'url';
  noUsersMessage = '';
  successAddMessage = '';
  successDeleteMessage = '';
  addButtonTitle = '';
  private usersSocket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 10000;
  private isDestroyed = false;

  override ngOnInit(): void {
    if (this.auth.currentUser.role === 'admin') {
      this.addButtonTitle = 'Add Group Admin';
      this.noUsersMessage = 'There are no group admins';
      this.successAddMessage = 'Email invite successfully sent';
      this.successDeleteMessage = 'Group Admin successfully deleted';
    } else {
      this.addButtonTitle = 'Add User';
      this.noUsersMessage = 'This group has no users';
      this.successAddMessage = 'Email invite successfully sent';
      this.successDeleteMessage = 'User successfully deleted';
    }

    this.addUserForm = this.formBuilder.group({
      addEmail: this.addEmail,
      addNotes: this.addNotes,
    });
    
    this.editUserForm = this.formBuilder.group({
      editList: this.editList,
      editNotes: this.editNotes,
    });

    this.route?.data?.subscribe(data => this.applyRouteView(data['view']));
    super.ngOnInit();
    this.connectUsersSocket();
  }

  private applyRouteView(view: unknown): void {
    if (view === 'add') {
      this.openAddForm();
      return;
    }

    if (view === 'edit') {
      const userId = this.route?.snapshot.paramMap.get('id');
      if (!userId) {
        this.showError = 'User not found';
        return;
      }
      if (!ObjectId.isValid(userId)) {
        this.showError = 'User not found';
        return;
      }
      this.userService.getUser({ _id: new ObjectId(userId) }).subscribe({
        next: user => this.openEditForm(user),
        error: error => this.showError = error?.error?.error ?? 'User not found'
      });
      return;
    }

    this.view = 'list';
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.clearReconnectTimer();
    if (this.usersSocket) {
      this.usersSocket.close();
      this.usersSocket = null;
    }
  }

  override getThemeBackground(): string {
    return this.themeService.currentTheme === 'light' ? 'white': '#111';
  }

  override getSearchPlaceholder(): string {
    let word = this.auth.currentUser.role === 'admin' ? 'Group Admins' : 'Users';
    if (this.term) word = this.term;
    if (this.items.length <= 0) return word;
    return `${word} (${this.total})`;
  }


  handleResponseData(data: UserData): void {
    for (let ii = 0; ii < data.users.length; ii++) {
      this.items.push(data.users[ii]);
    }
    this.total = data.count;
    this.listlastDate = data.users.length > 0 ? data.users[data.users.length - 1]._id : undefined;
  }

  setSearchField(user: UserPayloadType): void {
    let email = user.email.toLowerCase();
    let tagstr = user.tags && user.tags.length === 0 ? '' : user.tags.join(' ').toLowerCase();
    let notestr = user.notes ? user.notes.toLowerCase() : '';
    user.search = [email, tagstr, notestr].filter(part => part).join(' ');
  }

  protected override fetchAll(): void {
    const params = this.term ? { term: this.term } : undefined;
    this.userService.getUsers(this.listlastDate, params).subscribe(
      {
        next: (data) => this.handleResponseData(data),
        error: (error) => {
          this.isLoading = false;
          this.showError = error.error?.error ?? 'An unexpected error occurred.';
        },
        complete: () => {
          this.isLoading = false;
          this.tableLoading = false;
          this.inProgress = false;
        }
      }
    );
  }

  hasAccess() {
    if (this.showError) return false;
    if (!this.auth) return false;
    if (!this.auth.currentUser) return false;
    if (this.auth.currentUser.role === 'admin') return true;
    if (this.auth.currentUser.role === 'groupadmin') return true;
    return false;
  }

  override formatDate(inDate: Date): string {
    let date = new Date(inDate);
    return date.toDateString();
  }

  resendInvite(user: UserType): void {
    this.userService.resendInvite(user).subscribe({
      next: () => {
        this.toast.setMessage(this.successAddMessage, 'success');
      },
      error: (err) => {
        this.toast.setMessage('Unable to send invite email', 'danger');
      },
    });
  }

  async addUser(): Promise<void> {
    this.showError = undefined;
    this.working = true;
    let user: UserPayloadType = {
      email: this.addUserForm.value.addEmail,
      search: '',
      tags: this.tags,
      notes: this.addUserForm.value.addNotes ?? '',
    };

    this.setSearchField(user);

    try {
      const newUser = await firstValueFrom(this.userService.addUser(user));
      this.items.unshift(newUser);
      this.total += 1;
      this.addUserForm.reset();
      this.view = 'list';
      this.vscrollTrack = true;
      this.toast.setMessage(this.successAddMessage, 'success');
      this.navigateToListAfterMutation();
    } catch (error) {
      this.showError = 'Email already exists';
    } finally {
      this.working = false;
    }
  }

  enableAdding(): void {
    if (this.usesRouterNavigation()) {
      this.router.navigate(['/_admin/new'], { state: { returnToList: true } });
      return;
    }
    this.openAddForm();
  }

  private openAddForm(): void {
    this.vscrollTrack = false;
    this.previousView = 'list';
    this.view = 'add';
    this.tags = [];
  }

  cancelAdding(): void {
    if (this.usesRouterNavigation()) {
      this.returnToList();
      return;
    }
    this.showError = undefined;
    this.addUserForm.reset();
    this.textAreaAdd = '';
    this.urlInputAdd = 'url';
    this.view = 'list';
    this.user = undefined;
    this.viewId = new ObjectId();
    setTimeout(() => {
      window.scrollTo(0, this.vscrollPosition);
      this.vscrollTrack = true;
    });
  }

  enableEditing(user: UserType): void {
    if (this.usesRouterNavigation() && user._id) {
      this.router.navigate(['/_admin', user._id.toString(), 'edit'], { state: { returnToList: true } });
      return;
    }
    this.openEditForm(user);
  }

  private openEditForm(user: UserType): void {
    this.vscrollTrack = false;
    this.previousView = 'list';
    this.view = 'edit';
    this.savedUser = Object.assign({}, user);
    this.savedTags = [...user.tags];
    this.user = user;
    if (!user?._id) return;
    this.viewId = user._id;

    this.tags = user.tags;
    this.editUserForm.reset({ editNotes: user.notes ?? '' });
  }

  cancelEditing(): void {
    if (this.usesRouterNavigation()) {
      this.returnToList();
      return;
    }
    if (!this.user) return;
    if (!this.savedUser) return;
    this.showError = undefined;
    this.editUserForm.reset({});

    this.user.tags = [...this.savedTags.map(tag => tag.toString())];
    this.tags = [];
    this.savedUser = undefined;
    this.view = 'list';
    this.user = undefined;
    this.viewId = new ObjectId();
    setTimeout(() => {
        window.scrollTo(0, this.vscrollPosition);
        this.vscrollTrack = true;
    });
  }

  private returnToList(): void {
    if (history.state?.returnToList && this.location) {
      this.location.back();
      return;
    }
    this.router.navigate(['/_admin']);
  }

  private usesRouterNavigation(): boolean {
    return !!this.route?.snapshot?.routeConfig;
  }

  private navigateToListAfterMutation(): void {
    if (this.usesRouterNavigation()) {
      this.router.navigate(['/_admin']);
    }
  }

  updateUserInList(user: UserType): void {
    for (let ii = 0; ii < this.items.length; ii++) {
      if (this.items[ii]._id === user._id) {
        this.items[ii] = user;
        break;
      }
    }
    this.items.sort(function(a, b) {
      if (!b.updatedAt || !a.updatedAt) return 0
      if (b.updatedAt < a.updatedAt) return -1;
      if (b.updatedAt === a.updatedAt) return 0;
      return 1;
    });
  }

  editUser(value: { editName: string; editValue: any }): void {
    if (!this.user) return;
    this.showError = undefined;
    this.user.notes = this.editUserForm.value.editNotes ?? '';
    this.setSearchField(this.user);
    this.user.updatedAt = new Date().toISOString();
  
    this.userService.editUser(this.user).subscribe({
      next: res => {
        if (!this.user) return;
        this.updateUserInList(this.user);
        this.view = 'list';
        this.vscrollPosition = 0;
        this.vscrollTrack = true;
        this.toast.setMessage('Entry edited successfully.', 'success');
        this.navigateToListAfterMutation();
      },
      error: err => {
        this.showError = err?.error?.error ?? "An unexpected error occurred.";
      }
    });
  }

  deleteUser(user: UserType): void {
    this.userService.deleteUser(user).subscribe(
      {
        next: (data) => {
          this.view = 'list';
          const pos = this.items.findIndex((elem: UserType) => elem._id === user._id);
          if (pos > -1) {
            this.items.splice(pos, 1);
            this.total -= 1;
            this.toast.setMessage(this.successDeleteMessage, 'success');
          }
          this.navigateToListAfterMutation();
        },
        error: (err) => {
          this.showError = err.error.error ?? 'An unexpected error occurred.';
        },
        complete: () => {

        }
      }
    );
  }

  formatUpdatedAt(updatedAt: string | null | undefined): string {
    if (!updatedAt) return '';
    return this.dateFormat(new Date(updatedAt));
  }

  private connectUsersSocket(): void {
    if (!this.hasAccess()) return;
    const token = localStorage.getItem('token') || '';
    if (!token) return;
    if (this.usersSocket && (this.usersSocket.readyState === WebSocket.OPEN || this.usersSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/_ws/users?token=${encodeURIComponent(token)}`);
    this.usersSocket = ws;

    ws.addEventListener('open', () => {
      this.reconnectDelayMs = 1000;
      this.clearReconnectTimer();
    });

    ws.addEventListener('message', (event) => {
      this.handleUsersSocketMessage(event.data);
    });

    ws.addEventListener('error', () => {
      ws.close();
    });

    ws.addEventListener('close', () => {
      if (this.usersSocket === ws) {
        this.usersSocket = null;
      }

      if (!this.isDestroyed) {
        this.scheduleReconnect();
      }
    });
  }

  private handleUsersSocketMessage(raw: unknown): void {
    const text = typeof raw === 'string' ? raw : '';
    if (!text) return;

    try {
      const payload = JSON.parse(text) as { type?: string; userId?: string; active?: boolean };
      if (payload.type !== 'user-status') return;
      if (!payload.userId || typeof payload.active !== 'boolean') return;

      this.applyUserStatusUpdate(payload.userId, payload.active);
    } catch {
      // Ignore malformed websocket payloads.
    }
  }

  private applyUserStatusUpdate(userId: string, active: boolean): void {
    let changed = false;
    this.items = this.items.map((item) => {
      const itemId = this.toComparableId(item._id);
      if (itemId !== userId) return item;
      if (item.active === active) return item;
      changed = true;
      return { ...item, active };
    });

    if (!changed) return;

    if (this.user && this.toComparableId(this.user._id) === userId) {
      this.user = { ...this.user, active };
    }
  }

  private toComparableId(id: unknown): string {
    if (id === null || id === undefined) return '';
    return String(id);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.isDestroyed) return;

    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.min(this.reconnectDelayMs + jitter, this.maxReconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connectUsersSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}