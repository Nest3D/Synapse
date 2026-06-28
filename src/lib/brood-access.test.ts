import { describe, it, expect } from "vitest";
import { memberSeesColumn, applyMemberColumnAccess } from "./brood-access";

describe("memberSeesColumn", () => {
  it("ALL: everyone sees it", () => {
    expect(memberSeesColumn("ALL", [], "u1")).toBe(true);
  });
  it("INCLUDE: only listed users see it", () => {
    expect(memberSeesColumn("INCLUDE", ["u1"], "u1")).toBe(true);
    expect(memberSeesColumn("INCLUDE", ["u1"], "u2")).toBe(false);
  });
  it("EXCLUDE: everyone except listed users sees it", () => {
    expect(memberSeesColumn("EXCLUDE", ["u1"], "u1")).toBe(false);
    expect(memberSeesColumn("EXCLUDE", ["u1"], "u2")).toBe(true);
  });
});

describe("applyMemberColumnAccess", () => {
  it("ALL + hide -> EXCLUDE [user]", () => {
    expect(applyMemberColumnAccess("ALL", [], "u1", false)).toEqual({
      mode: "EXCLUDE",
      userIds: ["u1"],
    });
  });
  it("ALL + show -> stays ALL, empty list", () => {
    expect(applyMemberColumnAccess("ALL", [], "u1", true)).toEqual({
      mode: "ALL",
      userIds: [],
    });
  });
  it("INCLUDE + show adds the user (no duplicate)", () => {
    expect(applyMemberColumnAccess("INCLUDE", ["u1"], "u1", true)).toEqual({
      mode: "INCLUDE",
      userIds: ["u1"],
    });
    expect(applyMemberColumnAccess("INCLUDE", ["u1"], "u2", true)).toEqual({
      mode: "INCLUDE",
      userIds: ["u1", "u2"],
    });
  });
  it("INCLUDE + hide removes the user", () => {
    expect(applyMemberColumnAccess("INCLUDE", ["u1", "u2"], "u1", false)).toEqual({
      mode: "INCLUDE",
      userIds: ["u2"],
    });
  });
  it("EXCLUDE + hide adds the user to the exclude list", () => {
    expect(applyMemberColumnAccess("EXCLUDE", ["u1"], "u2", false)).toEqual({
      mode: "EXCLUDE",
      userIds: ["u1", "u2"],
    });
  });
  it("EXCLUDE + show removes the user; empty list reverts to ALL", () => {
    expect(applyMemberColumnAccess("EXCLUDE", ["u1"], "u1", true)).toEqual({
      mode: "ALL",
      userIds: [],
    });
    expect(applyMemberColumnAccess("EXCLUDE", ["u1", "u2"], "u1", true)).toEqual({
      mode: "EXCLUDE",
      userIds: ["u2"],
    });
  });
});
