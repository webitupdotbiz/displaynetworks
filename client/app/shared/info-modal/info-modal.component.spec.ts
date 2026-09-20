import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { AppInfoModal } from './info-modal.component';

describe('AppInfoModal', () => {
  let component: AppInfoModal;
  let fixture: ComponentFixture<AppInfoModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppInfoModal],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AppInfoModal);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render the modal with the provided inputs', () => {
    component.modalId = 'info-modal';
    component.title = 'Success';
    component.message = 'Operation completed successfully.';
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const modal = element.querySelector('.modal') as HTMLElement | null;
    const title = element.querySelector('.modal-title') as HTMLElement | null;
    const bodyText = element.querySelector('.modal-body p') as HTMLElement | null;

    expect(modal?.getAttribute('id')).toBe('info-modal');
    expect(title?.textContent).toContain('Success');
    expect(bodyText?.textContent).toContain('Operation completed successfully.');
  });

  it('should expose the default state for isShowing', () => {
    expect(component.isShowing).toBe(false);
  });
});
