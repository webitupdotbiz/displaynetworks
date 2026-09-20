import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { SharedModule } from '../shared/shared.module';

import { IFrameComponent } from './iframe.component';

const mockActivatedRoute = {
  paramMap: of(convertToParamMap({ name: 'surfing' }))
};

describe('Component: View', () => {
  let component: IFrameComponent;
  let fixture: ComponentFixture<IFrameComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ IFrameComponent, SharedModule ],
      providers: [ 
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockActivatedRoute } 
      ],
      schemas: [ NO_ERRORS_SCHEMA ]
    });
    fixture = TestBed.createComponent(IFrameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should handle iframe url resolution', () => {
    expect(component).toBeDefined();
  });

  it('should render iframe component', () => {
    const compiled = fixture.nativeElement;
    expect(compiled).toBeTruthy();
  });

  it('should build and bypass security for the iframe target url', () => {
    const iframeEl = fixture.debugElement.query(By.css('iframe'));
    expect(iframeEl).toBeTruthy();
    
    const trustedUrl = component.iframeUrl;
    expect(trustedUrl).toBeTruthy();
    
    const actualUrl = (trustedUrl as any).changingThisBreaksApplicationSecurity;
    expect(actualUrl).toBe('/_view/index.html?name=surfing');
    expect(iframeEl.nativeElement.src).toContain('/_view/index.html?name=surfing');
  });
});
