import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { RuleService, Rule, RuleResponseData } from './rules.service';

describe('RuleService', () => {
  let service: RuleService;
  let httpMock: HttpTestingController;
  const mockUserId = 'user-123';

  const mockRule: Rule = {
    _id: 'rule-abc',
    name: 'Promo Override',
    owner: mockUserId,
    overrideUrl: 'https://cdn.displaynet.works/video.mp4',
    matchStrategy: 'ANY',
    tags: ['retail'],
    startTime: null,
    endTime: null,
    startDate: null,
    endDate: null,
    daysOfWeek: [1, 2],
    isActive: true
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RuleService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(RuleService);
    httpMock = TestBed.inject(HttpTestingController);

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'token') return 'rule-token';
      return null;
    });
  });

  afterEach(() => {
    httpMock.verify();
    jest.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create a rule via POST', () => {
    service.addRule(mockRule).subscribe((res) => {
      expect(res).toEqual(mockRule);
    });

    const req = httpMock.expectOne(`/_api/user/${mockUserId}/rule`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(JSON.stringify(mockRule));
    expect(req.request.headers.get('x-access-token')).toBe('rule-token');
    req.flush(mockRule);
  });

  it('should get ordered rules without lastPriority and search terms', () => {
    const mockResponse: RuleResponseData = { rules: [mockRule], count: 1 };

    service.getOrderedRules(mockUserId).subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(`/_api/user/${mockUserId}/rules`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should append priority parameters and search filters to query URL', () => {
    const mockResponse: RuleResponseData = { rules: [mockRule], count: 1 };

    service.getOrderedRules(mockUserId, 50, { term: 'boston' }).subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne((r) => r.url === `/_api/user/${mockUserId}/rules/50` && r.params.has('term'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('term')).toBe('boston');
    req.flush(mockResponse);
  });

  it('should update structural modifications via PUT', () => {
    service.editRule(mockRule).subscribe();

    const req = httpMock.expectOne(`/_api/user/${mockUserId}/rule/rule-abc`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBe(JSON.stringify(mockRule));
    req.flush(null);
  });

  it('should issue a deletion event down-stream via DELETE', () => {
    service.deleteRule(mockRule).subscribe();

    const req = httpMock.expectOne(`/_api/user/${mockUserId}/rule/rule-abc`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('should coordinate priority changes through sequence swaps', () => {
    service.swapPriority('rule-1', 'rule-2', mockUserId).subscribe();

    const req = httpMock.expectOne(`/_api/user/${mockUserId}/rules/swap`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(JSON.stringify({ ruleIdA: 'rule-1', ruleIdB: 'rule-2', ownerId: mockUserId }));
    req.flush(null);
  });
});
