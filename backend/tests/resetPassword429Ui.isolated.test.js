const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const resetPasswordPath = path.resolve(
  __dirname,
  "../../frontend/src/pages/authentication/ResetPassword.jsx"
);

function readResetPasswordSource() {
  return fs.readFileSync(resetPasswordPath, "utf8");
}

/**
 * Source-level UI contract: confirm-endpoint 429 must not mark the reset link invalid.
 * Mirrors ForgotPassword.jsx rate-limit handling without a frontend test runner.
 */
describe("ResetPassword confirm 429 UX contract", () => {
  it("handles HTTP 429 before invalid-link handling and does not set linkInvalid", () => {
    const src = readResetPasswordSource();

    const rateLimitIdx = src.indexOf("res.status === 429");
    assert.ok(rateLimitIdx >= 0, "must check res.status === 429");

    const invalidIdx = src.indexOf("setLinkInvalid(true)");
    // First setLinkInvalid(true) in useEffect (hash) and later on !res.ok — find the one after fetch.
    const fetchIdx = src.indexOf("/auth/password-reset/confirm");
    assert.ok(fetchIdx >= 0, "must POST /auth/password-reset/confirm");

    const afterFetch = src.slice(fetchIdx);
    const rateAfterFetch = afterFetch.indexOf("res.status === 429");
    const invalidAfterFetch = afterFetch.indexOf("setLinkInvalid(true)");
    assert.ok(rateAfterFetch >= 0, "429 handling must be in confirm response path");
    assert.ok(invalidAfterFetch >= 0, "invalid-link handling must remain for other errors");
    assert.ok(
      rateAfterFetch < invalidAfterFetch,
      "429 must be handled before setLinkInvalid on confirm response"
    );

    // Rate-limit branch must not call setLinkInvalid.
    const rateBlock = afterFetch.slice(
      rateAfterFetch,
      afterFetch.indexOf("if (!res.ok)", rateAfterFetch)
    );
    assert.doesNotMatch(rateBlock, /setLinkInvalid\s*\(\s*true\s*\)/);
    assert.match(
      rateBlock,
      /Too many requests\. Please try again later\./
    );
  });

  it("still marks the link invalid for non-429 failed confirm responses", () => {
    const src = readResetPasswordSource();
    const fetchIdx = src.indexOf("/auth/password-reset/confirm");
    const afterFetch = src.slice(fetchIdx);
    const notOkIdx = afterFetch.indexOf("if (!res.ok)");
    assert.ok(notOkIdx >= 0);
    const notOkBlock = afterFetch.slice(notOkIdx, notOkIdx + 220);
    assert.match(notOkBlock, /setLinkInvalid\s*\(\s*true\s*\)/);
    assert.match(notOkBlock, /Invalid or expired reset link/);
  });

  it("preserves success flow clearing password fields after confirm", () => {
    const src = readResetPasswordSource();
    assert.match(src, /setSuccess\s*\(\s*true\s*\)/);
    assert.match(src, /setPassword\s*\(\s*""\s*\)/);
    assert.match(src, /setConfirmPassword\s*\(\s*""\s*\)/);
    assert.match(src, /setToken\s*\(\s*""\s*\)/);
    assert.match(src, /Password updated successfully/);
  });

  it("keeps busy guard against repeated submit while in flight", () => {
    const src = readResetPasswordSource();
    assert.match(src, /if\s*\(\s*busy\s*\)\s*return/);
    assert.match(src, /disabled=\{busy\}/);
  });
});
