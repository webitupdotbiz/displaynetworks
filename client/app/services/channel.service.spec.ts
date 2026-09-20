import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ChannelService, ChannelData } from './channel.service';
import { Entry } from '../entry';
import { ObjectId } from 'bson';

describe('ChannelService', () => {
  let service: ChannelService;
  let httpMock: HttpTestingController;
  const mockId = '60c72b2f9b1d8b2bad123456';
  const mockObjectId = new ObjectId(mockId);
  
  const mockEntry: Entry = {
    _id: mockId,
    name: 'test-channel'
  } as unknown as Entry;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChannelService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(ChannelService);
    httpMock = TestBed.inject(HttpTestingController);
    
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'token') return 'mock-token';
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

  it('should fetch channels without lastId', () => {
    const mockResponse: ChannelData = { count: 1, channels: [mockEntry] };

    service.getChannels(mockId, undefined, { term: 'test' }).subscribe((data) => {
      expect(data).toEqual(mockResponse);
    });

    const req = httpMock.expectOne((r) => r.url === `/_api/user/${mockId}/channels` && r.params.has('term'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-access-token')).toBe('mock-token');
    req.flush(mockResponse);
  });

  it('should fetch channels with lastId', () => {
    const mockResponse: ChannelData = { count: 1, channels: [mockEntry] };

    service.getChannels(mockId, mockObjectId, {}).subscribe((data) => {
      expect(data).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(`/_api/user/${mockId}/channels/${mockId}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should fetch count with id', () => {
    service.count(mockObjectId).subscribe((res) => {
      expect(res).toEqual({ count: 5 });
    });

    const req = httpMock.expectOne(`/_api/user/${mockId}/channels/count`);
    expect(req.request.method).toBe('GET');
    req.flush({ count: 5 });
  });

  it('should fetch count without id', () => {
    service.count(undefined as unknown as ObjectId).subscribe((res) => {
      expect(res).toEqual({ count: 10 });
    });

    const req = httpMock.expectOne('/_api/channels/count');
    expect(req.request.method).toBe('GET');
    req.flush({ count: 10 });
  });

  it('should add an entry', () => {
    service.addEntry(mockEntry).subscribe((res) => {
      expect(res).toEqual({ success: true });
    });

    const req = httpMock.expectOne('/_api/channels');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(JSON.stringify(mockEntry));
    req.flush({ success: true });
  });

  it('should get a single entry by id', () => {
    service.getEntry(mockObjectId).subscribe((res) => {
      expect(res).toEqual(mockEntry);
    });

    const req = httpMock.expectOne(`/_api/channels/${mockId}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockEntry);
  });

  it('should edit an entry', () => {
    service.editEntry(mockEntry).subscribe((res) => {
      expect(res).toEqual({ updated: true });
    });

    const req = httpMock.expectOne(`/_api/channels/${mockId}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBe(JSON.stringify(mockEntry));
    req.flush({ updated: true });
  });

  it('should delete an entry', () => {
    service.deleteEntry(mockEntry).subscribe((res) => {
      expect(res).toEqual({ deleted: true });
    });

    const req = httpMock.expectOne(`/_api/channels/${mockId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ deleted: true });
  });

  it('should get an entry by name', () => {
    service.getByName('test-channel').subscribe((res) => {
      expect(res).toEqual(mockEntry);
    });

    const req = httpMock.expectOne('/_api/channel/test-channel');
    expect(req.request.method).toBe('GET');
    req.flush(mockEntry);
  });

  it('should return true if name is available', () => {
    service.checkNameAvailable('new-name').subscribe((available) => {
      expect(available).toBe(true);
    });

    const req = httpMock.expectOne('/_api/channels/check/new-name');
    req.flush({ exists: false });
  });

  it('should return false if name is not available', () => {
    service.checkNameAvailable('existing-name').subscribe((available) => {
      expect(available).toBe(false);
    });

    const req = httpMock.expectOne('/_api/channels/check/existing-name');
    req.flush({ exists: true });
  });

  it('should catch error and return false during availability check', () => {
    service.checkNameAvailable('error-name').subscribe((available) => {
      expect(available).toBe(false);
    });

    const req = httpMock.expectOne('/_api/channels/check/error-name');
    req.error(new ProgressEvent('Network error'));
  });
});
