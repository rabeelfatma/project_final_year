/**
 * Private Cloudflare R2 (S3-compatible) object storage.
 * Used only when Vercel requires durable uploads; never exposes public URLs.
 */
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

function trimEnv(name) {
  return String(process.env[name] || "").trim();
}

function getR2Config() {
  const accountId = trimEnv("R2_ACCOUNT_ID");
  const accessKeyId = trimEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = trimEnv("R2_SECRET_ACCESS_KEY");
  const bucket = trimEnv("R2_BUCKET_NAME") || "quickcheck-hub-files";
  const endpoint =
    trimEnv("R2_ENDPOINT") ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

function isR2Configured() {
  const c = getR2Config();
  return Boolean(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket && c.endpoint);
}

/**
 * Clear error when Vercel needs R2 but env is incomplete.
 * Does not leak secret values.
 */
function assertR2Ready() {
  if (isR2Configured()) return getR2Config();
  const c = getR2Config();
  const missing = [];
  if (!c.accountId) missing.push("R2_ACCOUNT_ID");
  if (!c.accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!c.secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!c.bucket) missing.push("R2_BUCKET_NAME");
  if (!c.endpoint) missing.push("R2_ENDPOINT");
  const err = new Error(
    `Cloudflare R2 is required on Vercel but is not configured. Missing: ${missing.join(", ")}.`
  );
  err.code = "R2_NOT_CONFIGURED";
  err.statusCode = 503;
  throw err;
}

let cachedClient = null;
let cachedKey = "";

function getClient() {
  const c = assertR2Ready();
  const key = `${c.endpoint}|${c.accessKeyId}|${c.bucket}`;
  if (cachedClient && cachedKey === key) return { client: cachedClient, bucket: c.bucket };

  cachedClient = new S3Client({
    region: "auto",
    endpoint: c.endpoint,
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
    },
  });
  cachedKey = key;
  return { client: cachedClient, bucket: c.bucket };
}

/** Test helper — reset cached client between isolated tests. */
function resetR2ClientCache() {
  cachedClient = null;
  cachedKey = "";
}

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function putObject(key, body, contentType) {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    })
  );
  return key;
}

async function getObjectBuffer(key) {
  const { client, bucket } = getClient();
  const out = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  return streamToBuffer(out.Body);
}

async function getObjectStream(key) {
  const { client, bucket } = getClient();
  const out = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  return {
    body: out.Body,
    contentType: out.ContentType || "",
    contentLength: out.ContentLength,
  };
}

async function deleteObject(key) {
  const { client, bucket } = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  );
}

async function objectExists(key) {
  const { client, bucket } = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    const name = String(error?.name || "");
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
      return false;
    }
    throw error;
  }
}

module.exports = {
  getR2Config,
  isR2Configured,
  assertR2Ready,
  resetR2ClientCache,
  putObject,
  getObjectBuffer,
  getObjectStream,
  deleteObject,
  objectExists,
};
