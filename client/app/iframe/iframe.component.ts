import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class IFrameComponent implements OnInit {
  host = window.location.host;
  iframeUrl?: SafeResourceUrl;

  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const name = params.get('name');
      if (name) {
        const rawUrl = `/_view/index.html?name=${encodeURIComponent(name)}`;
        this.iframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(rawUrl);
      }
    });
  }
}