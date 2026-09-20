import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimezoneSelectComponent, TimezoneService } from './timezone-select.component';

describe('TimezoneService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds zones from Intl.supportedValuesOf and sorts by offset then IANA', () => {
    const supportedSpy = jest.spyOn(Intl as any, 'supportedValuesOf').mockReturnValue([
      'America/New_York',
      'UTC',
      'Europe/London'
    ]);

    const service = new TimezoneService();
    const zones = service.allZones();

    expect(supportedSpy).toHaveBeenCalledWith('timeZone');
    expect(zones.length).toBe(3);

    const utc = zones.find((z) => z.iana === 'UTC');
    expect(utc).toBeDefined();
    expect(utc?.region).toBe('Other');
    expect(utc?.label).toBe('UTC');
    expect(utc?.formattedOffset).toMatch(/^UTC[+-]\d{2}:\d{2}$/);

    const ny = zones.find((z) => z.iana === 'America/New_York');
    expect(ny).toBeDefined();
    expect(ny?.region).toBe('America');
    expect(ny?.label).toBe('New York');
  });

  it('falls back to UTC when supportedValuesOf is unavailable', () => {
    const original = (Intl as any).supportedValuesOf;
    (Intl as any).supportedValuesOf = undefined;

    const service = new TimezoneService();
    const zones = service.allZones();

    expect(zones.length).toBe(1);
    expect(zones[0].iana).toBe('UTC');

    (Intl as any).supportedValuesOf = original;
  });

  it('parses positive GMT offsets with minute components', () => {
    jest.spyOn(Intl as any, 'supportedValuesOf').mockReturnValue(['Asia/Kolkata']);

    const service = new TimezoneService();
    const zones = service.allZones();

    expect(zones.length).toBe(1);
    expect(zones[0].iana).toBe('Asia/Kolkata');
    expect(zones[0].offsetMinutes).toBe(330);
    expect(zones[0].formattedOffset).toBe('UTC+05:30');
  });
});

describe('TimezoneSelectComponent', () => {
  let fixture: ComponentFixture<TimezoneSelectComponent>;
  let component: TimezoneSelectComponent;
  let resolvedOptionsSpy: jest.SpyInstance;

  const zones = [
    { iana: 'UTC', label: 'UTC', region: 'Other', offsetMinutes: 0, formattedOffset: 'UTC+00:00' },
    { iana: 'America/New_York', label: 'New York', region: 'America', offsetMinutes: -300, formattedOffset: 'UTC-05:00' }
  ];

  beforeEach(async () => {
    resolvedOptionsSpy = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'America/New_York'
    } as Intl.ResolvedDateTimeFormatOptions);

    await TestBed.configureTestingModule({
      imports: [TimezoneSelectComponent],
      providers: [
        {
          provide: TimezoneService,
          useValue: {
            allZones: () => zones
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TimezoneSelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates and groups zones by region', () => {
    expect(component).toBeTruthy();
    expect(resolvedOptionsSpy).toHaveBeenCalled();

    const grouped = component.groupedZones();
    expect(grouped.length).toBe(2);
    expect(grouped.find((g) => g.region === 'America')?.zones[0].iana).toBe('America/New_York');
    expect(grouped.find((g) => g.region === 'Other')?.zones[0].iana).toBe('UTC');
  });

  it('defaults empty values to the browser timezone', () => {
    component.writeValue('');
    expect(component.selectedZone()).toBe('America/New_York');

    component.writeValue('America/New_York');
    expect(component.selectedZone()).toBe('America/New_York');
  });

  it('registers and triggers change/touched callbacks on selection change', () => {
    const onChange = jest.fn();
    const onTouched = jest.fn();

    component.registerOnChange(onChange);
    component.registerOnTouched(onTouched);

    component.onSelectionChange('America/New_York');
    expect(component.selectedZone()).toBe('America/New_York');
    expect(onChange).toHaveBeenCalledWith('America/New_York');
    expect(onTouched).toHaveBeenCalled();

    component.onSelectionChange('');
    expect(component.selectedZone()).toBe('America/New_York');
    expect(onChange).toHaveBeenCalledWith('America/New_York');
  });

  it('updates disabled state via ControlValueAccessor hook', () => {
    component.setDisabledState(true);
    expect(component.disabled()).toBe(true);

    component.setDisabledState(false);
    expect(component.disabled()).toBe(false);
  });

  it('auto-detects browser timezone when available in options', () => {
    const onChange = jest.fn();
    component.registerOnChange(onChange);

    const resolvedOptionsSpy = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'America/New_York'
    } as Intl.ResolvedDateTimeFormatOptions);

    component.detectBrowserTimezone();

    expect(resolvedOptionsSpy).toHaveBeenCalled();
    expect(component.selectedZone()).toBe('America/New_York');
    expect(onChange).toHaveBeenCalledWith('America/New_York');
  });

  it('ignores browser timezone when not available in options', () => {
    const onChange = jest.fn();
    component.registerOnChange(onChange);

    jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'Asia/Tokyo'
    } as Intl.ResolvedDateTimeFormatOptions);

    component.detectBrowserTimezone();

    expect(component.selectedZone()).toBe('America/New_York');
    expect(onChange).not.toHaveBeenCalled();
  });
});
