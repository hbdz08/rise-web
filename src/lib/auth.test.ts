import {
  clearAdminAuthFromStorage,
  readAdminAuthFromStorage,
  writeAdminAuthToStorage,
} from "@/lib/auth";

describe("auth storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips admin auth state", () => {
    writeAdminAuthToStorage(localStorage, {
      username: "hr01",
      role: "HR_ADMIN",
      issuedAt: 123,
    });

    expect(readAdminAuthFromStorage(localStorage)).toEqual({
      username: "hr01",
      role: "HR_ADMIN",
      issuedAt: 123,
    });

    clearAdminAuthFromStorage(localStorage);
    expect(readAdminAuthFromStorage(localStorage)).toBeNull();
  });

  it("rejects invalid payloads", () => {
    localStorage.setItem("rise.adminAuth", "not-json");
    expect(readAdminAuthFromStorage(localStorage)).toBeNull();

    localStorage.setItem("rise.adminAuth", JSON.stringify({ username: "", role: "HR_ADMIN", issuedAt: 1 }));
    expect(readAdminAuthFromStorage(localStorage)).toBeNull();

    localStorage.setItem("rise.adminAuth", JSON.stringify({ username: "a", role: "NOPE", issuedAt: 1 }));
    expect(readAdminAuthFromStorage(localStorage)).toBeNull();
  });
});

