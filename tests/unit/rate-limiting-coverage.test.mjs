import test from "node:test";
import assert from "node:assert/strict";
import csrfHandler from "../../api/csrf-token.js";
import catalogHandler from "../../api/catalog-state.js";

function createMockReqRes({ method = "GET", headers = {}, query = {}, body = null } = {}) {
  const req = {
    method,
    headers: {
      host: "localhost:5173",
      origin: "http://localhost:5173",
      "x-forwarded-for": "198.51.100.42",
      ...headers,
    },
    query,
    body,
  };

  let statusCode = 200;
  const responseHeaders = {};
  let responseData = null;
  let ended = false;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      responseHeaders[name.toLowerCase()] = value;
      return this;
    },
    json(data) {
      responseData = data;
      ended = true;
      return this;
    },
    end() {
      ended = true;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return responseData;
    },
    getHeader(name) {
      return responseHeaders[name.toLowerCase()];
    },
  };

  return { req, res };
}

test("Rate Limiting Coverage on New Endpoints", async (t) => {
  await t.test("1. csrf-token enforces rate limit after 120 requests", async () => {
    const testIp = "203.0.113.88";
    let lastStatusCode = 200;

    for (let i = 0; i < 125; i++) {
      const { req, res } = createMockReqRes({
        headers: { "x-forwarded-for": testIp },
      });
      await csrfHandler(req, res);
      lastStatusCode = res.getStatusCode();
      if (lastStatusCode === 429) {
        assert.equal(res.getStatusCode(), 429);
        assert.ok(res.getHeader("retry-after"));
        assert.equal(res.getData().ok, false);
        break;
      }
    }

    assert.equal(lastStatusCode, 429, "Expected 429 Too Many Requests after exhausting rate limit");
  });

  await t.test("2. catalog-state GET enforces rate limit after 180 requests", async () => {
    const testIp = "203.0.113.99";
    let hitRateLimit = false;

    for (let i = 0; i < 185; i++) {
      const { req, res } = createMockReqRes({
        headers: { "x-forwarded-for": testIp },
        query: { action: "get" },
      });
      await catalogHandler(req, res);
      if (res.getStatusCode() === 429) {
        hitRateLimit = true;
        assert.ok(res.getHeader("retry-after"));
        assert.equal(res.getData().ok, false);
        break;
      }
    }

    assert.ok(hitRateLimit, "Expected 429 on catalog-state after exceeding 180 requests");
  });
});
