import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule, UntypedFormBuilder } from '@angular/forms';
import { ObjectId } from 'bson';

import { ChannelsComponent } from './channels.component';
import { ChannelService } from '../services/channel.service';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { Entry } from '../entry';

const mockActivatedRoute = {
  paramMap: of(convertToParamMap({ name: 'surfing' }))
};

describe('Component: Channels', () => {
  let component: ChannelsComponent;
  let fixture: ComponentFixture<ChannelsComponent>;
  let channelService: {
    getChannels: jest.Mock;
    addEntry: jest.Mock;
    editEntry: jest.Mock;
    deleteEntry: jest.Mock;
    checkNameAvailable: jest.Mock;
  };
  let authService: { currentUser: { id: string | undefined; role: string | undefined } };
  let toast: { setMessage: jest.Mock };
  let themeService: { currentTheme: string };

  beforeEach(() => {
    authService = {
      currentUser: {
        id: new ObjectId().toHexString(),
        role: 'groupadmin'
      }
    };
    toast = {
      setMessage: jest.fn()
    };
    themeService = {
      currentTheme: 'light'
    };
    channelService = {
      getChannels: jest.fn().mockReturnValue(of({ channels: [], count: 0 })),
      addEntry: jest.fn().mockReturnValue(of({})),
      editEntry: jest.fn().mockReturnValue(of({})),
      deleteEntry: jest.fn().mockReturnValue(of({})),
      checkNameAvailable: jest.fn().mockReturnValue(of(true))
    };

    TestBed.configureTestingModule({
      imports: [ChannelsComponent, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        UntypedFormBuilder,
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: AuthService, useValue: authService },
        { provide: ChannelService, useValue: channelService },
        { provide: ThemeService, useValue: themeService },
        { provide: ToastComponent, useValue: toast }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    fixture = TestBed.createComponent(ChannelsComponent);
    component = fixture.componentInstance;
    component.toast = toast as any;
    component.ngOnInit();
  });

  it('should create an instance', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the component and fetch channels', () => {
    expect(component.items).toEqual([]);
    expect(component.total).toBe(0);
    expect(component.addChannelForm).toBeDefined();
    expect(component.editChannelForm).toBeDefined();
    expect(channelService.getChannels).toHaveBeenCalled();
  });

  it('should use the user role as the channel id for non-admin users', () => {
    authService.currentUser.role = 'user';
    channelService.getChannels.mockClear();
    component.fetchAll();
    expect(channelService.getChannels).toHaveBeenCalledWith('user', undefined, undefined);
  });

  it('should stop fetches when no user id is available', () => {
    authService.currentUser.id = undefined as any;
    authService.currentUser.role = undefined as any;
    channelService.getChannels.mockClear();
    component.fetchAll();
    expect(channelService.getChannels).not.toHaveBeenCalled();
  });

  it('should handle fetch errors', () => {
    channelService.getChannels.mockReturnValue(throwError(() => ({ error: { error: 'boom' } })));
    component.fetchAll();
    expect(component.showError).toBe('boom');
  });

  it('should append fetched channels and update pagination state', () => {
    const entry = { _id: new ObjectId(), name: 'one', displayName: 'one', value: 'value', tags: [], updatedAt: '2024-01-01T00:00:00.000Z' } as unknown as Entry;
    component['handleResponseData']({ channels: [entry], count: 1 } as any);
    expect(component.items).toContain(entry);
    expect(component.total).toBe(1);
    expect(component.listlastDate).toBe(entry._id);
  });

  it('should expose the expected search and theme values', () => {
    component.term = 'surfing';
    expect(component.getSearchPlaceholder()).toBe('surfing');
    expect(component.getThemeBackground()).toBe('white');
    themeService.currentTheme = 'dark';
    expect(component.getThemeBackground()).toBe('#111');
  });

  it('should copy the Channel URL to the clipboard when available', async () => {
    const clipboardSpy = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardSpy }
    });

    const entry = { displayName: 'demo' } as Entry;
    await component.copyToClipboardBrowserUrl(entry);

    expect(clipboardSpy).toHaveBeenCalledWith('http://localhost/demo');
    expect(toast.setMessage).toHaveBeenCalledWith('Channel URL copied to clipboard', 'success');
  });

  it('should fallback to document.execCommand when clipboard is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    document.execCommand = jest.fn().mockReturnValue(true) as any;

    component['fallbackCopyText']('hello');

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(toast.setMessage).toHaveBeenCalledWith('Channel URL copied to clipboard', 'success');
  });

  it('should set search text from the entry name and tags', () => {
    const entry = { name: 'My-Channel', tags: ['alpha', 'beta'] } as unknown as Entry;
    component.setSearchField(entry);
    expect(entry.search).toBe('my-channel alpha beta');
  });

  it('should include notes content in the search text', () => {
    const entry = { name: 'My-Channel', tags: [], notes: 'Lobby DISPLAY' } as unknown as Entry;
    component.setSearchField(entry);
    expect(entry.search).toBe('my-channel lobby display');
  });

  it('should guard access based on auth and errors', () => {
    expect(component.hasAccess()).toBe(true);
    component.showError = 'blocked';
    expect(component.hasAccess()).toBe(false);
    component.showError = undefined;
    component.auth = undefined as any;
    expect(component.hasAccess()).toBe(false);
  });

  it('should add a new entry and reset the form state', async () => {
    component.addChannelForm.patchValue({ addName: 'new-channel', addValue: 'value' });
    component.tags = ['tag'];
    const created = { _id: new ObjectId(), name: 'new-channel', displayName: 'new-channel', value: 'value', tags: ['tag'] } as unknown as Entry;
    channelService.addEntry.mockReturnValue(of(created));

    await component.addEntry();

    expect(channelService.addEntry).toHaveBeenCalled();
    expect(component.items[0]).toBe(created);
    expect(component.total).toBe(1);
    expect(component.view).toBe('list');
    expect(component.addChannelForm.value.addName).toBeNull();
  });

  it('should enable and cancel add mode', fakeAsync(() => {
    window.scrollTo = jest.fn() as any;
    component.enableAdding();
    expect(component.view).toBe('add');
    expect(component.vscrollTrack).toBe(false);

    component.cancelAdding();
    expect(component.view).toBe('list');
    expect(component.vscrollTrack).toBe(false);
    tick();
    expect(component.vscrollTrack).toBe(true);
  }));

  it('should enable editing and support the no-id branch', () => {
    const entry = { _id: new ObjectId(), name: 'demo', displayName: 'demo', value: 'value', tags: ['one'] } as unknown as Entry;
    component.enableEditing(entry);
    expect(component.view).toBe('edit');
    expect(component.entry).toBe(entry);
    expect(component.tags).toEqual(['one']);

    const noIdEntry = { name: 'noid', displayName: 'noid', value: 'value', tags: [] } as unknown as Entry;
    component.enableEditing(noIdEntry);
    expect(component.view).toBe('edit');
  });

  it('should build playlist and list URLs for add/edit inputs', () => {
    const url = `${component.origin}/_view/v/index.html?content=alpha%2Cbeta`;
    component.urlInputAdd = 'url';
    component.dataChangedAdd({ target: { value: url } } as unknown as Event);
    expect(component.textAreaAdd).toBe('alpha,beta');

    component.urlInputAdd = 'list';
    component.dataChangedAdd({ target: { value: 'alpha\nbeta' } } as unknown as Event);
    expect(component.addChannelForm.value.addValue).toContain('/_view/v/index.html?content=');

    component.urlInputEdit = 'url';
    component.dataChangedEdit({ target: { value: url } } as unknown as Event);
    expect(component.textAreaEdit).toBe('alpha,beta');

    component.urlInputEdit = 'list';
    component.dataChangedEdit({ target: { value: 'alpha\nbeta' } } as unknown as Event);
    expect(component.editChannelForm.value.editValue).toContain('/_view/v/index.html?content=');

    component.dataChangedAdd({} as Event);
    component.dataChangedEdit({} as Event);
    expect(component.buildUrlForList('  ')).toBe('');
    expect(component.buildUrlForList('alpha\nbeta')).toContain('content=alpha,beta');
    expect(component.buildPlaylist({ value: url } as Entry)).toEqual(['alpha,beta']);
    expect(component.buildPlaylist({ value: 'not-a-playlist' } as Entry)).toBeUndefined();
    expect(component.buildPlaylist({ value: '' } as Entry)).toBeUndefined();
    expect(component.buildPlaylist(undefined as any)).toBeUndefined();
  });

  it('should cancel edits and restore the previous state', fakeAsync(() => {
    const original = { name: 'original', displayName: 'original', value: 'value', tags: ['old'] } as unknown as Entry;
    component.savedEntry = { ...original };
    component.savedTags = ['saved'];
    component.entry = { ...original, tags: ['new'] } as Entry;
    component.tags = ['current'];
    component.textAreaEdit = 'dirty';
    component.editChannelForm.reset({ editName: 'changed', editValue: 'changed' });
    component.view = 'edit';
    component.vscrollPosition = 25;
    component.vscrollTrack = false;
    window.scrollTo = jest.fn() as any;

    component.cancelEditing();

    expect(component.view).toBe('list');
    expect(component.tags).toEqual([]);
    expect(component.entry).toBeUndefined();
    expect(component.savedEntry).toBeUndefined();
    tick();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 25);
    expect(component.vscrollTrack).toBe(true);
  }));

  it('should cancel adding and restore the previous list position', fakeAsync(() => {
    component.view = 'add';
    component.vscrollPosition = 75;
    component.vscrollTrack = false;
    window.scrollTo = jest.fn() as any;

    component.cancelAdding();

    expect(component.view).toBe('list');
    expect(component.vscrollTrack).toBe(false);
    tick();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 75);
    expect(component.vscrollTrack).toBe(true);
  }));

  it('should update an entry inside the list and sort by latest update', () => {
    const first = { _id: new ObjectId(), name: 'first', updatedAt: '2024-01-01T00:00:00.000Z' } as Entry;
    const second = { _id: new ObjectId(), name: 'second', updatedAt: '2024-02-01T00:00:00.000Z' } as Entry;
    component.items = [first, second];

    const updated = { ...second, updatedAt: '2024-03-01T00:00:00.000Z' } as Entry;
    component.updateEntryInList(updated);

    expect(component.items[0]).toBe(updated);
  });

  it('should edit and delete entries successfully', () => {
    const entry = { _id: new ObjectId(), name: 'edit-me', displayName: 'edit-me', value: 'before', tags: [] } as unknown as Entry;
    component.entry = entry;
    component.items = [entry];
    channelService.editEntry.mockReturnValue(of({}));

    component.editEntry({ editName: 'edited', editValue: 'after' });
    expect(component.view).toBe('list');
    expect(component.items[0].name).toBe('edited');

    component.deleteEntry(entry);
    expect(component.items).toEqual([]);
    expect(toast.setMessage).toHaveBeenCalledWith('Entry deleted successfully', 'success');
  });

  it('should surface edit and delete errors', () => {
    const entry = { _id: new ObjectId(), name: 'edit-me', displayName: 'edit-me', value: 'before', tags: [] } as unknown as Entry;
    component.entry = entry;
    channelService.editEntry.mockReturnValue(throwError(() => ({ error: { error: 'edit-failed' } })));
    component.editEntry({ editName: 'edited', editValue: 'after' });
    expect(component.showError).toBe('edit-failed');

    channelService.deleteEntry.mockReturnValue(throwError(() => ({ error: { error: 'delete-failed' } })));
    component.deleteEntry(entry);
    expect(component.showError).toBe('delete-failed');
  });

  it('should cover add-entry and validation branches', async () => {
    component.addChannelForm.patchValue({ addName: 'new-channel', addValue: 'value' });
    channelService.addEntry.mockReturnValue(throwError(() => ({ error: { error: 'add-failed' } })));
    await component.addEntry();
    expect(component.showError).toBe('add-failed');

    expect(component.asyncNameValidator({ value: '' } as any)).toBeDefined();
    component.savedEntry = { displayName: 'same-name' } as Entry;
    const sameName = component.asyncNameValidatorEdit({ value: 'same-name' } as any);
    expect(sameName).toBeDefined();

    channelService.checkNameAvailable.mockReturnValue(throwError(() => new Error('boom')));
    let caught: any;
    component.asyncNameValidatorEdit({ value: 'other' } as any).subscribe(result => { caught = result; });
    expect(caught).toBeNull();
  });

  it('should format timestamps and validate names asynchronously', fakeAsync(() => {
    expect(component.formatUpdatedAt(undefined)).toBe('');
    expect(component.formatUpdatedAt('2024-01-02T03:04:05.000Z')).toBeTruthy();

    let validatorResult: any;
    component.asyncNameValidator({ value: 'taken' } as any).subscribe(result => validatorResult = result);
    tick(500);
    expect(validatorResult).toBeNull();

    channelService.checkNameAvailable.mockReturnValue(of(false));
    let takenResult: any;
    component.asyncNameValidator({ value: 'taken' } as any).subscribe(result => takenResult = result);
    tick(500);
    expect(takenResult).toEqual({ nameTaken: true });

    component.savedEntry = { displayName: 'same-name' } as Entry;
    let sameEntryResult: any;
    component.asyncNameValidatorEdit({ value: 'same-name' } as any).subscribe(result => sameEntryResult = result);
    tick(500);
    expect(sameEntryResult).toBeNull();
  }));
});