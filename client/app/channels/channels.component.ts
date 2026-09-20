import { Component, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UntypedFormGroup, UntypedFormControl, Validators, UntypedFormBuilder, AbstractControl, ValidationErrors } from '@angular/forms';
import { firstValueFrom, Observable, debounceTime, map, catchError, of } from 'rxjs';
import { ObjectId } from 'bson';

import { BaseTableComponent } from '../shared/base-table.component';
import { AuthService } from '../services/auth.service';
import { ChannelData, ChannelService } from '../services/channel.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { TagsComponent } from '../shared/tags/tags.component';
import { LoadingComponent } from '../shared/loading/loading.component';
import { NavLinksComponent } from '../shared/nav-links/nav-links.component';
import { NavbarBrandComponent } from '../shared/navbar-brand/navbar-brand.component';
import { AppConfirmModal } from '../shared/confirm-modal/confirm-modal.component';
import { Entry } from '../entry';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-channels',
  templateUrl: './channels.component.html',
  styleUrls: ['./channels.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastComponent, TagsComponent, LoadingComponent, NavLinksComponent, NavbarBrandComponent, AppConfirmModal]
})
export class ChannelsComponent extends BaseTableComponent<Entry> {
  @ViewChild('vpanelDiv') vpanelDiv: ElementRef | undefined;
  @ViewChild('infoSpan') infoSpan: ElementRef | undefined;
  @ViewChild('color') color: ElementRef | undefined;
  @ViewChild('bgcolor') bgcolor: ElementRef | undefined;

  origin = window.location.origin;
  tags: String[] = [];
  fullscreen = undefined;
  savedEntry: Entry | undefined;
  savedTags: String[] = [];
  entry: Entry | undefined;
  viewId = new ObjectId();
  private channelService = inject(ChannelService);
  public auth = inject(AuthService);
  private formBuilder = inject(UntypedFormBuilder);
  private router = inject(Router, { optional: true });
  private route = inject(ActivatedRoute, { optional: true });
  private location = inject(Location, { optional: true });
  @ViewChild(ToastComponent, { static: true }) public toast!: ToastComponent;
  private themeService = inject(ThemeService);
  playlist: string[] | undefined = undefined;
  currentFrameId = 0;
  viewPosition = 0;
  
  // Notice: items, total, listlastDate, view states, and loaders are now inherited.
  // Overriding listlastDate to handle the specific ObjectId type safely
  override listlastDate: ObjectId | undefined = undefined;

  scrollAmount = { step: 1, mod: 0 };
  settingsUpdated = false;
  colorType = "";
  viewLoading = undefined;
  viewerEntry = undefined;
  viewerValue = undefined;

  // Forms
  addChannelForm: UntypedFormGroup = new UntypedFormGroup({});
  addName = new UntypedFormControl('', 
    [Validators.required, Validators.pattern(/^[a-zA-Z0-9-]+$/)],
    this.asyncNameValidator.bind(this)
  );
  addValue = new UntypedFormControl('', Validators.required);
  addList = new UntypedFormControl('');
  addNotes = new UntypedFormControl('');

  editChannelForm: UntypedFormGroup = new UntypedFormGroup({});
  editName = new UntypedFormControl('', 
    [Validators.required, Validators.pattern(/^[a-zA-Z0-9-]+$/)],
    this.asyncNameValidatorEdit.bind(this)
  );
  editValue = new UntypedFormControl('', Validators.required);
  editNotes = new UntypedFormControl('');

  urlInputAdd = 'url';
  textAreaAdd = '';
  textAreaEdit = '';
  urlInputEdit = 'url';

  override ngOnInit(): void {
    this.addChannelForm = this.formBuilder.group({
      addName: this.addName,
      owner: this.auth.currentUser.id,
      addValue: this.addValue,
      addNotes: this.addNotes
    });
    this.editChannelForm = this.formBuilder.group({
      editName: this.editName,
      editValue: this.editValue,
      editNotes: this.editNotes
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
      const id = this.route?.snapshot.paramMap.get('id');
      if (!id || !ObjectId.isValid(id)) {
        this.showError = 'Channel not found';
        return;
      }
      this.channelService.getEntry(new ObjectId(id)).subscribe({
        next: entry => this.openEditForm(entry),
        error: error => this.showError = error?.error?.error ?? 'Channel not found'
      });
      return;
    }

    this.view = 'list';
  }

 public override fetchAll(): void {
    let id = this.auth.currentUser.id?.toString();
    if (this.auth.currentUser.role !== 'admin' && this.auth.currentUser.role !== 'groupadmin') {
      id = this.auth.currentUser.role;
    }
    if (!id) return;

    const params = this.term ? { term: this.term } : undefined;
  
    this.channelService.getChannels(id, this.listlastDate, params).subscribe({
      next: (data) => this.handleResponseData(data),
      error: (error) => {
        console.log("getChannels error:", error);
        this.isLoading = false;
        this.showError = error.error?.error ?? "An unexpected error occurred.";
      },
      complete: () => {
        this.isLoading = false;
        this.tableLoading = false;
        this.inProgress = false;
      },
    });
  }

  private handleResponseData(data: ChannelData): void {
    for (let ii = 0; ii < data.channels.length; ii++) {
      this.items.push(data.channels[ii]);
    }
    this.total = data.count;
    this.listlastDate = data.channels.length > 0 ? data.channels[data.channels.length - 1]._id : undefined;
  }

  override getSearchPlaceholder(): string {
    let word = "Channels";
    if (this.term) word = this.term;
    if (this.items.length <= 0) return word;
    return `${word} (${this.total})`;
  }

  override getThemeBackground(): string {
    return this.themeService.currentTheme === 'light' ? 'white' : '#111';
  }

  copyToClipboardBrowserUrl(entry: Entry): void {
    const text = this.origin + '/' + entry.displayName;
    if (navigator && (navigator as any).clipboard && (navigator as any).clipboard.writeText) {
      (navigator as any).clipboard.writeText(text)
        .then(() => this.toast.setMessage('Channel URL copied to clipboard', 'success'))
        .catch(() => this.fallbackCopyText(text));
    } else {
      this.fallbackCopyText(text);
    }
  }

  private fallbackCopyText(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      this.toast.setMessage('Channel URL copied to clipboard', 'success');
    } catch (e) {
      this.toast.setMessage('Copy to clipboard failed', 'error');
    }
    document.body.removeChild(textarea);
  }

  setSearchField(entry: Entry): void {
    let name = entry.name.toLowerCase();
    let tagstr = entry.tags && entry.tags.length === 0 ? "" : entry.tags.join(" ").toLowerCase();
    let notestr = entry.notes ? entry.notes.toLowerCase() : "";
    entry.search = [name, tagstr, notestr].filter(part => part).join(" ");
  }

  hasAccess(): boolean {
    if (this.showError) return false;
    if (!this.auth) return false;
    if (!this.auth.currentUser) return false;
    return true;
  }

  async addEntry(): Promise<void> {
    this.showError = undefined;
    this.working = true;
  
    let entry: Entry = {
      name: this.addChannelForm.value.addName,
      displayName: this.addChannelForm.value.addName,
      owner: this.auth.currentUser.role !== 'groupadmin' ? new ObjectId(this.auth.currentUser.role) : this.auth.currentUser.id,
      value: this.addChannelForm.value.addValue,
      tags: this.tags,
      notes: this.addChannelForm.value.addNotes ?? '',
    };
  
    this.setSearchField(entry);
  
    try {
      const newChannel = await firstValueFrom(this.channelService.addEntry(entry));
      this.items.unshift(newChannel);
      this.total += 1;
      this.addChannelForm.reset();
      this.textAreaAdd = '';
      this.urlInputAdd = 'url';
      this.view = 'list';
      this.vscrollTrack = true;
      this.toast.setMessage('Entry added successfully', 'success');
      this.navigateToListAfterMutation();
    } catch (error) {
      console.log('addEntry: error: ', error);
      this.showError = BaseTableComponent.extractErrorMessage(error);
    } finally {
      this.working = false;
    }
  }

  enableAdding(): void {
    if (this.usesRouterNavigation()) {
      this.router?.navigate(['/_channels/new'], { state: { returnToList: true } });
      return;
    }
    this.openAddForm();
  }

  private openAddForm(): void {
    this.vscrollTrack = false;
    this.previousView = "list"
    this.view = "add";
    this.tags = [];
  }

  cancelAdding(): void {
    if (this.usesRouterNavigation()) {
      this.returnToList();
      return;
    }
    this.showError = undefined;
    this.addChannelForm.reset();
    this.textAreaAdd = '';
    this.urlInputAdd = 'url';
    this.view = "list";
    this.entry = undefined;
    this.viewId = new ObjectId();
    setTimeout(() => {
      window.scrollTo(0, this.vscrollPosition);
      this.vscrollTrack = true;
    });
  }

  enableEditing(entry: Entry): void {
    if (this.usesRouterNavigation() && entry._id) {
      this.router?.navigate(['/_channels', entry._id.toString(), 'edit'], { state: { returnToList: true } });
      return;
    }
    this.openEditForm(entry);
  }

  private openEditForm(entry: Entry): void {
    this.showError = undefined;
    this.vscrollTrack = false;
    this.previousView = "list";
    this.view = "edit";
    this.savedEntry = Object.assign({}, entry);
    this.savedTags = [...entry.tags];
    this.entry = entry;
    if (!entry._id) return;
    this.viewId = entry._id;
    this.playlist = this.buildPlaylist(entry);
    this.textAreaEdit = this.playlist ? this.playlist.join('\n') : '';
    if (this.playlist) this.urlInputEdit = 'list';
    else this.urlInputEdit = 'url';
    this.tags = entry.tags;
    this.editChannelForm.reset({ editName: entry.name, editValue: entry.value, editNotes: entry.notes ?? '' });
  }

  dataChangedAdd(event: Event): void {
    const target = event.target ? event.target as HTMLInputElement : undefined;
    if (!target) return;
    if (this.urlInputAdd === 'url') {
      const list = this.buildPlaylist({ value: target.value } as Entry);
      if (!list || list.length === 0) {
        this.textAreaAdd = '';
        return;
      }
      this.textAreaAdd = list.join('\n');
    } else {
      const url = this.buildUrlForList(target.value);
      if (url) {
        this.addChannelForm.controls['addValue'].setValue(url);
      } else {
        this.addChannelForm.controls['addValue'].setValue('');
      }
    }
  }

  dataChangedEdit(event: Event): void {
    const target = event.target ? event.target as HTMLInputElement : undefined;
    if (!target) return;
    if (this.urlInputEdit === 'url') {
      const list = this.buildPlaylist({ value: target.value } as Entry);
      if (!list || list.length === 0) {
        this.textAreaEdit = '';
        return;
      }
      this.textAreaEdit = list.join('\n');
    } else {
      const url = this.buildUrlForList(target.value);
      if (url) {
        this.editChannelForm.controls['editValue'].setValue(url);
      } else {
        this.editChannelForm.controls['editValue'].setValue('');
      }
      this.editChannelForm.controls['editValue'].markAsDirty();
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

  buildPlaylist(entry: Entry): string[] | undefined {
    if (!entry || !entry.value) return undefined;
    const url = this.origin + '/_view/v/index.html?content=';
    if (entry.value.startsWith(url) === false) return undefined;
    const data = entry.value.slice(url.length);
    const list = data.split(',');
    return list.map(e => decodeURIComponent(e));
  }

  cancelEditing(): void {
    if (this.usesRouterNavigation()) {
      this.returnToList();
      return;
    }
    if (!this.entry || !this.savedEntry) return;
    this.showError = undefined;
    this.editChannelForm.reset({ editName: this.savedEntry.name, editValue: this.savedEntry.value });
    this.textAreaEdit = '';
    this.entry.tags = [...this.savedTags];
    this.tags = [];
    this.savedEntry = undefined;
    this.view = "list";
    this.entry = undefined;
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
    this.router?.navigate(['/_channels']);
  }

  private usesRouterNavigation(): boolean {
    return !!this.router && !!this.route?.snapshot?.routeConfig;
  }

  private navigateToListAfterMutation(): void {
    if (this.usesRouterNavigation()) {
      this.router?.navigate(['/_channels']);
    }
  }

  updateEntryInList(entry: Entry): void {
    for (let ii = 0; ii < this.items.length; ii++) {
      if (this.items[ii]._id === entry._id) {
        this.items[ii] = entry;
        break;
      }
    }
    this.items.sort((a, b) => {
      if (!b.updatedAt || !a.updatedAt) return 0;
      if (b.updatedAt < a.updatedAt) return -1;
      if (b.updatedAt === a.updatedAt) return 0;
      return 1;
    });
  }

  editEntry(value: { editName: string; editValue: any; editNotes?: string }): void {
    if (!this.entry) return;
    this.showError = undefined;
    this.working = true;
    this.entry.name = value.editName;
    this.entry.displayName = value.editName;
    this.entry.value = value.editValue;
    this.entry.notes = value.editNotes ?? '';
    this.setSearchField(this.entry);
    this.entry.updatedAt = new Date().toISOString();

    this.channelService.editEntry(this.entry).subscribe({
      next: () => {
        if (!this.entry) return;
        this.updateEntryInList(this.entry);
        this.view = 'list';
        this.vscrollPosition = 0;
        this.vscrollTrack = true;
        this.working = false;
        this.toast.setMessage('Entry edited successfully.', 'success');
        this.navigateToListAfterMutation();
      },
      error: err => {
        this.working = false;
        this.showError = err?.error?.error ?? "An unexpected error occurred.";
      }
    });
  }

  deleteEntry(entry: Entry): void {
    this.channelService.deleteEntry(entry).subscribe({
      next: () => {
        this.view = 'list';
        const pos = this.items.findIndex(elem => elem._id === entry._id);
        if (pos > -1) {
          this.items.splice(pos, 1);
          this.total -= 1;
          this.toast.setMessage('Entry deleted successfully', 'success');
        }
        this.navigateToListAfterMutation();
      },
      error: err => {
        console.log("deleteEntry: error: ", err);
        this.showError = err.error.error ?? 'An unexpected error occurred.';
      }
    });
  }

  formatUpdatedAt(updatedAt: string | null | undefined): string {
    if (!updatedAt) return '';
    return this.dateFormat(new Date(updatedAt));
  }

  asyncNameValidator(control: AbstractControl): Observable<ValidationErrors | null> {
    if (!control.value) return of(null);
    return this.channelService.checkNameAvailable(control.value).pipe(
      debounceTime(500),
      map(isAvailable => isAvailable ? null : { nameTaken: true }),
      catchError(() => of(null))
    );
  }

  asyncNameValidatorEdit(control: AbstractControl): Observable<ValidationErrors | null> {
    if (!control.value) return of(null);
    if (this.savedEntry?.displayName && control.value.toLowerCase() === this.savedEntry.displayName.toLowerCase()) {
      return of(null);
    }
    return this.channelService.checkNameAvailable(control.value).pipe(
      debounceTime(500),
      map(isAvailable => isAvailable ? null : { nameTaken: true }),
      catchError(() => of(null))
    );
  }
}