import { Component, ViewChild, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { BaseTableComponent } from '../shared/base-table.component';
import { AuthService } from '../services/auth.service';
import { Rule, RuleService, RuleResponseData } from '../services/rules.service';
import { UserService } from '../services/user.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { TagsComponent } from '../shared/tags/tags.component';
import { LoadingComponent } from '../shared/loading/loading.component';
import { NavLinksComponent } from '../shared/nav-links/nav-links.component';
import { NavbarBrandComponent } from '../shared/navbar-brand/navbar-brand.component';
import { AppConfirmModal } from '../shared/confirm-modal/confirm-modal.component';
import { ThemeService } from '../services/theme.service';
import { TimezoneSelectComponent, getBrowserTimezoneOrUtc } from '../shared/timezone-select/timezone-select.component';

interface EditRuleFormValue {
  editName: string;
  editOverrideUrl: string;
  editMatchStrategy: 'ANY' | 'ALL';
  editScheduleType: 'CLIENT_CLOCK' | 'GLOBAL_INSTANT';
  editTimezone: string;
  editStartTime: string | null;
  editEndTime: string | null;
  editStartDate: string | null;
  editEndDate: string | null;
  editIsActive: boolean;
  editTags: string[];
  editDaysOfWeek: number[];
  editNotes: string;
}

@Component({
  selector: 'app-rules',
  templateUrl: './rules.component.html',
  styleUrls: ['./rules.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastComponent, LoadingComponent, NavLinksComponent, NavbarBrandComponent, AppConfirmModal, TimezoneSelectComponent]
})
export class RulesComponent extends BaseTableComponent<Rule> implements OnInit {

  origin = window.location.origin;
  allExistingTags: string[] = [];
  selectableTags: string[] = [];
  savedEntry: Rule | undefined;
  entry: Rule | undefined;
  private ruleService = inject(RuleService);
  private userService = inject(UserService);
  public auth = inject(AuthService);
  private formBuilder = inject(FormBuilder);
  private router = inject(Router, { optional: true });
  private route = inject(ActivatedRoute, { optional: true });
  private location = inject(Location, { optional: true });
  @ViewChild(ToastComponent, { static: true }) public toast!: ToastComponent;
  private themeService = inject(ThemeService);

  override listlastDate: number | undefined = undefined;

  urlInputAdd = 'url';
  textAreaAdd = '';
  textAreaEdit = '';
  urlInputEdit = 'url';

  scheduleTypeOptions: Array<'CLIENT_CLOCK' | 'GLOBAL_INSTANT'> = ['CLIENT_CLOCK', 'GLOBAL_INSTANT'];

  daysOfWeekList = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 }
  ];

  tagSelectControl = new FormControl<string>('', { nonNullable: true });

  addRuleForm: FormGroup<{
    addName: FormControl<string>;
    owner: FormControl<string>;
    addOverrideUrl: FormControl<string>;
    addMatchStrategy: FormControl<'ANY' | 'ALL'>;
    addScheduleType: FormControl<'CLIENT_CLOCK' | 'GLOBAL_INSTANT'>;
    addTimezone: FormControl<string>;
    addStartTime: FormControl<string | null>;
    addEndTime: FormControl<string | null>;
    addStartDate: FormControl<string | null>;
    addEndDate: FormControl<string | null>;
    addTags: FormControl<string[]>;
    addDaysOfWeek: FormControl<number[]>;
    addUseTimeRestriction: FormControl<boolean>;
    addUseDayRestriction: FormControl<boolean>;
    addUseDateRestriction: FormControl<boolean>;
    addNotes: FormControl<string>;
  }> = new FormGroup({}) as any;

  addName = new FormControl<string>('', { 
    nonNullable: true,
    validators: [Validators.required]
  });
  addOverrideUrl = new FormControl<string>('', { nonNullable: true, validators: Validators.required });
  addMatchStrategy = new FormControl<'ANY' | 'ALL'>('ANY', { nonNullable: true, validators: Validators.required });
  addScheduleType = new FormControl<'CLIENT_CLOCK' | 'GLOBAL_INSTANT'>('CLIENT_CLOCK', { nonNullable: true, validators: Validators.required });
  addTimezone = new FormControl<string>(getBrowserTimezoneOrUtc(), { nonNullable: true, validators: Validators.required });
  addStartTime = new FormControl<string | null>(null);
  addEndTime = new FormControl<string | null>(null);
  addStartDate = new FormControl<string | null>(null);
  addEndDate = new FormControl<string | null>(null);
  addUseTimeRestriction = new FormControl<boolean>(false, { nonNullable: true });
  addUseDayRestriction = new FormControl<boolean>(false, { nonNullable: true });
  addUseDateRestriction = new FormControl<boolean>(false, { nonNullable: true });
  addNotes = new FormControl<string>('', { nonNullable: true });
  editUseTimeRestriction = new FormControl<boolean>(false, { nonNullable: true });
  editUseDayRestriction = new FormControl<boolean>(false, { nonNullable: true });
  editUseDateRestriction = new FormControl<boolean>(false, { nonNullable: true });
  editNotes = new FormControl<string>('', { nonNullable: true });

  editRuleForm: FormGroup<{
    editName: FormControl<string>;
    editOverrideUrl: FormControl<string>;
    editMatchStrategy: FormControl<'ANY' | 'ALL'>;
    editScheduleType: FormControl<'CLIENT_CLOCK' | 'GLOBAL_INSTANT'>;
    editTimezone: FormControl<string>;
    editStartTime: FormControl<string | null>;
    editEndTime: FormControl<string | null>;
    editStartDate: FormControl<string | null>;
    editEndDate: FormControl<string | null>;
    editIsActive: FormControl<boolean>;
    editTags: FormControl<string[]>;
    editDaysOfWeek: FormControl<number[]>;
    editUseTimeRestriction: FormControl<boolean>;
    editUseDayRestriction: FormControl<boolean>;
    editUseDateRestriction: FormControl<boolean>;
    editNotes: FormControl<string>;
  }> = new FormGroup({}) as any;

  editName = new FormControl<string>('', { 
    nonNullable: true,
    validators: [Validators.required]
  });
  editOverrideUrl = new FormControl<string>('', { nonNullable: true, validators: Validators.required });
  editMatchStrategy = new FormControl<'ANY' | 'ALL'>('ANY', { nonNullable: true, validators: Validators.required });
  editScheduleType = new FormControl<'CLIENT_CLOCK' | 'GLOBAL_INSTANT'>('CLIENT_CLOCK', { nonNullable: true, validators: Validators.required });
  editTimezone = new FormControl<string>(getBrowserTimezoneOrUtc(), { nonNullable: true, validators: Validators.required });
  editStartTime = new FormControl<string | null>(null);
  editEndTime = new FormControl<string | null>(null);
  editStartDate = new FormControl<string | null>(null);
  editEndDate = new FormControl<string | null>(null);
  editIsActive = new FormControl<boolean>(true, { nonNullable: true });

  override ngOnInit(): void {
    const initialOwner = this.auth.currentUser.role !== 'groupadmin'
      ? this.auth.currentUser.role
      : this.auth.currentUser.id?.toString() ?? '';

    this.addRuleForm = new FormGroup({
      addName: this.addName,
      owner: new FormControl(
        initialOwner, 
        { nonNullable: true, validators: Validators.required }
      ),
      addOverrideUrl: this.addOverrideUrl,
      addMatchStrategy: this.addMatchStrategy,
      addScheduleType: this.addScheduleType,
      addTimezone: this.addTimezone,
      addStartTime: this.addStartTime,
      addEndTime: this.addEndTime,
      addStartDate: this.addStartDate,
      addEndDate: this.addEndDate,
      addTags: new FormControl<string[]>([], { nonNullable: true }),
      addDaysOfWeek: new FormControl<number[]>([], { nonNullable: true }),
      addUseTimeRestriction: this.addUseTimeRestriction,
      addUseDayRestriction: this.addUseDayRestriction,
      addUseDateRestriction: this.addUseDateRestriction,
      addNotes: this.addNotes
    });

    this.editRuleForm = new FormGroup({
      editName: this.editName,
      editOverrideUrl: this.editOverrideUrl,
      editMatchStrategy: this.editMatchStrategy,
      editScheduleType: this.editScheduleType,
      editTimezone: this.editTimezone,
      editStartTime: this.editStartTime,
      editEndTime: this.editEndTime,
      editStartDate: this.editStartDate,
      editEndDate: this.editEndDate,
      editIsActive: this.editIsActive,
      editTags: new FormControl<string[]>([], { nonNullable: true }),
      editDaysOfWeek: new FormControl<number[]>([], { nonNullable: true }),
      editUseTimeRestriction: this.editUseTimeRestriction,
      editUseDayRestriction: this.editUseDayRestriction,
      editUseDateRestriction: this.editUseDateRestriction,
      editNotes: this.editNotes
    });

    this.addUseTimeRestriction.valueChanges.subscribe(enabled => {
      if (!enabled) {
        this.addStartTime.setValue(null);
        this.addEndTime.setValue(null);
      }
    });

    this.addUseDayRestriction.valueChanges.subscribe(enabled => {
      if (!enabled) {
        this.addRuleForm.controls.addDaysOfWeek.setValue([]);
      }
    });

    this.addUseDateRestriction.valueChanges.subscribe(enabled => {
      if (!enabled) {
        this.addStartDate.setValue(null);
        this.addEndDate.setValue(null);
      }
    });

    this.editUseTimeRestriction.valueChanges.subscribe(enabled => {
      if (!enabled) {
        this.editStartTime.setValue(null);
        this.editEndTime.setValue(null);
      }
    });

    this.editUseDayRestriction.valueChanges.subscribe(enabled => {
      if (!enabled) {
        this.editRuleForm.controls.editDaysOfWeek.setValue([]);
      }
    });

    this.editUseDateRestriction.valueChanges.subscribe(enabled => {
      if (!enabled) {
        this.editStartDate.setValue(null);
        this.editEndDate.setValue(null);
      }
    });

    this.route?.data?.subscribe(data => this.applyRouteView(data['view']));
    super.ngOnInit();
  }

  private applyRouteView(view: unknown): void {
    if (view === 'add') {
      this.openAddForm();
      return;
    }

    if (view === 'edit') {
      const ruleId = this.route?.snapshot.paramMap.get('id');
      const ownerId = this.getOwnerId();
      if (!ruleId || !ownerId) {
        this.showError = 'Rule not found';
        return;
      }
      this.ruleService.getRule(ownerId, ruleId).subscribe({
        next: rule => this.openEditForm(rule),
        error: error => this.showError = error?.error?.error ?? 'Rule not found'
      });
      return;
    }

    this.view = 'list';
  }

  get currentTags(): string[] {
    const control = this.view === 'add'
      ? this.addRuleForm?.get('addTags')
      : this.editRuleForm?.get('editTags');
    const value = control?.value;
    return Array.isArray(value) ? value : [];
  }

  private loadExistingTags(): void {
    let id = this.auth.currentUser.id?.toString();
    if (this.auth.currentUser.role !== 'admin' && this.auth.currentUser.role !== 'groupadmin') {
      id = this.auth.currentUser.role;
    }
    if (!id) return;

    this.userService.getDropdownTags(id).subscribe({
      next: (res: any) => {
        const extractedTags = Array.isArray(res) ? res : (res?.tags || res?.data || []);
        this.allExistingTags = Array.from(
          new Set(
            extractedTags
              .filter((tag: unknown): tag is string => typeof tag === 'string')
              .map((tag: string) => tag.trim())
              .filter((tag: string) => tag.length > 0)
          )
        );
        this.updateSelectableTags();
      },
      error: (err) => console.error('Failed to retrieve channel tags:', err)
    });
  }

  private updateSelectableTags(): void {
    this.selectableTags = this.allExistingTags.filter(tag => !this.currentTags.includes(tag));
  }

  onTagSelected(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const selectedTag = selectElement.value;
    if (selectedTag) {
      const control = this.view === 'add'
        ? this.addRuleForm?.get('addTags') as FormControl<string[]> | null
        : this.editRuleForm?.get('editTags') as FormControl<string[]> | null;
      const current = Array.isArray(control?.value) ? control.value : [];
      if (!current.includes(selectedTag)) {
        control?.setValue([...current, selectedTag]);
        control?.markAsDirty();
        this.updateSelectableTags();
      }
    }
    this.tagSelectControl.setValue('');
  }

  removeTag(tagToRemove: string): void {
    const control = this.view === 'add' ? this.addRuleForm.get('addTags') : this.editRuleForm.get('editTags');
    const current = control?.value || [];
    control?.setValue(current.filter(t => t !== tagToRemove));
    control?.markAsDirty();
    this.updateSelectableTags();
  }

  get addTimeRangeInvalid(): boolean {
    return !!this.addStartTime.value &&
          !!this.addEndTime.value &&
          this.addStartTime.value === this.addEndTime.value;
  }

  get editTimeRangeInvalid(): boolean {
    return !!this.editStartTime.value &&
          !!this.editEndTime.value &&
          this.editStartTime.value === this.editEndTime.value;
  }

  get addDateRangeInvalid(): boolean {
    return !!this.addStartDate.value &&
          !!this.addEndDate.value &&
          this.addStartDate.value > this.addEndDate.value;
  }

  get editDateRangeInvalid(): boolean {
    return !!this.editStartDate.value &&
          !!this.editEndDate.value &&
          this.editStartDate.value > this.editEndDate.value;
  }

  isDaySelected(dayValue: number): boolean {
    const control = this.view === 'add' ? this.addRuleForm.get('addDaysOfWeek') : this.editRuleForm.get('editDaysOfWeek');
    return control?.value?.includes(dayValue) || false;
  }

  toggleDay(dayValue: number): void {
    const control = this.view === 'add' ? this.addRuleForm.get('addDaysOfWeek') : this.editRuleForm.get('editDaysOfWeek');
    const current = control?.value || [];
    const updated = current.includes(dayValue) 
      ? current.filter(d => d !== dayValue) 
      : [...current, dayValue];
    
    control?.setValue(updated);
    control?.markAsDirty();
  }

  protected override fetchAll(): void {
    let id = this.auth.currentUser.id?.toString();
    if (this.auth.currentUser.role !== 'admin' && this.auth.currentUser.role !== 'groupadmin') {
      id = this.auth.currentUser.role;
    }
    if (!id) return;

    const params = this.term ? { term: this.term } : undefined;
  
    this.ruleService.getOrderedRules(id, this.listlastDate, params).subscribe({
      next: (data) => this.handleResponseData(data),
      error: (error) => {
        console.log("getOrderedRules failure:", error);
        this.isLoading = false;
        this.showError = error.error?.error ?? "An unexpected network error occurred.";
      },
      complete: () => {
        this.isLoading = false;
        this.tableLoading = false;
        this.inProgress = false;
      },
    });
  }

  private handleResponseData(data: RuleResponseData): void {
    for (let ii = 0; ii < data.rules.length; ii++) {
      this.items.push(data.rules[ii]);
    }
    this.total = data.count;
    this.listlastDate = data.rules.length > 0 ? data.rules[data.rules.length - 1].priority : undefined;
  }

  override getSearchPlaceholder(): string {
    let word = "Rules";
    if (this.term) word = this.term;
    if (this.items.length <= 0) return word;
    return `${word} (${this.total})`;
  }

  override getThemeBackground(): string {
    return this.themeService.currentTheme === 'light' ? 'white' : '#111';
  }

  setSearchField(entry: Rule): void {
    let name = entry.name.toLowerCase();
    let tagstr = entry.tags && entry.tags.length === 0 ? "" : entry.tags.join(" ").toLowerCase();
    let notestr = entry.notes ? entry.notes.toLowerCase() : "";
    entry.search = [name, tagstr, notestr].filter(part => part).join(" ");
  }

  hasAccess(): boolean {
    if (this.showError) return false;
    if (!this.auth || !this.auth.currentUser) return false;
    return true;
  }

  async addRule(): Promise<void> {
    this.showError = undefined;
    this.working = true;
  
    const formValue = this.addRuleForm.getRawValue();
    let rule: Rule = {
      name: formValue.addName,
      owner: formValue.owner,
      overrideUrl: formValue.addOverrideUrl,
      matchStrategy: formValue.addMatchStrategy,
      scheduleType: formValue.addScheduleType,
      timezone: formValue.addTimezone || 'UTC',
      tags: formValue.addTags,
      startTime: formValue.addStartTime || null,
      endTime: formValue.addEndTime || null,
      startDate: formValue.addStartDate || null,
      endDate: formValue.addEndDate || null,
      daysOfWeek: formValue.addDaysOfWeek,
      notes: formValue.addNotes ?? '',
      isActive: true
    };
  
    this.setSearchField(rule);
  
    try {
      const newRule = await firstValueFrom(this.ruleService.addRule(rule));
      this.items.unshift(newRule);
      this.total += 1;
      
      const nextOwner = this.auth.currentUser.role !== 'groupadmin' 
        ? this.auth.currentUser.role 
        : this.auth.currentUser.id?.toString() ?? '';
        
      this.addRuleForm.reset({ 
        addMatchStrategy: 'ANY', 
        addScheduleType: 'CLIENT_CLOCK',
        addTimezone: getBrowserTimezoneOrUtc(),
        addTags: [], 
        addDaysOfWeek: [],
        addNotes: '',
        owner: nextOwner
      });
      this.updateSelectableTags();
      this.view = 'list';
      this.vscrollTrack = true;
      this.toast.setMessage('Rule added successfully', 'success');
      this.navigateToListAfterMutation();
    } catch (error) {
      const err = BaseTableComponent.extractErrorMessage(error);;
      this.toast.setMessage(err, 'danger');
    } finally {
      this.working = false;
    }
  }

  enableAdding(): void {
    if (this.usesRouterNavigation()) {
      this.router?.navigate(['/_rules/new'], { state: { returnToList: true } });
      return;
    }
    this.openAddForm();
  }

  private openAddForm(): void {
    this.vscrollTrack = false;
    this.previousView = "list";
    this.view = "add";
    this.updateSelectableTags();
    this.tagSelectControl.setValue('');
    this.textAreaAdd = '';
    this.urlInputAdd = 'url';
    this.loadExistingTags();
  }

  cancelAdding(): void {
    if (this.usesRouterNavigation()) {
      this.returnToList();
      return;
    }
    this.showError = undefined;
    const fallbackOwner = this.auth.currentUser.role !== 'groupadmin' 
      ? this.auth.currentUser.role 
      : this.auth.currentUser.id?.toString() ?? '';

    this.addRuleForm.reset({ 
      addMatchStrategy: 'ANY', 
      addScheduleType: 'CLIENT_CLOCK',
      addTimezone: getBrowserTimezoneOrUtc(),
      addTags: [], 
      addDaysOfWeek: [],
      addUseTimeRestriction: false,
      addUseDayRestriction: false,
      addUseDateRestriction: false,
      addNotes: '',
      owner: fallbackOwner
    });
    this.textAreaAdd = '';
    this.urlInputAdd = 'url';
    this.view = "list";
    this.entry = undefined;
    setTimeout(() => {
      window.scrollTo(0, this.vscrollPosition);
      this.vscrollTrack = true;
    });
  }

  enableEditing(rule: Rule): void {
    if (this.usesRouterNavigation() && rule._id) {
      this.router?.navigate(['/_rules', rule._id, 'edit'], { state: { returnToList: true } });
      return;
    }
    this.openEditForm(rule);
  }

  private openEditForm(rule: Rule): void {
    this.showError = undefined;
    this.vscrollTrack = false;
    this.previousView = "list";
    this.view = "edit";
    this.savedEntry = Object.assign({}, rule);
    this.entry = rule;
    this.loadExistingTags();

    const formattedStartDate = rule.startDate ? new Date(rule.startDate).toISOString().substring(0, 10) : null;
    const formattedEndDate = rule.endDate ? new Date(rule.endDate).toISOString().substring(0, 10) : null;

    this.editRuleForm.reset({ 
      editName: rule.name,
      editOverrideUrl: rule.overrideUrl,
      editMatchStrategy: rule.matchStrategy,
      editScheduleType: rule.scheduleType || 'CLIENT_CLOCK',
      editTimezone: rule.timezone || getBrowserTimezoneOrUtc(),
      editStartTime: rule.startTime,
      editEndTime: rule.endTime,
      editStartDate: formattedStartDate,
      editEndDate: formattedEndDate,
      editIsActive: rule.isActive,
      editTags: [...rule.tags],
      editDaysOfWeek: [...rule.daysOfWeek],
      editUseTimeRestriction: !!rule.startTime || !!rule.endTime,
      editUseDayRestriction: rule.daysOfWeek?.length > 0,
      editUseDateRestriction: !!rule.startDate || !!rule.endDate,
      editNotes: rule.notes ?? ''
});

    this.updateSelectableTags();
    this.tagSelectControl.setValue('');
    
    const playlist = this.buildPlaylist(rule);
    if (playlist) {
      this.textAreaEdit = playlist.join('\n');
      this.urlInputEdit = 'list';
    } else {
      this.textAreaEdit = '';
      this.urlInputEdit = 'url';
    }
  }

  cancelEditing(): void {
    if (this.usesRouterNavigation()) {
      this.returnToList();
      return;
    }
    if (!this.entry || !this.savedEntry) return;
    this.showError = undefined;
    this.savedEntry = undefined;
    this.view = "list";
    this.entry = undefined;
    this.textAreaEdit = '';
    this.urlInputEdit = 'url';
    setTimeout(() => {
        window.scrollTo(0, this.vscrollPosition);
        this.vscrollTrack = true;
    });
  }

  private getOwnerId(): string {
    return this.auth.currentUser.role !== 'groupadmin'
      ? this.auth.currentUser.role ?? ''
      : this.auth.currentUser.id?.toString() ?? '';
  }

  private returnToList(): void {
    if (history.state?.returnToList && this.location) {
      this.location.back();
      return;
    }
    this.router?.navigate(['/_rules']);
  }

  private usesRouterNavigation(): boolean {
    return !!this.router && !!this.route?.snapshot?.routeConfig;
  }

  private navigateToListAfterMutation(): void {
    if (this.usesRouterNavigation()) {
      this.router?.navigate(['/_rules']);
    }
  }

  editEntry(formValue: EditRuleFormValue): void {
    if (!this.entry) return;
    this.showError = undefined;
    this.working = true;

    this.entry.name = formValue.editName;
    this.entry.overrideUrl = formValue.editOverrideUrl;
    this.entry.matchStrategy = formValue.editMatchStrategy;
    this.entry.scheduleType = formValue.editScheduleType;
    this.entry.timezone = formValue.editTimezone || 'UTC';
    this.entry.startTime = formValue.editStartTime || null;
    this.entry.endTime = formValue.editEndTime || null;
    this.entry.startDate = formValue.editStartDate || null;
    this.entry.endDate = formValue.editEndDate || null;
    this.entry.isActive = formValue.editIsActive;
    this.entry.daysOfWeek = formValue.editDaysOfWeek;
    this.entry.tags = formValue.editTags;
    this.entry.notes = formValue.editNotes;

    this.entry.owner = this.auth.currentUser.role !== 'groupadmin' 
      ? this.auth.currentUser.role
      : this.auth.currentUser.id?.toString() ?? '';
    
    this.setSearchField(this.entry);
    this.entry.updatedAt = new Date().toISOString();

    this.ruleService.editRule(this.entry).subscribe({
      next: () => {
        this.view = 'list';
        this.vscrollPosition = 0;
        this.vscrollTrack = true;
        this.working = false;
        this.toast.setMessage('Rule updated successfully.', 'success');
        this.navigateToListAfterMutation();
      },
      error: (err: HttpErrorResponse) => {
        this.working = false;
        this.showError = err?.error?.error ?? "An unexpected error occurred.";
      }
    });
  }

  deleteEntry(rule: Rule): void {
    this.ruleService.deleteRule(rule).subscribe({
      next: () => {
        this.view = 'list';
        const pos = this.items.findIndex(elem => elem._id === rule._id);
        if (pos > -1) {
          this.items.splice(pos, 1);
          this.total -= 1;
          this.toast.setMessage('Rule deleted successfully', 'success');
        }
        this.navigateToListAfterMutation();
      },
      error: (err: HttpErrorResponse) => {
        this.showError = err?.error?.error ?? 'An unexpected error occurred.';
      }
    });
  }

  async movePriority(index: number, direction: 'up' | 'down'): Promise<void> {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.items.length) return;

    const ruleA = this.items[index];
    const ruleB = this.items[targetIndex];
    
    const ownerId = this.auth.currentUser.id?.toString() ?? '';

    if (!ruleA._id || !ruleB._id) return;

    const tempPriority = ruleA.priority;
    ruleA.priority = ruleB.priority;
    ruleB.priority = tempPriority;

    this.items[index] = ruleB;
    this.items[targetIndex] = ruleA;

    try {
      await firstValueFrom(this.ruleService.swapPriority(ruleA._id, ruleB._id, ownerId));
    } catch (error) {
      this.items[index] = ruleA;
      this.items[targetIndex] = ruleB;
      ruleA.priority = ruleB.priority;
      ruleB.priority = tempPriority;
      this.toast.setMessage('Failed to preserve list order adjustments.', 'danger');
    }
  }

  formatUpdatedAt(updatedAt: string | null | undefined): string {
    if (!updatedAt) return '';
    return this.dateFormat(new Date(updatedAt));
  }

  onSourceTypeChangeAdd(): void {
    this.updateUrlInputValidity('add');
  }

  onSourceTypeChangeEdit(): void {
    this.updateUrlInputValidity('edit');
  }

  private updateUrlInputValidity(mode: 'add' | 'edit'): void {
    if (mode === 'add') {
      const text = this.textAreaAdd;
      const url = this.urlInputAdd === 'list' ? this.buildUrlForList(text) : this.addOverrideUrl.value;
      this.addRuleForm.controls['addOverrideUrl'].setValue(url);
      this.addRuleForm.controls['addOverrideUrl'].markAsDirty();
      this.addRuleForm.controls['addOverrideUrl'].updateValueAndValidity();
    } else {
      const text = this.textAreaEdit;
      const url = this.urlInputEdit === 'list' ? this.buildUrlForList(text) : this.editOverrideUrl.value;
      this.editRuleForm.controls['editOverrideUrl'].setValue(url);
      this.editRuleForm.controls['editOverrideUrl'].markAsDirty();
      this.editRuleForm.controls['editOverrideUrl'].updateValueAndValidity();
    }
  }

  dataChangedAdd(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target) return;
    if (this.urlInputAdd === 'url') {
      const list = this.buildPlaylist({ overrideUrl: target.value } as Rule);
      if (!list || list.length === 0) {
        this.textAreaAdd = '';
        return;
      }
      this.textAreaAdd = list.join('\n');
    } else {
      const url = this.buildUrlForList(target.value);
      if (url) {
        this.addRuleForm.controls['addOverrideUrl'].setValue(url);
      } else {
        this.addRuleForm.controls['addOverrideUrl'].setValue('');
      }
      this.addRuleForm.controls['addOverrideUrl'].markAsDirty();
    }
  }

  dataChangedEdit(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target) return;
    if (this.urlInputEdit === 'url') {
      const list = this.buildPlaylist({ overrideUrl: target.value } as Rule);
      if (!list || list.length === 0) {
        this.textAreaEdit = '';
        return;
      }
      this.textAreaEdit = list.join('\n');
    } else {
      const url = this.buildUrlForList(target.value);
      if (url) {
        this.editRuleForm.controls['editOverrideUrl'].setValue(url);
      } else {
        this.editRuleForm.controls['editOverrideUrl'].setValue('');
      }
      this.editRuleForm.controls['editOverrideUrl'].markAsDirty();
    }
  }

  buildUrlForList(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '';
    const list = trimmed.split('\n').map(e => e.trim()).filter(e => e);
    if (list.length === 0) return '';
    const encoded = list.map(e => encodeURIComponent(e));
    return this.origin + '/_view/v/index.html?content=' + encoded.join(',');
  }

  buildPlaylist(rule: Rule): string[] | undefined {
    if (!rule || !rule.overrideUrl) return undefined;
    const url = this.origin + '/_view/v/index.html?content=';
    if (rule.overrideUrl.startsWith(url) === false) return undefined;
    const data = rule.overrideUrl.slice(url.length);
    if (!data) return undefined;
    const list = data.split(',');
    return list.map(e => decodeURIComponent(e));
  }
}
