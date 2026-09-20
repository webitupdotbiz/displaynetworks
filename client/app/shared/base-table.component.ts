import { HostListener, ViewChild, OnInit, ElementRef, Directive } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';

interface DeepErrorPayload {
  error?: {
    error?: string;
  };
}

/**
 * Abstract base component for table views with search, infinite scroll, and view management.
 * Subclasses must provide type T (the model type) and implement abstract methods.
 */
@Directive()
export abstract class BaseTableComponent<T> implements OnInit {
  @ViewChild('sbox') sbox: ElementRef | undefined;

  // Search & debounce
  protected term$ = new Subject<string>();
  term: string = '';

  // View state
  view: 'list' | 'edit' | 'add' = 'list';
  previousView: 'list' | 'edit' | 'add' = 'list';

  // Loading states
  isLoading = true;
  tableLoading = true;
  inProgress = false;
  working = false;

  // Scroll state
  vscrollPosition = 0;
  vscrollTrack = true;
  windowHeight = 0;

  // Pagination
  items: T[] = [];
  total = 0;
  listlastDate: any = undefined;

  // Error handling
  showError: string | undefined = undefined;

  // Readonly constants
  readonly COLOR = 'color';
  readonly BGCOLOR = 'bgcolor';
  readonly MAXATTEMPTS = 50;

  constructor() {
    this.term$
      .pipe(debounceTime(800))
      .subscribe(term => this.search(term));
  }

  ngOnInit(): void {
    this.windowHeight = window.innerHeight;
    this.loadInitialData();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.vscrollTrack) {
      this.vscrollPosition = window.scrollY;
    }
    if (!this.vscrollTrack) return;
    if (this.items.length >= this.total) return;
    if (this.inProgress) return;
    this.inProgress = true;
    this.fetchAll();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.windowHeight = window.innerHeight;
  }

  /**
   * Fetch all items (implements infinite scroll with pagination cursor)
   */
  protected abstract fetchAll(): void;

  /**
   * Load initial data on component init
   */
  protected loadInitialData(): void {
    this.fetchAll();
  }

  /**
   * Reset search and reload
   */
  search(term: string): void {
    this.term = term;
    this.tableLoading = true;
    this.items = [];
    this.listlastDate = undefined;
    this.fetchAll();
  }

  /**
   * Clear search box
   */
  clearSearchBox(): void {
    if (!this.term) return;
    this.term = '';
    if (this.sbox) {
      this.sbox.nativeElement.value = '';
      this.sbox.nativeElement.focus();
    }
    this.tableLoading = true;
    this.items = [];
    this.listlastDate = undefined;
    this.fetchAll();
  }

  /**
   * Handle input change (search)
   */
  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.term$.next(input.value);
  }

  /**
   * Get search placeholder text
   */
  abstract getSearchPlaceholder(): string;

  /**
   * View state helpers
   */
  isListView(): boolean {
    return this.view === 'list';
  }

  isEditView(): boolean {
    return this.view === 'edit';
  }

  isAddView(): boolean {
    return this.view === 'add';
  }

  showHeader(): boolean {
    return true;
  }

  /**
   * Date/time formatting
   */
  getTimeString(date: Date): string {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours || 12;
    const minStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minStr} ${ampm}`;
  }

  dateFormat(isodate: Date): string {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    const entrydate = new Date(isodate);
    const today = new Date();
    const isToday = today.toDateString() === entrydate.toDateString();

    if (isToday) return this.getTimeString(entrydate);
    if (today.getFullYear() !== entrydate.getFullYear()) {
      return `${months[entrydate.getMonth()]} ${entrydate.getDate()} ${entrydate.getFullYear()}`;
    }
    return `${months[entrydate.getMonth()]} ${entrydate.getDate()}`;
  }

  formatDate(inDate: Date): string {
    return new Date(inDate).toDateString();
  }

  /**
   * Get theme background color
   */
  getThemeBackground(): string {
    return 'white'; // Override in subclass if using theme service
  }
  static extractErrorMessage(error: unknown): string {
    const fallback = 'An unexpected error occurred.';

    if (error instanceof HttpErrorResponse) {
      return error.error?.error ?? fallback;
    }

    if (error && typeof error === 'object' && 'error' in error) {
      return (error as DeepErrorPayload).error?.error ?? fallback;
    }

    return fallback;
  }
}
