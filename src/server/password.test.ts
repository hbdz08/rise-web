import { hashPassword, verifyPassword } from "@/server/password";

describe("password", () => {
  it("hashes and verifies", () => {
    const h = hashPassword("p@ssw0rd");
    expect(verifyPassword("p@ssw0rd", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});

