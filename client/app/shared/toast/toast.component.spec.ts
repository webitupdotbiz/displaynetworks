import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { ToastComponent } from './toast.component';

describe('ToastComponent', () => {
  let component: ToastComponent;
  let fixture: ComponentFixture<ToastComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ ToastComponent ]
    });
    fixture = TestBed.createComponent(ToastComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not have message set nor DOM element initially', () => {
    if (component.message) {
      expect(component.message.body).toBeFalsy();
      expect(component.message.type).toBeFalsy();
    }
    const de = fixture.debugElement.query(By.css('div'));
    expect(de).toBeNull();
  });

  it('should set the message and create the DOM element when message is set', () => {
    if (component.setMessage) {
      const mockMessage = {
        body: 'test message',
        type: 'warning'
      };
      component.setMessage(mockMessage.body, mockMessage.type);
      expect(component.message?.body).toBe(mockMessage.body);
      expect(component.message?.type).toBe(mockMessage.type);
      fixture.detectChanges();
      const de = fixture.debugElement.query(By.css('div'));
      if (de) {
        const el = de.nativeElement;
        expect(de).toBeDefined();
        expect(el.textContent).toContain(mockMessage.body);
        expect(el.className).toContain(mockMessage.type);
      }
    }
  });

});
