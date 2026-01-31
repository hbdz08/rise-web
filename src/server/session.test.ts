import { createAdminSessionCookieValue, parseAdminSessionCookieValue } from "@/server/session";

describe("session", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "test-secret";
    process.env.SESSION_MAX_AGE_SECONDS = "3600";
  });

  it("round-trips a signed session", () => {
    const v = createAdminSessionCookieValue({
      userId: 1,
      username: "hr01",
      role: "HR_ADMIN",
      iat: Date.now(),
    });
    const parsed = parseAdminSessionCookieValue(v);
    expect(parsed?.userId).toBe(1);
    expect(parsed?.role).toBe("HR_ADMIN");
  });

  it("rejects tampered session", () => {
    const v = createAdminSessionCookieValue({
      userId: 1,
      username: "hr01",
      role: "HR_ADMIN",
      iat: Date.now(),
    });
    const bad = v.replace("a", "b");
    expect(parseAdminSessionCookieValue(bad)).toBeNull();
  });
});

