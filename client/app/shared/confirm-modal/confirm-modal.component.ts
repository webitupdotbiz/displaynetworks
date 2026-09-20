import { Component, Input, AfterViewInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class AppConfirmModal {
    @Input() modalId: string = '';
    @Input() title: string = '';
    @Input() message: string = '';
    @Output() confirmed = new EventEmitter<void>();

    onConfirm() {
      this.confirmed.emit();
    }
}