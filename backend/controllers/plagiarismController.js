const mongoose = require("mongoose");
const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");
const SimilarityCheck = require("../models/SimilarityCheck");
const turnitinProvider = require("../services/turnitinProvider");

const MAX_BATCH = 40;

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function ownershipFilter(user) {
  if (user.role === "admin") return {};
  return { teacherId: user._id };
}

function assignmentOwnershipFilter(user) {
  if (user.role === "admin") return {};
  return { teacher: user._id };
}

function publicProviderError(error) {
  const code = error?.code || "PROVIDER_ERROR";
  const status = Number(error?.status) || 500;
  return {
    status,
    body: {
      success: false,
      code,
      message: error?.message || "Plagiarism provider request failed.",
    },
  };
}

exports.getProviderStatus = async (req, res) => {
  try {
    const state = turnitinProvider.getConnectionState();
    return res.json({ success: true, ...state });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to read plagiarism provider status.",
      error: error.message,
    });
  }
};

/**
 * Create Turnitin-oriented similarity checks for selected submissions.
 * When the provider is not configured, persists provider_not_connected rows
 * and returns 503 PROVIDER_NOT_CONNECTED — never fabricates similarity %.
 */
exports.createChecks = async (req, res) => {
  try {
    const mode = turnitinProvider.assertValidMode(req.body?.mode);
    const assignmentId = String(req.body?.assignmentId || "").trim();
    const ids = Array.isArray(req.body?.submissionIds)
      ? [...new Set(req.body.submissionIds.map(String).filter(isObjectId))].slice(
          0,
          MAX_BATCH
        )
      : [];

    if (!assignmentId || !isObjectId(assignmentId)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ASSIGNMENT_ID",
        message: "Select a valid assignment before checking plagiarism.",
      });
    }

    if (!ids.length) {
      return res.status(400).json({
        success: false,
        code: "INVALID_SUBMISSION_IDS",
        message: "Select at least one valid submission.",
      });
    }

    if (
      mode === turnitinProvider.MODES.STUDENT_PAPER_REPOSITORY &&
      !turnitinProvider.readConfig().studentRepoEnabled &&
      turnitinProvider.isConfigured()
    ) {
      return res.status(400).json({
        success: false,
        code: "STUDENT_REPO_DISABLED",
        message:
          "Student Paper Repository checking is disabled until institutional Turnitin repository settings are confirmed.",
      });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      ...assignmentOwnershipFilter(req.user),
    }).select("_id title teacher");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Assignment not found for this account.",
      });
    }

    const scope = {
      _id: { $in: ids },
      assignment: assignment._id,
      ...ownershipFilter(req.user),
    };

    const selected = await Submission.find(scope)
      .populate("student", "name email registrationNumber")
      .populate("assignment", "title points");

    if (!selected.length) {
      return res.status(404).json({
        success: false,
        code: "SUBMISSIONS_NOT_FOUND",
        message: "No matching submissions found for this assignment and account.",
      });
    }

    // Reject mixed-assignment or foreign IDs: every requested id must match the owned assignment.
    if (selected.length !== ids.length) {
      return res.status(400).json({
        success: false,
        code: "MIXED_ASSIGNMENT_SUBMISSIONS",
        message:
          "Every selected submission must belong to the chosen assignment owned by this teacher.",
      });
    }

    const mismatched = selected.filter(
      (row) => String(row.assignment?._id || row.assignment) !== String(assignment._id)
    );
    if (mismatched.length) {
      return res.status(400).json({
        success: false,
        code: "MIXED_ASSIGNMENT_SUBMISSIONS",
        message:
          "Selected submissions include files from another assignment. Reselect and try again.",
      });
    }

    const connected = turnitinProvider.isConfigured();
    const created = [];

    for (const submission of selected) {
      const base = {
        submission: submission._id,
        assignment: submission.assignment?._id || submission.assignment,
        teacherId: submission.teacherId,
        studentId: submission.student?._id || submission.student,
        mode,
        provider: "turnitin",
        requestedAt: new Date(),
      };

      if (!connected) {
        const row = await SimilarityCheck.create({
          ...base,
          status: turnitinProvider.STATUSES.PROVIDER_NOT_CONNECTED,
          similarityPercent: null,
          matchedSources: [],
          highlightedPassages: [],
          reportAvailable: false,
          errorCode: "PROVIDER_NOT_CONNECTED",
          errorMessage:
            "Turnitin is not configured. No similarity score was generated.",
        });
        created.push(
          turnitinProvider.toPublicCheck({
            ...row.toObject(),
            student: submission.student
              ? { _id: submission.student._id, name: submission.student.name }
              : null,
            assignmentTitle: submission.assignment?.title || "Assignment",
            submissionOriginalFileName: submission.originalFileName || "",
          })
        );
        continue;
      }

      // Provider configured: attempt create; never fall back to local Jaccard.
      try {
        const providerResult = await turnitinProvider.createSubmission({
          submission,
          mode,
          teacher: req.user,
        });
        const row = await SimilarityCheck.create({
          ...base,
          status: providerResult?.status || turnitinProvider.STATUSES.QUEUED,
          providerSubmissionId: providerResult?.providerSubmissionId || null,
          providerReportId: providerResult?.providerReportId || null,
          similarityPercent: null,
          matchedSources: [],
          highlightedPassages: [],
          reportAvailable: false,
        });
        created.push(
          turnitinProvider.toPublicCheck({
            ...row.toObject(),
            student: submission.student
              ? { _id: submission.student._id, name: submission.student.name }
              : null,
            assignmentTitle: submission.assignment?.title || "Assignment",
            submissionOriginalFileName: submission.originalFileName || "",
          })
        );
      } catch (providerError) {
        const row = await SimilarityCheck.create({
          ...base,
          status:
            providerError.code === "PROVIDER_NOT_CONNECTED"
              ? turnitinProvider.STATUSES.PROVIDER_NOT_CONNECTED
              : turnitinProvider.STATUSES.FAILED,
          similarityPercent: null,
          matchedSources: [],
          highlightedPassages: [],
          reportAvailable: false,
          errorCode: providerError.code || "PROVIDER_ERROR",
          errorMessage: providerError.message || "Provider request failed.",
        });
        created.push(
          turnitinProvider.toPublicCheck({
            ...row.toObject(),
            student: submission.student
              ? { _id: submission.student._id, name: submission.student.name }
              : null,
            assignmentTitle: submission.assignment?.title || "Assignment",
            submissionOriginalFileName: submission.originalFileName || "",
          })
        );
      }
    }

    if (!connected) {
      return res.status(503).json({
        success: false,
        code: "PROVIDER_NOT_CONNECTED",
        message:
          "Turnitin provider is not connected. Checks were recorded as Provider Not Connected. No similarity percentages were generated.",
        provider: turnitinProvider.getConnectionState(),
        checks: created,
      });
    }

    return res.status(201).json({
      success: true,
      provider: turnitinProvider.getConnectionState(),
      checks: created,
    });
  } catch (error) {
    if (error.code === "INVALID_MODE") {
      return res.status(400).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    const mapped = publicProviderError(error);
    return res.status(mapped.status).json(mapped.body);
  }
};

exports.listChecks = async (req, res) => {
  try {
    const filter = { ...ownershipFilter(req.user) };
    if (req.query.submissionId) {
      if (!isObjectId(req.query.submissionId)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_SUBMISSION_IDS",
          message: "Invalid submission id.",
        });
      }
      filter.submission = req.query.submissionId;
    }
    if (req.query.status) {
      filter.status = String(req.query.status);
    }

    const rows = await SimilarityCheck.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("studentId", "name email registrationNumber")
      .populate("assignment", "title points")
      .populate("submission", "originalFileName")
      .lean();

    const checks = rows.map((row) =>
      turnitinProvider.toPublicCheck({
        ...row,
        student: row.studentId
          ? { _id: row.studentId._id, name: row.studentId.name }
          : null,
        assignmentTitle: row.assignment?.title || "Assignment",
        submissionOriginalFileName: row.submission?.originalFileName || "",
        studentId: row.studentId?._id || row.studentId,
        assignment: row.assignment?._id || row.assignment,
        submission: row.submission?._id || row.submission,
      })
    );

    return res.json({
      success: true,
      provider: turnitinProvider.getConnectionState(),
      checks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to list similarity checks.",
      error: error.message,
    });
  }
};

exports.getCheck = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CHECK_ID",
        message: "Invalid check id.",
      });
    }

    const row = await SimilarityCheck.findOne({
      _id: req.params.id,
      ...ownershipFilter(req.user),
    })
      .populate("studentId", "name email registrationNumber")
      .populate("assignment", "title points")
      .populate("submission", "originalFileName")
      .lean();

    if (!row) {
      return res.status(404).json({
        success: false,
        code: "CHECK_NOT_FOUND",
        message: "Similarity check not found.",
      });
    }

    return res.json({
      success: true,
      check: turnitinProvider.toPublicCheck({
        ...row,
        student: row.studentId
          ? { _id: row.studentId._id, name: row.studentId.name }
          : null,
        assignmentTitle: row.assignment?.title || "Assignment",
        submissionOriginalFileName: row.submission?.originalFileName || "",
        studentId: row.studentId?._id || row.studentId,
        assignment: row.assignment?._id || row.assignment,
        submission: row.submission?._id || row.submission,
      }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load similarity check.",
      error: error.message,
    });
  }
};

exports.refreshCheck = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CHECK_ID",
        message: "Invalid check id.",
      });
    }

    const row = await SimilarityCheck.findOne({
      _id: req.params.id,
      ...ownershipFilter(req.user),
    });

    if (!row) {
      return res.status(404).json({
        success: false,
        code: "CHECK_NOT_FOUND",
        message: "Similarity check not found.",
      });
    }

    if (!turnitinProvider.isConfigured()) {
      row.status = turnitinProvider.STATUSES.PROVIDER_NOT_CONNECTED;
      row.similarityPercent = null;
      row.reportAvailable = false;
      row.errorCode = "PROVIDER_NOT_CONNECTED";
      row.errorMessage = "Turnitin provider is not connected.";
      await row.save();
      return res.status(503).json({
        success: false,
        code: "PROVIDER_NOT_CONNECTED",
        message: "Turnitin provider is not connected.",
        check: turnitinProvider.toPublicCheck(row),
      });
    }

    if (!row.providerSubmissionId) {
      return res.status(400).json({
        success: false,
        code: "MISSING_PROVIDER_SUBMISSION",
        message: "This check has no provider submission id to refresh.",
        check: turnitinProvider.toPublicCheck(row),
      });
    }

    try {
      const statusPayload = await turnitinProvider.getSubmissionStatus(
        row.providerSubmissionId
      );
      if (statusPayload?.status) row.status = statusPayload.status;
      if (
        statusPayload?.similarityPercent !== undefined &&
        statusPayload?.similarityPercent !== null &&
        row.status === turnitinProvider.STATUSES.COMPLETED
      ) {
        row.similarityPercent = Number(statusPayload.similarityPercent);
      }
      if (Array.isArray(statusPayload?.matchedSources)) {
        row.matchedSources = statusPayload.matchedSources;
      }
      if (Array.isArray(statusPayload?.highlightedPassages)) {
        row.highlightedPassages = statusPayload.highlightedPassages;
      }
      if (statusPayload?.providerReportId) {
        row.providerReportId = statusPayload.providerReportId;
        row.reportAvailable = true;
      }
      if (row.status === turnitinProvider.STATUSES.COMPLETED) {
        row.completedAt = new Date();
        row.errorCode = "";
        row.errorMessage = "";
      }
      await row.save();
      return res.json({
        success: true,
        check: turnitinProvider.toPublicCheck(row),
      });
    } catch (providerError) {
      const mapped = publicProviderError(providerError);
      return res.status(mapped.status).json({
        ...mapped.body,
        check: turnitinProvider.toPublicCheck(row),
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to refresh similarity check.",
      error: error.message,
    });
  }
};

/**
 * Report metadata / open URL placeholder.
 * Never streams fabricated reports. Requires a real provider report id.
 */
exports.getReport = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_CHECK_ID",
        message: "Invalid check id.",
      });
    }

    const row = await SimilarityCheck.findOne({
      _id: req.params.id,
      ...ownershipFilter(req.user),
    });

    if (!row) {
      return res.status(404).json({
        success: false,
        code: "CHECK_NOT_FOUND",
        message: "Similarity check not found.",
      });
    }

    if (!turnitinProvider.isConfigured()) {
      return res.status(503).json({
        success: false,
        code: "PROVIDER_NOT_CONNECTED",
        message: "Turnitin provider is not connected.",
      });
    }

    if (
      row.status !== turnitinProvider.STATUSES.COMPLETED ||
      !row.reportAvailable ||
      !row.providerReportId
    ) {
      return res.status(404).json({
        success: false,
        code: "REPORT_NOT_AVAILABLE",
        message: "No provider report is available for this check yet.",
      });
    }

    try {
      const report = await turnitinProvider.getReport(row.providerReportId);
      return res.json({
        success: true,
        checkId: row._id,
        report: {
          providerReportId: row.providerReportId,
          similarityPercent: row.similarityPercent,
          matchedSources: row.matchedSources,
          highlightedPassages: row.highlightedPassages,
          // Future: signed open URL or streamed bytes from official API.
          openUrl: report?.openUrl || null,
          downloadUrl: report?.downloadUrl || null,
          mimeType: report?.mimeType || row.reportMimeType || "",
        },
      });
    } catch (providerError) {
      const mapped = publicProviderError(providerError);
      return res.status(mapped.status).json(mapped.body);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to load provider report.",
      error: error.message,
    });
  }
};

/**
 * Legacy POST /check — redirected to provider architecture.
 * Does NOT run local Jaccard or return fabricated similarity percentages.
 */
exports.check = async (req, res) => {
  req.body = {
    submissionIds: req.body?.submissionIds,
    assignmentId: req.body?.assignmentId,
    mode: req.body?.mode || turnitinProvider.MODES.EXTERNAL_SOURCES,
  };
  return exports.createChecks(req, res);
};
