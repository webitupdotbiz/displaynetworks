import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AdminComponent } from './admin.component';
import { AuthService } from '../services/auth.service';
import { UserService, UserData } from '../services/user.service';
import { ThemeService } from '../services/theme.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { UserType } from '../user';
import { ObjectId } from 'bson';

const mockActivatedRoute = {
  paramMap: of(convertToParamMap({ name: 'surfing' }))
};

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = MockWebSocket.CONNECTING;
  close = jest.fn(() => {
    this.readyState = 3;
    this.emit('close', {});
  });
  private listeners: Record<string, ((event: any) => void)[]> = {};

  constructor(public url: string) {}

  addEventListener(type: string, listener: (event: any) => void): void {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  emit(type: string, event: any): void {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
}

describe('AdminComponent', () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;
  let mockUserService: any;
  let mockAuthService: Partial<AuthService>;
  let mockThemeService: any;

  beforeEach(() => {
    mockUserService = {
      getUsers: jest.fn(),
      addUser: jest.fn(),
      editUser: jest.fn(),
      deleteUser: jest.fn(),
      resendInvite: jest.fn(),
      getUser: jest.fn()
    } as any;
    mockUserService.getUsers.mockReturnValue(of({ count: 0, users: [] } as UserData));

    mockAuthService = {
      currentUser: { role: 'admin' }
    } as any;

    mockThemeService = {
      currentTheme: 'light'
    } as any;

    TestBed.configureTestingModule({
      imports: [AdminComponent, ReactiveFormsModule, RouterTestingModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    localStorage.clear();
    fixture.detectChanges();
    jest.spyOn(component.toast, 'setMessage');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should set admin labels on init', () => {
    expect(component.addButtonTitle).toBe('Add Group Admin');
    expect(component.noUsersMessage).toBe('There are no group admins');
    expect(component.successAddMessage).toBe('Email invite successfully sent');
    expect(component.successDeleteMessage).toBe('Group Admin successfully deleted');
  });

  it('should return correct theme background values', () => {
    mockThemeService.currentTheme = 'light';
    expect(component.getThemeBackground()).toBe('white');
    mockThemeService.currentTheme = 'dark';
    expect(component.getThemeBackground()).toBe('#111');
  });

  it('should format time and date correctly', () => {
    const noon = new Date('2026-05-09T12:05:00');
    expect(component.getTimeString(noon)).toBe('12:05 pm');
    const midnight = new Date('2026-05-09T00:03:00');
    expect(component.getTimeString(midnight)).toBe('12:03 am');
    expect(component.formatDate(new Date('2026-05-09T00:00:00'))).toBe(new Date('2026-05-09T00:00:00').toDateString());
  });

  it('should handle response data and build users list', () => {
    component.items = [{ _id: '1', tags: [], email: 'a@x.com' } as any];
    component.total = 1;
    component.handleResponseData({ count: 2, users: [{ _id: '2', tags: [], email: 'b@x.com' } as any] });

    expect(component.items.length).toBe(2);
    expect(component.total).toBe(2);
    expect(component.listlastDate).toBe('2');
  });

  it('should set search field from email and tags', () => {
    const user = { email: 'TEST@EXAMPLE.COM', tags: ['Tag1', 'Tag2'] } as any;
    component.setSearchField(user);
    expect(user.search).toBe('test@example.com tag1 tag2');

    const userWithoutTags = { email: 'NO-TAGS@EXAMPLE.COM', tags: [] } as any;
    component.setSearchField(userWithoutTags);
    expect(userWithoutTags.search).toBe('no-tags@example.com');

    const userWithNotes = { email: 'NOTES@EXAMPLE.COM', tags: [], notes: 'Some NOTES here' } as any;
    component.setSearchField(userWithNotes);
    expect(userWithNotes.search).toBe('notes@example.com some notes here');
  });

  it('should use user labels for non-admin users', () => {
    component.auth = { currentUser: { role: 'groupadmin' } } as any;
    component.ngOnInit();

    expect(component.addButtonTitle).toBe('Add User');
    expect(component.noUsersMessage).toBe('This group has no users');
    expect(component.successDeleteMessage).toBe('User successfully deleted');
  });

  it('should clear the search box only when term is non-empty', () => {
    component.term = '';
    component.items = [{ _id: '1', tags: [], email: 'a@x.com' } as any];
    (mockUserService.getUsers as jest.Mock).mockClear();

    component.clearSearchBox();
    expect(mockUserService.getUsers).not.toHaveBeenCalled();

    component.term = 'abc';
    component.sbox = { nativeElement: { value: 'abc', focus: jest.fn() } } as any;
    component.clearSearchBox();

    expect(component.term).toBe('');
    expect(component.tableLoading).toBe(false);
    expect(mockUserService.getUsers).toHaveBeenCalled();
    expect(component.sbox!.nativeElement.focus).toHaveBeenCalled();
  });

  it('should return search placeholder values', () => {
    component.term = '';
    component.items = [];
    expect(component.getSearchPlaceholder()).toBe('Group Admins');
    component.items = [{ _id: '1', tags: [], email: 'a@x.com' } as any];
    component.total = 5;
    expect(component.getSearchPlaceholder()).toBe('Group Admins (5)');
    component.term = 'search';
    component.items = [];
    expect(component.getSearchPlaceholder()).toBe('search');
  });

  it('should detect view modes correctly', () => {
    component.view = 'list';
    expect(component.isListView()).toBe(true);
    expect(component.isEditView()).toBe(false);
    expect(component.isAddView()).toBe(false);
    component.view = 'edit';
    expect(component.isEditView()).toBe(true);
    component.view = 'add';
    expect(component.isAddView()).toBe(true);
  });

  it('should evaluate access correctly', () => {
    component.showError = 'error';
    expect(component.hasAccess()).toBe(false);
    component.showError = undefined;
    component.auth = undefined as any;
    expect(component.hasAccess()).toBe(false);
    component.auth = { currentUser: { role: 'unknown' } } as any;
    expect(component.hasAccess()).toBe(false);
    component.auth = { currentUser: { role: 'groupadmin' } } as any;
    expect(component.hasAccess()).toBe(true);
  });

  it('should enable and cancel adding', fakeAsync(() => {
    component.view = 'list';
    component.tags = ['x'] as any;
    component.vscrollPosition = 80;
    component.enableAdding();
    expect(component.view).toBe('add');
    expect(component.vscrollTrack).toBe(false);
    expect(component.tags).toEqual([]);

    component.cancelAdding();
    expect(component.view).toBe('list');
    expect(component.textAreaAdd).toBe('');
    expect(component.urlInputAdd).toBe('url');
    expect(component.vscrollTrack).toBe(false);
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    tick();
    expect(scrollSpy).toHaveBeenCalledWith(0, 80);
    expect(component.vscrollTrack).toBe(true);
  }));

  it('should enable editing and cancel editing with scroll restore', fakeAsync(() => {
    const sampleUser = { _id: '123', tags: ['one'], email: 'x@x.com' } as any;
    component.vscrollPosition = 100;
    component.enableEditing(sampleUser);
    expect(component.view).toBe('edit');
    expect(component.savedUser).toEqual(sampleUser);
    expect(component.user).toEqual(sampleUser);
    expect(component.tags).toEqual(['one']);

    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    component.cancelEditing();
    tick(0);
    expect(component.view).toBe('list');
    expect(scrollSpy).toHaveBeenCalledWith(0, 100);
    expect(component.vscrollTrack).toBe(true);
  }));

  it('should handle no-op editing and incomplete edit state', () => {
    component.cancelEditing();
    expect(component.view).toBe('list');

    component.enableEditing({ tags: [], email: 'no-id@example.com' } as any);
    expect(component.view).toBe('edit');
    expect(component.viewId).toBeDefined();

    component.user = { tags: [], email: 'missing-saved@example.com' } as any;
    component.savedUser = undefined;
    component.cancelEditing();
    expect(component.view).toBe('edit');
  });

  it('should update a user in list and sort descending by updatedAt', () => {
    component.items = [
      { _id: '1', updatedAt: '2021-01-01' } as any,
      { _id: '2', updatedAt: '2022-01-01' } as any
    ];

    component.updateUserInList({ _id: '1', updatedAt: '2023-01-01' } as any);
    expect(component.items[0]._id).toBe('1');
    expect(component.items[0].updatedAt).toBe('2023-01-01');
  });

  it('should add a user on success and show toast', async () => {
    component.addUserForm.patchValue({ addEmail: 'new@x.com' });
    const newUser = { _id: '10', tags: [], email: 'new@x.com' } as any;
    (mockUserService.addUser as jest.Mock).mockReturnValue(of(newUser));

    await component.addUser();

    expect(component.items[0]).toBe(newUser);
    expect(component.total).toBe(1);
    expect(component.view).toBe('list');
    expect(component.toast.setMessage).toHaveBeenCalledWith(component.successAddMessage, 'success');
  });

  it('should set showError when add user fails', async () => {
    component.addUserForm.patchValue({ addEmail: 'already@x.com' });
    (mockUserService.addUser as jest.Mock).mockReturnValue(throwError(() => ({ error: { error: 'Email already exists' } })));

    await component.addUser();

    expect(component.showError).toBe('Email already exists');
  });

  it('should edit user successfully and show toast', () => {
    component.user = { _id: '1', updatedAt: '2020-01-01', tags: [], email: 'x@x.com' } as any;
    (mockUserService.editUser as jest.Mock).mockReturnValue(of({}));

    component.editUser({ editName: 'foo', editValue: 'bar' });

    expect(component.view).toBe('list');
    expect(component.toast.setMessage).toHaveBeenCalledWith('Entry edited successfully.', 'success');
  });

  it('should set showError when edit user fails', () => {
    component.user = { _id: '1', updatedAt: '2020-01-01', tags: [], email: 'x@x.com' } as any;
    (mockUserService.editUser as jest.Mock).mockReturnValue(throwError(() => ({ error: { error: 'bad edit' } })));

    component.editUser({ editName: 'foo', editValue: 'bar' });

    expect(component.showError).toBe('bad edit');
  });

  it('should delete a user on success and show toast', () => {
    const user = { _id: 'delete-me' } as any;
    component.items = [{ _id: 'delete-me', tags: [], email: 'x@x.com' } as any];
    component.total = 1;
    (mockUserService.deleteUser as jest.Mock).mockReturnValue(of({}));

    component.deleteUser(user);

    expect(component.items.length).toBe(0);
    expect(component.total).toBe(0);
    expect(component.toast.setMessage).toHaveBeenCalledWith(component.successDeleteMessage, 'success');
  });

  it('should set showError when delete user fails', () => {
    const user = { _id: 'delete-me' } as any;
    (mockUserService.deleteUser as jest.Mock).mockReturnValue(throwError(() => ({ error: { error: 'delete failed' } })));

    component.deleteUser(user);

    expect(component.showError).toBe('delete failed');
  });

  it('should fetch users and reset loading state on success or failure', () => {
    component.term = 'find-me';
    component.listlastDate = 'last-id';
    component.tableLoading = true;
    (mockUserService.getUsers as jest.Mock).mockReturnValueOnce(of({ count: 1, users: [] }));
    (component as any).fetchAll();

    expect(mockUserService.getUsers).toHaveBeenLastCalledWith('last-id', { term: 'find-me' });
    expect(component.isLoading).toBe(false);
    expect(component.tableLoading).toBe(false);
    expect(component.inProgress).toBe(false);

    (mockUserService.getUsers as jest.Mock).mockReturnValueOnce(throwError(() => ({ error: { error: 'load failed' } })));
    (component as any).fetchAll();
    expect(component.showError).toBe('load failed');
    expect(component.isLoading).toBe(false);
  });

  it('should handle empty responses and default fetch errors', () => {
    component.handleResponseData({ count: 0, users: [] });
    expect(component.listlastDate).toBeUndefined();

    (mockUserService.getUsers as jest.Mock).mockReturnValueOnce(throwError(() => ({})));
    (component as any).fetchAll();
    expect(component.showError).toBe('An unexpected error occurred.');
  });

  it('should resend invites and report invite failures', () => {
    const user = { _id: 'invite-me' } as any;
    (mockUserService.resendInvite as jest.Mock).mockReturnValueOnce(of({}));
    component.resendInvite(user);
    expect(component.toast.setMessage).toHaveBeenCalledWith(component.successAddMessage, 'success');

    (mockUserService.resendInvite as jest.Mock).mockReturnValueOnce(throwError(() => new Error('failed')));
    component.resendInvite(user);
    expect(component.toast.setMessage).toHaveBeenCalledWith('Unable to send invite email', 'danger');
  });

  it('should apply router-driven add and edit views', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    (component as any).route = {
      snapshot: { routeConfig: {}, paramMap: convertToParamMap({ id: 'not-an-object-id' }) }
    };

    component.enableAdding();
    expect(navigateSpy).toHaveBeenCalledWith(['/_admin/new'], { state: { returnToList: true } });

    (component as any).applyRouteView('edit');
    expect(component.showError).toBe('User not found');

    (component as any).applyRouteView('unknown');
    expect(component.view).toBe('list');
  });

  it('should load a valid routed user for editing and report lookup failures', () => {
    const user = { _id: new ObjectId(), tags: [], email: 'route@example.com' } as any;
    (component as any).route = {
      snapshot: { routeConfig: {}, paramMap: convertToParamMap({ id: user._id.toString() }) }
    };
    (mockUserService.getUser as jest.Mock).mockReturnValueOnce(of(user));
    (component as any).applyRouteView('edit');
    expect(component.view).toBe('edit');
    expect(component.user).toBe(user);

    (mockUserService.getUser as jest.Mock).mockReturnValueOnce(throwError(() => ({ error: { error: 'lookup failed' } })));
    (component as any).applyRouteView('edit');
    expect(component.showError).toBe('lookup failed');
  });

  it('should update active status from websocket messages and ignore invalid payloads', () => {
    component.items = [{ _id: 'user-1', active: false, tags: [] } as any, { _id: 'user-2', active: true, tags: [] } as any];
    component.user = component.items[0];
    (component as any).handleUsersSocketMessage(JSON.stringify({ type: 'user-status', userId: 'user-1', active: true }));
    expect(component.items[0].active).toBe(true);
    expect(component.user!.active).toBe(true);

    const unchangedItems = component.items;
    (component as any).handleUsersSocketMessage(JSON.stringify({ type: 'other', userId: 'user-2', active: false }));
    (component as any).handleUsersSocketMessage(JSON.stringify({ type: 'user-status', userId: 'user-2', active: 'yes' }));
    (component as any).handleUsersSocketMessage('not json');
    (component as any).handleUsersSocketMessage({});
    expect(component.items).toBe(unchangedItems);
  });

  it('should connect, reconnect, and close the users websocket', fakeAsync(() => {
    const originalWebSocket = window.WebSocket;
    (window as any).WebSocket = MockWebSocket;
    localStorage.setItem('token', 'token value');
    (component as any).connectUsersSocket();
    const socket = (component as any).usersSocket as MockWebSocket;
    expect(socket.url).toContain('/_ws/users?token=token%20value');
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open', {});
    (component as any).reconnectDelayMs = 1;
    socket.emit('message', { data: JSON.stringify({ type: 'user-status', userId: 'missing', active: true }) });
    socket.emit('error', {});
    expect(socket.close).toHaveBeenCalled();

    tick(600);
    expect((component as any).usersSocket).toBeInstanceOf(MockWebSocket);

    component.ngOnDestroy();
    expect((component as any).isDestroyed).toBe(true);
    (window as any).WebSocket = originalWebSocket;
  }));

  it('should format updatedAt correctly', () => {
    expect(component.formatUpdatedAt(undefined)).toBe('');
    expect(component.formatUpdatedAt('2026-05-09T12:00:00Z')).toBe(component.dateFormat(new Date('2026-05-09T12:00:00Z')));
  });
});