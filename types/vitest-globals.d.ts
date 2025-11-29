// Minimal local Vitest globals for TypeScript when the full vitest types
// are not available. This provides simple ambient declarations for test
// files so the compiler does not error on `describe`, `it`, `expect`, etc.

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: (...args: any[]) => any): void;
declare function test(name: string, fn: (...args: any[]) => any): void;
declare function beforeEach(fn: (...args: any[]) => any): void;
declare function afterEach(fn: (...args: any[]) => any): void;
declare function afterAll(fn: (...args: any[]) => any): void;
declare function expect(actual: any): any;
declare const vi: any;
