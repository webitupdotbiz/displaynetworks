import { ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class ToastComponent {
  @Input() message = { body: '', type: '' };
  private cdr = inject(ChangeDetectorRef);

  setMessage(body: string, type: string, time = 4000) {
    this.message = { body, type };
    this.cdr.markForCheck();
    setTimeout(() => {
      this.message = { body: '', type: '' };
      this.cdr.markForCheck();
    }, time);
  }
}
