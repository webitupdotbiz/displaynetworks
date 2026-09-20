import { Component, Input, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';


@Component({
    selector: 'app-info-modal',
    templateUrl: './info-modal.component.html',
    styleUrls: ['./info-modal.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class AppInfoModal {
    @Input() modalId: string = '';
    @Input() title: string = '';
    @Input() message: string = '';
    isShowing: boolean = false;
}