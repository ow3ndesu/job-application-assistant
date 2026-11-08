import { describe, expect, it } from 'vitest';
import { APP_NAME } from './app-info';

describe('app-info', () => {
  it('exposes the product name', () => {
    expect(APP_NAME).toBe('Job Application Assistant');
  });
});
