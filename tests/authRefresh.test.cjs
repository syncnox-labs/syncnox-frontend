const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadApiClient(mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", "config", "apiClient.config.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const exports = {};
  const requireMock = (name) => {
    if (name in mocks) return mocks[name];
    if (name === "next-auth/react") {
      return {
        getSession: async () => ({
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
        }),
        signOut: async () => {},
      };
    }
    return require(name);
  };

  new Function("exports", "require", compiled)(exports, requireMock);
  return exports.default;
}

test("apiClient attaches Authorization Bearer token from session", async () => {
  const client = loadApiClient();
  let capturedConfig = null;
  // Test request interceptor
  const interceptor = client.interceptors.request.handlers[0];
  const config = await interceptor.fulfilled({ headers: {} });
  assert.equal(config.headers.Authorization, "Bearer mock-access-token");
});

test("apiClient does not attach Authorization to /auth/refresh", async () => {
  const client = loadApiClient();
  const interceptor = client.interceptors.request.handlers[0];
  const config = await interceptor.fulfilled({ url: "/auth/refresh", headers: {} });
  assert.equal(config.headers.Authorization, undefined);
});

test("apiClient preserves Authorization on retried request", async () => {
  const client = loadApiClient();
  const interceptor = client.interceptors.request.handlers[0];
  const config = await interceptor.fulfilled({
    url: "/routes",
    headers: { Authorization: "Bearer new-refreshed-token" },
    _retry: true,
  });
  assert.equal(config.headers.Authorization, "Bearer new-refreshed-token");
});

