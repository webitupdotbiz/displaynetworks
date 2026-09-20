import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { UserService, UserData } from './user.service';
import { UserType, UserPayloadType } from '../user';
import { SavedUser } from './auth.service';
import { ObjectId } from 'bson';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;
  const mockIdStr = '60c72b2f9b1d8b2bad123456';
  const mockObjectId = new ObjectId(mockIdStr);

  const mockUser: UserType = {
    _id: mockIdStr,
    email: 'dev@displaynet.works',
    role: 'admin'
  } as unknown as UserType;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UserService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'token') return 'user-session-token';
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

  it('should download selectable dropdown target tags', () => {
    const tags = ['cambridge', 'waltham'];
    service.getDropdownTags(mockIdStr).subscribe((res) => {
      expect(res).toEqual(tags);
    });

    const req = httpMock.expectOne(`/_api/user/${mockIdStr}/tags/selector`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-access-token')).toBe('user-session-token');
    req.flush(tags);
  });

  it('should post credential parameters during verification sessions', () => {
    const creds = { email: 'test', password: 'pwd' };
    service.login(creds).subscribe();

    const req = httpMock.expectOne('/_api/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(JSON.stringify(creds));
    req.flush({});
  });

  it('should fetch users list tracking parameters mapping without pointer references', () => {
    const mockRes: UserData = { count: 1, users: [mockUser] };
    service.getUsers(undefined, { role: 'admin' }).subscribe((res) => {
      expect(res).toEqual(mockRes);
    });

    const req = httpMock.expectOne((r) => r.url === '/_api/users/' && r.params.has('role'));
    expect(req.request.method).toBe('GET');
    req.flush(mockRes);
  });

  it('should append index offset identities to user profile queries', () => {
    const mockRes: UserData = { count: 1, users: [mockUser] };
    service.getUsers(mockObjectId, {}).subscribe((res) => {
      expect(res).toEqual(mockRes);
    });

    const req = httpMock.expectOne(`/_api/users/${mockIdStr}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockRes);
  });

  it('should pull user structural counter sizes', () => {
    service.countUsers().subscribe((res) => expect(res.count).toBe(1));

    const req = httpMock.expectOne('/_api/users/count');
    expect(req.request.method).toBe('GET');
    req.flush({ count: 1 });
  });

  it('should inject verified registration records downstream', () => {
    const payload = { email: 'new@test.com' } as UserPayloadType;
    service.addUser(payload).subscribe();

    const req = httpMock.expectOne('/_api/user');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.data).toEqual(payload);
    req.flush({});
  });

  it('should issue registration invites across network endpoints', () => {
    service.resendInvite(mockUser).subscribe();

    const req = httpMock.expectOne('/_api/user/invite');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.userId).toBe(mockIdStr);
    req.flush({});
  });

  it('should raise descriptive processing exceptions if target identifier validation matches zero records', () => {
    const invalidUser = { email: 'empty@test.com' } as SavedUser;
    expect(() => service.getUser(invalidUser)).toThrow('No user id available');
  });

  it('should download structured layout mappings belonging to validated target accounts', () => {
    const validSavedUser = { _id: mockIdStr } as unknown as SavedUser;
    service.getUser(validSavedUser).subscribe((res) => expect(res).toEqual(mockUser));

    const req = httpMock.expectOne(`/_api/user/${mockIdStr}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockUser);
  });

  it('should push updated data objects safely', () => {
    service.editUser(mockUser).subscribe();

    const req = httpMock.expectOne(`/_api/user/${mockIdStr}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBe(JSON.stringify(mockUser));
    req.flush({});
  });

  it('should drop records down-stream inside delete pathways', () => {
    service.deleteUser(mockUser).subscribe();

    const req = httpMock.expectOne(`/_api/user/${mockIdStr}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('should request baseline recovery links across mail structures', () => {
    service.initiateReset('dev@displaynet.works').subscribe();

    const req = httpMock.expectOne('/_api/user/reset');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.email).toBe('dev@displaynet.works');
    req.flush({});
  });

  it('should verify parameters parsed inside validation links', () => {
    service.verifyReset('reset-token-xyz').subscribe();

    const req = httpMock.expectOne('/_api/reset/reset-token-xyz');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('should post complete target credential records inside recovery pipelines', () => {
    const payload = { password: 'new-secure-password' };
    service.submitResetPassword('reset-token-xyz', payload).subscribe();

    const req = httpMock.expectOne('/_api/reset/reset-token-xyz');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });
});
