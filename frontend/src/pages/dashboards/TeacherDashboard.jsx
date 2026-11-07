import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, PlusCircle, BookOpen, ClipboardCheck, Users, RotateCcw,
  Loader2, FileUp, X, CheckCircle, TrendingUp, Download,
  ShieldCheck, Clock, Trash2, Edit3, Sparkles, MessageSquare,
  Send, Eye, AlertCircle, ShieldAlert, FileText, Archive,
  Layers, Folder, CalendarDays, Search, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import teacherService from '../../services/teacherService';
import SidebarControls from '../../components/common/SidebarControls';
import DashboardNavShell from '../../components/common/DashboardNavShell';
import DashboardNavItem from '../../components/common/DashboardNavItem';
import DashboardTopBar from '../../components/common/DashboardTopBar';
import AIChatbot from '../../components/common/AIChatbot';
import MessagePanel from '../../components/common/MessagePanel';
import OverflowMenu from '../../components/ui/OverflowMenu';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ProfilePage from '../account/ProfilePage';
import SettingsPage from '../account/SettingsPage';
import { downloadProtectedFile, openProtectedPreview } from '../../services/fileService';
import {
  ACADEMIC_ACCEPT,
  assertAcademicFile,
  uploadDurableFile,
  appendDurableFields,
} from '../../services/r2UploadService';
import api from '../../utils/api';
import {
  normalizeAssignmentId,
  toggleAssignmentSelection,
  isAssignmentSelected,
} from '../../utils/assignmentSelection';
import {
  filterAssignmentsByShelf,
  shelfAfterArchive,
  shelfAfterUnarchive,
} from '../../utils/assignmentShelf';
import {
  validateAssignmentFormFields,
  datetimeLocalToIso,
  suggestStartDatetimeLocal,
  utcIsoToKarachiDatetimeLocal,
  assignmentCreatedMessage,
} from '../../utils/assignmentFieldValidation';
import { validateAcademicContent, referenceFileSelectionError } from '../../utils/academicFileContent';
import { createSubmitLock } from '../../utils/submitLock';

function StatCard({ label, value, icon }) {
  const [selected, setSelected] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setSelected((current) => !current)}
      aria-pressed={selected}
      className="qc-stat-card relative"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 rounded-qc border transition-colors" style={{borderColor: selected ? 'var(--accent)' : 'var(--border)', color: selected ? 'var(--accent)' : 'var(--muted)'}}>{icon}</div>
      </div>
      <p className="qc-stat-label">{label}</p>
      <h3 className="qc-stat-value">{value || 0}</h3>
    </button>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold theme-muted">
      <div className={`w-2 h-2 rounded-full ${color}`}></div> {label}
    </div>
  );
}

function NoDataMessage({ icon, message }) {
  return (
    <div className="qc-card qc-empty w-full">
      <div className="mx-auto mb-3 opacity-30 flex justify-center">{icon}</div>
      <p>{message}</p>
    </div>
  );
}

function CustomPieTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    return (
      <div className="theme-card border rounded-xl px-4 py-3 shadow-xl">
        <p className="text-white font-black text-xs uppercase tracking-widest">{payload[0].name}</p>
        <p className="text-sky-400 font-black text-xl">{payload[0].value}</p>
      </div>
    );
  }
  return null;
}

// ─── Main Component ────────────────────────────────────────────
export default function TeacherDashboard() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const multimediaInputRef = useRef(null);

  const [activeTab, setActiveTab]               = useState('dashboard');
  const [shellView, setShellView]               = useState('main');
  const [loading, setLoading]                   = useState(true);
  const [editingId, setEditingId]               = useState(null);
  const [stats, setStats]                       = useState({ totalCreated: 0, totalStudents: 0, pendingCount: 0, completedCount: 0 });
  const [assignments, setAssignments]           = useState([]);
  const [students, setStudents]                 = useState([]);
  const [submissions, setSubmissions]           = useState([]);
  const [selectedSubmissions, setSelectedSubmissions] = useState([]);
  const [selectSubmissionsMode, setSelectSubmissionsMode] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [submissionAssignmentFilter, setSubmissionAssignmentFilter] = useState('all');
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('all');
  const [submissionPage, setSubmissionPage] = useState(1);
  const SUBMISSIONS_PAGE_SIZE = 8;
  const [selectedAssignments, setSelectedAssignments] = useState([]);
  const [manageAssignments, setManageAssignments] = useState(false);
  /** Active list = non-archived (active + legacy deactive). Archived = status archived only. */
  const [assignmentShelf, setAssignmentShelf] = useState('active');
  const [selectedQuestionAssignments, setSelectedQuestionAssignments] = useState([]);
  /** Shown when AI Evaluate is clicked: Include Question File? Yes / No */
  const [aiQuestionFilePrompt, setAiQuestionFilePrompt] = useState(null);
  const [aiLoading, setAiLoading]               = useState(false);
  const [isPublishing, setIsPublishing]         = useState(false);
  const [reviewModalOpen, setReviewModalOpen]   = useState(false);
  const [selectedReview, setSelectedReview]     = useState(null);
  const [manualScore, setManualScore]           = useState('');
  const [teacherNote, setTeacherNote]           = useState('');
  const [aiInstructions, setAiInstructions]     = useState('');
  const [multimediaFiles, setMultimediaFiles]   = useState([]);
  const [savingEval, setSavingEval]             = useState(false);
  const [reviewContent, setReviewContent]       = useState({ loading: false, text: '', strengths: [], improvements: [] });
  const [checkingPlagiarism, setCheckingPlagiarism] = useState(false);
  const [plagiarismResults, setPlagiarismResults] = useState([]);
  const [activePieIndex, setActivePieIndex]     = useState(null);
  const [form, setForm] = useState({ title: '', startDate: '', deadline: '', description: '', points: '', file: null, existingFileName: '', existingFileId: '' });
  /** Original ISO dates while editing — used so unchanged past start/deadline are not blocked. */
  const [editingBaseline, setEditingBaseline] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const assignmentSubmitLock = useRef(createSubmitLock());
  const archiveActionLock = useRef(createSubmitLock());

  // ── Fetch ─────────────────────────────────────────────────
  // silent: refresh lists without the full-page loading gate (status archive/restore).
  const fetchAllData = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [sData, aData, subData, stData] = await Promise.all([
        teacherService.getOverviewStats().catch(() => null),
        teacherService.getMyAssignments().catch(() => []),
        teacherService.getRecentSubmissions().catch(() => []),
        teacherService.getStudents().catch(() => []),
      ]);

      const safeAssignments = Array.isArray(aData) ? aData : [];
      const safeSubmissions = Array.isArray(subData) ? subData : [];
      const safeStudents    = Array.isArray(stData) ? stData : [];

      const pending = safeSubmissions.filter(s => !['graded','GRADED','PUBLISHED','AI_GRADED'].includes(s.status)).length;
      const graded  = safeSubmissions.filter(s =>  ['graded','GRADED','PUBLISHED','AI_GRADED'].includes(s.status)).length;

      setStats({
        totalCreated:   safeAssignments.length || (sData?.totalCreated || 0),
        totalStudents:  safeStudents.length    || (sData?.totalStudents || 0),
        pendingCount:   pending,
        completedCount: graded,
      });
      setAssignments(safeAssignments);
      setSubmissions(safeSubmissions);
      setStudents(safeStudents);
    } catch (err) {
      console.error('Dashboard Load Error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchAllData(); }, []);

  // Legacy display helper: mark overdue non-archived rows as deactive in UI only.
  // Never auto-archive, and never rewrite archived status.
  // Empty deps: do not rebind on every assignments change (that raced with Archive UI updates).
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setAssignments((prev) => prev.map((asgn) => {
        if (asgn.status === 'archived' || asgn.status === 'deactive') return asgn;
        if (new Date(asgn.deadline) < now) return { ...asgn, status: 'deactive' };
        return asgn;
      }));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Selection ─────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedSubmissions((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 40) {
        alert('Maximum 40 students can be selected at once.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const submissionStatusBucket = (status) => {
    if (status === 'PUBLISHED') return 'published';
    if (status === 'AI_GRADED') return 'ai_graded';
    if (status === 'AI_PROCESSING') return 'ai_processing';
    if (['graded', 'GRADED', 'Graded', 'REVIEWED'].includes(status)) return 'graded';
    return 'awaiting';
  };

  const filteredSubmissions = submissions.filter((sub) => {
    const q = submissionSearch.trim().toLowerCase();
    if (q) {
      const hay = [
        sub.student?.name,
        sub.student?.registrationNumber,
        sub.student?.email,
        sub.assignment?.title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (submissionAssignmentFilter !== 'all') {
      if (String(sub.assignment?._id || '') !== String(submissionAssignmentFilter)) return false;
    }
    if (submissionStatusFilter !== 'all') {
      if (submissionStatusBucket(sub.status) !== submissionStatusFilter) return false;
    }
    return true;
  });

  const submissionAssignmentOptions = (() => {
    const map = new Map();
    for (const sub of submissions) {
      const id = sub.assignment?._id;
      if (!id) continue;
      const key = String(id);
      if (!map.has(key)) {
        map.set(key, sub.assignment?.title || 'Untitled');
      }
    }
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  })();

  const submissionTotalPages = Math.max(1, Math.ceil(filteredSubmissions.length / SUBMISSIONS_PAGE_SIZE));
  const safeSubmissionPage = Math.min(submissionPage, submissionTotalPages);
  const pagedSubmissions = filteredSubmissions.slice(
    (safeSubmissionPage - 1) * SUBMISSIONS_PAGE_SIZE,
    safeSubmissionPage * SUBMISSIONS_PAGE_SIZE
  );

  const handleSelectAllSubmissions = (checked) => {
    if (checked) {
      const first40 = filteredSubmissions.slice(0, 40).map((s) => s._id);
      setSelectedSubmissions(first40);
      if (filteredSubmissions.length > 40) alert('Only first 40 students selected due to limit.');
    } else {
      setSelectedSubmissions([]);
    }
  };

  const clearSubmissionSelection = () => {
    setSelectedSubmissions([]);
    setSelectedQuestionAssignments([]);
    setSelectSubmissionsMode(false);
    setAiQuestionFilePrompt(null);
  };

  const questionAssignmentIdsForSelection = () => {
    const ids = [];
    for (const sub of submissions) {
      if (!selectedSubmissions.includes(sub._id)) continue;
      if (sub.assignment?.file && sub.assignment?._id) {
        ids.push(String(sub.assignment._id));
      }
    }
    return [...new Set(ids)];
  };

  const eligiblePublishSubmissionIds = () =>
    submissions
      .filter((sub) => {
        if (sub.status === 'PUBLISHED') return false;
        const hasTeacher =
          sub.marks !== null &&
          sub.marks !== undefined &&
          Number.isFinite(Number(sub.marks)) &&
          Number(sub.marks) >= 0;
        const hasAi =
          sub.aiScore !== null &&
          sub.aiScore !== undefined &&
          Number.isFinite(Number(sub.aiScore)) &&
          Number(sub.aiScore) >= 0;
        return hasTeacher || hasAi;
      })
      .map((sub) => sub._id);

  // ── AI Evaluation ─────────────────────────────────────────
  const handleAiEvaluation = () => {
    if (!aiInstructions.trim()) {
      alert('Please provide grading instructions first.');
      return;
    }
    if (selectedSubmissions.length === 0) {
      alert(
        'Select at least one submission before AI Evaluate.\n\nDouble-click a row to enter selection mode, then choose the submissions to grade.'
      );
      return;
    }
    setAiQuestionFilePrompt({ open: true });
  };

  const runAiEvaluation = async (includeQuestionFiles) => {
    const includeIds = includeQuestionFiles ? questionAssignmentIdsForSelection() : [];
    setSelectedQuestionAssignments(includeIds);
    setAiQuestionFilePrompt(null);
    try {
      setAiLoading(true);
      const result = await teacherService.evaluateWithAiBulk({
        submissionIds: selectedSubmissions,
        teacherInstructions: aiInstructions,
        referenceFiles: multimediaFiles,
        includeQuestionAssignmentIds: includeIds,
      });
      if (Array.isArray(result?.failed) && result.failed.length) {
        alert(`AI evaluation completed with ${result.failed.length} failed file(s).\n\n` + result.failed.map((item) => `${item.fileName || item.submissionId || 'File'}: ${item.message || item.error || 'Evaluation failed'}`).join('\n'));
      }
      const failures = (result?.results || []).filter((item) => item.status !== "Success");
      if (failures.length) {
        alert(`AI grading finished. ${failures.filter((x) => x.status === "Success").length} checked successfully; ${failures.length} failed.\n\n${failures.slice(0, 5).map((x) => x.error || x.status).join("\n")}`);
      } else {
        alert("✅ AI Grading Completed. Publish results to release scores and feedback to students.");
      }
      clearSubmissionSelection();
      fetchAllData();
    } catch (err) {
      alert('AI grading failed. Please try again or check the server connection.');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Publish Bulk ──────────────────────────────────────────
  const handlePublishBulk = async () => {
    const ids =
      selectedSubmissions.length > 0
        ? selectedSubmissions
        : eligiblePublishSubmissionIds();

    if (!ids.length) {
      alert(
        'No eligible submissions to publish.\n\nA submission needs AI marks or Teacher marks, and must not already be published. Students only see published results.'
      );
      return;
    }

    const usingSelection = selectedSubmissions.length > 0;
    const confirmMsg = usingSelection
      ? `Publish marks for ${ids.length} selected submission(s)? Students will see these results.`
      : `No rows selected. Publish marks for ${ids.length} eligible reviewed/graded submission(s)? Students will see these results.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsPublishing(true);
      const result = await teacherService.publishBulkResults({ submissionIds: ids });
      const published = Number(result?.published);
      alert(
        Number.isFinite(published)
          ? `✅ Successfully published ${published} result(s) to students!`
          : '✅ Publish request completed.'
      );
      clearSubmissionSelection();
      fetchAllData();
    } catch (err) {
      alert('❌ Failed to publish results.');
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Plagiarism check ─────────────────────────────────────
  const handlePlagiarismCheck = async () => {
    if (selectedSubmissions.length === 0) {
      alert(
        'Select at least one submission before Check Plagiarism.\n\nDouble-click a row to enter selection mode, then select submissions from the same assignment to compare.'
      );
      return;
    }
    try {
      setCheckingPlagiarism(true);
      const { data } = await api.post('/plagiarism/check', { submissionIds: selectedSubmissions });
      setPlagiarismResults(Array.isArray(data?.results) ? data.results : []);
      setActiveTab('plagiarism');
    } catch (err) {
      alert('❌ Plagiarism check failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setCheckingPlagiarism(false);
    }
  };

  // ── Review Modal ──────────────────────────────────────────
  const openReviewModal = async (submission) => {
    setSelectedReview(submission);
    setManualScore(submission.marks ?? '');
    setTeacherNote(submission.feedback || '');
    setReviewContent({
      loading: true,
      text: submission.answerText || '',
      strengths: submission.aiStrengths || [],
      improvements: submission.aiImprovements || [],
    });
    setReviewModalOpen(true);
    try {
      const content = await teacherService.getSubmissionContent(submission._id);
      setSelectedReview((prev) => ({
        ...(prev || submission),
        ...content,
        student: prev?.student || submission.student,
        assignment: prev?.assignment || submission.assignment,
      }));
      setReviewContent({
        loading: false,
        text: content.extractedText || content.answerText || '',
        strengths: content.aiStrengths || [],
        improvements: content.aiImprovements || [],
      });
    } catch (_) {
      setReviewContent((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSaveEvaluation = async () => {
    if (savingEval) return;
    if (manualScore === '' || manualScore === null || manualScore === undefined) {
      alert('Please enter Teacher Marks. AI Marks remain separate and will not be copied into this field.');
      return;
    }
    const maxMarks = Number(selectedReview?.totalMarks || selectedReview?.assignment?.points);
    const marksNum = Number(manualScore);
    if (!Number.isFinite(marksNum) || marksNum < 0) {
      alert('Teacher Marks must be a valid non-negative number.');
      return;
    }
    if (Number.isFinite(maxMarks) && marksNum > maxMarks) {
      alert(`Teacher Marks cannot exceed the maximum of ${maxMarks}.`);
      return;
    }
    try {
      setSavingEval(true);
      const response = await teacherService.updateFinalGrade(selectedReview._id, {
        marks:    marksNum,
        feedback: teacherNote,
        status:   'graded',
      });
      const saved = response?.data || response;
      // Keep Review Evaluation open after Save Teacher Grade so publish actions remain available.
      setSelectedReview((prev) => (prev ? {
        ...prev,
        ...(saved && typeof saved === 'object' ? saved : {}),
        marks: marksNum,
        feedback: teacherNote,
        status: prev.status === 'PUBLISHED' ? 'PUBLISHED' : 'graded',
      } : prev));
      setManualScore(String(marksNum));
      setTeacherNote(teacherNote);
      alert('✅ Teacher grade saved.');
      fetchAllData();
    } catch (err) {
      console.error('Save Evaluation Error:', err?.response?.data || err.message);
      alert('❌ Error saving evaluation: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSavingEval(false);
    }
  };

  const applyPublishStateToReview = (result) => {
    const detail = Array.isArray(result?.details)
      ? result.details.find((row) => String(row.id) === String(selectedReview?._id))
      : null;
    const components = detail?.components || [];
    setSelectedReview((prev) => {
      if (!prev) return prev;
      const next = { ...prev, status: 'PUBLISHED' };
      if (result?.scope === 'ai' || components.includes('AI Result')) {
        next.aiPublished = true;
      }
      if (components.includes('Teacher Marks')) next.teacherMarksPublished = true;
      if (components.includes('Teacher Feedback')) next.teacherFeedbackPublished = true;
      return next;
    });
    return components;
  };

  const handlePublishAiResult = async () => {
    if (savingEval) return;
    if (selectedReview?.aiScore == null || !Number.isFinite(Number(selectedReview.aiScore))) {
      alert('No AI marks available to publish. Run AI grading first.');
      return;
    }
    try {
      setSavingEval(true);
      const result = await teacherService.publishBulkResults({
        submissionIds: [selectedReview._id],
        scope: 'ai',
      });
      const components = applyPublishStateToReview(result);
      if (Number(result?.published) > 0) {
        alert('✅ AI Result published to the student (AI Marks + AI Feedback only).');
      } else {
        alert(components.length || selectedReview.aiPublished
          ? 'AI Result was already published.'
          : (result?.details?.[0]?.reason || 'Nothing new to publish.'));
      }
      // Keep modal open for further Teacher publication actions.
      fetchAllData();
    } catch (err) {
      alert('❌ Failed to publish AI result: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSavingEval(false);
    }
  };

  const handlePublishAvailableResults = async () => {
    if (savingEval) return;
    const maxMarks = Number(selectedReview?.totalMarks || selectedReview?.assignment?.points);
    const marksRaw = manualScore;
    const hasMarksInput = marksRaw !== '' && marksRaw !== null && marksRaw !== undefined;
    const marksNum = Number(marksRaw);
    const hasValidMarks = hasMarksInput && Number.isFinite(marksNum) && marksNum >= 0 &&
      (!Number.isFinite(maxMarks) || marksNum <= maxMarks);
    const feedbackText = String(teacherNote || '');
    const hasFeedback = feedbackText.trim().length > 0;
    const hasAi = selectedReview?.aiScore != null && Number.isFinite(Number(selectedReview.aiScore));

    if (hasMarksInput && !hasValidMarks) {
      alert(
        Number.isFinite(maxMarks) && marksNum > maxMarks
          ? `Teacher Marks cannot exceed the maximum of ${maxMarks}.`
          : 'Teacher Marks must be a valid non-negative number.'
      );
      return;
    }

    if (!hasAi && !hasValidMarks && !hasFeedback &&
        !(selectedReview?.marks != null && Number.isFinite(Number(selectedReview.marks))) &&
        !String(selectedReview?.feedback || '').trim()) {
      alert('Nothing to publish. Run AI grading or enter Teacher Marks/Feedback first.');
      return;
    }

    try {
      setSavingEval(true);
      // Persist optional Teacher fields first without publishing.
      if (hasValidMarks || hasFeedback) {
        const payload = { status: 'graded', feedback: feedbackText };
        if (hasValidMarks) payload.marks = marksNum;
        const response = await teacherService.updateFinalGrade(selectedReview._id, payload);
        const saved = response?.data || response;
        setSelectedReview((prev) => (prev ? {
          ...prev,
          ...(saved && typeof saved === 'object' ? saved : {}),
          marks: hasValidMarks ? marksNum : prev.marks,
          feedback: feedbackText,
        } : prev));
        if (hasValidMarks) setManualScore(String(marksNum));
      }

      const result = await teacherService.publishBulkResults({
        submissionIds: [selectedReview._id],
        scope: 'full',
      });
      const components = applyPublishStateToReview(result);
      if (Number(result?.published) > 0) {
        alert(`✅ Published to student: ${components.join(', ') || 'available results'}.`);
      } else {
        alert(result?.details?.[0]?.reason || 'All available results were already published.');
      }
      // Keep modal open unless Teacher closes manually.
      fetchAllData();
    } catch (err) {
      alert('❌ Failed to publish: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSavingEval(false);
    }
  };

  // ── File handlers ─────────────────────────────────────────
  const handleFileChange = async (e) => {
    const selected = e.target.files;
    const multipleError = referenceFileSelectionError(selected);
    if (multipleError) {
      alert(multipleError);
      e.target.value = null;
      setFormErrors((prev) => ({ ...prev, file: multipleError }));
      return;
    }
    const file = selected?.[0];
    if (!file) return;
    try {
      assertAcademicFile(file);
      const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
      const content = validateAcademicContent(file.name, head);
      if (!content.ok) throw new Error(content.message);
    } catch (err) {
      alert(err.message || 'File not allowed.');
      e.target.value = null;
      return;
    }
    setForm({ ...form, file });
    setFormErrors((prev) => ({ ...prev, file: undefined }));
  };

  const handleMultimediaChange = (e) => {
    const chosen = Array.from(e.target.files || []);
    if (chosen.length > 20) alert('Maximum 20 reference files/images can be selected at once.');
    setMultimediaFiles(chosen.slice(0, 20));
  };

  const handleStatusToggle = async (id, currentStatus) => {
    try {
      // Preserve legacy Active/Deactive for non-archived rows only.
      if (currentStatus === 'archived') return;
      const newStatus = currentStatus === 'active' ? 'deactive' : 'active';
      await teacherService.updateAssignmentStatus(id, { status: newStatus });
      fetchAllData();
    } catch { alert('❌ Failed to change status.'); }
  };

  const applyArchivedIdsLocally = (archivedIds) => {
    const idSet = new Set((archivedIds || []).map(normalizeAssignmentId).filter(Boolean));
    if (!idSet.size) return;
    setAssignments((prev) =>
      prev.map((asgn) =>
        idSet.has(normalizeAssignmentId(asgn._id))
          ? { ...asgn, status: 'archived' }
          : asgn
      )
    );
  };

  const applyUnarchivedIdsLocally = (unarchivedIds) => {
    const idSet = new Set((unarchivedIds || []).map(normalizeAssignmentId).filter(Boolean));
    if (!idSet.size) return;
    setAssignments((prev) =>
      prev.map((asgn) =>
        idSet.has(normalizeAssignmentId(asgn._id))
          ? { ...asgn, status: 'active' }
          : asgn
      )
    );
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmState(null);
  };

  const runConfirm = async () => {
    if (!confirmState?.onConfirm) return;
    if (!archiveActionLock.current.tryBegin()) return;
    setConfirmBusy(true);
    try {
      await confirmState.onConfirm();
      setConfirmState(null);
    } finally {
      setConfirmBusy(false);
      archiveActionLock.current.end();
    }
  };

  const handleArchiveAssignment = (id) => {
    const assignmentId = normalizeAssignmentId(id);
    const asgn = assignments.find((item) => normalizeAssignmentId(item._id) === assignmentId);
    if (!asgn || asgn.status === 'archived') return;
    setConfirmState({
      title: 'Archive assignment?',
      description:
        'This assignment will move out of Active and will no longer be available to students for new access or submissions. Existing files, submissions, marks and feedback are kept.',
      detail: asgn?.title || 'Selected assignment',
      confirmLabel: 'Archive',
      danger: false,
      onConfirm: async () => {
        try {
          const updated = await teacherService.updateAssignmentStatus(assignmentId, { status: 'archived' });
          if (String(updated?.status || '').toLowerCase() !== 'archived') {
            throw new Error('Server did not archive this assignment.');
          }
          setAssignmentShelf(shelfAfterArchive());
          setSelectedAssignments((prev) =>
            prev.filter((value) => normalizeAssignmentId(value) !== assignmentId)
          );
          applyArchivedIdsLocally([assignmentId]);
          await fetchAllData({ silent: true });
        } catch (error) {
          alert(error.response?.data?.message || error.message || 'Could not archive assignment.');
          throw error;
        }
      },
    });
  };

  const handleUnarchiveAssignment = (id) => {
    const assignmentId = normalizeAssignmentId(id);
    const asgn = assignments.find((item) => normalizeAssignmentId(item._id) === assignmentId);
    if (!asgn || asgn.status !== 'archived') return;
    setConfirmState({
      title: 'Unarchive assignment?',
      description:
        'This assignment will return to Active with its original title, attachments, dates, marks and submissions preserved. Start and due dates are not changed. If the due date has already passed, students still cannot submit.',
      detail: asgn?.title || 'Selected assignment',
      confirmLabel: 'Unarchive',
      danger: false,
      onConfirm: async () => {
        try {
          const beforeStart = asgn.startDate;
          const beforeDeadline = asgn.deadline;
          const updated = await teacherService.updateAssignmentStatus(assignmentId, { status: 'active' });
          if (String(updated?.status || '').toLowerCase() !== 'active') {
            throw new Error('Server did not unarchive this assignment.');
          }
          // Dates must remain unchanged after unarchive.
          if (
            beforeStart && updated?.startDate &&
            new Date(beforeStart).getTime() !== new Date(updated.startDate).getTime()
          ) {
            throw new Error('Unarchive unexpectedly changed the start date.');
          }
          if (
            beforeDeadline && updated?.deadline &&
            new Date(beforeDeadline).getTime() !== new Date(updated.deadline).getTime()
          ) {
            throw new Error('Unarchive unexpectedly changed the due date.');
          }
          setAssignmentShelf(shelfAfterUnarchive());
          setSelectedAssignments([]);
          applyUnarchivedIdsLocally([assignmentId]);
          await fetchAllData({ silent: true });
        } catch (error) {
          const message =
            error.response?.data?.message ||
            error.message ||
            'Could not unarchive assignment.';
          // Rule 2 / other errors: stay on Archived, no success toast, lists refreshed.
          alert(message);
          await fetchAllData({ silent: true });
          throw error;
        }
      },
    });
  };

  const handleArchiveSelectedAssignments = () => {
    const selectedActiveIds = selectedAssignments
      .map(normalizeAssignmentId)
      .filter(Boolean)
      .filter((id) => {
        const row = assignments.find((asgn) => normalizeAssignmentId(asgn._id) === id);
        return row && row.status !== 'archived';
      });
    if (!selectedActiveIds.length) {
      alert('Select at least one active assignment to archive.');
      return;
    }
    setConfirmState({
      title: 'Archive selected assignments?',
      description: `Archive ${selectedActiveIds.length} selected assignment(s)? They will leave Active and become unavailable to students for new submissions. Files, submissions and grades are kept.`,
      confirmLabel: 'Archive selected',
      danger: false,
      onConfirm: async () => {
        try {
          const result = await teacherService.archiveAssignmentsBulk(selectedActiveIds);
          applyArchivedIdsLocally(result?.archivedIds || selectedActiveIds);
          setSelectedAssignments([]);
          setAssignmentShelf(shelfAfterArchive());
          await fetchAllData({ silent: true });
          if (result?.failed?.length) {
            alert(result.message || `Archived ${result.archived || 0}. ${result.failed.length} could not be archived.`);
          }
        } catch (error) {
          alert(error.response?.data?.message || error.message || 'Could not archive selected assignments.');
          throw error;
        }
      },
    });
  };

  const handleUnarchiveSelectedAssignments = () => {
    const selectedArchivedIds = selectedAssignments
      .map(normalizeAssignmentId)
      .filter(Boolean)
      .filter((id) => {
        const row = assignments.find((asgn) => normalizeAssignmentId(asgn._id) === id);
        return row && row.status === 'archived';
      });
    if (!selectedArchivedIds.length) {
      alert('Select at least one archived assignment to unarchive.');
      return;
    }
    setConfirmState({
      title: 'Unarchive selected assignments?',
      description: `Return ${selectedArchivedIds.length} selected assignment(s) to Active? Original dates stay the same. Past due dates do not reopen submissions.`,
      confirmLabel: 'Unarchive selected',
      danger: false,
      onConfirm: async () => {
        try {
          const result = await teacherService.unarchiveAssignmentsBulk(selectedArchivedIds);
          const restoredIds = Array.isArray(result?.unarchivedIds) ? result.unarchivedIds : [];
          applyUnarchivedIdsLocally(restoredIds);
          setSelectedAssignments([]);
          if (restoredIds.length > 0) {
            setAssignmentShelf(shelfAfterUnarchive());
          }
          await fetchAllData({ silent: true });
          if (result?.failed?.length) {
            const titleConflict = (result.failed || []).find((f) => f.reason === 'title conflict');
            alert(
              titleConflict?.message ||
                result.message ||
                `Unarchived ${result.unarchived || 0}. ${result.failed.length} could not be unarchived.`
            );
          }
        } catch (error) {
          alert(error.response?.data?.message || error.message || 'Could not unarchive selected assignments.');
          throw error;
        }
      },
    });
  };

  const handleArchiveAllAssignments = () => {
    const activeOwned = assignments.filter((asgn) => asgn.status !== 'archived');
    if (!activeOwned.length) {
      alert('No active assignments to archive.');
      return;
    }
    setConfirmState({
      title: 'Archive all active assignments?',
      description: `Archive all ${activeOwned.length} active assignment(s)? Students will lose new access/submissions. Files, submissions and grades are kept.`,
      confirmLabel: 'Archive all',
      danger: false,
      onConfirm: async () => {
        try {
          const result = await teacherService.archiveAllAssignments();
          applyArchivedIdsLocally(result?.archivedIds || activeOwned.map((a) => a._id));
          setSelectedAssignments([]);
          setAssignmentShelf(shelfAfterArchive());
          await fetchAllData({ silent: true });
          if (result?.failed?.length) {
            alert(result.message || `Archived ${result.archived || 0}. Some items could not be archived.`);
          }
        } catch (error) {
          alert(error.response?.data?.message || error.message || 'Could not archive all assignments.');
          throw error;
        }
      },
    });
  };

  const handleUnarchiveAllAssignments = () => {
    const archivedOwned = assignments.filter((asgn) => asgn.status === 'archived');
    if (!archivedOwned.length) {
      alert('No archived assignments to unarchive.');
      return;
    }
    setConfirmState({
      title: 'Unarchive all archived assignments?',
      description: `Return all ${archivedOwned.length} archived assignment(s) to Active? Original start and due dates are preserved. Past due dates do not reopen submissions.`,
      confirmLabel: 'Unarchive all',
      danger: false,
      onConfirm: async () => {
        try {
          const result = await teacherService.unarchiveAllAssignments();
          const restoredIds = Array.isArray(result?.unarchivedIds) ? result.unarchivedIds : [];
          applyUnarchivedIdsLocally(restoredIds);
          setSelectedAssignments([]);
          if (restoredIds.length > 0) {
            setAssignmentShelf(shelfAfterUnarchive());
          }
          await fetchAllData({ silent: true });
          if (result?.failed?.length) {
            const titleConflict = (result.failed || []).find((f) => f.reason === 'title conflict');
            alert(
              titleConflict?.message ||
                result.message ||
                `Unarchived ${result.unarchived || 0}. Some items could not be unarchived.`
            );
          }
        } catch (error) {
          alert(error.response?.data?.message || error.message || 'Could not unarchive all assignments.');
          throw error;
        }
      },
    });
  };

  const visibleAssignments = filterAssignmentsByShelf(assignments, assignmentShelf);

  const describeDeleteError = (error) => {
    const status = error?.response?.status;
    if (!error?.response) {
      return 'Server unavailable. Assignment was not deleted. Connect MongoDB/API and try again.';
    }
    if (status === 401 || status === 403) {
      return error.response?.data?.message || 'Not authorized to delete this assignment.';
    }
    if (status === 404) {
      return error.response?.data?.message || 'Assignment not found (or already deleted).';
    }
    if (status === 503) {
      return error.response?.data?.message || 'Service unavailable. Assignment was not deleted.';
    }
    return error.response?.data?.message || error.message || 'Failed to delete.';
  };

  const handleDeleteAssignment = (id) => {
    const assignmentId = normalizeAssignmentId(id);
    const asgn = assignments.find((item) => normalizeAssignmentId(item._id) === assignmentId);
    setConfirmState({
      title: 'Delete assignment?',
      description: 'This permanently removes the assignment. This action cannot be undone.',
      detail: asgn?.title || 'Selected assignment',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await teacherService.deleteAssignment(assignmentId);
          setSelectedAssignments((prev) =>
            prev.filter((value) => normalizeAssignmentId(value) !== assignmentId)
          );
          await fetchAllData();
        } catch (error) {
          alert(describeDeleteError(error));
          throw error;
        }
      },
    });
  };

  const handleDeleteSelectedAssignments = () => {
    if (!selectedAssignments.length) return;
    setConfirmState({
      title: 'Delete selected assignments?',
      description: `Permanently delete ${selectedAssignments.length} selected assignment(s)? This cannot be undone.`,
      confirmLabel: 'Delete selected',
      danger: true,
      onConfirm: async () => {
        try {
          const ids = selectedAssignments.map(normalizeAssignmentId).filter(Boolean);
          await teacherService.deleteAssignmentsBulk(ids);
          setSelectedAssignments([]);
          await fetchAllData();
        } catch (error) {
          alert(describeDeleteError(error));
          throw error;
        }
      },
    });
  };

  const handleDeleteAllVisibleAssignments = () => {
    const ids = visibleAssignments.map((asgn) => normalizeAssignmentId(asgn._id)).filter(Boolean);
    if (!ids.length) {
      alert(assignmentShelf === 'archived' ? 'No archived assignments to delete.' : 'No active assignments to delete.');
      return;
    }
    setConfirmState({
      title: 'Delete all assignments on this shelf?',
      description: `Permanently delete all ${ids.length} ${assignmentShelf} assignment(s)? This cannot be undone.`,
      confirmLabel: 'Delete all',
      danger: true,
      onConfirm: async () => {
        try {
          await teacherService.deleteAssignmentsBulk(ids);
          setSelectedAssignments([]);
          await fetchAllData();
        } catch (error) {
          alert(describeDeleteError(error));
          throw error;
        }
      },
    });
  };

  const handleResetSubmissionGrade = (id) => {
    setConfirmState({
      title: 'Reset this grade?',
      description: 'Clear marks, feedback, and grading status so this submission can be graded again. The uploaded file is kept.',
      confirmLabel: 'Reset grade',
      danger: false,
      onConfirm: async () => {
        try {
          await teacherService.resetSubmissionGrade(id);
          setReviewModalOpen(false);
          await fetchAllData();
        } catch (error) {
          alert(error.response?.data?.message || error.message || 'Could not reset grading.');
          throw error;
        }
      },
    });
  };

  const handleDeleteSubmission = (id) => {
    setConfirmState({
      title: 'Delete submission?',
      description: 'Permanently delete this student submission? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await teacherService.deleteSubmission(id);
          setSelectedSubmissions((prev) => prev.filter((x) => x !== id));
          await fetchAllData();
        } catch (error) {
          alert(error.response?.data?.message || 'Failed to delete submission.');
          throw error;
        }
      },
    });
  };

  const handleResetSelectedGrades = () => {
    if (!selectedSubmissions.length) return;
    setConfirmState({
      title: 'Reset All Grades?',
      description: `Reset grades for ${selectedSubmissions.length} selected submission(s)? AI scores, teacher marks and feedback will be cleared. Submitted files are kept. This does not delete submissions.`,
      confirmLabel: 'Reset All Grades',
      danger: false,
      onConfirm: async () => {
        try {
          await teacherService.resetSubmissionGradesBulk(selectedSubmissions);
          setSelectedReview(null);
          setReviewModalOpen(false);
          clearSubmissionSelection();
          await fetchAllData();
        } catch (error) {
          alert(error.response?.data?.message || error.message || 'Could not reset selected grades.');
          throw error;
        }
      },
    });
  };

  const handleDeleteSelectedSubmissions = () => {
    if (!selectedSubmissions.length) return;
    setConfirmState({
      title: 'Delete Selected submissions?',
      description: `Permanently delete ${selectedSubmissions.length} selected submission(s)? This cannot be undone. Grades are removed with the submission — this is not a grade reset.`,
      confirmLabel: 'Delete Selected',
      danger: true,
      onConfirm: async () => {
        try {
          await teacherService.deleteSubmissionsBulk(selectedSubmissions);
          clearSubmissionSelection();
          await fetchAllData();
        } catch (error) {
          alert(error.response?.data?.message || 'Failed to delete selected submissions.');
          throw error;
        }
      },
    });
  };

  const handleEditSetup = (asgn) => {
    setEditingId(asgn._id);
    setFormErrors({});
    const startLocal = asgn.startDate ? utcIsoToKarachiDatetimeLocal(asgn.startDate) : '';
    const deadlineLocal = asgn.deadline ? utcIsoToKarachiDatetimeLocal(asgn.deadline) : '';
    setEditingBaseline({
      startDate: asgn.startDate || null,
      deadline: asgn.deadline || null,
      startDateLocal: startLocal,
      deadlineLocal,
    });
    setForm({
      title:       asgn.title,
      startDate:   startLocal,
      deadline:    deadlineLocal,
      description: asgn.description || '',
      points: asgn.points ?? '',
      file: null,
      existingFileName: asgn.originalFileName || '',
      existingFileId: asgn._id,
    });
    setActiveTab('create');
  };

  const handleCancelCreate = () => {
    if (savingAssignment || assignmentSubmitLock.current.pending) return;
    setForm({ title: '', startDate: '', deadline: '', description: '', points: '', file: null, existingFileName: '', existingFileId: '' });
    setFormErrors({});
    setEditingBaseline(null);
    setEditingId(null);
    setActiveTab('assignments');
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    if (savingAssignment || !assignmentSubmitLock.current.tryBegin()) return;

    // Keep original UTC ISO when the teacher did not change datetime-local fields
    // so edit-save does not shift timezone via slice(0,16) round-trip.
    const startUnchanged =
      Boolean(editingId) &&
      form.startDate === editingBaseline?.startDateLocal;
    const deadlineUnchanged =
      Boolean(editingId) &&
      form.deadline === editingBaseline?.deadlineLocal;
    const startIso = startUnchanged
      ? editingBaseline.startDate
      : datetimeLocalToIso(form.startDate);
    const deadlineIso = deadlineUnchanged
      ? editingBaseline.deadline
      : datetimeLocalToIso(form.deadline);
    const validationOptions = editingId
      ? {
          mode: 'update',
          existing: {
            startDate: editingBaseline?.startDate || null,
            deadline: editingBaseline?.deadline || null,
          },
        }
      : { mode: 'create' };

    // Early UX check (fresh Date.now — not form-open time). Backend remains authoritative.
    const validatedEarly = validateAssignmentFormFields(
      {
        ...form,
        startDate: startIso || form.startDate,
        deadline: deadlineIso || form.deadline,
      },
      validationOptions
    );
    if (!validatedEarly.ok) {
      assignmentSubmitLock.current.end();
      setFormErrors(validatedEarly.errors || {});
      return;
    }

    // Create requires a newly selected reference file; update may keep existingFileName.
    const hasReferenceFile = Boolean(form.file) || Boolean(editingId && form.existingFileName);
    if (!editingId && !form.file) {
      assignmentSubmitLock.current.end();
      setFormErrors((prev) => ({
        ...prev,
        file: 'Upload a reference file.',
      }));
      return;
    }
    if (editingId && !hasReferenceFile) {
      assignmentSubmitLock.current.end();
      setFormErrors((prev) => ({
        ...prev,
        file: 'Upload a reference file.',
      }));
      return;
    }

    setFormErrors({});
    setSavingAssignment(true);
    try {
      const formData = new FormData();
      formData.append('title', validatedEarly.values.title);
      formData.append('description', validatedEarly.values.description);
      formData.append('points', String(validatedEarly.values.points));
      formData.append('startDate', startIso);
      formData.append('deadline', deadlineIso);

      // Create: sign the selected schedule BEFORE the slow R2 upload.
      // The token stops date tampering. The server still re-checks that the
      // start and due instants are strictly in the future when the assignment is saved.
      if (!editingId) {
        const intent = await teacherService.createScheduleIntent({
          startDate: startIso,
          deadline: deadlineIso,
        });
        if (!intent?.scheduleIntentToken) {
          throw new Error('Unable to save assignment. Please try again.');
        }
        formData.append('scheduleIntentToken', intent.scheduleIntentToken);
      }

      // Durable assignment files go direct-to-R2 (presigned) so local + Vercel
      // share the same private bucket and bypass serverless body limits.
      if (form.file) {
        const durable = await uploadDurableFile(form.file, 'assignments');
        appendDurableFields(formData, durable);
      }

      if (editingId) {
        await teacherService.updateAssignment(editingId, formData);
        alert('Assignment updated successfully.');
      } else {
        await teacherService.createAssignment(formData);
        alert(assignmentCreatedMessage(startIso));
      }
      setForm({ title: '', startDate: '', deadline: '', description: '', points: '', file: null, existingFileName: '', existingFileId: '' });
      setFormErrors({});
      setEditingBaseline(null);
      setEditingId(null);
      setActiveTab('assignments');
      fetchAllData();
    } catch (err) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      const apiErrors = err?.response?.data?.errors;
      if (status === 409 || code === 'ASSIGNMENT_DUPLICATE') {
        const duplicateMessage = 'Assignment already exists.';
        setFormErrors((prev) => ({
          ...prev,
          ...(apiErrors && typeof apiErrors === 'object' ? apiErrors : null),
          title: duplicateMessage,
        }));
        // Keep form values and selected/uploaded file on expected duplicate conflict.
        alert(duplicateMessage);
        return;
      }
      if (apiErrors && typeof apiErrors === 'object') {
        setFormErrors(apiErrors);
      }
      const apiMessage = err?.response?.data?.message;
      const validationMessage =
        status >= 400 && status < 500 && typeof apiMessage === 'string' && apiMessage
          ? apiMessage
          : '';
      // Keep form + file on schedule/validation failures from the authoritative backend.
      alert(validationMessage || 'Unable to save assignment. Please try again.');
    } finally {
      assignmentSubmitLock.current.end();
      setSavingAssignment(false);
    }
  };

  const chartData = [
    { name: 'Assignments', count: stats.totalCreated },
    { name: 'Students',    count: stats.totalStudents },
    { name: 'Pending',     count: stats.pendingCount },
    { name: 'Graded',      count: stats.completedCount },
  ];

  const pieData = [
    { name: 'Pending', value: stats.pendingCount   || 0 },
    { name: 'Graded',  value: stats.completedCount || 0 },
  ];

  // ─── Loading ───────────────────────────────────────────────
  if (loading) return (
    <div className="h-screen theme-page flex flex-col items-center justify-center">
      <Loader2 className="animate-spin accent-text mb-4" size={40} />
      <p className="text-sm font-semibold theme-muted">Loading QuickCheck Hub…</p>
    </div>
  );

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const openMainTab = (tab) => {
    setShellView('main');
    setActiveTab(tab);
    if (tab !== 'create') setEditingId(null);
  };

  const mainPageTitle =
    activeTab === 'dashboard' ? 'Overview'
      : activeTab === 'create' ? (editingId ? 'Edit Assignment' : 'Create Assignment')
      : activeTab === 'assignments' ? 'My Assignments'
      : activeTab === 'submissions' ? 'Submissions'
      : activeTab === 'plagiarism' ? 'Similarity'
      : 'Students';

  const pageTitle =
    shellView === 'profile' ? 'My Profile'
      : shellView === 'settings' ? 'Settings'
      : mainPageTitle;

  // ─── Render ────────────────────────────────────────────────
  return (
    <>
    <DashboardNavShell
      widthClass="w-64"
      desktopMode="flow"
      mobileTitle="QuickCheck Hub"
      pageTitle={pageTitle}
      headerActions={
        <DashboardTopBar
          role="teacher"
          onLogout={handleLogout}
          onOpenProfile={() => setShellView('profile')}
          onOpenSettings={() => setShellView('settings')}
        />
      }
      sidebar={
        <div className="p-5 flex flex-col flex-1 min-h-0">
          <div className="qc-sidebar-brand">
            <span className="qc-sidebar-brand__mark"><ShieldCheck size={18}/></span>
            <div>
              <span className="qc-sidebar-brand__text">QuickCheck Hub</span>
              <span className="qc-sidebar-brand__role">Teacher</span>
            </div>
          </div>
          <nav className="qc-sidebar-nav space-y-1" aria-label="Teacher navigation">
            <DashboardNavItem icon={<Layout size={18}/>} label="Overview" active={shellView === 'main' && activeTab==='dashboard'} onClick={() => openMainTab('dashboard')} />
            <DashboardNavItem icon={<PlusCircle size={18}/>} label={editingId ? 'Edit Assignment' : 'Create Assignment'} active={shellView === 'main' && activeTab==='create'} onClick={() => { setShellView('main'); setActiveTab('create'); }} />
            <DashboardNavItem icon={<BookOpen size={18}/>} label="My Assignments" active={shellView === 'main' && activeTab==='assignments'} onClick={() => openMainTab('assignments')} />
            <DashboardNavItem icon={<ClipboardCheck size={18}/>} label="Submissions" active={shellView === 'main' && activeTab==='submissions'} onClick={() => openMainTab('submissions')} />
            <DashboardNavItem icon={<ShieldAlert size={18}/>} label="Similarity" active={shellView === 'main' && activeTab==='plagiarism'} onClick={() => openMainTab('plagiarism')} />
            <DashboardNavItem icon={<Users size={18}/>} label="Students" active={shellView === 'main' && activeTab==='students'} onClick={() => openMainTab('students')} />
          </nav>
          <SidebarControls />
        </div>
      }
    >
        {shellView === 'profile' ? (
          <ProfilePage onBack={() => setShellView('main')} />
        ) : shellView === 'settings' ? (
          <SettingsPage role="teacher" onBack={() => setShellView('main')} />
        ) : (
        <>
        {activeTab === 'dashboard' && (
          <div className="qc-overview">
            <div className="qc-page-header">
              <div>
                <h2 className="qc-page-title">Teacher Dashboard</h2>
                <p className="qc-page-subtitle">Live analytics and classroom performance.</p>
              </div>
            </div>
            <div className="qc-overview__stats grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total Assignments" value={stats.totalCreated} icon={<BookOpen size={16}/>}/>
              <StatCard label="Total Students" value={stats.totalStudents} icon={<Users size={16}/>}/>
              <StatCard label="Pending Graded" value={stats.pendingCount} icon={<Clock size={16}/>}/>
              <StatCard label="Successful Graded" value={stats.completedCount} icon={<CheckCircle size={16}/>}/>
            </div>
            <div className="qc-overview__charts qc-overview__charts--split">
              <div className="lg:col-span-1 qc-card qc-overview__panel">
                <h3 className="font-semibold mb-2 flex items-center gap-2"><TrendingUp className="accent-text" size={18}/> Activity Insights</h3>
                <div className="qc-overview__plot">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'var(--chart-axis)',fontSize:11}}/>
                      <YAxis axisLine={false} tickLine={false} tick={{fill:'var(--chart-axis)',fontSize:11}}/>
                      <Tooltip cursor={{fill:'#ffffff05'}} contentStyle={{backgroundColor:'var(--chart-tooltip-bg)',border:'1px solid var(--border)',borderRadius:'12px'}}/>
                      <Bar dataKey="count" fill="var(--chart-primary)" radius={[6,6,0,0]} barSize={40}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="qc-card qc-overview__panel items-center">
                <h3 className="font-semibold mb-1">Grading Progress</h3>
                <p className="theme-muted text-xs mb-2 shrink-0">Click a slice for details</p>

                {activePieIndex !== null && (
                  <div className={`mb-4 px-6 py-3 rounded-2xl border text-center ${activePieIndex === 0 ? 'accent-soft' : 'accent-soft'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{pieData[activePieIndex].name} Submissions</p>
                    <p className="text-3xl font-black accent-text">{pieData[activePieIndex].value}</p>
                  </div>
                )}

                <div className="qc-overview__plot">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius="46%" outerRadius="68%" paddingAngle={6} dataKey="value"
                        onClick={(_, index) => setActivePieIndex(activePieIndex === index ? null : index)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Cell fill="var(--chart-primary)" fillOpacity={1} stroke="var(--surface)" strokeWidth={2}/>
                        <Cell fill="var(--chart-secondary)" fillOpacity={1} stroke="var(--surface)" strokeWidth={2}/>
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-2 shrink-0">
                  <LegendItem color="bg-slate-500"   label="Pending"/>
                  <LegendItem color="bg-emerald-500" label="Graded"/>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ CREATE TAB ══ */}
        {activeTab === 'create' && (
          <div className="qc-create-form">
            <div className="qc-page-header">
              <div>
                <h2 className="qc-page-title">{editingId ? 'Update Assignment' : 'New Assignment'}</h2>
                <p className="qc-page-subtitle">Define the task, deadline, and supporting materials.</p>
              </div>
            </div>
            <form onSubmit={handleCreateOrUpdate} className="qc-card qc-create-form__body">
              <div className="qc-create-form__field">
                <label className="qc-label">Assignment Title <span className="text-red-400" aria-hidden="true">*</span></label>
                <input type="text" className="qc-input" value={form.title} onChange={e => { setForm({...form, title:e.target.value}); setFormErrors((prev) => ({ ...prev, title: undefined })); }} placeholder="e.g. System Design Analysis" maxLength={100} aria-required="true" aria-invalid={Boolean(formErrors.title)}/>
                {formErrors.title ? <p className="text-red-400 text-[11px] mt-1.5 font-semibold" role="alert">{formErrors.title}</p> : null}
              </div>

              <div className="qc-create-form__meta">
                <div className="qc-create-form__field">
                  <label className="qc-label">Total Marks <span className="text-red-400" aria-hidden="true">*</span></label>
                  <input type="number" min="1" max="100" step="1" className="qc-input" value={form.points} onChange={e => { setForm({...form, points:e.target.value}); setFormErrors((prev) => ({ ...prev, points: undefined })); }} placeholder="e.g. 30" aria-required="true" aria-invalid={Boolean(formErrors.points)}/>
                  {formErrors.points ? <p className="text-red-400 text-[11px] mt-1.5 font-semibold" role="alert">{formErrors.points}</p> : null}
                </div>
                <div className="qc-create-form__field">
                  <label className="qc-label">Start date and time <span className="text-red-400" aria-hidden="true">*</span></label>
                  <input type="datetime-local" className="qc-input" value={form.startDate} onChange={e => { setForm({...form, startDate:e.target.value}); setFormErrors((prev) => ({ ...prev, startDate: undefined })); }} aria-required="true" aria-invalid={Boolean(formErrors.startDate)}/>
                  {formErrors.startDate ? (
                    <div className="mt-1.5 space-y-1.5">
                      <p className="text-red-400 text-[11px] font-semibold" role="alert">{formErrors.startDate}</p>
                      <button
                        type="button"
                        className="text-[10px] font-black uppercase tracking-widest accent-text hover:underline"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            startDate: suggestStartDatetimeLocal(Date.now(), 5 * 60 * 1000),
                          }));
                          setFormErrors((prev) => ({ ...prev, startDate: undefined }));
                        }}
                      >
                        Set start to 5 minutes from now
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="qc-create-form__field">
                  <label className="qc-label">Due date and time <span className="text-red-400" aria-hidden="true">*</span></label>
                  <input type="datetime-local" className="qc-input" value={form.deadline} onChange={e => { setForm({...form, deadline:e.target.value}); setFormErrors((prev) => ({ ...prev, deadline: undefined })); }} aria-required="true" aria-invalid={Boolean(formErrors.deadline)}/>
                  {formErrors.deadline ? <p className="text-red-400 text-[11px] mt-1.5 font-semibold" role="alert">{formErrors.deadline}</p> : null}
                </div>
              </div>
              <p className="qc-create-form__hint">Whole marks from 1 to 100. Dates and times use Asia/Karachi.</p>

              <div className="qc-create-form__field">
                <label className="qc-label">Reference File <span className="text-red-400" aria-hidden="true">*</span></label>
                <div className={`qc-create-form__file ${formErrors.file ? 'is-invalid' : ''}`} onClick={() => fileInputRef.current.click()} role="button" tabIndex={0} aria-invalid={Boolean(formErrors.file)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}>
                  <input type="file" ref={fileInputRef} className="hidden" accept={ACADEMIC_ACCEPT} onChange={handleFileChange}/>
                  {form.file ? (
                    <div className="qc-create-form__file-row">
                      <CheckCircle size={18} className="accent-text shrink-0"/>
                      <span className="qc-create-form__file-name">{form.file.name}</span>
                      <X className="text-slate-500 hover:text-white shrink-0" size={16} onClick={e => { e.stopPropagation(); setForm({...form, file:null}); }}/>
                    </div>
                  ) : form.existingFileName ? (
                    <div className="qc-create-form__file-stack">
                      <div className="qc-create-form__file-row">
                        <CheckCircle size={18} className="accent-text shrink-0"/>
                        <span className="qc-create-form__file-name">Current file: {form.existingFileName}</span>
                      </div>
                      <div className="qc-create-form__file-actions">
                        <button type="button" className="accent-text" onClick={async (e) => { e.stopPropagation(); try { await openProtectedPreview(teacherService.previewAssignment(form.existingFileId), form.existingFileName, { downloadUrl: teacherService.downloadAssignment(form.existingFileId) }); } catch (err) { alert(err.message); } }}>Preview current</button>
                        <span className="theme-muted">Click this box to replace it</span>
                      </div>
                    </div>
                  ) : (
                    <div className="qc-create-form__file-row">
                      <FileUp size={16} className="text-slate-500 shrink-0" aria-hidden="true"/>
                      <span className="qc-create-form__file-title">Upload Reference File</span>
                      <span className="qc-create-form__file-hint">Required for new assignments</span>
                    </div>
                  )}
                </div>
                {formErrors.file ? <p className="text-red-400 text-[11px] mt-1.5 font-semibold" role="alert">{formErrors.file}</p> : null}
              </div>

              <div className="qc-create-form__actions">
                <button type="button" className="qc-btn qc-btn-secondary" onClick={handleCancelCreate} disabled={savingAssignment}>
                  Cancel
                </button>
                <button type="submit" className="qc-btn qc-btn-primary" disabled={savingAssignment} aria-busy={savingAssignment}>
                  {savingAssignment ? (editingId ? 'Updating…' : 'Uploading…') : (editingId ? 'Update Assignment' : 'Upload Assignment')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══ ASSIGNMENTS TAB ══ */}
        {activeTab === 'assignments' && (
          <div className="qc-assignment-workspace animate-in fade-in duration-500">
            <div className="qc-assignment-workspace__header">
              <div className="qc-assignment-workspace__heading">
                <div className="qc-assignment-workspace__title-row">
                  <FileText size={22} className="qc-assignment-workspace__title-icon" aria-hidden="true" />
                  <h1 className="qc-page-title">Assignment Workspace</h1>
                </div>
                <p className="qc-page-subtitle">Manage your assignments</p>
              </div>
              <div className="qc-list-toolbar">
                <OverflowMenu
                  label="Manage assignments"
                  buttonLabel="Manage"
                  items={[
                    assignmentShelf === 'active'
                      ? {
                          id: 'archive-all-assignments',
                          label: 'Archive All Active',
                          icon: <Archive size={14} />,
                          disabled: !assignments.some((a) => a.status !== 'archived'),
                          onSelect: handleArchiveAllAssignments,
                        }
                      : {
                          id: 'unarchive-all-assignments',
                          label: 'Restore All Archived',
                          icon: <RotateCcw size={14} />,
                          disabled: !assignments.some((a) => a.status === 'archived'),
                          onSelect: handleUnarchiveAllAssignments,
                        },
                    {
                      id: 'delete-all-assignments',
                      label: 'Delete All',
                      danger: true,
                      icon: <Trash2 size={14} />,
                      disabled: !visibleAssignments.length,
                      onSelect: handleDeleteAllVisibleAssignments,
                    },
                  ]}
                />
              </div>
            </div>

            <div className="qc-assignment-summary" aria-label="Assignment summary">
              <div className="qc-assignment-summary__card">
                <div className="qc-assignment-summary__icon" aria-hidden="true">
                  <Layers size={16} />
                </div>
                <div>
                  <p className="qc-assignment-summary__label">Total Assignments</p>
                  <p className="qc-assignment-summary__value">{assignments.length}</p>
                </div>
              </div>
              <div className="qc-assignment-summary__card">
                <div className="qc-assignment-summary__icon" aria-hidden="true">
                  <Folder size={16} />
                </div>
                <div>
                  <p className="qc-assignment-summary__label">Active Assignments</p>
                  <p className="qc-assignment-summary__value">
                    {assignments.filter((a) => a.status !== 'archived').length}
                  </p>
                </div>
              </div>
              <div className="qc-assignment-summary__card">
                <div className="qc-assignment-summary__icon" aria-hidden="true">
                  <Archive size={16} />
                </div>
                <div>
                  <p className="qc-assignment-summary__label">Archived Assignments</p>
                  <p className="qc-assignment-summary__value">
                    {assignments.filter((a) => a.status === 'archived').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="qc-segmented mb-4" role="tablist" aria-label="Assignment shelf">
              <button
                type="button"
                role="tab"
                aria-selected={assignmentShelf === 'active'}
                className={`qc-segmented__item ${assignmentShelf === 'active' ? 'is-active' : ''}`}
                onClick={() => {
                  setAssignmentShelf('active');
                  setSelectedAssignments([]);
                  setManageAssignments(false);
                }}
              >
                Active
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={assignmentShelf === 'archived'}
                className={`qc-segmented__item ${assignmentShelf === 'archived' ? 'is-active' : ''}`}
                onClick={() => {
                  setAssignmentShelf('archived');
                  setSelectedAssignments([]);
                  setManageAssignments(false);
                }}
              >
                Archived
              </button>
            </div>

            {manageAssignments && (() => {
              const allVisibleSelected =
                visibleAssignments.length > 0 &&
                visibleAssignments.every((a) => isAssignmentSelected(selectedAssignments, a._id));
              const hasSelection = selectedAssignments.length > 0;
              const archiveLabel = allVisibleSelected ? 'Archive All' : 'Archive Selected';
              const restoreLabel = allVisibleSelected ? 'Restore All' : 'Restore Selected';
              const deleteLabel = allVisibleSelected ? 'Delete All' : 'Delete Selected';
              return (
              <div className="qc-selection-bar mb-4" role="status" aria-live="polite">
                <div className="qc-selection-bar__left">
                  <span className="qc-selection-bar__count">
                    {selectedAssignments.length} selected
                  </span>
                  <label className="qc-selection-bar__select-all">
                    <input
                      type="checkbox"
                      className="qc-check"
                      checked={allVisibleSelected}
                      onChange={(e) =>
                        setSelectedAssignments(
                          e.target.checked
                            ? visibleAssignments.map((a) => normalizeAssignmentId(a._id)).filter(Boolean)
                            : []
                        )
                      }
                    />
                    Select All
                  </label>
                </div>
                <div className="qc-selection-bar__actions">
                  {hasSelection && assignmentShelf === 'active' && (
                    <button
                      type="button"
                      onClick={
                        allVisibleSelected
                          ? handleArchiveAllAssignments
                          : handleArchiveSelectedAssignments
                      }
                      disabled={confirmBusy}
                      className="qc-chat-toolbar-btn"
                    >
                      <Archive size={13} aria-hidden="true" /> {archiveLabel}
                    </button>
                  )}
                  {hasSelection && assignmentShelf === 'archived' && (
                    <button
                      type="button"
                      onClick={
                        allVisibleSelected
                          ? handleUnarchiveAllAssignments
                          : handleUnarchiveSelectedAssignments
                      }
                      disabled={confirmBusy}
                      className="qc-chat-toolbar-btn"
                    >
                      <RotateCcw size={13} aria-hidden="true" /> {restoreLabel}
                    </button>
                  )}
                  {hasSelection && (
                    <button
                      type="button"
                      onClick={
                        allVisibleSelected
                          ? handleDeleteAllVisibleAssignments
                          : handleDeleteSelectedAssignments
                      }
                      disabled={confirmBusy}
                      className="qc-chat-toolbar-btn danger"
                    >
                      <Trash2 size={13} aria-hidden="true" /> {deleteLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="qc-selection-exit"
                    title="Exit selection"
                    aria-label="Exit selection mode"
                    onClick={() => {
                      setManageAssignments(false);
                      setSelectedAssignments([]);
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              );
            })()}

            <div className="qc-assignment-list">
              {visibleAssignments.map((asgn) => {
                const isArchived = asgn.status === 'archived';
                const isOverdue = !isArchived && new Date(asgn.deadline) < new Date();
                const isInactive = !isArchived && (asgn.status === 'deactive' || isOverdue);
                const assignmentId = normalizeAssignmentId(asgn._id);
                const statusLabel = isArchived ? 'ARCHIVED' : (isInactive ? 'INACTIVE' : 'ACTIVE');
                const statusClass = isArchived ? 'archived' : (isInactive ? 'inactive' : 'active');
                const overflowItems = isArchived
                  ? [{
                      id: `edit-assignment-${assignmentId}`,
                      label: 'Edit',
                      icon: <Edit3 size={14} />,
                      onSelect: () => handleEditSetup(asgn),
                    }, {
                      id: `unarchive-assignment-${assignmentId}`,
                      label: 'Unarchive',
                      icon: <RotateCcw size={14} />,
                      onSelect: () => handleUnarchiveAssignment(asgn._id),
                    }, {
                      id: `delete-assignment-${assignmentId}`,
                      label: 'Delete',
                      danger: true,
                      icon: <Trash2 size={14} />,
                      onSelect: () => handleDeleteAssignment(asgn._id),
                    }]
                  : [{
                      id: `edit-assignment-${assignmentId}`,
                      label: 'Edit',
                      icon: <Edit3 size={14} />,
                      onSelect: () => handleEditSetup(asgn),
                    }, {
                      id: `archive-assignment-${assignmentId}`,
                      label: 'Archive',
                      icon: <Archive size={14} />,
                      onSelect: () => handleArchiveAssignment(asgn._id),
                    }, {
                      id: `delete-assignment-${assignmentId}`,
                      label: 'Delete',
                      danger: true,
                      icon: <Trash2 size={14} />,
                      onSelect: () => handleDeleteAssignment(asgn._id),
                    }];
                const selected = isAssignmentSelected(selectedAssignments, assignmentId);
                return (
                  <article
                    key={assignmentId || asgn._id}
                    className={`qc-card qc-assignment-card ${selected ? 'is-selected' : ''} ${manageAssignments ? 'is-selecting' : ''}`}
                    onDoubleClick={(event) => {
                      if (event.target?.closest?.('button, a, input, label, .qc-file-link, .qc-view-file-btn, .qc-overflow-menu')) return;
                      event.preventDefault();
                      if (!manageAssignments) setManageAssignments(true);
                      setSelectedAssignments((prev) => {
                        if (isAssignmentSelected(prev, assignmentId)) return prev;
                        return toggleAssignmentSelection(prev, assignmentId);
                      });
                    }}
                  >
                    <div className="qc-assignment-card__main">
                      {manageAssignments && (
                        <input
                          type="checkbox"
                          className="qc-check"
                          aria-label={`Select assignment ${asgn.title || assignmentId}`}
                          checked={selected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() =>
                            setSelectedAssignments((prev) =>
                              toggleAssignmentSelection(prev, assignmentId)
                            )
                          }
                        />
                      )}
                      <div className="qc-assignment-card__doc-icon" aria-hidden="true">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="qc-assignment-card__title">{asgn.title}</h3>
                        <div className="qc-assignment-card__meta">
                          <p className="qc-assignment-card__meta-item">
                            <CalendarDays size={12} aria-hidden="true"/> Start: {asgn.startDate ? new Date(asgn.startDate).toLocaleString() : '—'}
                          </p>
                          <p className={`qc-assignment-card__meta-item ${isOverdue ? 'is-danger' : ''}`}>
                            <Clock size={12} aria-hidden="true"/> Due: {asgn.deadline ? new Date(asgn.deadline).toLocaleString() : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="qc-assignment-card__aside" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      {asgn.file ? (
                        <button
                          type="button"
                          className="qc-view-file-btn"
                          title="View File"
                          aria-label={`View file for ${asgn.title || 'assignment'}`}
                          onClick={async (event) => {
                            event.stopPropagation();
                            try {
                              await openProtectedPreview(
                                teacherService.previewAssignment(asgn._id),
                                asgn.originalFileName || 'assignment',
                                { downloadUrl: teacherService.downloadAssignment(asgn._id) }
                              );
                            } catch (e) {
                              alert(e.message);
                            }
                          }}
                        >
                          <Eye size={14} aria-hidden="true" />
                          View File
                        </button>
                      ) : null}
                      <span className={`qc-status-badge is-${statusClass}`}>
                        <span className="qc-status-badge__dot" aria-hidden="true" />
                        {statusLabel}
                      </span>
                      <OverflowMenu
                        label={`More actions for ${asgn.title || 'assignment'}`}
                        items={overflowItems}
                      />
                    </div>
                  </article>
                );
              })}
              {visibleAssignments.length === 0 && (
                <NoDataMessage
                  icon={<BookOpen size={40}/>}
                  message={assignmentShelf === 'archived' ? 'No archived assignments.' : 'No active assignments found.'}
                />
              )}
            </div>
          </div>
        )}

        {/* ══ SUBMISSIONS TAB ══ */}
        {activeTab === 'submissions' && (
          <div className="qc-submissions-page">
            <header className="qc-submissions-header">
              <div className="qc-submissions-header__copy">
                <div className="qc-submissions-header__title-row">
                  <ClipboardCheck size={22} className="qc-submissions-header__icon" aria-hidden="true" />
                  <h1 className="qc-page-title">Submissions</h1>
                </div>
                <p className="qc-page-subtitle">
                  Review, evaluate, and publish student submissions.
                </p>
              </div>
              <div className="qc-submissions-toolbar">
                <button
                  type="button"
                  onClick={handleAiEvaluation}
                  disabled={aiLoading}
                  className="qc-btn qc-btn-primary"
                >
                  {aiLoading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                  AI Evaluate
                </button>
                <button
                  type="button"
                  onClick={handlePlagiarismCheck}
                  disabled={checkingPlagiarism}
                  className="qc-btn qc-btn-primary"
                >
                  {checkingPlagiarism ? <Loader2 size={14} className="animate-spin"/> : <ShieldAlert size={14}/>}
                  Check Plagiarism
                </button>
                <button
                  type="button"
                  onClick={handlePublishBulk}
                  disabled={isPublishing}
                  className="qc-btn qc-btn-primary"
                >
                  {isPublishing ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
                  Publish Marks
                </button>
              </div>
            </header>

            {selectSubmissionsMode && (
              <div className="qc-selection-bar" role="status" aria-live="polite">
                <div className="qc-selection-bar__left">
                  <label className="qc-selection-bar__select-all">
                    <input
                      type="checkbox"
                      className="qc-check"
                      aria-label="Select all filtered submissions"
                      checked={
                        filteredSubmissions.slice(0, 40).length > 0 &&
                        selectedSubmissions.length === filteredSubmissions.slice(0, 40).length
                      }
                      onChange={(e) => handleSelectAllSubmissions(e.target.checked)}
                    />
                    Select All
                  </label>
                  <span className="qc-selection-bar__count">
                    <span className={selectedSubmissions.length >= 40 ? 'text-red-500' : 'accent-text'}>
                      {selectedSubmissions.length}
                    </span>
                    {' '}selected
                  </span>
                </div>
                <div className="qc-selection-bar__actions">
                  <button
                    type="button"
                    className="qc-btn qc-btn-secondary"
                    onClick={handleResetSelectedGrades}
                    disabled={!selectedSubmissions.length}
                  >
                    <RotateCcw size={14} aria-hidden="true" /> Reset All Grades
                  </button>
                  <button
                    type="button"
                    className="qc-btn qc-btn-danger"
                    onClick={handleDeleteSelectedSubmissions}
                    disabled={!selectedSubmissions.length}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Delete Selected
                  </button>
                  <button type="button" className="qc-btn qc-btn-ghost" onClick={clearSubmissionSelection}>
                    Clear
                  </button>
                </div>
              </div>
            )}

            <section className="qc-submissions-ai-panel" aria-label="AI grading controls">
              <div className="qc-submissions-ai-panel__instructions">
                <div className="qc-submissions-ai-panel__label">
                  <MessageSquare size={14} aria-hidden="true" /> Grading Instructions for AI
                </div>
                <textarea
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  className="qc-submissions-ai-panel__textarea theme-input"
                  placeholder="Example: Evaluate out of 30 marks. Check correctness, completeness and clarity."
                />
              </div>
              <div className="qc-submissions-ai-panel__files">
                <div className="qc-submissions-ai-panel__label qc-submissions-ai-panel__label--muted">
                  <FileUp size={14} aria-hidden="true" /> Reference Files (Optional)
                </div>
                <div
                  className="qc-submissions-choose-files"
                  role="button"
                  tabIndex={0}
                  onClick={() => multimediaInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      multimediaInputRef.current?.click();
                    }
                  }}
                >
                  <input
                    type="file"
                    ref={multimediaInputRef}
                    className="hidden"
                    accept="*/*"
                    multiple
                    onChange={handleMultimediaChange}
                  />
                  {multimediaFiles.length ? (
                    <span className="qc-submissions-choose-files__selected">
                      <CheckCircle size={12} aria-hidden="true" />
                      <span className="truncate">{multimediaFiles.length} file(s) selected</span>
                      <button
                        type="button"
                        className="qc-submissions-choose-files__clear"
                        aria-label="Clear reference files"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMultimediaFiles([]);
                          if (multimediaInputRef.current) multimediaInputRef.current.value = null;
                        }}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  ) : (
                    <span>Choose Files</span>
                  )}
                </div>
              </div>
            </section>

            <div className="qc-submissions-filters" role="search" aria-label="Filter submissions">
              <label className="qc-search-field qc-submissions-filters__search">
                <Search size={14} className="qc-search-field__icon" aria-hidden="true" />
                <span className="sr-only">Search by student or assignment</span>
                <input
                  type="search"
                  value={submissionSearch}
                  onChange={(e) => {
                    setSubmissionSearch(e.target.value);
                    setSubmissionPage(1);
                  }}
                  placeholder="Search by student or assignment"
                  className="qc-search-field__input"
                />
              </label>
              <select
                className="qc-submissions-filter-select"
                value={submissionAssignmentFilter}
                aria-label="Filter by assignment"
                onChange={(e) => {
                  setSubmissionAssignmentFilter(e.target.value);
                  setSubmissionPage(1);
                }}
              >
                <option value="all">All Assignments</option>
                {submissionAssignmentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.title}</option>
                ))}
              </select>
              <select
                className="qc-submissions-filter-select"
                value={submissionStatusFilter}
                aria-label="Filter by status"
                onChange={(e) => {
                  setSubmissionStatusFilter(e.target.value);
                  setSubmissionPage(1);
                }}
              >
                <option value="all">All Statuses</option>
                <option value="awaiting">Awaiting Evaluation</option>
                <option value="ai_processing">AI Processing</option>
                <option value="ai_graded">AI Graded</option>
                <option value="graded">Graded</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div className="qc-submissions-card">
              <table className={`qc-submissions-table${selectSubmissionsMode ? ' is-selecting' : ''}`}>
                <colgroup>
                  {selectSubmissionsMode ? <col className="qc-submissions-col-check" /> : null}
                  <col className="qc-submissions-col-student" />
                  <col className="qc-submissions-col-assignment" />
                  <col className="qc-submissions-col-qfile" />
                  <col className="qc-submissions-col-solution" />
                  <col className="qc-submissions-col-score" />
                  <col className="qc-submissions-col-status" />
                  <col className="qc-submissions-col-review" />
                  <col className="qc-submissions-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    {selectSubmissionsMode && <th className="text-center" aria-label="Selection" />}
                    <th>Student</th>
                    <th>Assignment</th>
                    <th>Question File</th>
                    <th>Submission (Solution)</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th className="text-center">Review</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSubmissions.map((sub) => {
                    const maxPts = sub.totalMarks || sub.assignment?.points || '--';
                    const hasQuestionFile = Boolean(sub.assignment?.file && sub.assignment?._id);
                    const hasSolutionFile = Boolean(sub.file || sub.originalFileName);
                    const statusTone =
                      sub.status === 'PUBLISHED' ? 'is-published' :
                      sub.status === 'AI_GRADED' ? 'is-evaluated' :
                      sub.status === 'AI_PROCESSING' ? 'is-awaiting' :
                      ['graded', 'GRADED', 'Graded', 'REVIEWED'].includes(sub.status) ? 'is-graded' :
                      'is-awaiting';
                    const statusLabel =
                      sub.status === 'AI_PROCESSING' ? 'AI PROCESSING' :
                      sub.status === 'AI_GRADED' ? 'AI GRADED' :
                      sub.status === 'PUBLISHED' ? 'PUBLISHED' :
                      ['graded', 'GRADED', 'Graded', 'REVIEWED'].includes(sub.status) ? 'GRADED' :
                      'AWAITING EVALUATION';
                    return (
                      <tr
                        key={sub._id}
                        className={`qc-submissions-row${selectedSubmissions.includes(sub._id) ? ' is-selected' : ''}`}
                        onDoubleClick={(event) => {
                          if (event.target?.closest?.('button, a, input, label, .qc-file-link, .qc-file-named, .qc-view-file-btn, .qc-overflow-menu, .qc-overflow-trigger')) return;
                          if (!selectSubmissionsMode) setSelectSubmissionsMode(true);
                          toggleSelect(sub._id);
                        }}
                      >
                        {selectSubmissionsMode && (
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="qc-check"
                              aria-label={`Select submission from ${sub.student?.name || 'student'}`}
                              checked={selectedSubmissions.includes(sub._id)}
                              onChange={() => toggleSelect(sub._id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                        )}
                        <td>
                          <p className="qc-submissions-student-name">{sub.student?.name || 'Unknown'}</p>
                          <p className="qc-submissions-student-reg">
                            {sub.student?.registrationNumber || 'Not assigned'}
                          </p>
                        </td>
                        <td>
                          <span className="qc-submissions-assignment-title" title={sub.assignment?.title || 'Untitled'}>
                            {sub.assignment?.title || 'Untitled'}
                          </span>
                        </td>
                        <td>
                          {hasQuestionFile ? (
                            <button
                              type="button"
                              className="qc-view-file-btn"
                              title="View Question"
                              aria-label={`View question file for ${sub.assignment?.title || 'assignment'}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await openProtectedPreview(
                                    teacherService.previewAssignment(sub.assignment._id),
                                    sub.assignment.originalFileName || 'question',
                                    {
                                      downloadUrl: teacherService.downloadAssignment(sub.assignment._id),
                                      downloadLabel: 'Download File',
                                    }
                                  );
                                } catch (err) {
                                  alert(err.message);
                                }
                              }}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <Eye size={13} aria-hidden="true" />
                              View Question
                            </button>
                          ) : (
                            <span className="qc-file-unavailable">Not Available</span>
                          )}
                        </td>
                        <td>
                          {hasSolutionFile ? (
                            <button
                              type="button"
                              className="qc-view-file-btn"
                              title="View Solution"
                              aria-label={`View solution from ${sub.student?.name || 'student'}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await openProtectedPreview(
                                    teacherService.previewSubmission(sub._id),
                                    sub.originalFileName || 'student-submission',
                                    {
                                      downloadUrl: teacherService.downloadSubmission(sub._id),
                                      downloadLabel: 'Download Submission',
                                    }
                                  );
                                } catch (err) {
                                  alert(err.message);
                                }
                              }}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <Eye size={13} aria-hidden="true" />
                              View Solution
                            </button>
                          ) : (
                            <span className="qc-file-unavailable">Not Available</span>
                          )}
                        </td>
                        <td>
                          {sub.status === 'AI_PROCESSING' ? (
                            <span className="qc-submissions-score-muted">AI grading…</span>
                          ) : (
                            <div className="qc-submissions-score">
                              <span className="accent-text">
                                AI: {sub.aiScore != null && Number.isFinite(Number(sub.aiScore)) ? `${sub.aiScore}/${maxPts}` : `—/${maxPts}`}
                              </span>
                              <span>
                                Teacher: {sub.marks != null && Number.isFinite(Number(sub.marks)) ? `${sub.marks}/${maxPts}` : `—/${maxPts}`}
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`qc-status-badge qc-submissions-status ${statusTone}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openReviewModal(sub); }}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className="qc-icon-btn"
                            title="Review Evaluation"
                            aria-label="Review evaluation"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                        <td className="text-center" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                          <OverflowMenu
                            label={`Actions for submission ${sub.student?.name || sub._id}`}
                            items={[{
                              id: `reset-submission-${sub._id}`,
                              label: 'Reset Grade',
                              icon: <RotateCcw size={14} />,
                              onSelect: () => handleResetSubmissionGrade(sub._id),
                            }, {
                              id: `delete-submission-${sub._id}`,
                              label: 'Delete submission',
                              danger: true,
                              icon: <Trash2 size={14} />,
                              onSelect: () => handleDeleteSubmission(sub._id),
                            }]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {submissions.length === 0 && (
                <NoDataMessage icon={<ClipboardCheck size={40}/>} message="No student submissions yet." />
              )}
              {submissions.length > 0 && filteredSubmissions.length === 0 && (
                <NoDataMessage icon={<Search size={40}/>} message="No submissions match your search or filters." />
              )}
              {filteredSubmissions.length > 0 && (
                <div className="qc-submissions-pagination">
                  <p className="qc-submissions-pagination__meta">
                    Showing {(safeSubmissionPage - 1) * SUBMISSIONS_PAGE_SIZE + 1}
                    –
                    {Math.min(safeSubmissionPage * SUBMISSIONS_PAGE_SIZE, filteredSubmissions.length)}
                    {' '}of {filteredSubmissions.length}
                  </p>
                  <div className="qc-submissions-pagination__controls">
                    <button
                      type="button"
                      className="qc-btn qc-btn-ghost"
                      disabled={safeSubmissionPage <= 1}
                      onClick={() => setSubmissionPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} aria-hidden="true" /> Prev
                    </button>
                    <span className="qc-submissions-pagination__page">
                      {safeSubmissionPage} / {submissionTotalPages}
                    </span>
                    <button
                      type="button"
                      className="qc-btn qc-btn-ghost"
                      disabled={safeSubmissionPage >= submissionTotalPages}
                      onClick={() => setSubmissionPage((p) => Math.min(submissionTotalPages, p + 1))}
                      aria-label="Next page"
                    >
                      Next <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ PLAGIARISM TAB ══ */}
        {activeTab === 'plagiarism' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
              <div className="min-w-0">
                <h1 className="qc-page-title">Plagiarism Check</h1>
                <p className="text-slate-500 text-xs max-w-2xl">Local similarity checking compares extracted text from submissions of the same assignment. It is an indicator for teacher review, not an automatic misconduct decision.</p>
              </div>
              <button type="button" onClick={handlePlagiarismCheck} disabled={checkingPlagiarism} className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 shrink-0 self-start">
                {checkingPlagiarism ? <Loader2 size={14} className="animate-spin"/> : <ShieldAlert size={14}/>} Run Check
              </button>
            </div>
            <div className="qc-table-wrap">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="theme-page text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    <tr><th className="p-5">Student</th><th className="p-5">Assignment</th><th className="p-5">Highest Similarity</th><th className="p-5">Compared With</th><th className="p-5">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {plagiarismResults.map((row) => (
                      <tr key={String(row.submissionId)}>
                        <td className="p-5 text-sm font-bold text-white">{row.student}</td>
                        <td className="p-5 text-sm text-slate-400">{row.assignment}</td>
                        <td className="p-5 text-sm font-black">{row.similarity}%</td>
                        <td className="p-5 text-sm text-slate-400">{row.comparedWith ? `${row.comparedWith.student} (${row.comparedWith.similarity}%)` : 'No comparable submission'}</td>
                        <td className="p-5"><span className={`px-2 py-1 rounded text-[10px] font-black ${row.status === 'HIGH' ? 'bg-red-500/20 text-red-400' : row.status === 'REVIEW' ? 'bg-slate-500/20 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{row.status}</span></td>
                      </tr>
                    ))}
                    {plagiarismResults.length === 0 && <tr><td colSpan="5" className="p-16 text-center text-slate-500 text-xs">Select submissions in the Submissions tab and run a plagiarism check.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ STUDENTS TAB ══ */}
        {activeTab === 'students' && (
          <div className="animate-in fade-in duration-500">
            <h1 className="qc-page-title mb-6">Student Directory</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {students.map((st) => (
                // ✅ FIX: key uses _id instead of index
                <div key={st._id} className="qc-card qc-student-dir-card flex items-center gap-4 transition-all group">
                  <div className="qc-student-avatar" aria-hidden="true">
                    {(st.name || st.studentName)?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-bold text-sm truncate">{st.name || st.studentName}</h4>
                    <p className="text-[10px] theme-muted font-bold tracking-widest uppercase mt-1">
                      Reg No: {st.registrationNumber || st.regNo || st.studentRegNo || 'Not assigned'}
                    </p>
                    <p className="text-[11px] theme-muted break-all mt-1">
                      {st.email || 'Email not available'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {students.length === 0 && <NoDataMessage icon={<Users size={40}/>} message="No students are currently enrolled."/>}
          </div>
        )}
        </>
        )}
        <AIChatbot role="teacher" showTrigger={false} />
        <MessagePanel role="teacher" showTrigger={false} />

      {/* ══ REVIEW MODAL ══ */}
      {reviewModalOpen && selectedReview && (
        <div className="qc-modal-backdrop qc-modal-backdrop--elevated" role="presentation">
          <div className="qc-review-modal" role="dialog" aria-modal="true" aria-label="Review evaluation">
            <header className="qc-review-modal__header">
              <div className="qc-review-modal__heading min-w-0">
                <h2 className="qc-review-modal__title">Review Evaluation</h2>
                <p className="qc-review-modal__student">
                  {selectedReview.student?.name || selectedReview.studentName || 'Unknown'}
                </p>
                <p className="qc-review-modal__reg">
                  Registration No:{' '}
                  {selectedReview.student?.registrationNumber || selectedReview.studentRegNo || 'Not assigned'}
                </p>
              </div>
              <div className="qc-review-modal__header-actions">
                <button
                  type="button"
                  onClick={() => handleResetSubmissionGrade(selectedReview._id)}
                  className="qc-btn qc-btn-secondary"
                  title="Clear current grading to allow regrading"
                >
                  <RotateCcw size={14} aria-hidden="true" /> Reset Grade
                </button>
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="qc-icon-btn"
                  aria-label="Close review dialog"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="qc-review-modal__body">
              <section className="qc-review-modal__block">
                <h3 className="qc-review-modal__label">Student Submission</h3>
                <div className="qc-review-modal__file-row">
                  {(selectedReview.file || selectedReview.originalFileName) ? (
                    <button
                      type="button"
                      className="qc-view-file-btn"
                      title="View Solution"
                      aria-label="View submitted solution file"
                      onClick={async () => {
                        try {
                          await openProtectedPreview(
                            teacherService.previewSubmission(selectedReview._id),
                            selectedReview.originalFileName || 'student-submission',
                            {
                              downloadUrl: teacherService.downloadSubmission(selectedReview._id),
                              downloadLabel: 'Download Submission',
                            }
                          );
                        } catch (error) {
                          alert(error.message);
                        }
                      }}
                    >
                      <Eye size={14} aria-hidden="true" />
                      View Solution
                    </button>
                  ) : (
                    <span className="qc-file-unavailable">Not Available</span>
                  )}
                  {(selectedReview.file || selectedReview.originalFileName) ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await downloadProtectedFile(
                            teacherService.downloadSubmission(selectedReview._id),
                            selectedReview.originalFileName || 'student-submission'
                          );
                        } catch (error) {
                          alert(error.message);
                        }
                      }}
                      className="qc-btn qc-btn-secondary"
                    >
                      <Download size={14} aria-hidden="true" /> Download Submission
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="qc-review-modal__block qc-review-modal__block--ai">
                <h3 className="qc-review-modal__label flex items-center gap-1.5">
                  <Sparkles size={12} className="text-sky-500" aria-hidden="true" /> AI Feedback
                </h3>
                <div className="qc-review-modal__ai-scroll">
                  <p className="qc-review-modal__ai-summary">
                    {selectedReview.aiFeedback || 'No AI feedback available yet.'}
                  </p>
                  <div className="qc-review-modal__ai-cols">
                    <div>
                      <h4 className="qc-review-modal__sublabel is-strength">Strengths</h4>
                      {reviewContent.strengths?.length ? (
                        <ul className="qc-review-modal__bullets">
                          {reviewContent.strengths.map((item, idx) => (
                            <li key={`s-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="theme-muted text-xs m-0">No strengths listed.</p>
                      )}
                    </div>
                    <div>
                      <h4 className="qc-review-modal__sublabel is-improve">Improvements</h4>
                      {reviewContent.improvements?.length ? (
                        <ul className="qc-review-modal__bullets">
                          {reviewContent.improvements.map((item, idx) => (
                            <li key={`i-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="theme-muted text-xs m-0">No improvements listed.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="qc-review-modal__block">
                <h3 className="qc-review-modal__label">Marks</h3>
                <p className="qc-review-modal__max">
                  Maximum Marks:{' '}
                  <strong>{selectedReview.totalMarks || selectedReview.assignment?.points || 'Not set'}</strong>
                </p>
                <div className="qc-review-modal__marks">
                  <div className="qc-review-modal__mark-card is-ai">
                    <span className="qc-review-modal__mark-label">AI Marks</span>
                    <span className="qc-review-modal__mark-value">
                      {selectedReview.aiScore ?? '—'}
                      <span className="qc-review-modal__mark-denom">
                        / {selectedReview.totalMarks || selectedReview.assignment?.points || '—'}
                      </span>
                    </span>
                  </div>
                  <div className="qc-review-modal__mark-card is-teacher">
                    <label className="qc-review-modal__mark-label" htmlFor="qc-teacher-marks">
                      Teacher Marks
                    </label>
                    <input
                      id="qc-teacher-marks"
                      type="number"
                      value={manualScore}
                      onChange={(e) => setManualScore(e.target.value)}
                      min="0"
                      max={selectedReview.totalMarks || selectedReview.assignment?.points || undefined}
                      placeholder="Enter marks"
                      aria-label="Teacher marks"
                      className="qc-review-modal__mark-input"
                    />
                  </div>
                </div>
              </section>

              <section className="qc-review-modal__block">
                <label className="qc-review-modal__label block" htmlFor="qc-teacher-feedback">
                  Teacher Feedback
                </label>
                <textarea
                  id="qc-teacher-feedback"
                  value={teacherNote}
                  onChange={(e) => setTeacherNote(e.target.value)}
                  className="theme-input border qc-review-modal__feedback outline-none"
                  placeholder="Write clear feedback for the student…"
                  rows={4}
                />
              </section>
            </div>

            <footer className="qc-review-modal__footer">
              <button
                type="button"
                onClick={handleSaveEvaluation}
                disabled={savingEval}
                className="qc-btn qc-btn-primary"
              >
                {savingEval ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Teacher Grade
              </button>
              <button
                type="button"
                onClick={handlePublishAiResult}
                disabled={savingEval || selectedReview.aiScore == null}
                className="qc-btn qc-btn-primary"
                title="Publish only AI Marks and AI Feedback to the student"
              >
                <Send size={14} aria-hidden="true" />
                Publish AI Result
              </button>
              <button
                type="button"
                onClick={handlePublishAvailableResults}
                disabled={savingEval}
                className="qc-btn qc-btn-primary"
                title="Publish available AI and entered Teacher results to the student"
              >
                {savingEval ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} aria-hidden="true" />}
                Publish
              </button>
            </footer>
          </div>
        </div>
      )}

      {aiQuestionFilePrompt?.open && (
        <div
          className="qc-modal-backdrop qc-modal-backdrop--elevated"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !aiLoading) setAiQuestionFilePrompt(null);
          }}
        >
          <div
            className="qc-modal qc-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qc-ai-qfile-prompt-title"
          >
            <h3 id="qc-ai-qfile-prompt-title" className="qc-confirm-dialog__title">
              Do you want to include the Question File in AI Evaluation?
            </h3>
            <p className="qc-confirm-dialog__description">
              Yes includes each selected submission&apos;s assignment question/reference file (when available).
              No evaluates using only the student&apos;s submitted work. Extra reference uploads below the instructions
              are still included only if you already attached them.
            </p>
            <div className="qc-confirm-dialog__actions">
              <button
                type="button"
                className="qc-btn qc-btn-secondary"
                disabled={aiLoading}
                onClick={() => runAiEvaluation(false)}
              >
                No
              </button>
              <button
                type="button"
                className="qc-btn qc-btn-primary"
                disabled={aiLoading}
                onClick={() => runAiEvaluation(true)}
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

    </DashboardNavShell>
    <ConfirmDialog
      open={Boolean(confirmState)}
      title={confirmState?.title}
      description={confirmState?.description}
      detail={confirmState?.detail}
      confirmLabel={confirmState?.confirmLabel}
      danger={Boolean(confirmState?.danger)}
      busy={confirmBusy}
      onCancel={closeConfirm}
      onConfirm={runConfirm}
    />
    </>
  );
}
