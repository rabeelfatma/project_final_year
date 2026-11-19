import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAuthSession,
  getAuthHeader,
  getAuthToken,
  normalizeAuthToken,
  setAuthToken,
} from "./authToken";

describe("authToken helpers", () => {
  beforeEach(() => {
    clearAuthSession();
  });

  it("rejects empty, nullish, and non-JWT junk", () => {
    expect(normalizeAuthToken("")).toBeNull();
    expect(normalizeAuthToken("null")).toBeNull();
    expect(normalizeAuthToken("undefined")).toBeNull();
    expect(normalizeAuthToken("Bearer ")).toBeNull();
    expect(normalizeAuthToken("not-a-jwt")).toBeNull();
  });

  it("strips Bearer prefixes and accepts a JWT-shaped token", () => {
    const jwt = "aaa.bbb.ccc";
    expect(normalizeAuthToken(jwt)).toBe(jwt);
    expect(normalizeAuthToken(`Bearer ${jwt}`)).toBe(jwt);
    expect(normalizeAuthToken(`Bearer Bearer ${jwt}`)).toBe(jwt);
  });

  it("stores and reads only valid tokens; getAuthHeader omits Authorization when empty", () => {
    expect(getAuthHeader()).toEqual({});
    setAuthToken("hdr.pay.sig");
    expect(getAuthToken()).toBe("hdr.pay.sig");
    expect(getAuthHeader()).toEqual({ Authorization: "Bearer hdr.pay.sig" });
  });

  it("clears malformed storage values on read", () => {
    localStorage.setItem("token", "Bearer null");
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });
});
