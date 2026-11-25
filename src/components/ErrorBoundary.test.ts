import { describe, expect, it } from 'vitest';
import { clearSavedSettings, crashCopy } from './ErrorBoundary';

class FakeStorage {
  private readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  keys() {
    return [...this.items.keys()].sort();
  }
}

describe('crash screen', () => {
  it('speaks the page language, Arabic unless the page is English', () => {
    expect(crashCopy('en').dir).toBe('ltr');
    expect(crashCopy('ar').dir).toBe('rtl');
    expect(crashCopy('').dir).toBe('rtl');
    expect(crashCopy(undefined).title).toBe(crashCopy('ar').title);
  });

  it('forgets only what Darbak saved', () => {
    const storage = new FakeStorage();
    storage.setItem('darbak:prefs', '{}');
    storage.setItem('darbak:journey', '{}');
    storage.setItem('other-app:token', 'keep me');
    clearSavedSettings(storage);
    expect(storage.keys()).toEqual(['other-app:token']);
  });
});
