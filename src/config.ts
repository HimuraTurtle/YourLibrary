import { homedir } from "node:os";
import { join } from "node:path";

export interface SourceConfig {
  enabled: boolean;
  baseUrl: string;
  /** Optional API key, resolved from the environment - never hard-coded. */
  apiKey?: string;
  /** Contact email for "polite pool" APIs (OpenAlex, ...). */
  email?: string;
}

export interface AppConfig {
  userAgent: string;
  contactEmail: string;
  http: {
    timeoutMs: number;
    retries: number;
  };
  defaultLimit: number;
  maxLimit: number;
  sources: {
    openLibrary: SourceConfig;
    googleBooks: SourceConfig;
    gutenberg: SourceConfig;
    openAlex: SourceConfig;
    semanticScholar: SourceConfig;
    arxiv: SourceConfig;
    duckduckgo: SourceConfig;
  };
  store: { path: string };
}

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeDeep<T>(base: T, overrides: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return (overrides === undefined ? base : overrides) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = out[key];
    if (isPlainObject(value) && isPlainObject(baseValue)) {
      out[key] = mergeDeep(baseValue, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Builds the application config from environment variables plus caller overrides.
 * All tunables (endpoints, keys, limits) live here so nothing is hard-coded in
 * the adapters themselves.
 */
export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const env = process.env;
  const email = env.CONTACT_EMAIL ?? "";
  const base: AppConfig = {
    userAgent: env.YOUR_LIBRARY_USER_AGENT ?? "YourLibrary/0.1 (open-source desktop librarian)",
    contactEmail: email,
    http: {
      timeoutMs: int(env.YOUR_LIBRARY_HTTP_TIMEOUT_MS, 15000),
      retries: int(env.YOUR_LIBRARY_HTTP_RETRIES, 2),
    },
    defaultLimit: int(env.YOUR_LIBRARY_DEFAULT_LIMIT, 10),
    maxLimit: int(env.YOUR_LIBRARY_MAX_LIMIT, 50),
    sources: {
      openLibrary: {
        enabled: true,
        baseUrl: "https://openlibrary.org",
        email,
      },
      googleBooks: {
        enabled: true,
        baseUrl: "https://www.googleapis.com/books/v1",
        apiKey: env.GOOGLE_BOOKS_API_KEY ?? "",
      },
      gutenberg: {
        enabled: true,
        baseUrl: "https://gutendex.com",
      },
      openAlex: {
        enabled: true,
        baseUrl: "https://api.openalex.org",
        email,
      },
      semanticScholar: {
        enabled: true,
        baseUrl: "https://api.semanticscholar.org/graph/v1",
        apiKey: env.S2_API_KEY ?? "",
      },
      arxiv: {
        enabled: true,
        baseUrl: "https://export.arxiv.org/api",
      },
      duckduckgo: {
        enabled: true,
        baseUrl: "https://api.duckduckgo.com",
      },
    },
    store: {
      path: env.YOUR_LIBRARY_DB ?? join(homedir(), ".your-library", "library.db"),
    },
  };
  return mergeDeep(base, overrides);
}
