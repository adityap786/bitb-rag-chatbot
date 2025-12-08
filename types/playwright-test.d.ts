// Minimal module declaration to satisfy TypeScript in environments
// where `@playwright/test` types are not installed/needed for unit test checks.
declare module '@playwright/test' {
  export const test: any;
  export const expect: any;
  export const Page: any;
  export const chromium: any;
  export const firefox: any;
  export const webkit: any;
}
