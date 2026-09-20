import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { AppConfirmModal } from './confirm-modal.component';

describe('AppConfirmModal', () => {
  let component: AppConfirmModal;
  let fixture: ComponentFixture<AppConfirmModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppConfirmModal],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AppConfirmModal);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render the modal with the provided inputs', () => {
    component.modalId = 'delete-modal';
    component.message = 'Are you sure you want to delete this item?';
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const modal = element.querySelector('.modal') as HTMLElement | null;
    const bodyText = element.querySelector('.modal-body p') as HTMLElement | null;

    expect(modal?.getAttribute('id')).toBe('delete-modal');
    expect(bodyText?.textContent).toContain('Are you sure you want to delete this item?');
  });

  it('should emit confirmed when the delete button is clicked', () => {
    component.modalId = 'delete-modal';
    component.message = 'Delete this item?';
    fixture.detectChanges();

    const spy = jest.fn();
    component.confirmed.subscribe(spy);

    const button = fixture.nativeElement.querySelector('.btn-danger') as HTMLButtonElement | null;
    button?.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call onConfirm and emit confirmed', () => {
    const spy = jest.fn();
    component.confirmed.subscribe(spy);

    component.onConfirm();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
