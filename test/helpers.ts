import type { Fetcher } from "../src/http";

export interface Route {
  status?: number;
  body: string;
  headers?: Record<string, string>;
}

/** Builds a fetch stub that routes by URL substring, returning real Response objects. */
export function fakeFetch(routes: Record<string, Route>, fallback?: Route): Fetcher {
  return (async (input: unknown, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
    let matched: Route | undefined;
    for (const key of Object.keys(routes)) {
      if (url.includes(key)) {
        matched = routes[key];
        break;
      }
    }
    const r = matched ?? fallback ?? { status: 404, body: "{}" };
    return new Response(r.body, {
      status: r.status ?? 200,
      headers: r.headers ?? { "content-type": "application/json" },
    });
  }) as unknown as Fetcher;
}

export const NO_RETRY = { timeoutMs: 5000, retries: 0, userAgent: "test" };
