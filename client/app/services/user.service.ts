import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ObjectId } from 'bson';

import { UserPayloadType, UserType } from '../user';
import { AuthTokens } from './auth.service';

export interface UserData {
  count: number;
  users: UserType[];
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private options = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8' })
  };

  private http = inject(HttpClient);

  private getAuthOptions() {
    const value = localStorage.getItem('token');
    const token = typeof value === 'string' ? value : '';
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'charset': 'UTF-8',
        'x-access-token': token
      })
    };
  }

  getDropdownTags(id: string): Observable<string[]> {
    return this.http.get<string[]>(`/_api/user/${id}/tags/selector`, this.getAuthOptions());
  }

  login(credentials: Record<string, string>): Observable<AuthTokens> {
    return this.http.post<AuthTokens>('/_api/login', JSON.stringify(credentials), this.options);
  }

  refresh(refreshToken: string): Observable<AuthTokens> {
    return this.http.post<AuthTokens>('/_api/refresh', JSON.stringify({ refreshToken }), this.options);
  }

  getUsers(lastId: ObjectId | undefined, params: any): Observable<UserData> {
    const options = this.getAuthOptions();
    const paramsObj = { headers: options.headers, params };
    if (lastId) return this.http.get<UserData>('/_api/users/' + lastId, paramsObj);
    return this.http.get<UserData>('/_api/users/', paramsObj);
  }

  countUsers(): Observable<any> {
    return this.http.get('/_api/users/count', this.getAuthOptions());
  }

  addUser(user: UserPayloadType): Observable<any> {
    const params = { data: user, origin: window.location.origin };
    return this.http.post('/_api/user', params, this.getAuthOptions());
  }

  resendInvite(user: UserType): Observable<any> {
    const params = { userId: user._id, origin: window.location.origin };
    return this.http.post('/_api/user/invite', params, this.getAuthOptions());
  }

  getUser(user: { id?: ObjectId; _id?: ObjectId }): Observable<any> {
    const userId = user._id ?? user.id;
    if (!userId) throw new Error('No user id available');
    return this.http.get(`/_api/user/${userId}`, this.getAuthOptions());
  }

  editUser(user: UserType): Observable<any> {
    return this.http.put(`/_api/user/${user._id}`, JSON.stringify(user), this.getAuthOptions());
  }

  deleteUser(user: UserType): Observable<any> {
    return this.http.delete(`/_api/user/${user._id}`, this.getAuthOptions());
  }

  initiateReset(email: string): Observable<any> {
    const params = { email: email, origin: window.location.origin };
    return this.http.post('/_api/user/reset', params, this.options);
  }

  verifyReset(token: string): Observable<any> {
    return this.http.get('/_api/reset/' + token, this.options);
  }

  submitResetPassword(token: string, params: any): Observable<any> {
    return this.http.post('/_api/reset/' + token, params, this.options);
  }
}