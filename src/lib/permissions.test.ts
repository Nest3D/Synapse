import { describe, it, expect } from "vitest";
import {
  resolveVisibleFieldKeys,
  isLoginAllowed,
  stripValuesToVisible,
} from "./permissions";

describe("resolveVisibleFieldKeys", () => {
  const all = ["person", "description", "category", "done"];

  it("admin sees all fields regardless of grants", () => {
    expect(resolveVisibleFieldKeys({ allKeys: all, grantedKeys: ["done"], isAdmin: true })).toEqual(all);
  });

  it("no grants means see all (opt-in restriction)", () => {
    expect(resolveVisibleFieldKeys({ allKeys: all, grantedKeys: [], isAdmin: false })).toEqual(all);
  });

  it("with grants, sees only granted, in allKeys order", () => {
    expect(
      resolveVisibleFieldKeys({ allKeys: all, grantedKeys: ["done", "person"], isAdmin: false }),
    ).toEqual(["person", "done"]);
  });

  it("ignores granted keys that no longer exist on the tab", () => {
    expect(
      resolveVisibleFieldKeys({ allKeys: all, grantedKeys: ["ghost", "category"], isAdmin: false }),
    ).toEqual(["category"]);
  });
});

describe("isLoginAllowed", () => {
  it("allows the bootstrap admin email even without a user row", () => {
    expect(isLoginAllowed({ email: "a@b.com", adminEmail: "a@b.com", userExists: false })).toBe(true);
  });
  it("allows any email that already has a user row (invited)", () => {
    expect(isLoginAllowed({ email: "x@y.com", adminEmail: "a@b.com", userExists: true })).toBe(true);
  });
  it("rejects unknown, non-admin emails", () => {
    expect(isLoginAllowed({ email: "x@y.com", adminEmail: "a@b.com", userExists: false })).toBe(false);
  });
  it("is case-insensitive on the admin email", () => {
    expect(isLoginAllowed({ email: "A@B.com", adminEmail: "a@b.com", userExists: false })).toBe(true);
  });
  it("rejects when email is null/empty", () => {
    expect(isLoginAllowed({ email: null, adminEmail: "a@b.com", userExists: false })).toBe(false);
  });
});

describe("stripValuesToVisible", () => {
  it("keeps only visible keys", () => {
    const values = { person: ["u1"], description: "hi", secret: 42 };
    expect(stripValuesToVisible(values, ["person", "description"])).toEqual({
      person: ["u1"],
      description: "hi",
    });
  });
});
