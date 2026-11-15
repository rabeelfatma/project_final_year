/**
 * Official Turnitin provider adapter (architecture only).
 *
 * Does NOT call external Turnitin APIs until institutional credentials and
 * official endpoint documentation are configured. Isolates provider-specific
 * logic so create/poll/report can be filled in later without rewriting routes.
 *
 * Local Jaccard peer comparison must never be used as a Turnitin result.
 */

const MODES = Object.freeze({
  EXTERNAL_SOURCES: "external_sources",
  STUDENT_PAPER_REPOSITORY: "student_paper_repository",
});

const STATUSES = Object.freeze({
  PROVIDER_NOT_CONNECTED: "provider_not_connected",
  QUEUED: "queued",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
});

function readConfig(env = process.env) {
  return {
    enabled: String(env.TURNITIN_ENABLED || "").toLowerCase() === "true",
    apiBaseUrl: String(env.TURNITIN_API_BASE_URL || "").trim(),
    apiKey: String(env.TURNITIN_API_KEY || "").trim(),
    apiSecret: String(env.TURNITIN_API_SECRET || "").trim(),
    integrationName: String(env.TURNITIN_INTEGRATION_NAME || "").trim(),
    accountId: String(env.TURNITIN_ACCOUNT_ID || "").trim(),
    externalIdPrefix: String(env.TURNITIN_EXTERNAL_ID_PREFIX || "quickcheck").trim(),
    studentRepoEnabled:
      String(env.TURNITIN_STUDENT_REPO_ENABLED || "").toLowerCase() === "true",
    webhookSecret: String(env.TURNITIN_WEBHOOK_SECRET || "").trim(),
    timeoutMs: Number(env.TURNITIN_TIMEOUT_MS) || 30000,
  };
}

/**
 * Credentials / config are intentionally incomplete until official docs confirm
 * the final auth scheme. Require an explicit enable flag plus base URL and key.
 */
function isConfigured(env = process.env) {
  const config = readConfig(env);
  if (!config.enabled) return false;
  if (!config.apiBaseUrl) return false;
  if (!config.apiKey) return false;
  return true;
}

function getConnectionState(env = process.env) {
  const config = readConfig(env);
  const connected = isConfigured(env);
  return {
    connected,
    provider: "turnitin",
    status: connected ? "connected" : STATUSES.PROVIDER_NOT_CONNECTED,
    modes: {
      external_sources: connected,
      student_paper_repository: connected && config.studentRepoEnabled,
    },
    message: connected
      ? "Turnitin provider is configured."
      : "Turnitin is not configured. Set server-only TURNITIN_* environment variables after obtaining official API access. No similarity scores are generated without the provider.",
  };
}

function assertValidMode(mode) {
  const value = String(mode || "").trim();
  if (value !== MODES.EXTERNAL_SOURCES && value !== MODES.STUDENT_PAPER_REPOSITORY) {
    const error = new Error(
      "Invalid check mode. Use external_sources or student_paper_repository."
    );
    error.code = "INVALID_MODE";
    error.status = 400;
    throw error;
  }
  return value;
}

/**
 * Create a provider submission for a student paper.
 * Until official API wiring exists, this refuses rather than inventing reports.
 */
async function createSubmission(/* { submission, mode, teacher } */) {
  if (!isConfigured()) {
    const error = new Error(
      "Turnitin provider is not connected. Configure TURNITIN_* credentials on the server."
    );
    error.code = "PROVIDER_NOT_CONNECTED";
    error.status = 503;
    throw error;
  }
  const error = new Error(
    "Turnitin API integration is prepared but not yet wired to official endpoints. Awaiting institutional API documentation and credentials."
  );
  error.code = "PROVIDER_NOT_IMPLEMENTED";
  error.status = 503;
  throw error;
}

async function getSubmissionStatus(/* providerSubmissionId */) {
  if (!isConfigured()) {
    const error = new Error("Turnitin provider is not connected.");
    error.code = "PROVIDER_NOT_CONNECTED";
    error.status = 503;
    throw error;
  }
  const error = new Error(
    "Turnitin status polling is not yet wired to official endpoints."
  );
  error.code = "PROVIDER_NOT_IMPLEMENTED";
  error.status = 503;
  throw error;
}

async function getReport(/* providerReportId */) {
  if (!isConfigured()) {
    const error = new Error("Turnitin provider is not connected.");
    error.code = "PROVIDER_NOT_CONNECTED";
    error.status = 503;
    throw error;
  }
  const error = new Error(
    "Turnitin report retrieval is not yet wired to official endpoints."
  );
  error.code = "PROVIDER_NOT_IMPLEMENTED";
  error.status = 503;
  throw error;
}

/** Public DTO — never include secrets or raw provider payloads. */
function toPublicCheck(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    _id: plain._id,
    submission: plain.submission,
    assignment: plain.assignment,
    teacherId: plain.teacherId,
    studentId: plain.studentId,
    mode: plain.mode,
    provider: plain.provider,
    status: plain.status,
    similarityPercent:
      plain.status === STATUSES.COMPLETED &&
      plain.similarityPercent !== null &&
      plain.similarityPercent !== undefined &&
      Number.isFinite(Number(plain.similarityPercent))
        ? Number(plain.similarityPercent)
        : null,
    matchedSources: Array.isArray(plain.matchedSources) ? plain.matchedSources : [],
    highlightedPassages: Array.isArray(plain.highlightedPassages)
      ? plain.highlightedPassages
      : [],
    reportAvailable: Boolean(plain.reportAvailable && plain.providerReportId),
    errorCode: plain.errorCode || "",
    errorMessage: plain.errorMessage || "",
    requestedAt: plain.requestedAt || plain.createdAt || null,
    completedAt: plain.completedAt || null,
    student: plain.student || null,
    assignmentTitle: plain.assignmentTitle || null,
    submissionOriginalFileName: plain.submissionOriginalFileName || null,
  };
}

module.exports = {
  MODES,
  STATUSES,
  readConfig,
  isConfigured,
  getConnectionState,
  assertValidMode,
  createSubmission,
  getSubmissionStatus,
  getReport,
  toPublicCheck,
};
