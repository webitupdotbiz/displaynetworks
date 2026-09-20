import { ElementRef } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { fakeAsync, tick } from '@angular/core/testing';

import { BaseTableComponent } from './base-table.component';

class TestTableComponent extends BaseTableComponent<{ id: string }> {
  fetchAllCalls = 0;

  protected fetchAll(): void {
    this.fetchAllCalls += 1;
  }

  getSearchPlaceholder(): string {
    return 'Search';
  }
}

describe('BaseTableComponent', () => {
  let component: TestTableComponent;

  beforeEach(() => {
    component = new TestTableComponent();
    component.ngOnInit();
  });

  it('should initialize state and load data on startup', () => {
    expect(component.windowHeight).toBe(window.innerHeight);
    expect(component.fetchAllCalls).toBe(1);
    expect(component.isListView()).toBe(true);
    expect(component.showHeader()).toBe(true);
  });

  it('should debounce search input and reset pagination state', fakeAsync(() => {
    component.items = [{ id: 'a' } as any];
    component.total = 10;
    component.listlastDate = 'old';

    component.onInputChange({ target: { value: 'alpha' } } as unknown as Event);
    tick(799);
    expect(component.fetchAllCalls).toBe(1);

    tick(1);
    expect(component.term).toBe('alpha');
    expect(component.tableLoading).toBe(true);
    expect(component.items).toEqual([]);
    expect(component.listlastDate).toBeUndefined();
    expect(component.fetchAllCalls).toBe(2);
  }));

  it('should clear the search box only when there is a term and focus the input', () => {
    component.term = 'alpha';
    const focus = jest.fn();
    component.sbox = new ElementRef({ value: 'old-value', focus });

    component.clearSearchBox();

    expect(component.term).toBe('');
    expect(component.tableLoading).toBe(true);
    expect(component.items).toEqual([]);
    expect(focus).toHaveBeenCalled();

    component.term = 'beta';
    component.sbox = undefined;
    component.clearSearchBox();
    expect(component.fetchAllCalls).toBe(3);

    component.term = '';
    component.clearSearchBox();
    expect(component.fetchAllCalls).toBe(3);
  });

  it('should manage scroll behavior for the different branches', () => {
    component.vscrollTrack = false;
    component.onScroll();
    expect(component.vscrollPosition).toBe(0);
    expect(component.fetchAllCalls).toBe(1);

    component.vscrollTrack = true;
    component.total = 1;
    component.items = [{ id: 'a' } as any];
    component.inProgress = false;
    component.onScroll();
    expect(component.fetchAllCalls).toBe(1);

    component.total = 2;
    component.items = [{ id: 'a' } as any];
    component.inProgress = true;
    component.onScroll();
    expect(component.fetchAllCalls).toBe(1);

    component.inProgress = false;
    component.onScroll();
    expect(component.fetchAllCalls).toBe(2);
  });

  it('should update the window height on resize and expose view helpers', () => {
    component.onResize();
    expect(component.windowHeight).toBe(window.innerHeight);

    component.view = 'edit';
    expect(component.isListView()).toBe(false);
    expect(component.isEditView()).toBe(true);
    expect(component.isAddView()).toBe(false);

    component.view = 'add';
    expect(component.isAddView()).toBe(true);
  });

  it('should format times and dates for today, this year, and other years', () => {
    expect(component.getTimeString(new Date(2024, 0, 1, 13, 5))).toBe('1:05 pm');
    expect(component.getTimeString(new Date(2024, 0, 1, 1, 5))).toBe('1:05 am');
    expect(component.getTimeString(new Date(2024, 0, 1, 0, 5))).toBe('12:05 am');
    expect(component.dateFormat(new Date())).toBe(component.getTimeString(new Date()));
    expect(component.dateFormat(new Date(new Date().getFullYear(), 0, 1))).toContain('Jan');
    expect(component.dateFormat(new Date(new Date().getFullYear() - 1, 0, 1))).toContain(String(new Date().getFullYear() - 1));
    expect(component.formatDate(new Date('2024-01-02T00:00:00.000Z'))).toBe(new Date('2024-01-02T00:00:00.000Z').toDateString());
  });

  it('should return the configured theme background and extract error messages', () => {
    expect(component.getThemeBackground()).toBe('white');

    expect(BaseTableComponent.extractErrorMessage(new HttpErrorResponse({ error: { error: 'boom' } }))).toBe('boom');
    expect(BaseTableComponent.extractErrorMessage(new HttpErrorResponse({}))).toBe('An unexpected error occurred.');
    expect(BaseTableComponent.extractErrorMessage({ error: { error: 'nested' } })).toBe('nested');
    expect(BaseTableComponent.extractErrorMessage({})).toBe('An unexpected error occurred.');
    expect(BaseTableComponent.extractErrorMessage('plain')).toBe('An unexpected error occurred.');
  });
});
