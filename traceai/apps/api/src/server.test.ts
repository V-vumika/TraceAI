process.env.NODE_ENV = "test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./server";

const email = `auth-test-${Date.now()}@example.com`;
const password = "TestPass123!";
const protectedUrl = "/workspaces/6bcc0159-3b8f-4507-9d55-8e43cdad504f/access";

let accessToken = "";
let refreshCookie = "";

function firstCookie(header: string | string[] | undefined): string {
  if (!header) return "";
  return Array.isArray(header) ? (header[0] ?? "") : header;
}

function allCookies(header: string | string[] | undefined): string {
  if (!header) return "";
  return Array.isArray(header) ? header.join("\n") : header;
}

describe("Auth integration tests", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects signup with invalid details", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "invalid-email", password: "x" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("signs up a new user without leaking secrets", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { name: "Auth Test User", email, password },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().user.email).toBe(email);

    const raw = response.body;
    expect(raw).not.toContain(password);
    expect(raw.toLowerCase()).not.toContain("passwordhash");
    expect(raw.toLowerCase()).not.toContain("argon2");
  });

  it("rejects duplicate signup", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { name: "Auth Test User", email, password },
    });

    expect(response.statusCode).toBe(409);
  });

  it("logs in and sets an HTTP-only refresh cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.accessToken).toBeTruthy();
    accessToken = body.accessToken;

    const cookieHeader = firstCookie(response.headers["set-cookie"]);
    expect(cookieHeader).toContain("traceai_refresh=");
    expect(cookieHeader).toContain("HttpOnly");

    refreshCookie = cookieHeader.split(";")[0] ?? "";
    expect(refreshCookie).toContain("traceai_refresh=");
  });

  it("rejects an incorrect password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "WrongPassword123!" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects login for an unknown email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: `nobody-${Date.now()}@example.com`, password },
    });

    expect(response.statusCode).toBe(401);
  });

  it("refreshes the access token using the refresh cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: refreshCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeTruthy();
  });

  it("rejects refresh when the cookie is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects refresh with a garbage cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: "traceai_refresh=garbage.invalid.token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("logs out and clears the refresh cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe("Logged out successfully.");

    const cookies = allCookies(response.headers["set-cookie"]);
    expect(cookies).toContain("traceai_refresh=");
    expect(cookies).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("rejects access to a protected route without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: protectedUrl,
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects access to a protected route with an invalid token", async () => {
    const response = await app.inject({
      method: "GET",
      url: protectedUrl,
      headers: { authorization: "Bearer not-a-real-token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("accepts a valid access token on a protected route", async () => {
    const response = await app.inject({
      method: "GET",
      url: protectedUrl,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Token is valid, so auth must pass. The workspace id is random,
    // so 403/404 is expected here, but never 401.
    expect(response.statusCode).not.toBe(401);
  });
});