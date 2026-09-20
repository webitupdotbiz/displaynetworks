import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Rule {
  _id?: string;
  name: string;
  owner: string;
  overrideUrl: string;
  matchStrategy: 'ANY' | 'ALL';
  tags: string[];
  notes?: string;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: number[];
  scheduleType?: 'CLIENT_CLOCK' | 'GLOBAL_INSTANT';
  timezone?: string;
  isActive: boolean;
  priority?: number;
  updatedAt?: string;
  search?: string;
}

export interface RuleResponseData {
  rules: Rule[];
  count: number;
}

@Injectable({
  providedIn: 'root'
})
export class RuleService {
  
  private apiPrefix = '/_api';
  private http = inject(HttpClient);

  private getHttpOptions() {
    const value = localStorage.getItem('token');
    const token = (value && typeof value === 'string') ? value : '';
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'charset': 'UTF-8',
        'x-access-token': token
      })
    };
  }

  addRule(rule: Rule): Observable<Rule> {
    const userId = rule.owner;
    return this.http.post<Rule>(
      `${this.apiPrefix}/user/${userId}/rule`, 
      JSON.stringify(rule), 
      this.getHttpOptions()
    );
  }

  getOrderedRules(userId: string, lastPriority?: number, params?: { term: string }): Observable<RuleResponseData> {
    let url = `${this.apiPrefix}/user/${userId}/rules`;
    if (lastPriority !== undefined) {
      url += `/${lastPriority}`;
    }
    
    const options = this.getHttpOptions();
    const paramsObj = params ? { headers: options.headers, params } : options;
    
    return this.http.get<RuleResponseData>(url, paramsObj);
  }

  getRule(userId: string, ruleId: string): Observable<Rule> {
    return this.http.get<Rule>(
      `${this.apiPrefix}/user/${userId}/rule/${ruleId}`,
      this.getHttpOptions()
    );
  }

  editRule(rule: Rule): Observable<void> {
    return this.http.put<void>(
      `${this.apiPrefix}/user/${rule.owner}/rule/${rule._id}`, 
      JSON.stringify(rule), 
      this.getHttpOptions()
    );
  }

  deleteRule(rule: Rule): Observable<void> {
    return this.http.delete<void>(
      `${this.apiPrefix}/user/${rule.owner}/rule/${rule._id}`, 
      this.getHttpOptions()
    );
  }

  swapPriority(ruleIdA: string, ruleIdB: string, ownerId: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiPrefix}/user/${ownerId}/rules/swap`, 
      JSON.stringify({ ruleIdA, ruleIdB, ownerId }), 
      this.getHttpOptions()
    );
  }
}
