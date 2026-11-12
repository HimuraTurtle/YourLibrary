import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpClient, HttpError } from "../src/http";

test("retries a transient 500 and then succeeds", async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls++;
    return calls === 1 ? new Response("err", { status: 500 }) : new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;
  const http = new HttpClient(fetchFn, { timeoutMs: 5000, retries: 2, userAgent: "t" });
  assert.equal(await http.getText("https://example.test"), "ok");
  assert.equal(calls, 2);
});

test("non-retryable 404 throws HttpError without retrying", async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls++;
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  const http = new HttpClient(fetchFn, { timeoutMs: 5000, retries: 2, userAgent: "t" });
  await assert.rejects(
    () => http.getText("https://example.test"),
    (e: unknown) => e instanceof HttpError && e.status === 404,
  );
  assert.equal(calls, 1);
});

test("a caller-aborted signal fails fast without retrying", async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls++;
    throw new Error("aborted");
  }) as unknown as typeof fetch;
  const http = new HttpClient(fetchFn, { timeoutMs: 5000, retries: 3, userAgent: "t" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => http.getText("https://example.test", { signal: controller.signal }));
  assert.equal(calls, 1);
});
