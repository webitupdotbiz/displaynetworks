import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { Observable, of, map, catchError } from 'rxjs';
import { Entry } from '../entry';
import { ObjectId } from 'bson';
export interface ChannelData {
  count: number;
  channels: Entry[];
}

@Injectable({providedIn: 'root'})
export class ChannelService {
  private http = inject(HttpClient);

  getChannels(id: string, lastId: ObjectId | undefined, params: any): Observable<ChannelData> {
    const value = localStorage.getItem('token');
    const  token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', "x-access-token": token })
    };
    let paramsObj = { headers: options.headers, params };
    if (lastId) return this.http.get<ChannelData>('/_api/user/' + id + '/channels/' + lastId, paramsObj);
    return this.http.get<ChannelData>('/_api/user/' + id + '/channels', paramsObj);
  }

  count(id: ObjectId): Observable<any> {
    const value = localStorage.getItem('token');
    const  token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', "x-access-token": token })
    };
    if (id) return this.http.get('/_api/user/' + id + '/channels/count', options);
    return this.http.get('/_api/channels/count', options);
  }

  addEntry(entry: Entry): Observable<any> {
    const value = localStorage.getItem('token');
    const  token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', "x-access-token": token })
    };
    return this.http.post('/_api/channels', JSON.stringify(entry), options);
  }

  getEntry(id: ObjectId): Observable<Entry> {
    const value = localStorage.getItem('token');
    const token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', 'x-access-token': token })
    };
    return this.http.get<Entry>(`/_api/channels/${id}`, options);
  }

  editEntry(entry: Entry): Observable<any> {
    const value = localStorage.getItem('token');
    const  token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', "x-access-token": token })
    };
    return this.http.put(`/_api/channels/${entry._id}`, JSON.stringify(entry), options);
  }

  deleteEntry(entry: Entry): Observable<any> {
    const value = localStorage.getItem('token');
    const  token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', "x-access-token": token })
    };
    return this.http.delete(`/_api/channels/${entry._id}`, options);
  }

  getByName(name: string): Observable<Entry> {
    const value = localStorage.getItem('token');
    const token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', "x-access-token": token })
    };
    return this.http.get<Entry>(`/_api/channel/${name}`, options);
  }

  checkNameAvailable(name: string): Observable<boolean> {
    const value = localStorage.getItem('token');
    const token = (value && typeof value === 'string') ? value : '';
    const options = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json', 'charset': 'UTF-8', "x-access-token": token })
    };
    return this.http.get<{exists: boolean}>(`/_api/channels/check/${name}`, options)
      .pipe(
        map(res => !res.exists),
        catchError(() => of(false))
      );
  }
}
