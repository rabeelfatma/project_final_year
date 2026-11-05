/**
 * Isolated JWT bearer extraction (no Mongo / network).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { extractBearerToken } = require(path.resolve(
  __dirname,
  "../middleware/authMiddleware.js"
));

describe("extractBearerToken", () => {
  it("returns null for missing, empty, and Bearer-only headers", () => {
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken(""), null);
    assert.equal(extractBearerToken("Bearer"), null);
    assert.equal(extractBearerToken("Bearer "), null);
    assert.equal(extractBearerToken("Bearer null"), null);
    assert.equal(extractBearerToken("Bearer undefined"), null);
  });

  it("strips nested Bearer prefixes and requires JWT-shaped tokens", () => {
    assert.equal(extractBearerToken("Bearer aaa.bbb.ccc"), "aaa.bbb.ccc");
    assert.equal(extractBearerToken("Bearer Bearer aaa.bbb.ccc"), "aaa.bbb.ccc");
    assert.equal(extractBearerToken("Token aaa.bbb.ccc"), null);
    assert.equal(extractBearerToken("Bearer not-a-jwt"), null);
  });
});
