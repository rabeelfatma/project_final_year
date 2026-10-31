import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, PlusCircle, BookOpen, ClipboardCheck, Users, RotateCcw,
  Loader2, FileUp, X, CheckCircle, TrendingUp, Download,
  ShieldCheck, Clock, Trash2, Edit3, Sparkles, MessageSquare,
  Send, Eye, AlertCircle, ShieldAlert, FileText, ListChecks
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
  shelfAfterRestore,
} from '../../utils/assignmentShelf';

function StatCard({ label, value, icon }) {
  const [selected, setSelected] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setSelected((current) => !current)}
      aria-pressed={selected}
      className="qc-stat-card relative overflow-hidden"
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
  const [selectedAssignments, setSelectedAssignments] = useState([]);
  const [manageAssignments, setManageAssignments] = useState(false);
  /** Active list = non-archived (active + legacy deactive). Archived = status archived only. */
  const [assignmentShelf, setAssignmentShelf] = useState('active');
  const [selectedQuestionAssignments, setSelectedQuestionAssignments] = useState([]);
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
    setSelectedSubmissions(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 40) { alert('⚠️ Maximum 40 students can be selected at once.'); return prev; }
      return [...prev, id];
    });
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const first40 = submissions.slice(0, 40).map(s => s._id);
      setSelectedSubmissions(first40);
      if (submissions.length > 40) alert('Only first 40 students selected due to limit.');
    } else {
      setSelectedSubmissions([]);
    }
  };

  // ── AI Evaluation ─────────────────────────────────────────
  const handleAiEvaluation = async () => {
    if (selectedSubmissions.length === 0) return;
    if (!aiInstructions.trim()) return alert('Please provide grading instructions first.');
    try {
      setAiLoading(true);
      const result = await teacherService.evaluateWithAiBulk({
        submissionIds: selectedSubmissions,
        teacherInstructions: aiInstructions,
        referenceFiles: multimediaFiles,
        includeQuestionAssignmentIds: selectedQuestionAssignments,
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
      setSelectedSubmissions([]);
      fetchAllData();
    } catch (err) {
      alert('AI grading failed. Please try again or check the server connection.');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Publish Bulk ──────────────────────────────────────────
  const handlePublishBulk = async () => {
    if (selectedSubmissions.length === 0) return;
    try {
      setIsPublishing(true);
      const result = await teacherService.publishBulkResults({ submissionIds: selectedSubmissions });
      const published = Number(result?.published);
      alert(
        Number.isFinite(published)
          ? `✅ Successfully published ${published} result(s) to students!`
          : '✅ Publish request completed.'
      );
      setSelectedSubmissions([]);
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
      alert('Select at least one submission first.');
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

  const handleSaveEvaluation = async (publish = false) => {
    if (manualScore === '' || manualScore === null || manualScore === undefined) {
      alert('Please enter Teacher Marks. AI Marks remain separate and will not be copied into this field.');
      return;
    }
    try {
      setSavingEval(true);
      await teacherService.updateFinalGrade(selectedReview._id, {
        marks:    manualScore,
        feedback: teacherNote,
        status:   publish ? 'PUBLISHED' : 'graded',
      });
      alert(publish ? '✅ Published!' : '✅ Saved!');
      setReviewModalOpen(false);
      fetchAllData();
    } catch (err) {
      console.error('Save Evaluation Error:', err?.response?.data || err.message);
      alert('❌ Error saving evaluation: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSavingEval(false);
    }
  };

  const handlePublishAiResult = async () => {
    if (selectedReview?.aiScore == null || !Number.isFinite(Number(selectedReview.aiScore))) {
      alert('No AI marks available to publish. Run AI grading first, or enter Teacher Marks.');
      return;
    }
    try {
      setSavingEval(true);
      const result = await teacherService.publishBulkResults({
        submissionIds: [selectedReview._id],
      });
      alert(`✅ Published ${Number(result?.published) || 1} AI result(s) to the student.`);
      setReviewModalOpen(false);
      fetchAllData();
    } catch (err) {
      alert('❌ Failed to publish AI result: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSavingEval(false);
    }
  };

  // ── File handlers ─────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      assertAcademicFile(file);
    } catch (err) {
      alert(err.message || 'File not allowed.');
      e.target.value = null;
      return;
    }
    setForm({ ...form, file });
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

  const handleArchiveAssignment = async (id) => {
    if (!window.confirm('Archive this assignment? Students will no longer see it. Files and submissions are kept.')) return;
    try {
      const assignmentId = normalizeAssignmentId(id);
      const updated = await teacherService.updateAssignmentStatus(assignmentId, { status: 'archived' });
      if (String(updated?.status || '').toLowerCase() !== 'archived') {
        throw new Error('Server did not archive this assignment.');
      }
      // Move to Archived shelf without a full-page reload so the row stays visible.
      setAssignmentShelf(shelfAfterArchive());
      setSelectedAssignments((prev) =>
        prev.filter((value) => normalizeAssignmentId(value) !== assignmentId)
      );
      applyArchivedIdsLocally([assignmentId]);
      await fetchAllData({ silent: true });
    } catch (error) {
      alert(error.response?.data?.message || error.message || 'Could not archive assignment.');
    }
  };

  const handleRestoreAssignment = async (id) => {
    if (!window.confirm('Restore this assignment to Active? Students will see it again if it is open.')) return;
    try {
      const assignmentId = normalizeAssignmentId(id);
      const updated = await teacherService.updateAssignmentStatus(assignmentId, { status: 'active' });
      if (String(updated?.status || '').toLowerCase() !== 'active') {
        throw new Error('Server did not restore this assignment.');
      }
      setAssignmentShelf(shelfAfterRestore());
      setSelectedAssignments([]);
      setAssignments((prev) =>
        prev.map((asgn) =>
          normalizeAssignmentId(asgn._id) === assignmentId
            ? { ...asgn, status: 'active' }
            : asgn
        )
      );
      await fetchAllData({ silent: true });
    } catch (error) {
      alert(error.response?.data?.message || error.message || 'Could not restore assignment.');
    }
  };

  const handleArchiveSelectedAssignments = async () => {
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
    if (!window.confirm(`Archive ${selectedActiveIds.length} selected assignment(s)? Files and submissions are kept.`)) return;
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
    }
  };

  const handleArchiveAllAssignments = async () => {
    const activeOwned = assignments.filter((asgn) => asgn.status !== 'archived');
    if (!activeOwned.length) {
      alert('No active assignments to archive.');
      return;
    }
    if (!window.confirm(`Archive all ${activeOwned.length} active assignment(s)? Files and submissions are kept.`)) return;
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
    }
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

  const handleDeleteAssignment = async (id) => {
    if (!window.confirm('Delete this assignment?')) return;
    try {
      await teacherService.deleteAssignment(normalizeAssignmentId(id));
      setSelectedAssignments((prev) =>
        prev.filter((value) => normalizeAssignmentId(value) !== normalizeAssignmentId(id))
      );
      fetchAllData();
    } catch (error) {
      alert(describeDeleteError(error));
    }
  };

  const handleDeleteSelectedAssignments = async () => {
    if (!selectedAssignments.length || !window.confirm(`Delete ${selectedAssignments.length} selected assignments?`)) return;
    try {
      const ids = selectedAssignments.map(normalizeAssignmentId).filter(Boolean);
      await teacherService.deleteAssignmentsBulk(ids);
      setSelectedAssignments([]);
      fetchAllData();
    } catch (error) {
      alert(describeDeleteError(error));
    }
  };

  const handleResetSubmissionGrade = async (id) => {
    if (!window.confirm('Reset marks, feedback and grading status for this existing submission so it can be graded again?')) return;
    try {
      await teacherService.resetSubmissionGrade(id);
      setReviewModalOpen(false);
      await fetchAllData();
    } catch (error) {
      alert(error.response?.data?.message || error.message || 'Could not reset grading.');
    }
  };

  const handleDeleteSubmission = async (id) => {
    if (!window.confirm('Delete this submission?')) return;
    try { await teacherService.deleteSubmission(id); setSelectedSubmissions((prev) => prev.filter((x) => x !== id)); fetchAllData(); }
    catch { alert('❌ Failed to delete submission.'); }
  };

  const handleResetSelectedGrades = async () => {
    if (!selectedSubmissions.length) return;
    if (!window.confirm(`Reset grades for ${selectedSubmissions.length} selected submission(s)? Files and submissions will be kept.`)) return;
    try {
      await teacherService.resetSubmissionGradesBulk(selectedSubmissions);
      setSelectedReview(null);
      setReviewModalOpen(false);
      setSelectedSubmissions([]);
      await fetchAllData();
      alert('Selected grades have been reset.');
    } catch (error) {
      alert(error.response?.data?.message || error.message || 'Could not reset selected grades.');
    }
  };

  const handleDeleteSelectedSubmissions = async () => {
    if (!selectedSubmissions.length || !window.confirm(`Delete ${selectedSubmissions.length} selected submissions?`)) return;
    try { await teacherService.deleteSubmissionsBulk(selectedSubmissions); setSelectedSubmissions([]); fetchAllData(); }
    catch { alert('❌ Failed to delete selected submissions.'); }
  };

  const handleEditSetup = (asgn) => {
    setEditingId(asgn._id);
    setForm({
      title:       asgn.title,
      startDate:   asgn.startDate ? asgn.startDate.slice(0, 16) : '',
      deadline:    asgn.deadline  ? asgn.deadline.slice(0, 16)  : '',
      description: asgn.description || '',
      points: asgn.points ?? '',
      file: null,
      existingFileName: asgn.originalFileName || '',
      existingFileId: asgn._id,
    });
    setActiveTab('create');
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    if (!form.title || !String(form.description || '').trim() || !form.startDate || !form.deadline || !form.points || Number(form.points) <= 0) {
      return alert('Title, academic instructions, Start Date, Deadline, and Total Marks are mandatory.');
    }
    if (new Date(form.deadline) < new Date(form.startDate)) {
      return alert('Deadline must be on or after the start date.');
    }
    try {
      const formData = new FormData();
      formData.append('title',       form.title);
      formData.append('startDate',   new Date(form.startDate).toISOString());
      formData.append('deadline',    new Date(form.deadline).toISOString());
      formData.append('description', form.description || '');
      formData.append('points', String(form.points));
      // Durable assignment files go direct-to-R2 (presigned) so local + Vercel
      // share the same private bucket and bypass serverless body limits.
      if (form.file) {
        const durable = await uploadDurableFile(form.file, 'assignments');
        appendDurableFields(formData, durable);
      }

      if (editingId) {
        await teacherService.updateAssignment(editingId, formData);
        alert('✅ Updated!');
      } else {
        await teacherService.createAssignment(formData);
        alert('✅ Uploaded!');
      }
      setForm({ title: '', startDate: '', deadline: '', description: '', points: '', file: null, existingFileName: '', existingFileId: '' });
      setEditingId(null);
      setActiveTab('assignments');
      fetchAllData();
    } catch { alert('❌ Operation failed.'); }
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
          <nav className="space-y-1" aria-label="Teacher navigation">
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
          <div>
            <div className="qc-page-header">
              <div>
                <h2 className="qc-page-title">Teacher Dashboard</h2>
                <p className="qc-page-subtitle">Live analytics and classroom performance.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Assignments" value={stats.totalCreated} icon={<BookOpen size={16}/>}/>
              <StatCard label="Total Students" value={stats.totalStudents} icon={<Users size={16}/>}/>
              <StatCard label="Pending Graded" value={stats.pendingCount} icon={<Clock size={16}/>}/>
              <StatCard label="Successful Graded" value={stats.completedCount} icon={<CheckCircle size={16}/>}/>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
              <div className="lg:col-span-2 qc-card">
                <h3 className="font-semibold mb-5 flex items-center gap-2"><TrendingUp className="accent-text" size={18}/> Activity Insights</h3>
                <div style={{ width:'100%', height:300 }}>
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

              <div className="qc-card flex flex-col items-center justify-center">
                <h3 className="font-semibold mb-1">Grading Progress</h3>
                <p className="theme-muted text-xs mb-4">Click a slice for details</p>

                {activePieIndex !== null && (
                  <div className={`mb-4 px-6 py-3 rounded-2xl border text-center ${activePieIndex === 0 ? 'accent-soft' : 'accent-soft'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{pieData[activePieIndex].name} Submissions</p>
                    <p className="text-3xl font-black accent-text">{pieData[activePieIndex].value}</p>
                  </div>
                )}

                <div style={{ width:'100%', minWidth:0, height:220, minHeight:220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius={55} outerRadius={75} paddingAngle={8} dataKey="value"
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
                <div className="flex gap-4 mt-4">
                  <LegendItem color="bg-slate-500"   label="Pending"/>
                  <LegendItem color="bg-emerald-500" label="Graded"/>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ CREATE TAB ══ */}
        {activeTab === 'create' && (
          <div className="max-w-3xl">
            <div className="qc-page-header">
              <div>
                <h2 className="qc-page-title">{editingId ? 'Update Assignment' : 'New Assignment'}</h2>
                <p className="qc-page-subtitle">Define the task, deadline, and supporting materials.</p>
              </div>
            </div>
            <form onSubmit={handleCreateOrUpdate} className="qc-card space-y-5 sm:space-y-6">
              <div>
                <label className="qc-label">Assignment Title</label>
                <input type="text" className="qc-input" value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="e.g. System Design Analysis"/>
              </div>
              <div>
                <label className="qc-label">Total Marks</label>
                <input type="number" min="1" className="qc-input" value={form.points} onChange={e => setForm({...form, points:e.target.value})} placeholder="e.g. 30" />
                <p className="text-[9px] text-slate-500 mt-2">Students will see their score as obtained / this total only after grading.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="qc-label">Start Date</label>
                  <input type="datetime-local" className="qc-input" value={form.startDate} onChange={e => setForm({...form, startDate:e.target.value})}/>
                </div>
                <div>
                  <label className="qc-label">Deadline Date</label>
                  <input type="datetime-local" className="qc-input" value={form.deadline} onChange={e => setForm({...form, deadline:e.target.value})}/>
                </div>
              </div>
              <div>
                <label className="qc-label">Description</label>
                <textarea className="qc-input !h-36 resize-none" value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Instructions..."/>
              </div>
              <div className="border-2 border-dashed border-slate-800 rounded-2xl p-6 sm:p-10 text-center cursor-pointer hover:bg-sky-500/5 transition-all" onClick={() => fileInputRef.current.click()}>
                <input type="file" ref={fileInputRef} className="hidden" accept={ACADEMIC_ACCEPT} onChange={handleFileChange}/>
                {form.file ? (
                  <div className="flex items-center justify-center gap-3 text-sky-400 font-bold text-sm">
                    <CheckCircle size={24}/> {form.file.name}
                    <X className="text-slate-500 hover:text-white" onClick={e => { e.stopPropagation(); setForm({...form, file:null}); }}/>
                  </div>
                ) : form.existingFileName ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle size={28} className="accent-text"/>
                    <p className="font-bold text-sm">Current file: {form.existingFileName}</p>
                    <div className="flex gap-3 text-[10px] font-black uppercase">
                      <button type="button" className="accent-text" onClick={async (e) => { e.stopPropagation(); try { await openProtectedPreview(teacherService.previewAssignment(form.existingFileId), form.existingFileName); } catch (err) { alert(err.message); } }}>Preview current</button>
                      <span className="theme-muted">Click this box to replace it</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileUp size={32} className="text-slate-600"/>
                    <p className="text-white font-bold text-sm">Upload Reference File</p>
                  </div>
                )}
              </div>
              <button type="submit" className="qc-btn qc-btn-primary qc-btn-block !py-3.5">
                {editingId ? 'Update Assignment' : 'Upload Assignment'}
              </button>
            </form>
          </div>
        )}

        {/* ══ ASSIGNMENTS TAB ══ */}
        {activeTab === 'assignments' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
              <h1 className="qc-page-title">My Assignments</h1>
              <div className="qc-list-toolbar">
                {assignmentShelf === 'active' && (
                  <button
                    type="button"
                    onClick={handleArchiveAllAssignments}
                    disabled={!assignments.some((a) => a.status !== 'archived')}
                    className="qc-chat-toolbar-btn"
                  >
                    <BookOpen size={13} aria-hidden="true" /> Archive All
                  </button>
                )}
                <button
                  type="button"
                  className={`qc-manage-toggle ${manageAssignments ? 'is-active' : ''}`}
                  onClick={() => {
                    if (manageAssignments) {
                      setManageAssignments(false);
                      setSelectedAssignments([]);
                    } else {
                      setManageAssignments(true);
                    }
                  }}
                  aria-pressed={manageAssignments}
                >
                  <ListChecks size={14} aria-hidden="true" />
                  {manageAssignments ? 'Done' : 'Manage'}
                </button>
                {manageAssignments && (
                  <>
                    <label className="text-[10px] font-black uppercase theme-muted flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={
                          visibleAssignments.length > 0 &&
                          visibleAssignments.every((a) => isAssignmentSelected(selectedAssignments, a._id))
                        }
                        onChange={(e) =>
                          setSelectedAssignments(
                            e.target.checked
                              ? visibleAssignments.map((a) => normalizeAssignmentId(a._id)).filter(Boolean)
                              : []
                          )
                        }
                      />
                      Select all
                    </label>
                    <span className="qc-chat-selection-count" aria-live="polite">
                      {selectedAssignments.length} selected
                    </span>
                    {assignmentShelf === 'active' && (
                      <button
                        type="button"
                        onClick={handleArchiveSelectedAssignments}
                        disabled={!selectedAssignments.length}
                        className="qc-chat-toolbar-btn"
                      >
                        <BookOpen size={13} aria-hidden="true" /> Archive Selected
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDeleteSelectedAssignments}
                      disabled={!selectedAssignments.length}
                      className="qc-chat-toolbar-btn danger"
                    >
                      <Trash2 size={13} aria-hidden="true" /> Delete selected
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-6" role="tablist" aria-label="Assignment shelf">
              <button
                type="button"
                role="tab"
                aria-selected={assignmentShelf === 'active'}
                className={`qc-filter-chip ${assignmentShelf === 'active' ? 'is-active' : ''}`}
                onClick={() => { setAssignmentShelf('active'); setSelectedAssignments([]); }}
              >
                Active ({assignments.filter((a) => a.status !== 'archived').length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={assignmentShelf === 'archived'}
                className={`qc-filter-chip ${assignmentShelf === 'archived' ? 'is-active' : ''}`}
                onClick={() => { setAssignmentShelf('archived'); setSelectedAssignments([]); }}
              >
                Archived ({assignments.filter((a) => a.status === 'archived').length})
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {visibleAssignments.map((asgn) => {
                const isArchived = asgn.status === 'archived';
                const isOverdue = !isArchived && new Date(asgn.deadline) < new Date();
                const displayStatus = isArchived
                  ? 'archived'
                  : (isOverdue ? 'deactive' : (asgn.status || 'active'));
                const assignmentId = normalizeAssignmentId(asgn._id);
                const overflowItems = isArchived
                  ? [{
                      id: `restore-assignment-${assignmentId}`,
                      label: 'Restore Assignment',
                      icon: <RotateCcw size={14} />,
                      onSelect: () => handleRestoreAssignment(asgn._id),
                    }, {
                      id: `delete-assignment-${assignmentId}`,
                      label: 'Delete Assignment',
                      danger: true,
                      icon: <Trash2 size={14} />,
                      onSelect: () => handleDeleteAssignment(asgn._id),
                    }]
                  : [{
                      id: `archive-assignment-${assignmentId}`,
                      label: 'Archive Assignment',
                      icon: <BookOpen size={14} />,
                      onSelect: () => handleArchiveAssignment(asgn._id),
                    }, {
                      id: `delete-assignment-${assignmentId}`,
                      label: 'Delete Assignment',
                      danger: true,
                      icon: <Trash2 size={14} />,
                      onSelect: () => handleDeleteAssignment(asgn._id),
                    }];
                return (
                  <div key={assignmentId || asgn._id} className="qc-card flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center hover:border-sky-500/30 transition-all">
                    <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                      {manageAssignments && (
                        <input
                          type="checkbox"
                          aria-label={`Select assignment ${asgn.title || assignmentId}`}
                          checked={isAssignmentSelected(selectedAssignments, assignmentId)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() =>
                            setSelectedAssignments((prev) =>
                              toggleAssignmentSelection(prev, assignmentId)
                            )
                          }
                        />
                      )}
                      <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold text-base sm:text-lg break-words">{asgn.title}</h3>
                      <div className="flex flex-col gap-1 mt-2">
                        <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black flex items-center gap-1">
                          <Clock size={12}/> Created: {new Date(asgn.createdAt).toLocaleString()}
                        </p>
                        <p className={`text-[10px] uppercase tracking-widest font-black flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                          <Clock size={12}/> Deadline: {new Date(asgn.deadline).toLocaleString()}
                        </p>
                        {isArchived && (
                          <p className="text-[10px] uppercase tracking-widest font-black text-amber-400">Archived — hidden from students</p>
                        )}
                      </div>
                    </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                      {asgn.file && <button type="button" onClick={async()=>{try{await openProtectedPreview(teacherService.previewAssignment(asgn._id), asgn.originalFileName || 'assignment');}catch(e){alert(e.message);}}} className="p-2 text-slate-400 hover:text-sky-400" title="Open inside browser" aria-label="Open assignment file"><Eye size={18}/></button>}
                      {asgn.file && <button type="button" onClick={async()=>{try{await downloadProtectedFile(teacherService.downloadAssignment(asgn._id),asgn.originalFileName||"assignment");}catch(e){alert(e.message);}}} className="p-2 text-slate-400 hover:text-sky-400" title="Download original reference file" aria-label="Download assignment file"><Download size={18}/></button>}
                      {!isArchived && (
                        <button type="button" onClick={() => handleEditSetup(asgn)} className="p-2 text-slate-400 hover:text-sky-400" aria-label="Edit assignment"><Edit3 size={18}/></button>
                      )}
                      {!isArchived && (
                        <button type="button" onClick={() => handleStatusToggle(asgn._id, displayStatus)} disabled={isOverdue} className={`px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase border tracking-widest transition-all ${displayStatus==='deactive' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-sky-500/10 text-sky-500 border-sky-500/20 hover:bg-sky-500 hover:text-white'} ${isOverdue ? 'cursor-not-allowed opacity-70' : ''}`}>
                          {displayStatus === 'deactive' ? 'Deactive' : 'Active'}
                        </button>
                      )}
                      <OverflowMenu
                        label={`More actions for ${asgn.title || 'assignment'}`}
                        items={overflowItems}
                      />
                    </div>
                  </div>
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
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col gap-6 mb-8">
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
                <div>
                  <h1 className="qc-page-title">Submissions</h1>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">
                    Selected: <span className={selectedSubmissions.length >= 40 ? 'text-red-500' : 'text-sky-500'}>{selectedSubmissions.length}</span> / 40
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {selectedSubmissions.length > 0 && (
                    <>
                      <button type="button" onClick={handleAiEvaluation} disabled={aiLoading} className="bg-sky-500 hover:bg-sky-400 text-white px-4 sm:px-6 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-lg shadow-sky-500/20">
                        {aiLoading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                        AI Evaluate
                      </button>
                      <button type="button" onClick={handlePlagiarismCheck} disabled={checkingPlagiarism} className="bg-sky-500 hover:bg-sky-400 text-white px-4 sm:px-6 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all">
                        {checkingPlagiarism ? <Loader2 size={14} className="animate-spin"/> : <ShieldAlert size={14}/>}
                        Check Plagiarism
                      </button>
                      <button type="button" onClick={handlePublishBulk} disabled={isPublishing} className="bg-emerald-500 hover:bg-emerald-400 text-white px-4 sm:px-6 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                        {isPublishing ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
                        Publish Marks
                      </button>
                      <button type="button" onClick={handleResetSelectedGrades} className="bg-slate-600 hover:bg-slate-500 text-white px-4 sm:px-5 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2"><RotateCcw size={14}/> Reset grades</button>
                      <button type="button" onClick={handleDeleteSelectedSubmissions} className="qc-chat-toolbar-btn danger !min-h-10 !px-4"><Trash2 size={14}/> Delete selected</button>
                    </>
                  )}
                </div>
              </div>

              {/* Grading Instructions */}
              <div className="qc-card flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sky-400 font-black text-[10px] uppercase tracking-widest">
                  <MessageSquare size={14}/> Grading Instructions for AI
                </div>
                <textarea
                  value={aiInstructions}
                  onChange={e => setAiInstructions(e.target.value)}
                  className="w-full theme-input border rounded-xl p-4 text-sm h-20 resize-none outline-none"
                  placeholder="Example: Evaluate out of 30 marks. Check correctness, completeness and clarity."
                />
                {/* Reference file attach */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest shrink-0">
                    <FileUp size={14}/> Attach Reference File (Optional)
                  </div>
                  <div
                    className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg theme-page border border-slate-700 hover:border-sky-500/50 transition-all min-w-0"
                    onClick={() => multimediaInputRef.current.click()}
                  >
                    <input type="file" ref={multimediaInputRef} className="hidden" accept="*/*" multiple onChange={handleMultimediaChange}/>
                    {multimediaFiles.length ? (
                      <div className="flex items-center gap-2 text-sky-400 text-[10px] font-bold min-w-0">
                        <CheckCircle size={12}/>
                        <span className="max-w-[min(220px,50vw)] truncate">{multimediaFiles.length} file(s) selected</span>
                        <X size={12} className="text-slate-500 hover:text-white shrink-0" onClick={e => { e.stopPropagation(); setMultimediaFiles([]); if (multimediaInputRef.current) multimediaInputRef.current.value = null; }}/>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[10px] font-bold">Choose reference files</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Submissions Table */}
            <div className="qc-table-wrap">
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full min-w-[900px] text-left border-collapse">
                  <thead className="theme-page sticky top-0 z-10 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-800">
                    <tr>
                      <th className="p-5 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={selectedSubmissions.length > 0 && selectedSubmissions.length === submissions.slice(0, 40).length}
                          onChange={e => handleSelectAll(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-800 theme-page accent-sky-500"
                        />
                      </th>
                      <th className="p-5">Student</th>
                      <th className="p-5">Assignment</th>
                      <th className="p-5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            aria-label="Select all question files for AI"
                            title="Select/deselect all available question files for AI"
                            checked={submissions.filter((item) => item.assignment?.file).length > 0 && submissions.filter((item) => item.assignment?.file).every((item) => selectedQuestionAssignments.includes(String(item.assignment._id)))}
                            onChange={(e) => {
                              const available = [...new Set(submissions.filter((item) => item.assignment?.file).map((item) => String(item.assignment._id)))];
                              setSelectedQuestionAssignments(e.target.checked ? available : []);
                            }}
                            className="w-4 h-4 accent-sky-500"
                          />
                          <span>Question file (optional for AI)</span>
                        </div>
                      </th>
                      <th className="p-5">Score (AI / Final)</th>
                      <th className="p-5">Status</th>
                      <th className="p-5 text-center">Review</th>
                      <th className="p-5 text-center">More</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {submissions.map((sub) => (
                      // ✅ FIX 1: key={sub._id} instead of key={i} — fixes React re-render bug
                      <tr key={sub._id} className={`hover:bg-white/5 transition-colors ${selectedSubmissions.includes(sub._id) ? 'bg-sky-500/5' : ''}`}>
                        <td className="p-5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedSubmissions.includes(sub._id)}
                            onChange={() => toggleSelect(sub._id)}
                            className="w-4 h-4 rounded border-slate-800 theme-page accent-sky-500"
                          />
                        </td>

                        {/* ✅ FIX 2: Clean student name + regNo logic */}
                        <td className="p-5">
                          <p className="font-bold text-white text-sm">
                            {sub.student?.name || 'Unknown'}
                          </p>
                          <p className="text-[10px] text-sky-500 font-black tracking-widest uppercase">
                            Reg No: {sub.student?.registrationNumber || 'Not assigned'}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 break-all">
                            {sub.student?.email || 'Email not available'}
                          </p>
                        </td>

                        {/* ✅ FIX 4: Clean assignment title */}
                        <td className="p-5 text-slate-400 text-sm">
                          {sub.assignment?.title || 'Untitled'}
                        </td>
                        <td className="p-5">
                          {sub.assignment?.file ? <div className="flex items-center gap-2">
                            <input type="checkbox" checked={selectedQuestionAssignments.includes(String(sub.assignment._id))} onChange={() => setSelectedQuestionAssignments((prev) => prev.includes(String(sub.assignment._id)) ? prev.filter((x) => x !== String(sub.assignment._id)) : [...prev, String(sub.assignment._id)])}/>
                            <button type="button" className="accent-text text-[10px] font-black uppercase" onClick={async()=>{try{await openProtectedPreview(teacherService.previewAssignment(sub.assignment._id),sub.assignment.originalFileName||'question');}catch(e){alert(e.message);}}}>Open question</button>
                          </div> : <span className="theme-muted text-[10px]">No file</span>}
                        </td>

                        {/* Scores are hidden until teacher/AI has actually checked the submission */}
                        <td className="p-5">
                          {['graded','GRADED','PUBLISHED','AI_GRADED','Graded'].includes(sub.status) ? (
                            <div className="flex flex-col items-start gap-1 min-w-0 whitespace-nowrap">
                              <span className="text-xs font-black accent-text">AI Marks: {sub.aiScore != null ? `${sub.aiScore}/${sub.totalMarks || sub.assignment?.points || '--'}` : `--/${sub.totalMarks || sub.assignment?.points || '--'}`}</span>
                              <span className="text-xs font-black" style={{color: 'var(--text)'}}>Teacher Marks: {sub.marks != null ? `${sub.marks}/${sub.totalMarks || sub.assignment?.points || '--'}` : `--/${sub.totalMarks || sub.assignment?.points || '--'}`}</span>
                            </div>
                          ) : sub.status === 'AI_PROCESSING' ? (
                            <span className="theme-muted text-[10px] font-black uppercase">AI grading…</span>
                          ) : <span className="theme-muted text-[10px] font-black uppercase">Not graded</span>}
                        </td>

                        {/* Status badge */}
                        <td className="p-5">
                          <span className={`px-2 py-1 rounded text-[10px] font-black ${
                            sub.status === 'PUBLISHED'                            ? 'bg-emerald-500/20 text-emerald-500' :
                            sub.status === 'AI_GRADED'                            ? 'bg-sky-500/20 text-sky-400'        :
                            sub.status === 'AI_PROCESSING'                        ? 'bg-sky-500/20 text-sky-400'        :
                            ['graded','GRADED'].includes(sub.status)              ? 'bg-sky-500/20 text-sky-400'        :
                            sub.status === 'submitted'                            ? 'bg-slate-500/20 text-slate-400'    :
                                                                                    'bg-slate-500/20 text-slate-400'
                          }`}>
                            {sub.status === 'AI_PROCESSING'            ? 'AI PROCESSING' :
                             sub.status === 'AI_GRADED'                ? 'AI GRADED / REVIEW' :
                             sub.status === 'PUBLISHED'                ? 'PUBLISHED' :
                             ['graded','GRADED'].includes(sub.status)  ? 'TEACHER REVIEWED' :
                             sub.status === 'submitted'                ? 'SUBMITTED' : 'NOT GRADED'}
                          </span>
                        </td>

                        {/* Eye button — always visible */}
                        <td className="p-5 text-center">
                          <button onClick={() => openReviewModal(sub)} className="p-2 text-slate-400 hover:text-sky-400 transition-colors" title="Review Evaluation"><Eye size={18}/></button>
                          <button onClick={async()=>{try{await openProtectedPreview(teacherService.previewSubmission(sub._id),sub.originalFileName||'submission');}catch(e){alert(e.message);}}} className="p-2 text-slate-400 hover:text-emerald-400" title="Open submitted file"><FileText size={17}/></button>
                        </td>
                        <td className="p-5 text-center">
                          <OverflowMenu
                            label={`Actions for submission ${sub.student?.name || sub._id}`}
                            items={[{
                              id: `delete-submission-${sub._id}`,
                              label: 'Delete submission',
                              danger: true,
                              icon: <Trash2 size={14} />,
                              onSelect: () => handleDeleteSubmission(sub._id),
                            }]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {submissions.length === 0 && <NoDataMessage icon={<ClipboardCheck size={40}/>} message="No student submissions yet."/>}
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
              <button type="button" onClick={handlePlagiarismCheck} disabled={checkingPlagiarism || selectedSubmissions.length === 0} className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 shrink-0 self-start">
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
                <div key={st._id} className="qc-card flex items-center gap-4 hover:border-sky-50 transition-all group">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-[#020617] flex items-center justify-center text-sky-500 font-black text-xl border border-slate-800 shadow-xl">
                    {(st.name || st.studentName)?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold text-sm group-hover:text-sky-400">{st.name || st.studentName}</h4>
                    <p className="text-[10px] text-sky-500 font-black tracking-widest uppercase">
                      Roll / Reg No: {st.registrationNumber || st.regNo || st.studentRegNo || 'Not assigned'}
                    </p>
                    <p className="text-[11px] text-slate-400 break-all mt-1">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto">
          <div className="theme-card border w-full max-w-2xl rounded-t-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 max-h-[94dvh] sm:max-h-[90vh] flex flex-col my-0 sm:my-auto">

            <div className="p-4 sm:p-8 border-b border-slate-800 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 theme-surface shrink-0">
              <div className="min-w-0">
                <h2 className="text-white font-black text-lg sm:text-xl tracking-tighter uppercase">Review Evaluation</h2>
                <p className="text-sky-500 text-[10px] font-black uppercase tracking-widest break-words">
                 {selectedReview.student?.name || selectedReview.studentName || 'Unknown'}

               {/* ✅ FIXED: Safe regNo fallback */}
              {(selectedReview.student?.registrationNumber || selectedReview.studentRegNo) && (
            <span className="ml-2 text-slate-500">
            — {selectedReview.student?.registrationNumber || selectedReview.studentRegNo}
              </span>
                )}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 sm:gap-4">
                  <button type="button" onClick={async () => { try { await openProtectedPreview(teacherService.previewSubmission(selectedReview._id), selectedReview.originalFileName || 'student-submission'); } catch (error) { alert(error.message); } }} className="text-[10px] font-black uppercase accent-text flex items-center gap-2"><Eye size={14}/> Open file</button>
                  <button type="button" onClick={async () => { try { await downloadProtectedFile(teacherService.downloadSubmission(selectedReview._id), selectedReview.originalFileName || 'student-submission'); } catch (error) { alert(error.message); } }} className="text-[10px] font-black uppercase accent-text flex items-center gap-2"><Download size={14}/> Download file</button>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
              <button type="button" onClick={() => handleResetSubmissionGrade(selectedReview._id)} className="rounded-lg border border-slate-500/40 px-3 py-2 text-[9px] font-black uppercase text-slate-400 hover:bg-slate-500/10" title="Clear current grading to allow regrading">Reset grade</button>
              <button type="button" onClick={() => setReviewModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white" aria-label="Close review dialog">
                <X size={24}/>
              </button>
              </div>
            </div>

            <div className="p-4 sm:p-8 overflow-y-auto space-y-6 min-h-0 flex-1">
              <div className="theme-page p-4 sm:p-6 rounded-2xl border border-slate-800">
                <h4 className="text-slate-500 font-black text-[10px] uppercase tracking-widest mb-3">Student answer</h4>
                {reviewContent.loading ? (
                  <p className="text-slate-400 text-sm">Loading submission text…</p>
                ) : (
                  <pre className="text-white text-sm leading-relaxed whitespace-pre-wrap break-words font-sans max-h-48 overflow-y-auto">
                    {reviewContent.text || 'No readable text found. Open or download the file if this was a binary upload.'}
                  </pre>
                )}
              </div>

              {/* AI Feedback */}
              <div className="theme-page p-4 sm:p-6 rounded-2xl border border-slate-800">
                <h4 className="text-slate-500 font-black text-[10px] uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Sparkles size={14} className="text-sky-500"/> AI Feedback
                </h4>
                <p className="text-white text-sm leading-relaxed italic break-words">
                  {selectedReview.aiFeedback || 'No AI feedback available yet'}
                </p>
                {!!reviewContent.strengths?.length && (
                  <div className="mt-4">
                    <p className="text-[9px] font-black uppercase text-emerald-400 mb-1">Strengths</p>
                    <ul className="list-disc pl-5 text-sm text-slate-200 space-y-1">
                      {reviewContent.strengths.map((item, idx) => <li key={`s-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {!!reviewContent.improvements?.length && (
                  <div className="mt-4">
                    <p className="text-[9px] font-black uppercase text-amber-400 mb-1">Improvements</p>
                    <ul className="list-disc pl-5 text-sm text-slate-200 space-y-1">
                      {reviewContent.improvements.map((item, idx) => <li key={`i-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Scores */}
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Maximum marks: {selectedReview.totalMarks || selectedReview.assignment?.points || 'Not set'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="theme-page p-4 rounded-2xl border border-slate-800 text-center">
                  <p className="theme-muted font-black text-[10px] uppercase tracking-widest mb-1">AI Marks</p>
                  <p className="text-2xl font-black text-sky-500">
                    {selectedReview.aiScore ?? '--'}
                    <span className="text-sm text-slate-500 font-bold ml-1">{selectedReview.aiScore != null ? `/ ${selectedReview.totalMarks || selectedReview.assignment?.points || '--'}` : ''}</span>
                  </p>
                </div>
                <div className="theme-page p-4 rounded-2xl border border-emerald-500/30 text-center">
                  <p className="theme-muted font-black text-[10px] uppercase tracking-widest mb-1">Teacher Marks</p>
                  <input
                    type="number"
                    value={manualScore}
                    onChange={e => setManualScore(e.target.value)}
                    min="0"
                    max={selectedReview.totalMarks || selectedReview.assignment?.points || undefined}
                    className="w-24 max-w-full bg-transparent text-center text-2xl font-black accent-text outline-none border-b"
                    style={{borderColor: 'var(--accent)'}}
                    placeholder="Enter marks"
                  />
                </div>
              </div>

              {/* Teacher Note */}
              <div className="space-y-2">
                <label className="text-slate-500 font-black text-[10px] uppercase tracking-widest block">Teacher's Private Note/Feedback</label>
                <textarea
                  value={teacherNote}
                  onChange={e => setTeacherNote(e.target.value)}
                  className="w-full theme-input border rounded-2xl p-4 text-sm h-28 outline-none"
                  placeholder="Add your own feedback here..."
                />
              </div>
            </div>

            <div className="p-4 sm:p-8 theme-surface border-t border-slate-800 flex flex-col sm:flex-row gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleSaveEvaluation(false)}
                disabled={savingEval}
                className="flex-1 border border-slate-600 text-slate-200 font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all disabled:opacity-60"
              >
                Save teacher grade
              </button>
              <button
                type="button"
                onClick={handlePublishAiResult}
                disabled={savingEval || selectedReview.aiScore == null}
                className="flex-1 bg-sky-500 text-black font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-sky-400 transition-all disabled:opacity-60"
              >
                Publish AI result
              </button>
              <button
                type="button"
                onClick={() => handleSaveEvaluation(true)}
                disabled={savingEval}
                className="flex-1 bg-emerald-500 text-black font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] hover:bg-emerald-400 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingEval && <Loader2 size={14} className="animate-spin"/>}
                Save & Publish
              </button>
            </div>

          </div>
        </div>
      )}

    </DashboardNavShell>
  );
}
