import { IChannel } from '../models/channel.js';
import { IRule } from '../models/rule.js';


export class MemoryStore<T> {
  private store = new Map<string, T>();

  public get(key: string): T | undefined {
    return this.store.get(key);
  }

  public set(key: string, value: T): void {
    this.store.set(key, value);
  }

  public invalidate(key: string): boolean {
console.log('invalidate: ', key)
    return this.store.delete(key);
  }

  public clearAll(): void {
    this.store.clear();
  }
}

export const channelCache = new MemoryStore<IChannel>();
export const rulesCache = new MemoryStore<IRule[]>();
