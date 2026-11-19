import React, { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {

  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,

  Cell, PieChart, Pie, Legend

} from 'recharts';

import {

  BookOpen, CheckCircle, Clock, FileUp, Layout,

  Award, Loader2, Download, Eye, X, FileText, Activity, TrendingUp,

  Sparkles, Info, Layers, Folder, CalendarDays, UserRound

} from 'lucide-react';

import studentService from '../../services/studentService';
import {
  ACADEMIC_ACCEPT,
  assertAcademicFile,
  uploadDurableFile,
} from '../../services/r2UploadService';

import SidebarControls from '../../components/common/SidebarControls';

import DashboardNavShell from '../../components/common/DashboardNavShell';

import DashboardNavItem from '../../components/common/DashboardNavItem';

import DashboardTopBar from '../../components/common/DashboardTopBar';

import ProfilePage from '../account/ProfilePage';

import SettingsPage from '../account/SettingsPage';

import AIChatbot from '../../components/common/AIChatbot';

import MessagePanel from '../../components/common/MessagePanel';

import SearchField from '../../components/ui/SearchField';
import OverflowMenu from '../../components/ui/OverflowMenu';

import { sortAssignmentsByDueDate } from '../../utils/assignmentSort';
import {
  studentActivityState,
  countActiveStudentAssignments,
} from '../../utils/studentAssignmentActivity';

import { downloadProtectedFile, openProtectedPreview } from '../../services/fileService';
import FileLink from '../../components/files/FileLink';



export default function StudentDashboard() {

  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('Overview');

  const [shellView, setShellView] = useState('main');

  const [selectedAsgn, setSelectedAsgn] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all");

  const [assignmentSort, setAssignmentSort] = useState("due-asc");

  const [uploadStatus, setUploadStatus] = useState({ id: null, loading: false, success: false });

  // Assignment id for which the inline duplicate-submit notice is visible (null = hidden).
  const [duplicateNoticeId, setDuplicateNoticeId] = useState(null);



  const userName = localStorage.getItem("userName") || "Student";

  const userRegNo = localStorage.getItem("userRegNo") || "Not Assigned";



  const [studentData, setStudentData] = useState({

    name: userName,

    regNo: userRegNo,

    tasksCompleted: 0,

    performanceHistory: [],

    gradeDistribution: [],

    subjectWise: []

  });

  const [assignments, setAssignments] = useState([]);

  const [checkedResults, setCheckedResults] = useState([]);



  useEffect(() => {

    const token = localStorage.getItem('token');

    if (!token) {

      navigate('/login');

      return;

    }

    fetchAllData();

  }, []);



  const fetchAllData = async () => {

    try {

      setLoading(true);

      const [stats, asgns, submissions] = await Promise.all([

        studentService.getDashboardStats(),

        studentService.getAssignments(),

        studentService.getMySubmissions(),

      ]);



      if (stats) setStudentData(prev => ({ ...prev, ...stats }));

      const assignmentRows = Array.isArray(asgns) ? asgns : [];
      const visibleAssignments = assignmentRows.filter((item) => item?.notOpenYet !== true);
      if (Array.isArray(asgns)) {
        setAssignments(visibleAssignments);
      }

      let mappedChecked = [];
      if (Array.isArray(submissions)) {
        mappedChecked = submissions
          // Only published result components are student-visible (API redacts unpublished fields).
          .filter((s) => {
            if (!s.assignment) return false;
            return (
              s.status === "PUBLISHED" ||
              s.resultStatus === "PUBLISHED" ||
              s.aiPublished === true ||
              s.teacherMarksPublished === true ||
              s.teacherFeedbackPublished === true ||
              s.aiScore != null ||
              s.marks != null ||
              Boolean(String(s.feedback || "").trim()) ||
              Boolean(String(s.aiFeedback || "").trim())
            );
          })
          .map((s) => {
            const assignment =
              s.assignment && typeof s.assignment === "object" ? s.assignment : {};
            const assignmentId = assignment._id || s.assignment;
            // Prefer populated assignment fields; fall back to the live assignments list.
            const fromList = assignmentRows.find(
              (item) => String(item._id) === String(assignmentId)
            );
            const startDate =
              assignment.startDate || s.startDate || fromList?.startDate || null;
            const deadline =
              assignment.deadline || s.deadline || fromList?.deadline || null;
            const questionName =
              assignment.originalFileName ||
              s.assignmentOriginalFileName ||
              fromList?.assignmentOriginalFileName ||
              fromList?.originalFileName ||
              "";
            const hasFile = Boolean(
              assignment.hasFile === true ||
                s.hasFile === true ||
                fromList?.hasFile === true ||
                questionName ||
                assignment.file ||
                fromList?.file
            );
            return {
              _id: assignmentId,
              title: assignment.title || fromList?.title || "Assignment",
              subject: assignment.subject || fromList?.subject || "",
              points: assignment.points ?? fromList?.points ?? null,
              startDate,
              deadline,
              // Keep AI and Teacher marks separate — never coalesce.
              marks: s.marks ?? null,
              aiScore: s.aiScore ?? null,
              totalMarks: s.totalMarks || assignment.points || fromList?.points || null,
              feedback: s.feedback || "",
              aiFeedback: s.aiFeedback || "",
              aiStrengths: s.aiStrengths || [],
              aiImprovements: s.aiImprovements || [],
              aiPublished: s.aiPublished === true,
              teacherMarksPublished: s.teacherMarksPublished === true,
              teacherFeedbackPublished: s.teacherFeedbackPublished === true,
              submissionId: s._id,
              originalFileName: questionName,
              assignmentOriginalFileName: questionName || (hasFile ? "assignment" : ""),
              submissionOriginalFileName:
                s.originalFileName || s.submissionOriginalFileName || "",
              hasFile,
              // Published results remain accessible for question/submission files.
              canAccessMaterials: true,
              notOpenYet: false,
              status: s.status,
              resultStatus: s.resultStatus || s.status,
              checkedAt: s.updatedAt || s.createdAt,
              isSubmitted: true,
            };
          });

        setCheckedResults(mappedChecked);
        setSelectedResultIds([]);
      }

      setSelectedAsgn((previous) => {
        if (!previous) return previous;
        // Checked-result modal: refresh from mapped results so dates/files stay intact.
        if (previous.submissionId) {
          const freshChecked = mappedChecked.find(
            (item) => String(item.submissionId) === String(previous.submissionId)
          );
          return freshChecked || previous;
        }
        const fresh = visibleAssignments.find(
          (item) => String(item._id) === String(previous._id)
        );
        return fresh || null;
      });

    } catch (err) {

      console.error("Dashboard Sync Error:", err);

      if (err.response?.status === 401) {

        handleLogout();

      }

    } finally {

      setLoading(false);

    }

  };



  const showAlreadySubmittedNotice = (assignmentId) => {
    const id = assignmentId?._id || assignmentId;
    if (!id) return;
    // One anchored notice on the matching card only — never a banner or global toast.
    setDuplicateNoticeId(String(id));
  };

  // Clear when leaving the current dashboard view / tab.
  useEffect(() => {
    setDuplicateNoticeId(null);
  }, [activeTab, shellView]);

  // Auto-dismiss after 3s; clear timer on dismiss, assignment change, or unmount.
  useEffect(() => {
    if (!duplicateNoticeId) return undefined;
    const timer = setTimeout(() => setDuplicateNoticeId(null), 3000);
    return () => clearTimeout(timer);
  }, [duplicateNoticeId]);

  const handleFileUpload = async (e, asgnId) => {

    const input = e.target;
    const file = input.files?.[0];

    if (!file) return;

    const current = assignments.find((item) => String(item._id) === String(asgnId));
    const alreadySubmitted = Boolean(
      current &&
      (current.canSubmit === false ||
        current.isSubmitted ||
        current.submissionId ||
        ["submitted", "published"].includes(String(current.status || "").toLowerCase()))
    );
    // Backend does not allow resubmission while a submission exists.
    if (alreadySubmitted && current?.canSubmit !== true) {
      input.value = "";
      showAlreadySubmittedNotice(asgnId);
      return;
    }

    try {
      assertAcademicFile(file);
    } catch (err) {
      alert(err.message || `Error: file not allowed.`);
      input.value = "";
      return;
    }

    if (!localStorage.getItem('token')) {

      alert("Session expired. Please login again.");

      handleLogout();

      return;

    }



    setUploadStatus({ id: asgnId, loading: true, success: false });

    const formData = new FormData();

    try {
      // Direct-to-R2 for durable submissions (shared bucket locally + on Vercel).
      const durable = await uploadDurableFile(file, 'submissions');
      formData.append('storedFileKey', durable.storedFileKey);
      formData.append('originalFileName', durable.originalFileName || '');
      formData.append('fileMimeType', durable.fileMimeType || '');
      formData.append('fileSize', String(durable.fileSize || ''));
    } catch (uploadErr) {
      const uploadStatus = uploadErr?.response?.status;
      const uploadMessage = uploadErr?.response?.data?.message;
      alert(
        uploadStatus && uploadStatus < 500 && uploadMessage
          ? uploadMessage
          : !uploadErr?.response && uploadErr?.message && !/network|axios|failed to fetch/i.test(uploadErr.message)
            ? uploadErr.message
            : 'Unable to upload file. Please try again.'
      );
      setUploadStatus({ id: null, loading: false, success: false });
      input.value = "";
      return;
    }

    try {

      const result = await studentService.submitAssignment(asgnId, formData);

      const submission = result?.submission;

      const submittedPatch = {
        isSubmitted: true,
        canSubmit: false,
        status: 'submitted',
        availabilityLabel: 'Awaiting evaluation',
        submissionId: submission?._id || null,
        // Keep assignment.originalFileName; store the student's upload name separately.
        submissionOriginalFileName: submission?.originalFileName || '',
        marks: null,
        aiScore: null,
        feedback: '',
        aiFeedback: '',
      };

      // Immediate card update from authenticated response; fetchAllData remains source of truth.
      setAssignments((previous) =>
        previous.map((item) =>
          String(item._id) === String(asgnId) ? { ...item, ...submittedPatch } : item
        )
      );
      setSelectedAsgn((previous) =>
        previous && String(previous._id) === String(asgnId)
          ? { ...previous, ...submittedPatch }
          : previous
      );

      setDuplicateNoticeId((previous) =>
        previous && String(previous) === String(asgnId) ? null : previous
      );
      setUploadStatus({ id: asgnId, loading: false, success: true });

      await fetchAllData();

      setTimeout(() => setUploadStatus({ id: null, loading: false, success: false }), 3000);

    } catch (err) {

      const errCode = err.response?.data?.code;
      const errStatus = err.response?.status;
      const errMsg = err.response?.data?.message || "";
      const isDuplicate =
        errCode === "ALREADY_SUBMITTED" ||
        /already submitted/i.test(String(errMsg));

      if (isDuplicate) {
        showAlreadySubmittedNotice(asgnId);
        await fetchAllData();
      } else {
        alert(errStatus && errStatus < 500 && errMsg ? errMsg : "Unable to submit. Please try again.");
      }

      setUploadStatus({ id: null, loading: false, success: false });

    } finally {
      input.value = "";
    }

  };



  const handleLogout = () => {

    localStorage.clear();

    navigate('/login');

  };



  const totalCount = assignments.length;

  const gradedCount = assignments.filter(a => a.status === 'PUBLISHED').length;

  const submittedCount = assignments.filter(a => a.status === 'submitted' || a.status === 'Submitted').length;

  const pendingCount = assignments.filter(a => a.status === 'pending' || !a.status).length;

  const checkedAssignments = checkedResults.length
    ? checkedResults
    : assignments.filter((a) => a.status === 'PUBLISHED');

  const filteredSortedAssignments = sortAssignmentsByDueDate(
    assignments.filter((asgn) => {
      const titleOk = String(asgn.title || "").toLowerCase().includes(searchTerm.toLowerCase());
      if (!titleOk) return false;
      const status = String(asgn.status || "pending");
      if (assignmentStatusFilter === "all") return true;
      if (assignmentStatusFilter === "pending") return status === "pending" || !asgn.status;
      if (assignmentStatusFilter === "submitted") return status === "submitted" || status === "Submitted";
      if (assignmentStatusFilter === "PUBLISHED") return status === "PUBLISHED";
      return true;
    }),
    assignmentSort
  );

  const totalAssignmentCount = assignments.length;
  // Must match ACTIVE badges on cards (schedule window), not submission status.
  const activeAssignmentCount = countActiveStudentAssignments(assignments);

  const totalVsPendingData = [

    { name: 'Completed/Submitted', value: submittedCount + gradedCount },

    { name: 'Pending Action', value: pendingCount }

  ];



  const gradedPerformanceData = [

    { name: 'Total Assignments', count: totalCount },

    { name: 'Graded (Results)', count: gradedCount }

  ];





  const publishedScoreForChart = (item) => {
    if (item?.teacherMarksPublished === true && item.marks != null) return Number(item.marks);
    if (item?.aiPublished === true && item.aiScore != null) return Number(item.aiScore);
    if (item?.marks != null) return Number(item.marks);
    if (item?.aiScore != null) return Number(item.aiScore);
    return NaN;
  };

  const realPerformanceData = checkedResults

    .filter((item) => Number.isFinite(publishedScoreForChart(item)))

    .slice()

    .sort((a, b) => new Date(a.checkedAt || 0) - new Date(b.checkedAt || 0))

    .map((item) => ({
      name: item.title || 'Assignment',
      score: publishedScoreForChart(item),
      total: Number(item.totalMarks || item.points || 100),
    }));



  const realDistributionData = Array.isArray(studentData.gradeDistribution) && studentData.gradeDistribution.length

    ? studentData.gradeDistribution

    : totalVsPendingData;



  if (loading) return (

    <div className="h-screen theme-page flex items-center justify-center">

        <Loader2 className="animate-spin accent-text" size={40} />

    </div>

  );



  return (

    <DashboardNavShell

      widthClass="w-64"

      desktopMode="flow"

      mobileTitle="QuickCheck Hub"
      pageTitle={
        shellView === 'profile' ? 'My Profile'
          : shellView === 'settings' ? 'Settings'
          : (activeTab === 'Analytics' ? 'Performance' : activeTab)
      }

      headerActions={
        <DashboardTopBar
          role="student"
          onLogout={handleLogout}
          onOpenProfile={() => setShellView('profile')}
          onOpenSettings={() => setShellView('settings')}
        />
      }

      sidebar={

        <div className="p-6 flex flex-col flex-1 min-h-0">

          <div className="qc-sidebar-brand">
            <span className="qc-sidebar-brand__mark"><BookOpen size={18}/></span>
            <div>
              <span className="qc-sidebar-brand__text">QuickCheck Hub</span>
              <span className="qc-sidebar-brand__role">Student</span>
            </div>
          </div>

          <nav className="qc-sidebar-nav space-y-1" aria-label="Student navigation">

            <DashboardNavItem icon={<Layout size={18}/>} label="Overview" active={shellView === 'main' && activeTab === 'Overview'} onClick={() => { setShellView('main'); setActiveTab('Overview'); }} />

            <DashboardNavItem icon={<FileText size={18}/>} label="My Assignments" active={shellView === 'main' && activeTab === 'Assignments'} onClick={() => { setShellView('main'); setActiveTab('Assignments'); }} />

            <DashboardNavItem icon={<CheckCircle size={18}/>} label="Checked Results" active={shellView === 'main' && activeTab === 'Checked'} onClick={() => { setShellView('main'); setActiveTab('Checked'); }} />

            <DashboardNavItem icon={<TrendingUp size={18}/>} label="Performance" active={shellView === 'main' && activeTab === 'Analytics'} onClick={() => { setShellView('main'); setActiveTab('Analytics'); }} />

          </nav>



          <SidebarControls />

        </div>

      }

    >
        {shellView === 'profile' ? (
          <ProfilePage onBack={() => setShellView('main')} />
        ) : shellView === 'settings' ? (
          <SettingsPage role="student" onBack={() => setShellView('main')} />
        ) : (
        <>
        <header className="qc-page-header qc-student-heading">
            <div>
              <h1 className="qc-page-title">Dashboard</h1>
              <p className="qc-page-subtitle">Track assignments, submissions, and published results.</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold theme-muted uppercase tracking-wide">Roll Number</p>
              <p className="accent-text font-black">{studentData.regNo || userRegNo}</p>
            </div>
        </header>



        {activeTab === 'Overview' && (

          <div className="qc-overview">

             <div className="qc-overview__stats qc-student-stats">

                <StatCard label="Assignments" value={totalCount} color="text-sky-400" icon={<FileText size={16}/>} sub="Assigned to you" />

                <StatCard label="Submitted" value={submittedCount} color="text-slate-400" icon={<CheckCircle size={16}/>} sub="Under Review" />

                <StatCard label="Graded" value={gradedCount} color="text-emerald-400" icon={<Award size={16}/>} sub="Results Published" />

                <StatCard label="Pending" value={pendingCount} color="text-slate-400" icon={<Clock size={16}/>} sub="Action Needed" />

                <StatCard label="Average Score" value={`${studentData.averageScore || 0}%`} color="text-sky-400" icon={<TrendingUp size={16}/>} sub="From graded work" />

             </div>



             <div className="qc-card qc-overview__panel qc-student-recent min-h-0">

                <h2 className="text-base font-semibold flex items-center gap-2 mb-3 shrink-0"><FileUp size={18} className="accent-text"/> Recent Assignments</h2>

                <div className="qc-overview__list space-y-3">

                  {assignments.length > 0 ? (

                    assignments.slice(0, 5).map(asgn => (

                      <AssignmentRow
                        key={asgn._id}
                        asgn={asgn}
                        onUpload={handleFileUpload}
                        onAlreadySubmitted={showAlreadySubmittedNotice}
                        showDuplicateNotice={String(duplicateNoticeId) === String(asgn._id)}
                        onDismissDuplicate={() => setDuplicateNoticeId(null)}
                        uploadStatus={uploadStatus}
                      />

                    ))

                  ) : (

                    <p className="text-slate-500 text-xs italic">No assignments found.</p>

                  )}

                </div>

             </div>

          </div>

        )}



        {activeTab === 'Checked' && (

          <div className="space-y-6 animate-in fade-in duration-500">

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">

              <div>

                <h2 className="text-2xl font-black uppercase italic tracking-tighter">Checked Assignments</h2>

                <p className="theme-muted text-xs mt-1">Assignments reviewed by your teacher or evaluated by AI.</p>

              </div>

            </div>

            {checkedAssignments.length ? (
              <div className="qc-checked-results-list">
                {checkedAssignments.map((asgn) => {
                  const total = asgn.totalMarks || asgn.points;

                  return (
                    <article
                      key={asgn.submissionId || asgn._id}
                      className="qc-card qc-checked-result-card"
                    >
                      <div className="qc-checked-result-card__main">
                        <div className="qc-assignment-card__doc-icon" aria-hidden="true">
                          <FileText size={16} />
                        </div>
                        <div className="qc-checked-result-card__copy min-w-0">
                          <h3 className="qc-assignment-card__title">{asgn.title}</h3>
                          <div className="qc-assignment-card__meta">
                            <p className="qc-assignment-card__meta-item">
                              <CalendarDays size={12} aria-hidden="true" /> Start: {formatDateTime(asgn.startDate)}
                            </p>
                            <p className="qc-assignment-card__meta-item">
                              <Clock size={12} aria-hidden="true" /> Due: {formatDateTime(asgn.deadline)}
                            </p>
                          </div>
                          {(asgn.aiPublished === true && asgn.aiScore != null) ||
                          (asgn.teacherMarksPublished === true && asgn.marks != null) ? (
                            <div className="qc-checked-result-card__scores">
                              {asgn.aiPublished === true && asgn.aiScore != null && (
                                <div>
                                  <p className="theme-muted text-[9px] font-black uppercase">AI Marks</p>
                                  <p className="accent-text text-lg font-black">
                                    {asgn.aiScore}
                                    <span className="theme-muted text-sm font-semibold"> / {total}</span>
                                  </p>
                                </div>
                              )}
                              {asgn.teacherMarksPublished === true && asgn.marks != null && (
                                <div>
                                  <p className="theme-muted text-[9px] font-black uppercase">Teacher Marks</p>
                                  <p className="text-lg font-black" style={{ color: "var(--text)" }}>
                                    {asgn.marks}
                                    <span className="theme-muted text-sm font-semibold"> / {total}</span>
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="qc-checked-result-card__actions">
                        <button
                          type="button"
                          className="qc-view-file-btn qc-checked-result-card__view-btn"
                          title="View Result"
                          aria-label={`View result for ${asgn.title || "assignment"}`}
                          onClick={() => setSelectedAsgn(asgn)}
                        >
                          <Eye size={14} aria-hidden="true" />
                          View Result
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="theme-muted text-sm py-12 text-center theme-card border rounded-3xl">
                No checked assignments yet.
              </p>
            )}

          </div>

        )}



        {activeTab === 'Analytics' && (

          <div className="space-y-8 animate-in slide-in-from-right duration-500">

             <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                <div className="qc-card">

                    <h2 className="text-lg font-black uppercase italic text-white mb-6">Workload Distribution</h2>

                    <div className="h-72">

                        <ResponsiveContainer width="100%" height="100%">

                            <PieChart>

                                <Pie data={realDistributionData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label>

                                    {realDistributionData.map((entry, index) => <Cell key={`cell-${index}`} fill={index === 0 ? "var(--chart-primary)" : "var(--chart-secondary)"} />)}

                                </Pie>

                                <Tooltip contentStyle={{backgroundColor: 'var(--chart-tooltip-bg)', border: 'none', borderRadius: '10px'}} />

                                <Legend />

                            </PieChart>

                        </ResponsiveContainer>

                    </div>

                </div>



                <div className="qc-card">

                    <h2 className="text-lg font-black uppercase italic text-white mb-6">Real Score Trend</h2>

                    <div className="h-72">

                        {realPerformanceData.length ? (

                          <ResponsiveContainer width="100%" height="100%">

                            <LineChart data={realPerformanceData}>

                              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />

                              <XAxis dataKey="name" stroke="var(--chart-axis)" fontSize={9} />

                              <YAxis domain={[0, 'auto']} stroke="var(--chart-axis)" fontSize={10} />

                              <Tooltip contentStyle={{backgroundColor: 'var(--chart-tooltip-bg)', border: 'none', borderRadius: '10px'}} />

                              <Line type="monotone" dataKey="score" name="Marks earned" stroke="var(--chart-primary)" strokeWidth={3} dot={{r:4}} />

                            </LineChart>

                          </ResponsiveContainer>

                        ) : <div className="h-full flex items-center justify-center text-slate-500 text-xs">No graded scores yet.</div>}

                    </div>

                </div>



                <div className="qc-card">

                    <h2 className="text-lg font-black uppercase italic text-white mb-6">Grading Progress</h2>

                    <div className="h-72">

                        <ResponsiveContainer width="100%" height="100%">

                            <BarChart data={gradedPerformanceData}>

                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />

                                <XAxis dataKey="name" stroke="var(--chart-axis)" fontSize={10} />

                                <YAxis stroke="var(--chart-axis)" fontSize={10} allowDecimals={false} />

                                <Tooltip cursor={{fill: 'var(--chart-grid)'}} contentStyle={{backgroundColor: 'var(--chart-tooltip-bg)', border: 'none'}} />

                                <Bar dataKey="count" radius={[10, 10, 0, 0]} barSize={50}>

                                    <Cell fill="var(--chart-primary)" />

                                    <Cell fill="var(--chart-secondary)" />

                                </Bar>

                            </BarChart>

                        </ResponsiveContainer>

                    </div>

                </div>

             </div>

          </div>

        )}



        {activeTab === 'Assignments' && (

          <div className="qc-assignment-workspace qc-student-assignments animate-in slide-in-from-bottom-4 duration-500">

             <div className="qc-assignment-workspace__header">
               <div className="qc-assignment-workspace__heading">
                 <div className="qc-assignment-workspace__title-row">
                   <FileText size={22} className="qc-assignment-workspace__title-icon" aria-hidden="true" />
                   <h1 className="qc-page-title">My Assignments</h1>
                 </div>
                 <p className="qc-page-subtitle">Open question files, track due dates, and submit your work.</p>
               </div>
               <OverflowMenu
                 label="Manage assignment list"
                 buttonLabel="Manage"
                 items={[
                   {
                     id: 'sort-due-asc',
                     label: 'Due date: Earliest first',
                     onSelect: () => setAssignmentSort('due-asc'),
                   },
                   {
                     id: 'sort-due-desc',
                     label: 'Due date: Latest first',
                     onSelect: () => setAssignmentSort('due-desc'),
                   },
                   {
                     id: 'filter-all',
                     label: 'Filter: All statuses',
                     onSelect: () => setAssignmentStatusFilter('all'),
                   },
                   {
                     id: 'filter-pending',
                     label: 'Filter: Pending',
                     onSelect: () => setAssignmentStatusFilter('pending'),
                   },
                   {
                     id: 'filter-submitted',
                     label: 'Filter: Submitted',
                     onSelect: () => setAssignmentStatusFilter('submitted'),
                   },
                 ]}
               />
             </div>

             <div className="qc-assignment-summary qc-assignment-summary--student" aria-label="Assignment summary">
               <div className="qc-assignment-summary__card">
                 <div className="qc-assignment-summary__icon" aria-hidden="true">
                   <Layers size={16} />
                 </div>
                 <div>
                   <p className="qc-assignment-summary__label">Total Assignments</p>
                   <p className="qc-assignment-summary__value">{totalAssignmentCount}</p>
                 </div>
               </div>
               <div className="qc-assignment-summary__card">
                 <div className="qc-assignment-summary__icon" aria-hidden="true">
                   <Folder size={16} />
                 </div>
                 <div>
                   <p className="qc-assignment-summary__label">Active Assignments</p>
                   <p className="qc-assignment-summary__value">{activeAssignmentCount}</p>
                 </div>
               </div>
             </div>

             <div className="qc-assignments-toolbar mb-4">
               <SearchField
                 value={searchTerm}
                 onChange={setSearchTerm}
                 placeholder="Search by title..."
                 label="Search by title..."
               />
             </div>

             <div className="qc-assignment-list">
               {filteredSortedAssignments.map((asgn) => (
                 <AssignmentRow
                   key={asgn._id}
                   asgn={asgn}
                   onUpload={handleFileUpload}
                   onAlreadySubmitted={showAlreadySubmittedNotice}
                   showDuplicateNotice={String(duplicateNoticeId) === String(asgn._id)}
                   onDismissDuplicate={() => setDuplicateNoticeId(null)}
                   uploadStatus={uploadStatus}
                 />
               ))}
               {filteredSortedAssignments.length === 0 && (
                 <p className="theme-muted text-sm py-10 text-center qc-card">
                   No assignments found.
                 </p>
               )}
             </div>

          </div>

        )}



        {/* ========== ASSIGNMENT DETAIL MODAL ========== */}

        {selectedAsgn && (() => {
          const detailStatus = studentStatusLabel(selectedAsgn);
          const totalMarks = selectedAsgn.totalMarks || selectedAsgn.points || null;
          // Backend already redacts unpublished scores — never coalesce AI ↔ Teacher.
          const aiScoreRaw = selectedAsgn.aiScore;
          const teacherMarksRaw = selectedAsgn.marks;
          const hasAiScore =
            aiScoreRaw !== undefined &&
            aiScoreRaw !== null &&
            Number.isFinite(Number(aiScoreRaw));
          const hasTeacherScore =
            teacherMarksRaw !== undefined &&
            teacherMarksRaw !== null &&
            Number.isFinite(Number(teacherMarksRaw));
          const aiPublished = selectedAsgn.aiPublished === true || hasAiScore;
          const teacherMarksPublished =
            selectedAsgn.teacherMarksPublished === true && hasTeacherScore;
          const aiText = String(selectedAsgn.aiFeedback || "").trim();
          const strengths = Array.isArray(selectedAsgn.aiStrengths) ? selectedAsgn.aiStrengths : [];
          const improvements = Array.isArray(selectedAsgn.aiImprovements)
            ? selectedAsgn.aiImprovements
            : [];
          const hasAiFeedbackContent = Boolean(aiText || strengths.length || improvements.length);
          // AI Feedback from API implies published AI result (unpublished feedback is redacted).
          const showAiResult = aiPublished || hasAiFeedbackContent;
          const showAiMarks = showAiResult && hasAiScore;
          const showTeacherMarksScore = teacherMarksPublished;
          const showResultsOverview = showAiResult || showTeacherMarksScore;
          const showAiFeedbackSection = showAiResult;
          const showTeacherFeedbackSection = showAiResult || showTeacherMarksScore;
          const teacherFeedbackText =
            selectedAsgn.teacherFeedbackPublished === true
              ? String(selectedAsgn.feedback || "").trim()
              : "";
          const anyPublishedResult =
            showAiMarks || showTeacherMarksScore || showAiFeedbackSection || Boolean(teacherFeedbackText);
          const awaitingEvaluation =
            (selectedAsgn.isSubmitted || selectedAsgn.submissionId) && !anyPublishedResult;

          return (
          <div className="qc-student-detail-overlay" role="dialog" aria-modal="true" aria-label="Assignment details">
             <div className="qc-student-detail-modal">
                <button type="button" onClick={() => setSelectedAsgn(null)} className="qc-student-detail-modal__close" aria-label="Close assignment details"><X size={18}/></button>

                <header className="qc-student-detail-modal__header">
                  <h2 className="qc-student-detail-modal__title">{selectedAsgn.title}</h2>
                  <span className={`qc-status-badge is-${detailStatus.tone}`}>
                    {detailStatus.label}
                  </span>
                </header>

                <div className="qc-student-detail-modal__body">
                  <section className="qc-student-detail-modal__section" aria-label="Assignment Schedule">
                    <p className="qc-student-detail-modal__stat-label">Schedule</p>
                    <div className="qc-student-detail-modal__meta-row">
                      <p className="qc-assignment-card__meta-item">
                        <CalendarDays size={12} aria-hidden="true" /> Start: {formatDateTime(selectedAsgn.startDate)}
                      </p>
                      <p className="qc-assignment-card__meta-item">
                        <Clock size={12} aria-hidden="true" /> Due: {formatDateTime(selectedAsgn.deadline)}
                      </p>
                    </div>
                  </section>

                  {showResultsOverview ? (
                    <section className="qc-student-detail-modal__section" aria-label="Results Overview">
                      <p className="qc-student-detail-modal__stat-label">Results Overview</p>
                      <div className="qc-student-detail-modal__marks-grid">
                        {showAiMarks ? (
                          <div className="qc-student-detail-modal__mark-card">
                            <p className="qc-student-detail-modal__stat-label">
                              <Sparkles size={12} aria-hidden="true" /> AI Marks
                            </p>
                            <p className="qc-student-detail-modal__stat-value">
                              {Number(aiScoreRaw)}
                              {totalMarks != null ? <span className="theme-muted text-sm font-semibold"> / {totalMarks}</span> : null}
                            </p>
                          </div>
                        ) : showAiResult ? (
                          <div className="qc-student-detail-modal__mark-card">
                            <p className="qc-student-detail-modal__stat-label">
                              <Sparkles size={12} aria-hidden="true" /> AI Marks
                            </p>
                            <p className="qc-student-detail-modal__stat-text">AI Marks Not Available</p>
                          </div>
                        ) : null}
                        <div className="qc-student-detail-modal__mark-card">
                          <p className="qc-student-detail-modal__stat-label">
                            <UserRound size={12} aria-hidden="true" /> Teacher Marks
                          </p>
                          {showTeacherMarksScore ? (
                            <p className="qc-student-detail-modal__stat-value">
                              {Number(teacherMarksRaw)}
                              {totalMarks != null ? <span className="theme-muted text-sm font-semibold"> / {totalMarks}</span> : null}
                            </p>
                          ) : (
                            <p className="qc-student-detail-modal__stat-text">
                              Teacher has not graded yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : awaitingEvaluation ? (
                    <p className="qc-student-detail-modal__hint">Awaiting Evaluation</p>
                  ) : null}

                  {showAiFeedbackSection ? (
                    <section className="qc-student-detail-modal__section qc-student-detail-modal__section--ai" aria-label="AI Feedback">
                      <p className="qc-student-detail-modal__stat-label">
                        <Sparkles size={12} aria-hidden="true" /> AI Feedback
                      </p>
                      {hasAiFeedbackContent ? (
                        <div className="qc-student-ai-feedback">
                          {aiText ? (
                            <p className="qc-student-detail-modal__stat-text qc-student-detail-modal__stat-text--open">{aiText}</p>
                          ) : (
                            <p className="qc-student-detail-modal__stat-text">AI Feedback Not Available</p>
                          )}
                          {(strengths.length > 0 || improvements.length > 0) && (
                            <div className="qc-student-ai-feedback__cols">
                              {strengths.length > 0 && (
                                <div>
                                  <p className="qc-student-detail-modal__stat-label">Strengths</p>
                                  <ul className="qc-student-ai-feedback__list">
                                    {strengths.map((item, idx) => <li key={`st-${idx}`}>{item}</li>)}
                                  </ul>
                                </div>
                              )}
                              {improvements.length > 0 && (
                                <div>
                                  <p className="qc-student-detail-modal__stat-label">Areas for Improvement</p>
                                  <ul className="qc-student-ai-feedback__list">
                                    {improvements.map((item, idx) => <li key={`im-${idx}`}>{item}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="qc-student-detail-modal__stat-text">AI Feedback Not Available</p>
                      )}
                    </section>
                  ) : null}

                  {showTeacherFeedbackSection ? (
                    <section className="qc-student-detail-modal__section" aria-label="Teacher Feedback">
                      <p className="qc-student-detail-modal__stat-label">
                        <UserRound size={12} aria-hidden="true" /> Teacher Feedback
                      </p>
                      <p className="qc-student-detail-modal__stat-text qc-student-detail-modal__stat-text--open">
                        {teacherFeedbackText || "No Teacher Feedback Available"}
                      </p>
                    </section>
                  ) : null}

                  <section className="qc-student-detail-modal__section" aria-label="Question File">
                    <p className="qc-student-detail-modal__stat-label">Question File</p>
                    {selectedAsgn.notOpenYet || selectedAsgn.canAccessMaterials === false ? (
                      <p className="qc-student-detail-modal__hint">Not open yet.</p>
                    ) : (selectedAsgn.hasFile || selectedAsgn.assignmentOriginalFileName || selectedAsgn.originalFileName) ? (
                      <div className="qc-student-file-actions">
                        <div className="qc-student-file-action">
                          <FileLink
                            variant="named"
                            fileName={
                              selectedAsgn.assignmentOriginalFileName ||
                              selectedAsgn.originalFileName ||
                              "assignment"
                            }
                            openLabel="View File"
                            onOpen={async () => {
                              try {
                                await openProtectedPreview(
                                  studentService.previewAssignment(selectedAsgn._id),
                                  selectedAsgn.assignmentOriginalFileName ||
                                    selectedAsgn.originalFileName ||
                                    "assignment",
                                  { downloadUrl: studentService.downloadAssignment(selectedAsgn._id) }
                                );
                              } catch (error) {
                                alert(error.message);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await downloadProtectedFile(
                                  studentService.downloadAssignment(selectedAsgn._id),
                                  `${
                                    selectedAsgn.assignmentOriginalFileName ||
                                    selectedAsgn.originalFileName ||
                                    "assignment"
                                  }`
                                );
                              } catch (error) {
                                alert(error.message);
                              }
                            }}
                            className="qc-btn qc-btn-secondary"
                          >
                            <Download size={14} aria-hidden="true" /> Download File
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="qc-student-detail-modal__stat-text">No question file attached.</p>
                    )}
                  </section>

                  <section className="qc-student-detail-modal__section" aria-label="Student Submission">
                    <p className="qc-student-detail-modal__stat-label">Student Submission</p>
                    {selectedAsgn.submissionId ? (
                      <div className="qc-student-file-actions">
                        <div className="qc-student-file-action">
                          <FileLink
                            variant="named"
                            fileName={selectedAsgn.submissionOriginalFileName || 'my-submission'}
                            openLabel="View Submission"
                            onOpen={async () => {
                              try {
                                await openProtectedPreview(
                                  studentService.previewSubmission(selectedAsgn.submissionId),
                                  selectedAsgn.submissionOriginalFileName || 'my-submission',
                                  { downloadUrl: studentService.downloadSubmission(selectedAsgn.submissionId) }
                                );
                              } catch (error) {
                                alert(error.message);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await downloadProtectedFile(
                                  studentService.downloadSubmission(selectedAsgn.submissionId),
                                  selectedAsgn.submissionOriginalFileName || "my-submission"
                                );
                              } catch (error) {
                                alert(error.message);
                              }
                            }}
                            className="qc-btn qc-btn-secondary"
                          >
                            <Download size={14} aria-hidden="true" /> Download Submission
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="qc-student-detail-modal__stat-text">No submission yet.</p>
                    )}
                  </section>
                </div>
             </div>
          </div>
          );
        })()}

        </>
        )}

        <AIChatbot role="student" showTrigger={false} />

        <MessagePanel role="student" showTrigger={false} />

    </DashboardNavShell>

  );

}



function StatCard({ label, value, color, icon, sub }) {

  const [selected, setSelected] = useState(false);

  return (

    <button

      type="button"

      onClick={() => setSelected((current) => !current)}

      aria-pressed={selected}

      className="qc-stat-card"

    >

      <div className="flex justify-between items-start mb-2">

        <div>

          <p className="qc-stat-label">{label}</p>

          <h3 className={`qc-stat-value ${color}`}>{value}</h3>

        </div>

        <div className={`p-3 rounded-xl bg-slate-800/50 ${color}`}>{icon}</div>

      </div>

      <p className="qc-stat-sub">{sub}</p>

    </button>

  );

}



function formatDateTime(value) {
  if (value === undefined || value === null || value === "") return "Not specified";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not specified";
    return date.toLocaleString();
  } catch {
    return "Not specified";
  }
}

function meaningfulSubject(subject) {
  const value = String(subject || "").trim();
  if (!value) return "";
  if (/^general$/i.test(value)) return "";
  return value;
}

function studentStatusLabel(asgn) {
  const status = String(asgn.status || "").toLowerCase();
  const isSubmitted = Boolean(
    asgn.isSubmitted || asgn.submissionId || ["submitted", "published", "graded", "ai_graded"].includes(status)
  );
  // Never infer publication from saved marks alone — only published flags / status.
  const isPublished = Boolean(
    status === "published" ||
    asgn.resultStatus === "PUBLISHED" ||
    asgn.aiPublished === true ||
    asgn.teacherMarksPublished === true ||
    asgn.teacherFeedbackPublished === true
  );

  // Submission/evaluation badges never use dots.
  if (isPublished) return { label: "Published", tone: "published", showDot: false };
  if (isSubmitted) {
    return { label: "Submitted", tone: "submitted", showDot: false };
  }
  if (/^pending$/i.test(status) || !status) {
    return { label: "Not Submitted", tone: "not-submitted", showDot: false };
  }
  return { label: "Not Submitted", tone: "not-submitted", showDot: false };
}

function AssignmentRow({
  asgn,
  onUpload,
  onAlreadySubmitted,
  showDuplicateNotice = false,
  onDismissDuplicate,
  uploadStatus,
}) {

  const status = String(asgn.status || "").toLowerCase();
  const isSubmitted = Boolean(asgn.isSubmitted || asgn.submissionId || ["submitted", "published", "graded", "ai_graded"].includes(status));
  // Backend canSubmit is authoritative; resubmission is not supported while a submission exists.
  const canUpload = asgn.canSubmit === true && !isSubmitted;
  const availability = String(asgn.availabilityLabel || "").trim();
  const questionFileName =
    asgn.assignmentOriginalFileName ||
    asgn.originalFileName ||
    "assignment";
  const hasAssignmentFile = Boolean(asgn.hasFile || asgn.file || asgn.assignmentOriginalFileName || asgn.fileUrl);
  const activityInfo = studentActivityState(asgn);
  const statusInfo = studentStatusLabel(asgn);

  const actionLabel = (() => {
    if (uploadStatus.id === asgn._id) {
      if (uploadStatus.loading) return "Submitting…";
      if (uploadStatus.success) return "Submitted";
    }
    if (canUpload) return "Submit Assignment";
    return availability || "Closed";
  })();

  const openAssignmentFile = async () => {
    if (!hasAssignmentFile) return;
    try {
      await openProtectedPreview(
        studentService.previewAssignment(asgn._id),
        questionFileName,
        { downloadUrl: studentService.downloadAssignment(asgn._id) }
      );
    } catch (error) {
      alert(error.message);
    }
  };

  const duplicateNotice = showDuplicateNotice ? (
    <div
      className="qc-assignment-inline-notice"
      role="status"
      aria-live="polite"
      data-testid="qc-already-submitted-inline"
    >
      <Info size={14} className="qc-assignment-inline-notice__icon" aria-hidden="true" />
      <div className="qc-assignment-inline-notice__body">
        <p className="qc-assignment-inline-notice__title">Already submitted.</p>
        <p className="qc-assignment-inline-notice__detail">
          Your submission is saved. You do not need to submit it again.
        </p>
      </div>
      <button
        type="button"
        className="qc-assignment-inline-notice__close"
        aria-label="Dismiss notice"
        onClick={() => onDismissDuplicate?.()}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  ) : null;

  return (
    <article className="qc-card qc-assignment-card qc-student-assignment-card">
      <div className="qc-assignment-card__main qc-student-assignment-card__main">
        <div className="qc-assignment-card__doc-icon" aria-hidden="true">
          <FileText size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="qc-assignment-card__title">{asgn.title}</h3>
          <div className="qc-assignment-card__meta">
            <p className="qc-assignment-card__meta-item">
              <CalendarDays size={12} aria-hidden="true" /> Start: {formatDateTime(asgn.startDate)}
            </p>
            <p className="qc-assignment-card__meta-item">
              <Clock size={12} aria-hidden="true" /> Due: {formatDateTime(asgn.deadline)}
            </p>
          </div>
        </div>
      </div>

      <div className="qc-assignment-card__aside qc-student-assignment-card__actions">
        {hasAssignmentFile ? (
          <button
            type="button"
            className="qc-view-file-btn"
            title="View File"
            aria-label={`View file for ${asgn.title || "assignment"}`}
            onClick={openAssignmentFile}
          >
            <Eye size={14} aria-hidden="true" />
            View File
          </button>
        ) : null}

        <span className={`qc-status-badge is-${activityInfo.tone}`}>
          {activityInfo.showDot ? <span className="qc-status-badge__dot" aria-hidden="true" /> : null}
          {activityInfo.label}
        </span>

        <span className={`qc-status-badge is-${statusInfo.tone}`}>
          {statusInfo.showDot ? <span className="qc-status-badge__dot" aria-hidden="true" /> : null}
          {statusInfo.label}
        </span>

        {canUpload ? (
          <label className="qc-btn qc-btn-primary cursor-pointer">
            {actionLabel}
            <input
              type="file"
              accept={ACADEMIC_ACCEPT}
              className="hidden"
              onChange={(e) => onUpload(e, asgn._id)}
            />
          </label>
        ) : isSubmitted ? (
          <div className="qc-assignment-status-anchor">
            {duplicateNotice}
          </div>
        ) : (
          <span className="qc-btn qc-btn-secondary opacity-60 pointer-events-none">{actionLabel}</span>
        )}
      </div>
    </article>
  );
}

