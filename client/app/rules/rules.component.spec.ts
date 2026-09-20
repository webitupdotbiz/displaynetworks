import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { provideRouter } from '@angular/router';

import { RulesComponent } from './rules.component';
import { RuleService, Rule } from '../services/rules.service';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { ToastComponent } from '../shared/toast/toast.component';

const mockAuthService = {
  currentUser: {
    id: 'mock-user-id',
    role: 'admin'
  }
};

const dummyRule: Rule = {
  _id: 'rule_1',
  name: 'alpha-rule',
  owner: 'mock-user-id',
  overrideUrl: 'https://cdn.display.net/asset.mp4',
  matchStrategy: 'ANY',
  tags: ['boston', 'retail'],
  startTime: '08:00',
  endTime: '17:00',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  daysOfWeek: [1, 2, 3, 4, 5],
  scheduleType: 'CLIENT_CLOCK',
  timezone: 'UTC',
  isActive: true,
  priority: 100
};

const mockRuleService = {
  getOrderedRules: jest.fn(() => of({ rules: [dummyRule], count: 1 })),
  addRule: jest.fn((rule: Rule) => of({ ...rule, _id: 'new_rule_id', priority: 200 })),
  editRule: jest.fn((rule: Rule) => of(rule)),
  deleteRule: jest.fn((rule: Rule) => of({})),
  swapPriority: jest.fn((idA: string, idB: string, ownerId: string) => of({}))
};

const mockUserService = {
  getDropdownTags: jest.fn((id: string) => of(['boston', 'cambridge', 'waltham', 'retail', 'promo']))
};

const mockThemeService = {
  currentTheme: 'dark'
};

const mockToastComponent = {
  message: '',
  setMessage: jest.fn((msg: string, type: string) => {})
};

function createMockSelectEvent(value: string): Event {
  const select = document.createElement('select');
  const option = document.createElement('option');
  option.value = value;
  select.appendChild(option);
  select.value = value;

  const event = new Event('change', { bubbles: true });
  Object.defineProperty(event, 'target', { value: select, enumerable: true });
  return event;
}

function createMockInputEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;

  const event = new Event('input', { bubbles: true });
  Object.defineProperty(event, 'target', { value: input, enumerable: true });
  return event;
}

describe('Component: Rules', () => {
  let component: RulesComponent;
  let fixture: ComponentFixture<RulesComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [ RulesComponent, ReactiveFormsModule ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        FormBuilder,
        { provide: AuthService, useValue: mockAuthService },
        { provide: RuleService, useValue: mockRuleService },
        { provide: UserService, useValue: mockUserService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: ToastComponent, useValue: mockToastComponent }
      ],
      schemas: [ CUSTOM_ELEMENTS_SCHEMA ]
    }).compileComponents();

    fixture = TestBed.createComponent(RulesComponent);
    component = fixture.componentInstance;
    component.toast = mockToastComponent as any;
    fixture.detectChanges();
  });

  it('should construct reactive forms and pull operational rules on init', () => {
    expect(component).toBeTruthy();
    expect(mockRuleService.getOrderedRules).toHaveBeenCalled();
    expect(component.items.length).toBe(1);
    expect(component.total).toBe(1);
  });

  it('should isolate conditional layout rules based on user clearance profiles', () => {
    expect(component.hasAccess()).toBe(true);
    component.showError = 'Enforced access restriction failure';
    expect(component.hasAccess()).toBe(false);
  });

  it('should toggle view panels and pre-populate local dropdown tag repositories', fakeAsync(() => {
    component.vscrollPosition = 80;
    component.enableAdding();
    expect(component.view).toBe('add');
    expect(mockUserService.getDropdownTags).toHaveBeenCalledWith('mock-user-id');
    expect(component.selectableTags).toContain('cambridge');
    expect(component.selectableTags).toContain('boston');

    component.cancelAdding();
    expect(component.view).toBe('list');
    expect(component.vscrollTrack).toBe(false);
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    tick();
    expect(scrollSpy).toHaveBeenCalledWith(0, 80);
    expect(component.vscrollTrack).toBe(true);
  }));

  it('should append missing strings inside targeting tag arrays and prevent duplicates', () => {
    component.enableAdding();
    const mockEvent: Event = createMockSelectEvent('cambridge');
    component.onTagSelected(mockEvent);

    expect(component.currentTags).toContain('cambridge');
    expect(component.selectableTags).not.toContain('cambridge');

    component.onTagSelected(mockEvent);
    expect(component.currentTags.filter(t => t === 'cambridge').length).toBe(1);
  });

  it('should extract target metrics when removing tags from array variables', () => {
    component.enableAdding();
    const mockEvent: Event = createMockSelectEvent('waltham');
    component.onTagSelected(mockEvent);
    expect(component.currentTags).toContain('waltham');

    component.removeTag('waltham');
    expect(component.currentTags).not.toContain('waltham');
    expect(component.selectableTags).toContain('waltham');
  });

  it('should manage schedule checkbox arrays through matrix selection updates', () => {
    component.enableAdding();
    expect(component.isDaySelected(2)).toBe(false);

    component.toggleDay(2);
    expect(component.isDaySelected(2)).toBe(true);

    component.toggleDay(2);
    expect(component.isDaySelected(2)).toBe(false);
  });

  it('should allow overnight time ranges for add and edit forms', () => {
    component.enableAdding();
    component.addStartTime.setValue('23:00');
    component.addEndTime.setValue('02:00');
    expect(component.addTimeRangeInvalid).toBe(false);

    component.enableEditing(dummyRule);
    component.editStartTime.setValue('23:00');
    component.editEndTime.setValue('02:00');
    expect(component.editTimeRangeInvalid).toBe(false);
  });

  it('should push verified payload entities downstream during insertion actions', async () => {
    component.enableAdding();
    component.addRuleForm.patchValue({
      addName: 'delta-rule',
      addOverrideUrl: 'https://cdn.display.net/delta.mp4',
      addMatchStrategy: 'ALL',
      addNotes: 'Texas'
    });

    await component.addRule();

    expect(mockRuleService.addRule).toHaveBeenCalledWith(expect.objectContaining({
      notes: 'Texas',
      search: 'delta-rule texas'
    }));
    expect(component.view).toBe('list');
    expect(mockToastComponent.setMessage).toHaveBeenCalledWith('Rule added successfully', 'success');
  });

  it('should display diagnostic errors when rule verification requests crash', async () => {
    mockRuleService.addRule.mockImplementationOnce(() => throwError(() => ({ error: { error: 'Invalid name parameter pattern' } })));
    component.enableAdding();
    component.addRuleForm.patchValue({ addName: 'invalid_name_chars' });

    await component.addRule();

    expect(mockToastComponent.setMessage).toHaveBeenCalledWith('Invalid name parameter pattern', 'danger');
    expect(component.working).toBe(false);
  });

  it('should deserialize rule instances into form group tracking values on edit switches', () => {
    component.enableEditing(dummyRule);
    expect(component.view).toBe('edit');
    expect(component.editRuleForm.get('editName')?.value).toBe('alpha-rule');

    component.cancelEditing();
    expect(component.view).toBe('list');
  });

  it('should post updated structural changes when operational rule properties mutate', () => {
    component.enableEditing({ ...dummyRule });
    const formValues = {
      editName: 'mutated-alpha',
      editOverrideUrl: 'https://cdn.display.net/mutated.mp4',
      editMatchStrategy: 'ALL' as const,
      editScheduleType: 'GLOBAL_INSTANT' as const,
      editTimezone: 'UTC',
      editStartTime: '09:00',
      editEndTime: '18:00',
      editStartDate: '2026-02-01',
      editEndDate: '2026-11-30',
      editIsActive: true,
      editTags: ['retail'],
      editDaysOfWeek: [1, 2],
      editNotes: 'Toast'
    };

    component.editEntry(formValues);

    expect(mockRuleService.editRule).toHaveBeenCalledWith(expect.objectContaining({
      notes: 'Toast',
      search: 'mutated-alpha retail toast'
    }));
    expect(component.view).toBe('list');
    expect(mockToastComponent.setMessage).toHaveBeenCalledWith('Rule updated successfully.', 'success');
  });

  it('should trigger target item index splitting arrays during entry deletions', () => {
    component.items = [{ ...dummyRule }];
    component.deleteEntry(dummyRule);

    expect(mockRuleService.deleteRule).toHaveBeenCalledWith(dummyRule);
    expect(component.items.length).toBe(0);
    expect(mockToastComponent.setMessage).toHaveBeenCalledWith('Rule deleted successfully', 'success');
  });

  it('should change sequence ordering targets when index shifts happen', async () => {
    const secondaryRule = { ...dummyRule, _id: 'rule_2', priority: 50 };
    component.items = [dummyRule, secondaryRule];

    await component.movePriority(0, 'down');

    expect(component.items[0]._id).toBe('rule_2');
    expect(component.items[1]._id).toBe('rule_1');
    expect(mockRuleService.swapPriority).toHaveBeenCalled();
  });

  it('should fallback to baseline layout structures if priority shifts throw database errors', async () => {
    mockRuleService.swapPriority.mockImplementationOnce(() => throwError(() => new Error('Lock failure')));
    const secondaryRule = { ...dummyRule, _id: 'rule_2', priority: 50 };
    component.items = [dummyRule, secondaryRule];

    await component.movePriority(0, 'down');

    expect(component.items[0]._id).toBe('rule_1');
    expect(mockToastComponent.setMessage).toHaveBeenCalledWith('Failed to preserve list order adjustments.', 'danger');
  });

  it('should structure search bar context parameters through matching wildcards', () => {
    const entry: Rule = { ...dummyRule, name: 'BETA-testing', tags: ['PROMO', 'local'] };
    component.setSearchField(entry);
    expect(entry.search).toBe('beta-testing promo local');
  });

  it('should include notes content in the search text', () => {
    const entry: Rule = { ...dummyRule, name: 'BETA-testing', tags: [], notes: 'Lobby SCREEN' };
    component.setSearchField(entry);
    expect(entry.search).toBe('beta-testing lobby screen');
  });

  it('should construct fallback layout strings on search placeholders', () => {
    component.items = [];
    expect(component.getSearchPlaceholder()).toBe('Rules');

    component.items = [dummyRule];
    component.total = 1;
    expect(component.getSearchPlaceholder()).toBe('Rules (1)');
  });

  it('should calculate the current theme state colors', () => {
    expect(component.getThemeBackground()).toBe('#111');
  });

  it('should pass ISO layout definitions through dates safely', () => {
    expect(component.formatUpdatedAt(null)).toBe('');
    expect(component.formatUpdatedAt(undefined)).toBe('');
  });

  it('should cover tag-loading and fetch-all fallback branches', () => {
    (component as any).auth.currentUser = { id: undefined, role: '' };
    (component as any).loadExistingTags();
    expect(mockUserService.getDropdownTags).not.toHaveBeenCalled();

    (component as any).auth.currentUser = { id: 'user-1', role: 'user' };
    mockRuleService.getOrderedRules.mockReturnValueOnce(throwError(() => ({ error: { error: 'boom' } })));
    (component as any).fetchAll();
    expect(component.showError).toBe('boom');
  });

  it('should cover the subscription callbacks and current-tags getter branches', () => {
    component.addUseTimeRestriction.setValue(false);
    component.addUseDayRestriction.setValue(false);
    component.addUseDateRestriction.setValue(false);
    expect(component.addStartTime.value).toBeNull();
    expect(component.addRuleForm.controls.addDaysOfWeek.value).toEqual([]);
    expect(component.addStartDate.value).toBeNull();

    component.addUseTimeRestriction.setValue(true);
    component.addUseDayRestriction.setValue(true);
    component.addUseDateRestriction.setValue(true);

    component.view = 'edit';
    component.editRuleForm.get('editTags')?.setValue(['alpha']);
    expect(component.currentTags).toEqual(['alpha']);

    component.editUseTimeRestriction.setValue(false);
    component.editUseDayRestriction.setValue(false);
    component.editUseDateRestriction.setValue(false);
    expect(component.editStartTime.value).toBeNull();
    expect(component.editRuleForm.controls.editDaysOfWeek.value).toEqual([]);
    expect(component.editStartDate.value).toBeNull();
  });

  it('should expose date and time range validity for add and edit flows', () => {
    component.addStartTime.setValue('09:00');
    component.addEndTime.setValue('09:00');
    expect(component.addTimeRangeInvalid).toBe(true);

    component.addStartDate.setValue('2026-02-02');
    component.addEndDate.setValue('2026-02-01');
    expect(component.addDateRangeInvalid).toBe(true);

    component.editStartTime.setValue('10:00');
    component.editEndTime.setValue('10:00');
    expect(component.editTimeRangeInvalid).toBe(true);

    component.editStartDate.setValue('2026-03-02');
    component.editEndDate.setValue('2026-03-01');
    expect(component.editDateRangeInvalid).toBe(true);
  });

  it('should convert list content into a URL and back', () => {
    expect(component.buildUrlForList('alpha\n beta ')).toContain('/_view/v/index.html?content=alpha,beta');
    expect(component.buildPlaylist({ overrideUrl: `${component.origin}/_view/v/index.html?content=alpha,beta` } as Rule)).toEqual(['alpha', 'beta']);
    expect(component.buildPlaylist({ overrideUrl: 'https://example.com' } as Rule)).toBeUndefined();
  });

  it('should update the URL field from textarea input and vice versa', () => {
    component.enableAdding();
    component.urlInputAdd = 'url';
    component.dataChangedAdd(createMockInputEvent('https://cdn.display.net/asset.mp4'));
    expect(component.textAreaAdd).toBe('');

    component.urlInputAdd = 'list';
    component.textAreaAdd = 'alpha\n beta';
    component.dataChangedAdd(createMockInputEvent('alpha\n beta'));
    expect(component.addRuleForm.controls['addOverrideUrl'].value).toContain('/_view/v/index.html?content=alpha%20beta');

    component.urlInputAdd = 'url';
    component.dataChangedAdd(createMockInputEvent('not-a-playlist'));
    expect(component.textAreaAdd).toBe('');

    component.urlInputAdd = 'url';
    component.dataChangedAdd(createMockInputEvent(`${component.origin}/_view/v/index.html?content=alpha,beta`));
    expect(component.textAreaAdd).toBe('alpha\nbeta');

    component.urlInputAdd = 'list';
    component.dataChangedAdd(createMockInputEvent('   '));
    expect(component.addRuleForm.controls['addOverrideUrl'].value).toBe('');

    component.enableEditing(dummyRule);
    component.urlInputEdit = 'list';
    component.textAreaEdit = 'gamma\n delta';
    component.dataChangedEdit(createMockInputEvent('gamma\n delta'));
    expect(component.editRuleForm.controls['editOverrideUrl'].value).toContain('/_view/v/index.html?content=gamma%20delta');

    component.urlInputEdit = 'url';
    component.dataChangedEdit(createMockInputEvent('not-a-playlist'));
    expect(component.textAreaEdit).toBe('');

    component.urlInputEdit = 'url';
    component.dataChangedEdit(createMockInputEvent(`${component.origin}/_view/v/index.html?content=gamma,beta`));
    expect(component.textAreaEdit).toBe('gamma\nbeta');

    component.urlInputEdit = 'list';
    component.dataChangedEdit(createMockInputEvent('   '));
    expect(component.editRuleForm.controls['editOverrideUrl'].value).toBe('');

    component.dataChangedAdd({ target: null } as unknown as Event);
    component.dataChangedEdit({ target: null } as unknown as Event);
    expect(component.textAreaAdd).toBe('alpha\nbeta');
  });

  it('should cover playlist and source-type fallback branches', () => {
    expect(component.buildUrlForList('   ')).toBe('');
    expect(component.buildPlaylist(undefined as unknown as Rule)).toBeUndefined();
    expect(component.buildPlaylist({ overrideUrl: `${component.origin}/_view/v/index.html?content=` } as Rule)).toBeUndefined();

    const playlistRule = { ...dummyRule, overrideUrl: `${component.origin}/_view/v/index.html?content=alpha,beta` } as Rule;
    component.enableEditing(playlistRule);
    expect(component.textAreaEdit).toBe('alpha\nbeta');

    component.onSourceTypeChangeAdd();
    component.onSourceTypeChangeEdit();
    expect(component.addRuleForm.controls['addOverrideUrl'].value).toBeDefined();
  });

  it('should handle tag-loading failures and finish cancel-edit cleanup', fakeAsync(() => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUserService.getDropdownTags.mockReturnValueOnce(throwError(() => new Error('tags failed')));
    component.vscrollPosition = 120;
    component.vscrollTrack = false;
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    component.enableEditing(dummyRule);
    component.cancelEditing();
    tick();

    expect(consoleSpy).toHaveBeenCalledWith('Failed to retrieve channel tags:', expect.anything());
    expect(scrollSpy).toHaveBeenCalledWith(0, 120);
    expect(component.vscrollTrack).toBe(true);
  }));

  it('should cover edit and delete error branches plus priority guard conditions', async () => {
    component.entry = dummyRule;
    mockRuleService.editRule.mockReturnValueOnce(throwError(() => ({ error: { error: 'bad edit' } })));
    component.editEntry({
      editName: 'x',
      editOverrideUrl: 'https://cdn.display.net/x.mp4',
      editMatchStrategy: 'ANY',
      editScheduleType: 'CLIENT_CLOCK',
      editTimezone: 'UTC',
      editStartTime: null,
      editEndTime: null,
      editStartDate: null,
      editEndDate: null,
      editIsActive: true,
      editTags: [],
      editDaysOfWeek: []
    } as any);
    expect(component.showError).toBe('bad edit');

    mockRuleService.deleteRule.mockReturnValueOnce(throwError(() => ({ error: { error: 'bad delete' } })));
    component.deleteEntry(dummyRule);
    expect(component.showError).toBe('bad delete');

    component.items = [dummyRule];
    await component.movePriority(0, 'down');
    expect(mockRuleService.swapPriority).not.toHaveBeenCalled();
  });

  it('should skip canceling edit mode when no entry exists', () => {
    component.entry = undefined;
    component.savedEntry = undefined;

    component.cancelEditing();

    expect(component.view).toBe('list');
  });
});