import type { jest } from '@jest/globals';

export type MockFn<T extends (...args: never[]) => unknown> = ReturnType<typeof jest.fn<T>>;
