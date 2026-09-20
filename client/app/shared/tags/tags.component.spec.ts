import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { TagsComponent } from './tags.component';

describe('TagsComponent', () => {
  let component: TagsComponent;
  let fixture: ComponentFixture<TagsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagsComponent, ReactiveFormsModule],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(TagsComponent);
    component = fixture.componentInstance;
    component.formGroup = new FormGroup({
      tags: new FormControl('')
    });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the tag input and existing tags', () => {
    component.tags = ['alpha', 'beta'];
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('#tagsSet') as HTMLInputElement | null;
    const tagElements = element.querySelectorAll('.tag');

    expect(input).not.toBeNull();
    expect(tagElements.length).toBe(2);
  });

  it('should add a new tag when enter is pressed and the tag is unique', () => {
    component.tags = [];
    component.tagsSet = 'new-tag';
    const markAsDirtySpy = jest.spyOn(component.formGroup, 'markAsDirty');

    component.onTagsSetKeydown();

    expect(component.tags).toEqual(['new-tag']);
    expect(markAsDirtySpy).toHaveBeenCalled();
    expect(component.tagsSet).toBe('');
  });

  it('should ignore duplicate tags and clear the input', () => {
    component.tags = ['existing'];
    component.lookup = { existing: true } as any;
    component.tagsSet = 'existing';

    component.onTagsSetKeydown();

    expect(component.tags).toEqual(['existing']);
    expect(component.tagsSet).toBe('');
  });

  it('should remove a tag and emit tagsChange', () => {
    component.tags = ['alpha', 'beta'];
    component.lookup = { alpha: true, beta: true } as any;
    const emitSpy = jest.fn();
    component.tagsChange.subscribe(emitSpy);

    component.dropTag(0);

    expect(component.tags).toEqual(['beta']);
    expect(emitSpy).toHaveBeenCalledWith(['beta']);
  });

  it('should initialize insert mode and allow tag focus', () => {
    component.ngOnInit();
    expect(component.isInsert).toBe(true);

    component.tagsSetFocus();
    expect(component.tagsSetRefElement).toBeDefined();
  });

  it('should set tags and reset insert mode', () => {
    component.isInsert = true;
    component.setTags(['one', 'two']);

    expect(component.isInsert).toBe(false);
    expect(component.tags).toEqual(['one', 'two']);
    expect(component.tagsSet).toBe('');
  });

  it('should reset state for new or cancel', () => {
    component.isInsert = false;
    component.tags = ['one'];
    component.tagsSet = 'draft';

    component.newOrCancel();

    expect(component.isInsert).toBe(true);
    expect(component.tags).toEqual([]);
    expect(component.tagsSet).toBe('');
  });

  it('should prevent default on ctrl+s and on tag enter flows', () => {
    const event = { preventDefault: jest.fn(), ctrlKey: true, metaKey: false, keyCode: 83 } as unknown as KeyboardEvent;
    component.tagEnter = false;
    component.onKeyPress(event);
    expect(event.preventDefault).toHaveBeenCalled();

    component.tagEnter = true;
    component.onKeyPress(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
  });
});
