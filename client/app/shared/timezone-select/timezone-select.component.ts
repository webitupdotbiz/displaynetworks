import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  computed,
  forwardRef,
  inject,
  signal
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

export function getBrowserTimezoneOrUtc(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return detected && typeof detected === 'string' ? detected : 'UTC';
}

export interface TimezoneOption {
  iana: string;
  label: string;
  region: string;
  offsetMinutes: number;
  formattedOffset: string;
}

@Injectable({ providedIn: 'root' })
export class TimezoneService {
  readonly allZones = signal<TimezoneOption[]>(this.buildTimezoneList());

  private buildTimezoneList(): TimezoneOption[] {
    const supportedValuesOf = (Intl as any).supportedValuesOf as ((key: string) => string[]) | undefined;
    const supportedZones = typeof supportedValuesOf === 'function'
      ? supportedValuesOf('timeZone')
      : ['UTC'];
    const now = new Date();

    return supportedZones
      .map((iana) => {
        const parts = iana.split('/');
        const region = parts.length > 1 ? parts[0].replace('_', ' ') : 'Other';
        const label = parts.slice(1).join('/').replace(/_/g, ' ') || iana;

        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: iana,
          timeZoneName: 'shortOffset'
        });

        const formattedName = formatter
          .formatToParts(now)
          .find((p) => p.type === 'timeZoneName')?.value || 'UTC';

        const offsetMatch = formattedName.match(/GMT([+-]\d+)?(?::(\d+))?/);
        let offsetMinutes = 0;

        if (offsetMatch && offsetMatch[1]) {
          const hours = parseInt(offsetMatch[1], 10);
          const mins = offsetMatch[2] ? parseInt(offsetMatch[2], 10) : 0;
          offsetMinutes = hours * 60 + (hours < 0 ? -mins : mins);
        }

        const totalMins = Math.abs(offsetMinutes);
        const sign = offsetMinutes >= 0 ? '+' : '-';
        const padH = String(Math.floor(totalMins / 60)).padStart(2, '0');
        const padM = String(totalMins % 60).padStart(2, '0');
        const formattedOffset = `UTC${sign}${padH}:${padM}`;

        return { iana, label, region, offsetMinutes, formattedOffset };
      })
      .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.iana.localeCompare(b.iana));
  }
}

@Component({
  selector: 'app-timezone-select',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimezoneSelectComponent),
      multi: true
    }
  ],
  template: `
    <div class="input-group">
      <select
        class="form-select"
        [disabled]="disabled()"
        [ngModel]="selectedZone()"
        (ngModelChange)="onSelectionChange($event)"
        aria-label="Rule timezone"
      >
        <option value="" disabled>Select display timezone...</option>
        @for (group of groupedZones(); track group.region) {
          <optgroup [label]="group.region">
            @for (tz of group.zones; track tz.iana) {
              <option [value]="tz.iana">
                ({{ tz.formattedOffset }}) {{ tz.label }}
              </option>
            }
          </optgroup>
        }
      </select>
    </div>
  `
})
export class TimezoneSelectComponent implements ControlValueAccessor {
  readonly selectedZone = signal<string>(getBrowserTimezoneOrUtc());
  readonly disabled = signal<boolean>(false);

  private readonly timezoneService = inject(TimezoneService);
  private readonly zones = this.timezoneService.allZones;

  readonly groupedZones = computed(() => {
    const map = new Map<string, TimezoneOption[]>();
    for (const tz of this.zones()) {
      const existing = map.get(tz.region) || [];
      existing.push(tz);
      map.set(tz.region, existing);
    }

    return Array.from(map.entries()).map(([region, zones]) => ({
      region,
      zones
    }));
  });

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(val: string): void {
    this.selectedZone.set(val || getBrowserTimezoneOrUtc());
  }

  registerOnChange(fn: (val: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onSelectionChange(value: string): void {
    this.selectedZone.set(value || getBrowserTimezoneOrUtc());
    this.onChange(this.selectedZone());
    this.onTouched();
  }

  detectBrowserTimezone(): void {
    const detected = getBrowserTimezoneOrUtc();
    const exists = this.zones().some((z) => z.iana === detected);
    if (exists) {
      this.onSelectionChange(detected);
    }
  }
}
