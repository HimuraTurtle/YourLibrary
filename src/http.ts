export type Fetcher = typeof fetch;

export interface HttpOptions {
  timeoutMs: number;
  retries: number;
  userAgent: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const exp = Math.min(250 * 2 ** attempt, 5000);
  return exp + Math.floor(Math.random() * 200);
}

function readRetryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toHeaderRecord(headers: RequestInit["headers"]): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  return { ...(headers as Record<string, string>) };
}

/** Minimal fetch wrapper with per-request timeout, retry-on-transient-failure, and a user agent. */
export class HttpClient {
  readonly fetchFn: Fetcher;
  readonly opts: HttpOptions;

  constructor(fetchFn: Fetcher, opts: HttpOptions) {
    this.fetchFn = fetchFn;
    this.opts = opts;
  }

  async getText(url: string, init?: RequestInit): Promise<string> {
    const attempts = this.opts.retries + 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
      try {
        const res = await this.fetchFn(url, {
          ...init,
          signal,
          headers: { "user-agent": this.opts.userAgent, accept: "*/*", ...toHeaderRecord(init?.headers) },
        });
        if (res.status === 429 || res.status >= 500) {
          if (attempt === attempts - 1) throw new HttpError(res.status, url, "HTTP " + res.status + " from " + url);
          await sleep(Math.max(backoffMs(attempt), Math.min(readRetryAfterMs(res.headers.get("retry-after")), 30000)));
          continue;
        }
        if (!res.ok) throw new HttpError(res.status, url, "HTTP " + res.status + " from " + url);
        return await res.text();
      } catch (err) {
        if (init?.signal?.aborted) throw err; // caller cancelled: never retry
        if (err instanceof HttpError) throw err;
        if (attempt === attempts - 1) throw err;
        await sleep(backoffMs(attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("Failed to fetch " + url + " after " + attempts + " attempts");
  }

  async getJson(url: string, init?: RequestInit): Promise<unknown> {
    const text = await this.getText(url, init);
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Invalid JSON from " + url + ": " + errorMessage(err));
    }
  }
}
