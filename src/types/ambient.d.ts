// Ambient module declarations to satisfy TypeScript language server
declare module 'next/server' {
  export class NextRequest extends Request {
    nextUrl: any;
    cookies: any;
    geo: any;
    ip?: string;
  }
  export class NextResponse extends Response {
    static json(data: any, init?: ResponseInit): Response;
    static redirect(url: string | URL, init?: ResponseInit): Response;
    static rewrite(url: string | URL, init?: ResponseInit): Response;
    static next(init?: ResponseInit): Response;
  }
}

// Note: only declare minimal ambient modules here. Path aliases are
// resolved via tsconfig `paths` mapping; avoid broad wildcard modules
// which break named export resolution.
