import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LoadingComponent } from './loading.component';

describe('LoadingComponent', () => {
  let component: LoadingComponent;
  let fixture: ComponentFixture<LoadingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should not show the DOM element when condition is false', () => {
    fixture.componentRef.setInput('condition', false);
    fixture.detectChanges();

    const element = fixture.debugElement.query(By.css('.card'));
    expect(element).toBeNull();
  });

  it('should show the DOM element when condition is true', () => {
    fixture.componentRef.setInput('condition', true);
    fixture.detectChanges();

    const element = fixture.debugElement.query(By.css('.card'));
    expect(element).not.toBeNull();

    const header = fixture.debugElement.query(By.css('.app-header'));
    expect(header.nativeElement.textContent).toContain('Loading...');
  });

  it('should toggle visibility based on condition updates', () => {
    fixture.componentRef.setInput('condition', false);
    fixture.detectChanges();
    
    let element = fixture.debugElement.query(By.css('.card'));
    expect(element).toBeNull();

    fixture.componentRef.setInput('condition', true);
    fixture.detectChanges();
    
    element = fixture.debugElement.query(By.css('.card'));
    expect(element).not.toBeNull();
  });
});