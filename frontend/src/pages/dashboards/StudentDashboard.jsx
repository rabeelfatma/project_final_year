import React, { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {

  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,

  Cell, PieChart, Pie, Legend

} from 'recharts';

import {

  BookOpen, CheckCircle, Clock, FileUp, Layout,

  Award, Loader2, Download, Eye, X, FileText, Activity, TrendingUp,

  Sparkles, Info

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

  /** Student shelf: Active = open/in-progress; Archived = published / past closed work still listed. */
  const [studentAssignmentShelf, setStudentAssignmentShelf] = useState("active");

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

      if (Array.isArray(asgns)) {
        const visible = asgns.filter((item) => item?.notOpenYet !== true);
        setAssignments(visible);
        setSelectedAsgn((previous) => {
          if (!previous) return previous;
          const fresh = visible.find((item) => String(item._id) === String(previous._id));
          return fresh || null;
        });
      }

      if (Array.isArray(submissions)) {

        setCheckedResults(submissions

          // Only published results are student-visible (API also nulls unpublished scores).
          .filter((s) => s.status === 'PUBLISHED' && s.assignment)

          .map((s) => ({

            _id: s.assignment._id,

            title: s.assignment.title,

            subject: s.assignment.subject,

            points: s.assignment.points,

            marks: s.marks ?? s.aiScore,

            aiScore: s.aiScore,

            totalMarks: s.totalMarks || s.assignment.points,

            feedback: s.feedback || s.aiFeedback || '',

            aiFeedback: s.aiFeedback || '',

            aiStrengths: s.aiStrengths || [],

            aiImprovements: s.aiImprovements || [],

            submissionId: s._id,

            originalFileName: s.originalFileName || '',
            submissionOriginalFileName: s.originalFileName || '',

            status: s.status,

            resultStatus: s.status,

            checkedAt: s.updatedAt || s.createdAt,

            isSubmitted: true,

          })));

        setSelectedResultIds([]);

      }

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
      const isArchivedShelf = status === "PUBLISHED";
      if (studentAssignmentShelf === "archived" ? !isArchivedShelf : isArchivedShelf) {
        return false;
      }
      if (assignmentStatusFilter === "all") return true;
      if (assignmentStatusFilter === "pending") return status === "pending" || !asgn.status;
      if (assignmentStatusFilter === "submitted") return status === "submitted" || status === "Submitted";
      if (assignmentStatusFilter === "PUBLISHED") return status === "PUBLISHED";
      return true;
    }),
    assignmentSort
  );

  const activeAssignmentCount = assignments.filter((a) => String(a.status || "") !== "PUBLISHED").length;
  const archivedAssignmentCount = assignments.filter((a) => String(a.status || "") === "PUBLISHED").length;

  const totalVsPendingData = [

    { name: 'Completed/Submitted', value: submittedCount + gradedCount },

    { name: 'Pending Action', value: pendingCount }

  ];



  const gradedPerformanceData = [

    { name: 'Total Assignments', count: totalCount },

    { name: 'Graded (Results)', count: gradedCount }

  ];





  const realPerformanceData = checkedResults

    .filter((item) => {
      const score = Number(item.marks ?? item.aiScore);
      return Number.isFinite(score);
    })

    .slice()

    .sort((a, b) => new Date(a.checkedAt || 0) - new Date(b.checkedAt || 0))

    .map((item) => ({
      name: item.title || 'Assignment',
      score: Number(item.marks ?? item.aiScore),
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
                        onSelect={setSelectedAsgn}
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

            {checkedAssignments.length ? checkedAssignments.map((asgn) => {

              const total = asgn.totalMarks || asgn.points;

              return (

                <div key={asgn.submissionId || asgn._id} className="theme-card border p-4 sm:p-6 rounded-3xl flex flex-col md:flex-row md:items-center md:justify-between gap-5">

                  <div className="flex items-start gap-3 min-w-0">

                    <div className="min-w-0">

                    <h3 className="font-black text-lg break-words">{asgn.title}</h3>

                    <p className="theme-muted text-[10px] uppercase tracking-widest mt-1">{asgn.subject || 'Assignment'} · {asgn.resultStatus || asgn.status}</p>

                    {asgn.checkedAt && <p className="theme-muted text-[10px] mt-2">Checked: {new Date(asgn.checkedAt).toLocaleString()}</p>}

                    </div>

                  </div>

                  <div className="flex items-center gap-4 sm:gap-5 shrink-0">

                    <div className="text-left space-y-2 min-w-0">

                      <div>

                        <p className="theme-muted text-[9px] font-black uppercase">AI Marks</p>

                        <p className="accent-text text-xl font-black">{asgn.aiScore ?? '--'} <span className="theme-muted text-sm">/ {total ?? '--'}</span></p>

                      </div>

                      <div>

                        <p className="theme-muted text-[9px] font-black uppercase">Teacher Marks</p>

                        <p className="text-xl font-black" style={{color: 'var(--text)'}}>{asgn.marks ?? '--'} <span className="theme-muted text-sm">/ {total ?? '--'}</span></p>

                      </div>

                    </div>

                    <button onClick={() => setSelectedAsgn(asgn)} className="icon-btn" title="View checked result" aria-label="View checked result"><Eye size={17}/></button>

                  </div>

                </div>

              );

            }) : <p className="theme-muted text-sm py-12 text-center theme-card border rounded-3xl">No checked assignments yet.</p>}

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

          <div className="qc-student-assignments animate-in slide-in-from-bottom-4 duration-500">

             <div className="qc-student-assignments__header">
               <div>
                 <h1 className="qc-page-title">My Assignments</h1>
                 <p className="qc-page-subtitle">Open question files, track due dates, and submit your work.</p>
               </div>
               <OverflowMenu
                 label="Manage assignment list"
                 buttonLabel="Manage"
                 items={[
                   {
                     id: 'sort-due-asc',
                     label: 'Sort: Earliest due',
                     onSelect: () => setAssignmentSort('due-asc'),
                   },
                   {
                     id: 'sort-due-desc',
                     label: 'Sort: Latest due',
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

             <div className="qc-segmented mb-4" role="tablist" aria-label="Assignment shelf">
               <button
                 type="button"
                 role="tab"
                 aria-selected={studentAssignmentShelf === 'active'}
                 className={`qc-segmented__item ${studentAssignmentShelf === 'active' ? 'is-active' : ''}`}
                 onClick={() => setStudentAssignmentShelf('active')}
               >
                 Active ({activeAssignmentCount})
               </button>
               <button
                 type="button"
                 role="tab"
                 aria-selected={studentAssignmentShelf === 'archived'}
                 className={`qc-segmented__item ${studentAssignmentShelf === 'archived' ? 'is-active' : ''}`}
                 onClick={() => setStudentAssignmentShelf('archived')}
               >
                 Archived ({archivedAssignmentCount})
               </button>
             </div>

             <div className="qc-assignments-toolbar mb-4">
               <SearchField
                 value={searchTerm}
                 onChange={setSearchTerm}
                 placeholder="Search by title…"
                 label="Filter assignments by title"
               />
             </div>

             <div className="qc-student-assignment-grid">
               {filteredSortedAssignments.map((asgn) => (
                 <AssignmentRow
                   key={asgn._id}
                   asgn={asgn}
                   shelf={studentAssignmentShelf}
                   onSelect={setSelectedAsgn}
                   onUpload={handleFileUpload}
                   onAlreadySubmitted={showAlreadySubmittedNotice}
                   showDuplicateNotice={String(duplicateNoticeId) === String(asgn._id)}
                   onDismissDuplicate={() => setDuplicateNoticeId(null)}
                   uploadStatus={uploadStatus}
                 />
               ))}
               {filteredSortedAssignments.length === 0 && (
                 <p className="theme-muted text-sm py-10 text-center qc-card">
                   {studentAssignmentShelf === 'archived'
                     ? 'No archived (published) assignments yet.'
                     : 'No active assignments found.'}
                 </p>
               )}
             </div>

          </div>

        )}



        {/* ========== ASSIGNMENT DETAIL MODAL ========== */}

        {selectedAsgn && (

          <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 overflow-y-auto">

             <div className="theme-card border w-full max-w-2xl rounded-t-[2rem] sm:rounded-[2.5rem] p-5 sm:p-10 relative max-h-[94dvh] sm:max-h-[90vh] overflow-y-auto my-0 sm:my-auto">

                <button type="button" onClick={() => setSelectedAsgn(null)} className="absolute top-4 right-4 sm:top-8 sm:right-8 text-slate-500 hover:text-white transition-all p-2" aria-label="Close assignment details"><X size={24}/></button>

                <h2 className="text-xl sm:text-2xl font-black text-white italic uppercase mb-2 pr-10 break-words">{selectedAsgn.title}</h2>



                {/* Instructions */}

                <p className="text-blue-400 text-[10px] font-bold uppercase mb-6 tracking-widest">

                  Instructions: <span className="text-slate-300 normal-case italic font-medium ml-2 break-words">{selectedAsgn.description || "No instructions provided."}</span>

                </p>



                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">

                    {/* Marks */}

                    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-800 text-center flex flex-col items-center justify-center min-h-[100px] sm:min-h-[120px]">

                       <p className="text-[8px] uppercase font-black text-blue-500 mb-2">Marks Obtained</p>

                       {/* ✅ STUDENT FIX: Dynamic marks with totalMarks */}

                       <span className="text-[18px] font-black italic leading-tight uppercase tracking-widest">

                         {selectedAsgn.marks !== undefined && selectedAsgn.marks !== null

                           ? `${selectedAsgn.marks} / ${selectedAsgn.totalMarks || selectedAsgn.points || '--'}`

                           : (selectedAsgn.isSubmitted || selectedAsgn.submissionId)
                             ? "Awaiting evaluation"
                             : "—"}

                       </span>

                    </div>

                    {/* Feedback */}

                    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-800 text-center flex flex-col items-center justify-center min-h-[100px] sm:min-h-[120px]">

                       <p className="text-[8px] uppercase font-black accent-text mb-2">Teacher Feedback</p>

                       <p className="text-sm text-slate-300 italic leading-relaxed break-words">

                         {selectedAsgn.feedback
                           || (selectedAsgn.isSubmitted && !selectedAsgn.aiFeedback
                             ? "Your submission is awaiting evaluation."
                             : "No teacher feedback yet.")}

                       </p>

                    </div>

                </div>

                {!!(selectedAsgn.aiStrengths?.length || selectedAsgn.aiImprovements?.length) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {!!selectedAsgn.aiStrengths?.length && (
                      <div className="bg-slate-900 p-4 rounded-2xl border border-emerald-500/20">
                        <p className="text-[8px] uppercase font-black text-emerald-400 mb-2">Strengths</p>
                        <ul className="list-disc pl-4 text-sm text-slate-300 space-y-1">
                          {selectedAsgn.aiStrengths.map((item, idx) => <li key={`st-${idx}`}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                    {!!selectedAsgn.aiImprovements?.length && (
                      <div className="bg-slate-900 p-4 rounded-2xl border border-sky-500/20">
                        <p className="text-[8px] uppercase font-black text-sky-400 mb-2">Suggestions</p>
                        <ul className="list-disc pl-4 text-sm text-slate-300 space-y-1">
                          {selectedAsgn.aiImprovements.map((item, idx) => <li key={`im-${idx}`}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}



                {/* ✅ STUDENT FIX: AI Score & AI Feedback section */}

                {(selectedAsgn.aiScore !== undefined && selectedAsgn.aiScore !== null || selectedAsgn.aiFeedback) && (

                  <div className="theme-page border border-sky-500/20 rounded-2xl p-4 sm:p-6 mb-6">

                    <div className="flex items-center gap-2 mb-4">

                      <Sparkles size={14} className="text-sky-400"/>

                      <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">AI Evaluation</p>

                    </div>

                    <div className="flex items-center gap-3 mb-3">

                      <span className="text-[10px] text-slate-500 font-black uppercase">AI Marks:</span>

                      <span className="text-sky-400 font-black text-lg">

                        {selectedAsgn.aiScore !== undefined ? selectedAsgn.aiScore : '--'}

                        <span className="text-slate-500 text-sm font-bold ml-1">/ {selectedAsgn.totalMarks || selectedAsgn.points || '--'}</span>

                      </span>

                    </div>

                    {selectedAsgn.aiFeedback && (

                      <p className="text-slate-300 text-sm italic leading-relaxed">

                        {selectedAsgn.aiFeedback}

                      </p>

                    )}

                  </div>

                )}



                {selectedAsgn.notOpenYet || selectedAsgn.canAccessMaterials === false ? (
                  <p className="text-center text-xs font-semibold theme-muted border border-dashed border-slate-700 rounded-xl py-4">
                    Not open yet.
                  </p>
                ) : (
                <div className="qc-student-file-actions">
                  <div className="qc-student-file-action">
                    <FileLink
                      variant="named"
                      fileName={selectedAsgn.assignmentOriginalFileName || selectedAsgn.originalFileName || 'assignment'}
                      openLabel={selectedAsgn.assignmentOriginalFileName || selectedAsgn.originalFileName || 'Open question file'}
                      onOpen={async () => {
                        try {
                          await openProtectedPreview(
                            studentService.previewAssignment(selectedAsgn._id),
                            selectedAsgn.assignmentOriginalFileName || selectedAsgn.originalFileName || 'assignment',
                            { downloadUrl: studentService.downloadAssignment(selectedAsgn._id) }
                          );
                        } catch (error) {
                          alert(error.message);
                        }
                      }}
                    />
                  </div>
                  <button type="button" onClick={async () => { try { await downloadProtectedFile(studentService.downloadAssignment(selectedAsgn._id), `${selectedAsgn.assignmentOriginalFileName || selectedAsgn.originalFileName || "assignment"}`); } catch (error) { alert(error.message); } }} className="qc-btn qc-btn-secondary"><Download size={16}/> Download Original</button>
                </div>
                )}

                {(selectedAsgn.isSubmitted || selectedAsgn.submissionId) && !selectedAsgn.marks && (
                  <p className="mt-4 text-center text-xs theme-muted font-semibold">
                    Submitted — awaiting evaluation
                  </p>
                )}

                {selectedAsgn.canSubmit === true && !selectedAsgn.isSubmitted && !selectedAsgn.submissionId && (
                  <p className="mt-4 text-center text-xs theme-muted">
                    Use <span className="font-semibold text-[var(--text)]">Submit Assignment</span> on the assignment card to submit your file.
                  </p>
                )}

                {selectedAsgn.submissionId && <div className="qc-student-file-actions mt-3">
                  <div className="qc-student-file-action">
                    <FileLink
                      variant="named"
                      fileName={selectedAsgn.submissionOriginalFileName || 'my-submission'}
                      openLabel={selectedAsgn.submissionOriginalFileName || 'View submission'}
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
                  </div>
                  <button type="button" onClick={async () => { try { await downloadProtectedFile(studentService.downloadSubmission(selectedAsgn.submissionId), selectedAsgn.submissionOriginalFileName || "my-submission"); } catch (error) { alert(error.message); } }} className="qc-btn qc-btn-secondary"><Download size={16}/> Download Original</button>
                </div>}

             </div>

          </div>

        )}

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
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function meaningfulSubject(subject) {
  const value = String(subject || "").trim();
  if (!value) return "";
  if (/^general$/i.test(value)) return "";
  return value;
}

function AssignmentRow({
  asgn,
  onSelect,
  onUpload,
  onAlreadySubmitted,
  showDuplicateNotice = false,
  onDismissDuplicate,
  uploadStatus,
}) {

  const status = String(asgn.status || "").toLowerCase();
  const isSubmitted = Boolean(asgn.isSubmitted || asgn.submissionId || ["submitted", "published", "graded", "ai_graded"].includes(status));
  const isPublished = status === "published" || (asgn.marks !== undefined && asgn.marks !== null && isSubmitted);
  // Backend canSubmit is authoritative; resubmission is not supported while a submission exists.
  const canUpload = asgn.canSubmit === true && !isSubmitted;
  const availability = String(asgn.availabilityLabel || "").trim();
  const questionFileName =
    asgn.assignmentOriginalFileName ||
    asgn.originalFileName ||
    "assignment";
  const subjectLabel = meaningfulSubject(asgn.subject);
  const hasAssignmentFile = Boolean(asgn.file || asgn.assignmentOriginalFileName || asgn.fileUrl);

  const statusMeta = (() => {
    if (isPublished) return "Published";
    if (isSubmitted) {
      if (/awaiting evaluation/i.test(availability)) return "Submitted — awaiting evaluation";
      if (availability && !/^open$/i.test(availability) && !/^submitted$/i.test(availability)) {
        return availability.startsWith("Submitted") ? availability : `Submitted — ${availability}`;
      }
      return "Submitted — awaiting evaluation";
    }
    if (availability && !/^open$/i.test(availability)) return availability;
    return "";
  })();

  const actionLabel = (() => {
    if (uploadStatus.id === asgn._id) {
      if (uploadStatus.loading) return "Submitting…";
      if (uploadStatus.success) return "Submitted";
    }
    if (canUpload) return "Submit Assignment";
    if (isPublished) return "View Result";
    if (isSubmitted) return "Submitted";
    return availability || "Closed";
  })();

  const openAssignmentFile = async () => {
    if (!hasAssignmentFile) {
      onSelect?.(asgn);
      return;
    }
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

  const downloadAssignmentFile = async () => {
    try {
      await downloadProtectedFile(
        studentService.downloadAssignment(asgn._id),
        questionFileName
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
    <article className="qc-card qc-student-assignment-card">
      <div className="qc-student-assignment-card__main">
        <div className="qc-assignment-card__title-row">
          <button
            type="button"
            className="qc-assignment-card__title qc-link-title text-left"
            onClick={openAssignmentFile}
            title={hasAssignmentFile ? `Open ${questionFileName}` : "View assignment details"}
          >
            {asgn.title}
          </button>
        </div>
        <div className="qc-assignment-card__meta">
          {subjectLabel ? (
            <p className="qc-assignment-card__meta-item">Subject: {subjectLabel}</p>
          ) : null}
          <p className="qc-assignment-card__meta-item">
            <Clock size={12} aria-hidden="true" /> Start: {formatDateTime(asgn.startDate)}
          </p>
          <p className="qc-assignment-card__meta-item">
            <Clock size={12} aria-hidden="true" /> Due: {formatDateTime(asgn.deadline)}
          </p>
          {statusMeta ? (
            <p className="qc-assignment-card__meta-item">{statusMeta}</p>
          ) : null}
        </div>
      </div>

      <div className="qc-student-assignment-card__actions">
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
        ) : isPublished ? (
          <button type="button" onClick={() => onSelect(asgn)} className="qc-btn qc-btn-primary">
            View Result
          </button>
        ) : isSubmitted ? (
          <div className="qc-assignment-status-anchor">
            {duplicateNotice}
            <button
              type="button"
              className="qc-btn qc-btn-secondary"
              aria-label="Submission status"
              title="Submission already recorded"
              onClick={() => onAlreadySubmitted?.(asgn)}
            >
              {actionLabel}
            </button>
          </div>
        ) : (
          <span className="qc-btn qc-btn-secondary opacity-60 pointer-events-none">{actionLabel}</span>
        )}

        {hasAssignmentFile ? (
          <button
            type="button"
            className="qc-icon-btn"
            title={`Download ${questionFileName}`}
            aria-label={`Download ${questionFileName}`}
            onClick={downloadAssignmentFile}
          >
            <Download size={16} aria-hidden="true" />
          </button>
        ) : null}

        <OverflowMenu
          label={`Manage ${asgn.title || "assignment"}`}
          items={[
            {
              id: `view-details-${asgn._id}`,
              label: "View Details",
              icon: <Eye size={14} />,
              onSelect: () => onSelect(asgn),
            },
            ...(isPublished
              ? [{
                  id: `view-result-${asgn._id}`,
                  label: "View Result",
                  icon: <CheckCircle size={14} />,
                  onSelect: () => onSelect(asgn),
                }]
              : []),
          ]}
        />
      </div>
    </article>
  );
}

