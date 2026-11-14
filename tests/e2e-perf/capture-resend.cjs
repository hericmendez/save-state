"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function isIsolatedE2EProcess() {
  const uri = process.env.E2E_MONGODB_URI;
  const captureFile = process.env.E2E_EMAIL_CAPTURE_FILE;
  if (
    process.env.E2E_DATABASE_EPHEMERAL !== "1" ||
    process.env.E2E_EMAIL_CAPTURE !== "1" ||
    !process.argv.some((argument) => /[\\/]next[\\/]dist[\\/]bin[\\/]next$/u.test(argument)) ||
    !process.argv.includes("start") ||
    !uri ||
    !captureFile
  ) return false;

  try {
    const parsed = new URL(uri);
    const expectedTempRoot = path.resolve(os.tmpdir(), "opencode");
    return (
      parsed.protocol === "mongodb:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      parsed.pathname.replace(/^\//u, "") === "save-state-e2e" &&
      parsed.searchParams.has("replicaSet") &&
      path.dirname(path.resolve(captureFile)) === expectedTempRoot &&
      path.basename(captureFile).startsWith("save-state-e2e-email-")
    );
  } catch {
    return false;
  }
}

if (!isIsolatedE2EProcess()) {
  throw new Error("Refusing to install E2E email capture outside the guarded local replica-set harness");
}

const captureFile = process.env.E2E_EMAIL_CAPTURE_FILE;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "api.resend.com") {
    if (url.pathname !== "/emails" || (init?.method ?? "GET").toUpperCase() !== "POST") {
      throw new Error("E2E harness blocked an unexpected Resend request");
    }
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (!body || typeof body.text !== "string" || typeof body.to !== "string") {
      throw new Error("E2E harness refused an unrecognized email payload");
    }
    fs.appendFileSync(captureFile, `${JSON.stringify(body)}\n`, { encoding: "utf8", mode: 0o600 });
    return new Response(JSON.stringify({ id: "e2e-captured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (!localHost) {
    throw new Error(`E2E harness blocked outbound server fetch to ${url.hostname}`);
  }
  return originalFetch(input, init);
};
