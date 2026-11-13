import { describe, expect, it } from "vitest";
import { getSafePostLoginDestination } from "@/lib/auth/post-login-destination";

describe("getSafePostLoginDestination", () => {
  it.each([
    ["/home", "/home"],
    ["/backlog", "/backlog"],
    ["/catalog?search=zelda%20totk#results", "/catalog?search=zelda%20totk#results"],
    ["/games/123", "/games/123"],
  ])("accepts the internal destination %s", (input, expected) => {
    expect(getSafePostLoginDestination(input)).toBe(expected);
  });

  it.each([
    null,
    "",
    "   ",
    "https://evil.example",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "javascript:alert(1)",
    "data:text/html,hello",
    "\\\\evil.example",
    "/%5c%5cevil.example",
    "login",
    "../admin",
    "/../admin",
    "/%2e%2e/admin",
    "/%252e%252e/admin",
    "/%252f%252fevil.example",
    "/bad%escape",
    "/path?bad=%escape",
    "/path\nnext",
    "/path?value=%0a",
    "/login",
    "/login?from=/home",
    "/check-email",
    "/api/auth/me",
  ])("falls back to /home for unsafe destination %s", (input) => {
    expect(getSafePostLoginDestination(input)).toBe("/home");
  });
});
