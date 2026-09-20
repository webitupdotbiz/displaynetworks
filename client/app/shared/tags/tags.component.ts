import { Component, Input, Output, ViewChild, HostListener, ElementRef, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UntypedFormGroup } from '@angular/forms';


@Component({
  selector: 'app-tags',
  templateUrl: './tags.component.html',
  styleUrls: ['./tags.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TagsComponent implements OnInit {
  @Input() tags: any[] = [];
  @Input() formGroup: UntypedFormGroup = new UntypedFormGroup({});
  @Output() tagsChange = new EventEmitter();
  @ViewChild('tagsSetRef', { static: false }) tagsSetRefElement: ElementRef | undefined;

  tagsSet: any;
  lookup: boolean[] = [];
  isInsert: boolean = false;
  tagEnter: boolean = false;

  onTagsSetKeydown() {
    this.tagEnter = true;
    if (this.tagsSet == "" || this.tagsSet == null) return;
    let name = this.tagsSet.trim().replace(/\s+/g, ' ');
    if (this.lookup[name.toLowerCase()] !== undefined) {
      this.tagsSet = "";
      return;
    }
    this.lookup[name.toLowerCase()] = true;
    this.tags.push(name);
    this.formGroup.markAsDirty();
    this.tagsSet = "";
  }

  dropTag(index: any) {
    delete this.lookup[this.tags[index].toLowerCase()];
    this.tags.splice(index, 1);
    this.formGroup.markAsDirty();
    this.tagsChange.emit(this.tags);
  }

  ngOnInit() {
    this.isInsert = true;
  }

  setTags(tags: String[]) {
    this.isInsert = false;
    this.tags = tags;
    this.tagsSet = "";
  }

  newOrCancel() {
    this.isInsert = true;
    this.tagsSet = "";
    this.tags = [];
  }

  tagsSetFocus() {
    if (!this.tagsSetRefElement) return;
    this.tagsSetRefElement.nativeElement.focus();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyPress($event: KeyboardEvent) {
    if (this.tagEnter === true) {
      this.tagEnter = false;
      $event.preventDefault();
      return;
    }
    if (($event.ctrlKey || $event.metaKey) && $event.keyCode == 83) {
      $event.preventDefault();
    }
  }

}
