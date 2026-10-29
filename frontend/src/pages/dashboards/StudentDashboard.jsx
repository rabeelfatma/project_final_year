import React, { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';

import { useNavigate } from 'react-router-dom';

import {

  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,

  Cell, PieChart, Pie, Legend

} from 'recharts';

import {

  BookOpen, CheckCircle, Clock, FileUp, Layout,

  Award, Loader2, Download, Eye, X, FileText, Activity, TrendingUp,

  Sparkles, Trash2, ListChecks

} from 'lucide-react';

import studentService from '../../services/studentService';

import SidebarControls from '../../components/common/SidebarControls';

import DashboardNavShell from '../../components/common/DashboardNavShell';

import DashboardNavItem from '../../components/common/DashboardNavItem';

import DashboardTopBar from '../../components/common/DashboardTopBar';

import ProfilePage from '../account/ProfilePage';

import SettingsPage from '../account/SettingsPage';

import AIChatbot from '../../components/common/AIChatbot';

import MessagePanel from '../../components/common/MessagePanel';

import OverflowMenu from '../../components/ui/OverflowMenu';

import SearchField from '../../components/ui/SearchField';

import { sortAssignmentsByDueDate } from '../../utils/assignmentSort';

import { downloadProtectedFile, openProtectedPreview } from '../../services/fileService';



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

  const [submitNotice, setSubmitNotice] = useState(null);



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

  const [selectedResultIds, setSelectedResultIds] = useState([]);

  const [selectedAssignmentSubmissionIds, setSelectedAssignmentSubmissionIds] = useState([]);

  const [deletingAssignments, setDeletingAssignments] = useState(false);

  const [deletingResults, setDeletingResults] = useState(false);

  const [manageAssignments, setManageAssignments] = useState(false);

  const [manageResults, setManageResults] = useState(false);



  const allowedExtensions = [

    'pdf','doc','docx','txt','md','rtf','csv','tsv','json','xml','yaml','yml','xlsx','xls','ods','pptx','ppt','odp','zip','rar','7z','tar','gz',

    'py','ipynb','js','jsx','ts','tsx','cpp','c','h','hpp','java','php','cs','swift','go','rs','kt','kts','sql','html','htm','css','scss','sass','less','vue','svelte','sh','bat','ps1','rb','r','m','mm','dart','lua','pl',

    'jpg','jpeg','png','gif','webp','bmp','svg','heic','heif','tif','tiff','mp4','mkv','webm','mov','avi','wmv','mpeg','mpg','m4v','mp3','wav','ogg','aac','flac','m4a'

  ];



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
        setAssignments(asgns);
        setSelectedAsgn((previous) => {
          if (!previous) return previous;
          const fresh = asgns.find((item) => String(item._id) === String(previous._id));
          return fresh || previous;
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



  const showAlreadySubmittedNotice = () => {
    // Compact floating toast only — never a dashboard banner.
    setSubmitNotice({
      id: Date.now(),
      title: "Already submitted.",
      detail: "Your submission is saved.",
    });
  };

  useEffect(() => {
    if (!submitNotice) return undefined;
    const timer = setTimeout(() => setSubmitNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [submitNotice]);

  // Do not keep the toast after leaving the current dashboard view.
  useEffect(() => {
    setSubmitNotice(null);
  }, [activeTab, shellView]);

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
      showAlreadySubmittedNotice();
      return;
    }

    const fileExt = file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExt)) {

      alert(`Error: .${fileExt} files are not allowed.`);
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

    formData.append('file', file);



    try {

      const result = await studentService.submitAssignment(asgnId, formData);

      const submission = result?.submission;

      const submittedPatch = {
        isSubmitted: true,
        canSubmit: false,
        status: 'submitted',
        availabilityLabel: 'Awaiting evaluation',
        submissionId: submission?._id || null,
        originalFileName: submission?.originalFileName || '',
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

      setUploadStatus({ id: asgnId, loading: false, success: true });

      await fetchAllData();

      setTimeout(() => setUploadStatus({ id: null, loading: false, success: false }), 3000);

    } catch (err) {

      const errCode = err.response?.data?.code;
      const errMsg = err.response?.data?.message || "Submission Failed: Check if you are logged in.";
      const isDuplicate =
        errCode === "ALREADY_SUBMITTED" ||
        /already submitted/i.test(String(errMsg));

      if (isDuplicate) {
        showAlreadySubmittedNotice();
        await fetchAllData();
      } else {
        alert(errMsg);
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



  const toggleResultSelection = (id) => setSelectedResultIds((prev) =>

    prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]

  );



  const toggleAssignmentSubmission = (id) => setSelectedAssignmentSubmissionIds((previous) =>

    previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]

  );

  const handleDeleteSelectedAssignmentSubmissions = async () => {

    if (!selectedAssignmentSubmissionIds.length) return;

    if (!window.confirm(`Delete ${selectedAssignmentSubmissionIds.length} selected submission(s)? This cannot be undone.`)) return;

    setDeletingAssignments(true);

    try {

      await studentService.deleteMySubmissionsBulk(selectedAssignmentSubmissionIds);

      setSelectedAssignmentSubmissionIds([]);

      await fetchAllData();

    } catch (error) {

      alert(error.response?.data?.message || error.message || 'Could not delete selected submissions.');

    } finally { setDeletingAssignments(false); }

  };



  const handleDeleteSelectedResults = async () => {

    if (!selectedResultIds.length) return;

    if (!window.confirm(`Delete ${selectedResultIds.length} selected submission/result(s)? This cannot be undone.`)) return;

    setDeletingResults(true);

    try {

      await studentService.deleteMySubmissionsBulk(selectedResultIds);

      setSelectedResultIds([]);

      await fetchAllData();

    } catch (error) {

      alert(error.response?.data?.message || error.message || 'Could not delete selected results.');

    } finally {

      setDeletingResults(false);

    }

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
      if (assignmentStatusFilter === "all") return true;
      const status = String(asgn.status || "pending");
      if (assignmentStatusFilter === "pending") return status === "pending" || !asgn.status;
      if (assignmentStatusFilter === "submitted") return status === "submitted" || status === "Submitted";
      if (assignmentStatusFilter === "PUBLISHED") return status === "PUBLISHED";
      return true;
    }),
    assignmentSort
  );

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

          <nav className="space-y-2 flex-1">

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
        <header className="mb-6 md:mb-10 flex flex-wrap items-end justify-between gap-4">
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

          <div className="space-y-8 animate-in fade-in duration-700">

             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">

                <StatCard label="Assignments" value={totalCount} color="text-sky-400" icon={<FileText size={16}/>} sub="Assigned to you" />

                <StatCard label="Submitted" value={submittedCount} color="text-slate-400" icon={<CheckCircle size={16}/>} sub="Under Review" />

                <StatCard label="Graded" value={gradedCount} color="text-emerald-400" icon={<Award size={16}/>} sub="Results Published" />

                <StatCard label="Pending" value={pendingCount} color="text-slate-400" icon={<Clock size={16}/>} sub="Action Needed" />

                <StatCard label="Average Score" value={`${studentData.averageScore || 0}%`} color="text-sky-400" icon={<TrendingUp size={16}/>} sub="From graded work" />

             </div>



             <div className="qc-card">

                <h2 className="text-lg font-black uppercase italic text-white flex items-center gap-2 mb-6"><FileUp size={18} className="text-sky-500"/> Recent Assignments</h2>

                <div className="space-y-4">

                  {assignments.length > 0 ? (

                    assignments.slice(0, 5).map(asgn => (

                      <AssignmentRow key={asgn._id} asgn={asgn} onSelect={setSelectedAsgn} onUpload={handleFileUpload} onAlreadySubmitted={showAlreadySubmittedNotice} uploadStatus={uploadStatus} />

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

              <div className="qc-list-toolbar">

                <button

                  type="button"

                  className={`qc-manage-toggle ${manageResults ? 'is-active' : ''}`}

                  onClick={() => {

                    if (manageResults) {

                      setManageResults(false);

                      setSelectedResultIds([]);

                    } else {

                      setManageResults(true);

                    }

                  }}

                  aria-pressed={manageResults}

                  disabled={!checkedAssignments.length}

                >

                  <ListChecks size={14} aria-hidden="true" />{manageResults ? 'Done' : 'Manage'}

                </button>

                {manageResults && checkedAssignments.length > 0 && (

                  <>

                    <button

                      type="button"

                      className="qc-chat-toolbar-btn accent"

                      onClick={() => {

                        const eligible = checkedAssignments.map((item) => item.submissionId || item._id).filter(Boolean);

                        const allSelected = eligible.length > 0 && eligible.every((id) => selectedResultIds.includes(id));

                        setSelectedResultIds(allSelected ? [] : eligible);

                      }}

                    >

                      {checkedAssignments.every((item) => selectedResultIds.includes(item.submissionId || item._id))

                        ? 'Deselect all'

                        : 'Select all'}

                    </button>

                    <span className="qc-chat-selection-count" aria-live="polite">{selectedResultIds.length} selected</span>

                    <button type="button" onClick={handleDeleteSelectedResults} disabled={!selectedResultIds.length || deletingResults} className="qc-chat-toolbar-btn danger"><Trash2 size={14} aria-hidden="true"/>{deletingResults ? 'Deleting…' : 'Delete selected'}</button>

                  </>

                )}

              </div>

            </div>

            {checkedAssignments.length ? checkedAssignments.map((asgn) => {

              const total = asgn.totalMarks || asgn.points;

              return (

                <div key={asgn.submissionId || asgn._id} className="theme-card border p-4 sm:p-6 rounded-3xl flex flex-col md:flex-row md:items-center md:justify-between gap-5">

                  <div className="flex items-start gap-3 min-w-0">

                    {manageResults && (

                      <input aria-label={`Select ${asgn.title || 'result'}`} type="checkbox" checked={selectedResultIds.includes(asgn.submissionId || asgn._id)} onChange={() => toggleResultSelection(asgn.submissionId || asgn._id)} className="mt-2" />

                    )}

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

                    {(asgn.submissionId || asgn._id) && (

                      <OverflowMenu

                        label={`Actions for ${asgn.title || 'result'}`}

                        items={[{

                          id: `delete-result-${asgn.submissionId || asgn._id}`,

                          label: 'Delete submission',

                          danger: true,

                          icon: <Trash2 size={14} />,

                          onSelect: async () => {

                            const id = asgn.submissionId || asgn._id;

                            if (!window.confirm(`Delete your submission for "${asgn.title}"?`)) return;

                            try {

                              await studentService.deleteMySubmission(id);

                              setSelectedResultIds((previous) => previous.filter((item) => item !== id));

                              await fetchAllData();

                            } catch (error) {

                              alert(error.response?.data?.message || error.message || 'Could not delete submission.');

                            }

                          },

                        }]}

                      />

                    )}

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

          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">

             <div className="qc-assignments-toolbar mb-6">

               <SearchField

                 value={searchTerm}

                 onChange={setSearchTerm}

                 placeholder="Search by title…"

                 label="Filter assignments by title"

               />

               <select className="qc-toolbar-select" value={assignmentStatusFilter} onChange={(e) => setAssignmentStatusFilter(e.target.value)} aria-label="Filter by submission status">

                 <option value="all">All statuses</option>

                 <option value="pending">Pending</option>

                 <option value="submitted">Submitted</option>

                 <option value="PUBLISHED">Published</option>

               </select>

               <select className="qc-toolbar-select" value={assignmentSort} onChange={(e) => setAssignmentSort(e.target.value)} aria-label="Sort by due date">

                 <option value="due-asc">Due date: Earliest first</option>

                 <option value="due-desc">Due date: Latest first</option>

               </select>

               <button

                 type="button"

                 className={`qc-manage-toggle ${manageAssignments ? 'is-active' : ''}`}

                 onClick={() => {

                   if (manageAssignments) {

                     setManageAssignments(false);

                     setSelectedAssignmentSubmissionIds([]);

                   } else {

                     setManageAssignments(true);

                   }

                 }}

                 aria-pressed={manageAssignments}

                 disabled={!assignments.some((a) => a.submissionId)}

               >

                 <ListChecks size={14} aria-hidden="true" />{manageAssignments ? 'Done' : 'Manage'}

               </button>

               {manageAssignments && assignments.some((a) => a.submissionId) && (

                 <>

                   <button

                     type="button"

                     className="qc-chat-toolbar-btn accent"

                     onClick={() => {

                       const eligible = assignments.map((a) => a.submissionId).filter(Boolean);

                       const allSelected = eligible.length > 0 && eligible.every((id) => selectedAssignmentSubmissionIds.includes(id));

                       setSelectedAssignmentSubmissionIds(allSelected ? [] : eligible);

                     }}

                   >

                     {assignments.filter((a) => a.submissionId).every((a) => selectedAssignmentSubmissionIds.includes(a.submissionId))

                       ? 'Deselect all'

                       : 'Select all'}

                   </button>

                   <span className="qc-chat-selection-count" aria-live="polite">{selectedAssignmentSubmissionIds.length} selected</span>

                   <button type="button" onClick={handleDeleteSelectedAssignmentSubmissions} disabled={!selectedAssignmentSubmissionIds.length || deletingAssignments} className="qc-chat-toolbar-btn danger">

                     <Trash2 size={14} aria-hidden="true" />{deletingAssignments ? 'Deleting…' : 'Delete selected'}

                   </button>

                 </>

               )}

             </div>

             {filteredSortedAssignments.map(asgn => (

               <div key={asgn._id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">

                 <div className="flex items-start gap-3 min-w-0 flex-1">

                 {manageAssignments && (

                   <input type="checkbox" aria-label={`Select submission for ${asgn.title}`} className="mt-6 shrink-0" disabled={!asgn.submissionId} checked={Boolean(asgn.submissionId && selectedAssignmentSubmissionIds.includes(asgn.submissionId))} onChange={() => asgn.submissionId && toggleAssignmentSubmission(asgn.submissionId)} />

                 )}

                 <div className="flex-1 min-w-0"><AssignmentRow asgn={asgn} onSelect={setSelectedAsgn} onUpload={handleFileUpload} onAlreadySubmitted={showAlreadySubmittedNotice} uploadStatus={uploadStatus} onDeleteSubmission={asgn.submissionId ? async () => { if (!window.confirm(`Delete your submission for "${asgn.title}"?`)) return; try { await studentService.deleteMySubmission(asgn.submissionId); setSelectedAssignmentSubmissionIds(previous => previous.filter(id => id !== asgn.submissionId)); await fetchAllData(); } catch (error) { alert(error.response?.data?.message || error.message || 'Could not delete submission.'); } } : null} /></div>

                 </div>

               </div>

             ))}

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



                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  <button type="button" onClick={async () => { try { await openProtectedPreview(studentService.previewAssignment(selectedAsgn._id), selectedAsgn.originalFileName || 'assignment'); } catch (error) { alert(error.message); } }} className="py-4 border font-black uppercase text-[10px] rounded-xl flex items-center justify-center gap-2"><Eye size={16}/> Open Instructions</button>

                  <button type="button" onClick={async () => { try { await downloadProtectedFile(studentService.downloadAssignment(selectedAsgn._id), `${selectedAsgn.originalFileName || "assignment"}`); } catch (error) { alert(error.message); } }} className="py-4 bg-white text-black font-black uppercase text-[10px] rounded-xl hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"><Download size={16}/> Download Instructions</button>

                </div>

                {(selectedAsgn.isSubmitted || selectedAsgn.submissionId) && !selectedAsgn.marks && (
                  <p className="mt-4 text-center text-xs theme-muted font-semibold">
                    Submitted — awaiting evaluation
                  </p>
                )}

                {selectedAsgn.canSubmit === true && !selectedAsgn.isSubmitted && !selectedAsgn.submissionId && (
                  <p className="mt-4 text-center text-xs theme-muted">
                    Use <span className="font-semibold text-[var(--text)]">Upload</span> on the assignment card to submit your file.
                  </p>
                )}

                {selectedAsgn.submissionId && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">

                  <button type="button" onClick={async () => { try { await openProtectedPreview(studentService.previewSubmission(selectedAsgn.submissionId), selectedAsgn.originalFileName || 'my-submission'); } catch (error) { alert(error.message); } }} className="py-4 border font-black uppercase text-[10px] rounded-xl flex items-center justify-center gap-2"><Eye size={16}/> Open my file</button>

                  <button type="button" onClick={async () => { try { await downloadProtectedFile(studentService.downloadSubmission(selectedAsgn.submissionId), selectedAsgn.originalFileName || "my-submission"); } catch (error) { alert(error.message); } }} className="py-4 border font-black uppercase text-[10px] rounded-xl flex items-center justify-center gap-2"><Download size={16}/> Download my file</button>

                </div>}

             </div>

          </div>

        )}

        </>
        )}

        <AIChatbot role="student" showTrigger={false} />

        <MessagePanel role="student" showTrigger={false} />

        {submitNotice &&
          createPortal(
            <div
              className="qc-info-toast qc-info-toast--float"
              role="status"
              aria-live="polite"
              data-testid="qc-already-submitted-toast"
            >
              <div className="qc-info-toast__body">
                <p className="qc-info-toast__title">{submitNotice.title}</p>
                {submitNotice.detail ? (
                  <p className="qc-info-toast__detail">{submitNotice.detail}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="qc-info-toast__close"
                aria-label="Dismiss notice"
                onClick={() => setSubmitNotice(null)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>,
            document.body
          )}

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



function AssignmentRow({ asgn, onSelect, onUpload, onAlreadySubmitted, uploadStatus, onDeleteSubmission }) {

  const status = String(asgn.status || "").toLowerCase();
  const isSubmitted = Boolean(asgn.isSubmitted || asgn.submissionId || ["submitted", "published", "graded", "ai_graded"].includes(status));
  const isPublished = status === "published" || (asgn.marks !== undefined && asgn.marks !== null && isSubmitted);
  // Backend canSubmit is authoritative; resubmission is not supported while a submission exists.
  const canUpload = asgn.canSubmit === true && !isSubmitted;
  const availability = String(asgn.availabilityLabel || "").trim();
  const dueLabel = asgn.deadline?.split?.("T")?.[0] || (asgn.deadline ? String(asgn.deadline).slice(0, 10) : "N/A");
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
    return null;
  })();
  const metaLine = [
    `Due: ${dueLabel}`,
    statusMeta,
    `Max ${asgn.points ?? asgn.totalMarks ?? "--"}`,
  ].filter(Boolean).join(" · ");

  const actionLabel = (() => {
    if (uploadStatus.id === asgn._id) {
      if (uploadStatus.loading) return "...";
      if (uploadStatus.success) return "Submitted";
    }
    if (canUpload) return "Upload";
    if (isPublished) return "Published";
    if (isSubmitted) return "Submitted";
    return availability || "Closed";
  })();

  return (

    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 sm:p-5 qc-card !p-4 sm:!p-5 hover:border-[var(--accent)] transition-colors">

        <div className="flex items-center gap-3 sm:gap-4 min-w-0">

          <div className={`p-3 rounded-xl shrink-0 ${isSubmitted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>

            <FileText size={18}/>

          </div>

          <div className="min-w-0">

             <h4 className="font-semibold text-sm break-words">{asgn.title}</h4>

             <p className="text-xs theme-muted mt-0.5">{metaLine}</p>

          </div>

        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">

          <button type="button" onClick={() => onSelect(asgn)} className="p-2.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all" aria-label="View assignment"><Eye size={16}/></button>

          {canUpload ? (
            <label className="px-3 py-2 rounded-qc text-xs font-semibold cursor-pointer transition-all qc-btn-primary">
              {actionLabel}
              <input type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.tsv,.json,.xml,.yaml,.yml,.xlsx,.xls,.ods,.pptx,.ppt,.odp,.zip,.rar,.7z,.tar,.gz,.py,.ipynb,.js,.jsx,.ts,.tsx,.cpp,.c,.h,.hpp,.java,.php,.cs,.swift,.go,.rs,.kt,.kts,.sql,.html,.htm,.css,.scss,.sass,.less,.vue,.svelte,.sh,.bat,.ps1,.rb,.r,.m,.mm,.dart,.lua,.pl,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.heic,.heif,.tif,.tiff,.mp4,.mkv,.webm,.mov,.avi,.wmv,.mpeg,.mpg,.m4v,.mp3,.wav,.ogg,.aac,.flac,.m4a" className="hidden" onChange={(e) => onUpload(e, asgn._id)} />
            </label>
          ) : isSubmitted ? (
            <button
              type="button"
              className="px-3 py-2 rounded-qc text-xs font-semibold bg-[var(--surface-2)] theme-muted hover:border-[var(--accent)] border border-transparent transition-all"
              aria-label="Submission status"
              title="Submission already recorded"
              onClick={() => onAlreadySubmitted?.(asgn)}
            >
              {actionLabel}
            </button>
          ) : (
            <span
              className="px-3 py-2 rounded-qc text-xs font-semibold bg-[var(--surface-2)] theme-muted"
              aria-label={actionLabel}
            >
              {actionLabel}
            </span>
          )}

          {typeof onDeleteSubmission === 'function' && (

            <OverflowMenu

              label={`Actions for ${asgn.title || 'assignment'}`}

              items={[{

                id: `delete-submission-${asgn.submissionId || asgn._id}`,

                label: 'Delete my submission',

                danger: true,

                icon: <Trash2 size={14} />,

                onSelect: onDeleteSubmission,

              }]}

            />

          )}

        </div>

    </div>

  );

}

