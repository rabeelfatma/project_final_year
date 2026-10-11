import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, PlusCircle, BookOpen, ClipboardCheck, Users, RotateCcw,
  LogOut, Loader2, FileUp, X, CheckCircle, TrendingUp, Download,
  ShieldCheck, Clock, Trash2, Edit3, Sparkles, MessageSquare,
  Send, Eye, AlertCircle, ShieldAlert, FileText
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import teacherService from '../../services/teacherService';
import SidebarControls from '../../components/common/SidebarControls';
import AIChatbot from '../../components/common/AIChatbot';
import MessagePanel from '../../components/common/MessagePanel';
import { downloadProtectedFile, openProtectedPreview } from '../../services/fileService';
import api from '../../utils/api';

// ─── Sub-components ───────────────────────────────────────────
function SidebarItem({ icon, label, active, onClick }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all ${
      active ? 'bg-sky-500 text-black font-black shadow-lg shadow-sky-500/20' : 'text-slate-500 hover:bg-slate-800/50 hover:text-white font-bold'
    }`}>
      {icon} <span className="text-[10px] uppercase tracking-widest font-black">{label}</span>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  const [selected, setSelected] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setSelected((current) => !current)}
      aria-pressed={selected}
      className={`w-full text-left theme-card border p-6 rounded-3xl relative overflow-hidden group transition-all duration-200 hover:-translate-y-1 hover:border-[var(--accent)] ${selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20' : ''}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 rounded-lg theme-page border transition-colors" style={{borderColor: selected ? 'var(--accent)' : 'var(--border)', color: selected ? 'var(--accent)' : 'var(--muted)'}}>{icon}</div>
      </div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <h3 className="text-3xl font-black accent-text tracking-tighter">{value || 0}</h3>
    </button>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
      <div className={`w-2 h-2 rounded-full ${color}`}></div> {label}
    </div>
  );
}

function NoDataMessage({ icon, message }) {
  return (
    <div className="theme-card border p-20 rounded-3xl text-center w-full">
      <div className="mx-auto text-slate-700 mb-4 opacity-20 flex justify-center">{icon}</div>
      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{message}</p>
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
  const [loading, setLoading]                   = useState(true);
  const [editingId, setEditingId]               = useState(null);
  const [stats, setStats]                       = useState({ totalCreated: 0, totalStudents: 0, pendingCount: 0, completedCount: 0 });
  const [assignments, setAssignments]           = useState([]);
  const [students, setStudents]                 = useState([]);
  const [submissions, setSubmissions]           = useState([]);
  const [selectedSubmissions, setSelectedSubmissions] = useState([]);
  const [selectedAssignments, setSelectedAssignments] = useState([]);
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
  const [checkingPlagiarism, setCheckingPlagiarism] = useState(false);
  const [plagiarismResults, setPlagiarismResults] = useState([]);
  const [activePieIndex, setActivePieIndex]     = useState(null);
  const [form, setForm] = useState({ title: '', startDate: '', deadline: '', description: '', points: '', file: null, existingFileName: '', existingFileId: '' });

  // ── Fetch ─────────────────────────────────────────────────
  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [sData, aData, subData, stData] = await Promise.all([
        teacherService.getOverviewStats().catch(() => null),
        teacherService.getMyAssignments().catch(() => []),
        teacherService.getRecentSubmissions().catch(() => []),
        teacherService.getStudents().catch(() => []),
      ]);

      const safeAssignments = Array.isArray(aData) ? aData : [];
      const safeSubmissions = Array.isArray(subData) ? subData : [];
      const safeStudents    = Array.isArray(stData) ? stData : [];

      // ✅ FIX: Debug log — check what's coming from backend
      console.log("SUBMISSIONS:", safeSubmissions);

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
      setLoading(false);
    }
  };

  useEffect(() => { fetchAllData(); }, []);

  // Auto-deactivate overdue
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setAssignments(prev => prev.map(asgn =>
        new Date(asgn.deadline) < now && asgn.status !== 'deactive'
          ? { ...asgn, status: 'deactive' }
          : asgn
      ));
    }, 60000);
    return () => clearInterval(interval);
  }, [assignments]);

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
    if (!aiInstructions.trim()) return alert('❌ Please provide grading instructions first!');
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
        alert("✅ AI Grading Completed. Students can see the checked score and feedback in Checked Results.");
      }
      setSelectedSubmissions([]);
      fetchAllData();
    } catch (err) {
      alert('❌ AI Grading Failed. Check Server Console.');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Publish Bulk ──────────────────────────────────────────
  const handlePublishBulk = async () => {
    if (selectedSubmissions.length === 0) return;
    try {
      setIsPublishing(true);
      await teacherService.publishBulkResults({ submissionIds: selectedSubmissions });
      alert(`✅ Successfully published ${selectedSubmissions.length} results to students!`);
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
  const openReviewModal = (submission) => {
    setSelectedReview(submission);
    setManualScore(submission.marks ?? '');
    setTeacherNote(submission.feedback || '');
    setReviewModalOpen(true);
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

  // ── File handlers ─────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = [
      'pdf','doc','docx','txt','md','rtf','csv','tsv','json','xml','yaml','yml','xlsx','xls','ods','pptx','ppt','odp','zip','rar','7z','tar','gz',
      'py','ipynb','js','jsx','ts','tsx','cpp','c','h','hpp','java','php','cs','swift','go','rs','kt','kts','sql','html','htm','css','scss','sass','less','vue','svelte','sh','bat','ps1','rb','r','m','mm','dart','lua','pl',
      'jpg','jpeg','png','gif','webp','bmp','svg','heic','heif','tif','tiff','mp4','mkv','webm','mov','avi','wmv','mpeg','mpg','m4v','mp3','wav','ogg','aac','flac','m4a'
    ];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { alert('❌ File extension not allowed!'); e.target.value = null; return; }
    setForm({ ...form, file });
  };

  const handleMultimediaChange = (e) => {
    const chosen = Array.from(e.target.files || []);
    if (chosen.length > 20) alert('Maximum 20 reference files/images can be selected at once.');
    setMultimediaFiles(chosen.slice(0, 20));
  };

  const handleStatusToggle = async (id, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'deactive' : 'active';
      await teacherService.updateAssignmentStatus(id, { status: newStatus });
      fetchAllData();
    } catch { alert('❌ Failed to change status.'); }
  };

  const handleDeleteAssignment = async (id) => {
    if (!window.confirm('Delete this assignment?')) return;
    try { await teacherService.deleteAssignment(id); fetchAllData(); }
    catch { alert('❌ Failed to delete.'); }
  };

  const handleDeleteSelectedAssignments = async () => {
    if (!selectedAssignments.length || !window.confirm(`Delete ${selectedAssignments.length} selected assignments?`)) return;
    try { await teacherService.deleteAssignmentsBulk(selectedAssignments); setSelectedAssignments([]); fetchAllData(); }
    catch { alert('❌ Failed to delete selected assignments.'); }
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
    if (!form.title || !form.startDate || !form.deadline || !form.points || Number(form.points) <= 0) return alert('Title, Start Date, Deadline, and Total Marks are mandatory.');
    try {
      const formData = new FormData();
      formData.append('title',       form.title);
      formData.append('startDate',   new Date(form.startDate).toISOString());
      formData.append('deadline',    new Date(form.deadline).toISOString());
      formData.append('description', form.description || '');
      formData.append('points', String(form.points));
      if (form.file) formData.append('file', form.file);

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
      <Loader2 className="animate-spin text-sky-500 mb-4" size={48} />
      <p className="text-white font-bold tracking-[0.3em] text-[10px]">SYNCING EDUCORRE...</p>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="flex h-screen theme-page font-sans overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-64 theme-card border-r border-slate-800 flex flex-col overflow-y-auto custom-scrollbar">
        <div className="p-8">
          <div className="flex items-center gap-3 text-white mb-10">
            <div className="bg-sky-500 p-2 rounded-lg text-black"><ShieldCheck size={20}/></div>
            <span className="font-black text-xl tracking-tighter">EDUCORRE</span>
          </div>
          <nav className="space-y-1">
            <SidebarItem icon={<Layout size={18}/>}        label="Overview"          active={activeTab==='dashboard'}    onClick={() => { setActiveTab('dashboard'); setEditingId(null); }} />
            <SidebarItem icon={<PlusCircle size={18}/>}    label={editingId ? 'Editing Mode' : 'Create Assignment'} active={activeTab==='create'} onClick={() => setActiveTab('create')} />
            <SidebarItem icon={<BookOpen size={18}/>}      label="My Assignments"    active={activeTab==='assignments'}  onClick={() => { setActiveTab('assignments'); setEditingId(null); }} />
            <SidebarItem icon={<ClipboardCheck size={18}/>} label="Submissions"      active={activeTab==='submissions'}  onClick={() => setActiveTab('submissions')} />
            <SidebarItem icon={<ShieldAlert size={18}/>} label="Plagiarism"       active={activeTab==='plagiarism'}   onClick={() => setActiveTab('plagiarism')} />
            <SidebarItem icon={<Users size={18}/>}         label="Students"          active={activeTab==='students'}     onClick={() => setActiveTab('students')} />
          </nav>
        </div>
        <div className="px-6"><SidebarControls role="teacher" /></div>
        <button onClick={() => { localStorage.clear(); navigate('/login'); }} className="mt-auto p-8 flex items-center gap-3 text-slate-500 hover:text-red-400 border-t border-slate-800 transition-colors">
          <LogOut size={18}/> <span className="font-bold text-xs uppercase">Disconnect</span>
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto p-10 theme-page relative">
        

        {/* ══ DASHBOARD TAB ══ */}
        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-700">
            <header className="mb-10 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Teacher Dashboard</h1>
                <p className="text-slate-400 text-sm mt-1">Live analytics and classroom performance.</p>
              </div>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <StatCard label="Total Assignments" value={stats.totalCreated} icon={<BookOpen size={16}/>}/>
              <StatCard label="Total Students" value={stats.totalStudents} icon={<Users size={16}/>}/>
              <StatCard label="Pending Graded" value={stats.pendingCount} icon={<Clock size={16}/>}/>
              <StatCard label="Successful Graded" value={stats.completedCount} icon={<CheckCircle size={16}/>}/>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 theme-card border p-8 rounded-3xl">
                <h3 className="text-white font-bold mb-6 flex items-center gap-2"><TrendingUp className="text-sky-500" size={18}/> Activity Insights</h3>
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

              <div className="theme-card border p-8 rounded-3xl flex flex-col items-center justify-center">
                <h3 className="text-white font-bold mb-2">Grading Progress</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Click a slice for details</p>

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
                  <LegendItem color="bg-amber-500"   label="Pending"/>
                  <LegendItem color="bg-emerald-500" label="Graded"/>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ CREATE TAB ══ */}
        {activeTab === 'create' && (
          <div className="max-w-3xl mx-auto animate-in zoom-in-95 duration-500">
            <h1 className="text-2xl font-black text-white mb-8 tracking-tighter uppercase">
              {editingId ? 'Update Assignment' : 'New Assignment'}
            </h1>
            <form onSubmit={handleCreateOrUpdate} className="theme-card border p-10 rounded-3xl space-y-8 shadow-2xl">
              <div>
                <label className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-2 block">Assignment Title</label>
                <input type="text" className="w-full theme-input border rounded-xl p-4 text-sm outline-none" value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="e.g. System Design Analysis"/>
              </div>
              <div>
                <label className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-2 block">Total Marks</label>
                <input type="number" min="1" className="w-full theme-input border rounded-xl p-4 text-sm outline-none" value={form.points} onChange={e => setForm({...form, points:e.target.value})} placeholder="e.g. 30" />
                <p className="text-[9px] text-slate-500 mt-2">Students will see their score as obtained / this total only after grading.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-2 block">Start Date</label>
                  <input type="datetime-local" className="w-full theme-input border rounded-xl p-4 text-sm outline-none focus:ring-2 ring-[var(--accent)]/50" value={form.startDate} onChange={e => setForm({...form, startDate:e.target.value})}/>
                </div>
                <div>
                  <label className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-2 block">Deadline Date</label>
                  <input type="datetime-local" className="w-full theme-input border rounded-xl p-4 text-sm outline-none focus:ring-2 ring-[var(--accent)]/50" value={form.deadline} onChange={e => setForm({...form, deadline:e.target.value})}/>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-2 block">Description</label>
                <textarea className="w-full theme-input border rounded-xl p-4 text-sm h-40 resize-none outline-none" value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Instructions..."/>
              </div>
              <div className="border-2 border-dashed border-slate-800 rounded-2xl p-10 text-center cursor-pointer hover:bg-sky-500/5 transition-all" onClick={() => fileInputRef.current.click()}>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange}/>
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
              <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest hover:shadow-lg transition-all">
                {editingId ? 'Update Assignment' : 'Upload Assignment'}
              </button>
            </form>
          </div>
        )}

        {/* ══ ASSIGNMENTS TAB ══ */}
        {activeTab === 'assignments' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8 gap-4">
              <h1 className="text-3xl font-black text-white tracking-tighter uppercase">My Assignments</h1>
              <div className="flex items-center gap-3">
                <label className="text-[10px] font-black uppercase theme-muted flex items-center gap-2"><input type="checkbox" checked={assignments.length > 0 && selectedAssignments.length === assignments.length} onChange={(e) => setSelectedAssignments(e.target.checked ? assignments.map((a) => a._id) : [])}/> Select all</label>
                {selectedAssignments.length > 0 && <button type="button" onClick={handleDeleteSelectedAssignments} className="bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase"><Trash2 size={13} className="inline mr-1"/> Delete selected</button>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {assignments.map((asgn) => {
                const isOverdue = new Date(asgn.deadline) < new Date();
                const displayStatus = isOverdue ? 'deactive' : (asgn.status || 'active');
                return (
                  // ✅ FIX: key uses _id instead of index
                  <div key={asgn._id} className="theme-card border p-6 rounded-2xl flex justify-between items-center hover:border-sky-500/30 transition-all">
                    <div className="flex items-center gap-4 flex-1">
                      <input type="checkbox" checked={selectedAssignments.includes(asgn._id)} onChange={() => setSelectedAssignments((prev) => prev.includes(asgn._id) ? prev.filter((x) => x !== asgn._id) : [...prev, asgn._id])}/>
                      <div className="flex-1">
                      <h3 className="text-white font-bold text-lg">{asgn.title}</h3>
                      <div className="flex flex-col gap-1 mt-2">
                        <p className="text-slate-500 text-[10px] uppercase tracking-widest font-black flex items-center gap-1">
                          <Clock size={12}/> Created: {new Date(asgn.createdAt).toLocaleString()}
                        </p>
                        <p className={`text-[10px] uppercase tracking-widest font-black flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                          <Clock size={12}/> Deadline: {new Date(asgn.deadline).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {asgn.file && <button onClick={async()=>{try{await openProtectedPreview(teacherService.previewAssignment(asgn._id), asgn.originalFileName || 'assignment');}catch(e){alert(e.message);}}} className="p-2 text-slate-400 hover:text-sky-400" title="Open inside browser"><Eye size={18}/></button>}
                      {asgn.file && <button onClick={async()=>{try{await downloadProtectedFile(teacherService.downloadAssignment(asgn._id),asgn.originalFileName||"assignment");}catch(e){alert(e.message);}}} className="p-2 text-slate-400 hover:text-sky-400" title="Download original reference file"><Download size={18}/></button>}
                      <button onClick={() => handleEditSetup(asgn)} className="p-2 text-slate-400 hover:text-sky-400"><Edit3 size={18}/></button>
                      <button onClick={() => handleDeleteAssignment(asgn._id)} className="p-2 text-slate-400 hover:text-red-400"><Trash2 size={18}/></button>
                      <button onClick={() => handleStatusToggle(asgn._id, displayStatus)} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase border tracking-widest transition-all ${displayStatus==='deactive' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-sky-500/10 text-sky-500 border-sky-500/20 hover:bg-sky-500 hover:text-white'} ${isOverdue ? 'cursor-not-allowed opacity-70' : ''}`}>
                        {displayStatus === 'deactive' ? 'Deactive' : 'Active'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {assignments.length === 0 && <NoDataMessage icon={<BookOpen size={40}/>} message="No assignments found."/>}
            </div>
          </div>
        )}

        {/* ══ SUBMISSIONS TAB ══ */}
        {activeTab === 'submissions' && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col gap-6 mb-8">
              <div className="flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Submissions</h1>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">
                    Selected: <span className={selectedSubmissions.length >= 40 ? 'text-red-500' : 'text-sky-500'}>{selectedSubmissions.length}</span> / 40
                  </p>
                </div>
                <div className="flex gap-3">
                  {selectedSubmissions.length > 0 && (
                    <>
                      <button onClick={handleAiEvaluation} disabled={aiLoading} className="bg-sky-500 hover:bg-sky-400 text-black px-6 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-lg shadow-sky-500/20">
                        {aiLoading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                        AI Evaluate
                      </button>
                      <button onClick={handlePlagiarismCheck} disabled={checkingPlagiarism} className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all">
                        {checkingPlagiarism ? <Loader2 size={14} className="animate-spin"/> : <ShieldAlert size={14}/>}
                        Check Plagiarism
                      </button>
                      <button onClick={handlePublishBulk} disabled={isPublishing} className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
                        {isPublishing ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
                        Publish Marks
                      </button>
                      <button onClick={handleResetSelectedGrades} className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2"><RotateCcw size={14}/> Reset grades</button>
                      <button onClick={handleDeleteSelectedSubmissions} className="bg-red-500 hover:bg-red-400 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2"><Trash2 size={14}/> Delete selected</button>
                    </>
                  )}
                </div>
              </div>

              {/* Grading Instructions */}
              <div className="theme-card border p-6 rounded-3xl flex flex-col gap-4">
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
                <div className="flex items-center gap-4 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                    <FileUp size={14}/> Attach Reference File (Optional)
                  </div>
                  <div
                    className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg theme-page border border-slate-700 hover:border-sky-500/50 transition-all"
                    onClick={() => multimediaInputRef.current.click()}
                  >
                    <input type="file" ref={multimediaInputRef} className="hidden" accept="*/*" multiple onChange={handleMultimediaChange}/>
                    {multimediaFiles.length ? (
                      <div className="flex items-center gap-2 text-sky-400 text-[10px] font-bold">
                        <CheckCircle size={12}/>
                        <span className="max-w-[220px] truncate">{multimediaFiles.length} file(s) selected</span>
                        <X size={12} className="text-slate-500 hover:text-white" onClick={e => { e.stopPropagation(); setMultimediaFiles([]); if (multimediaInputRef.current) multimediaInputRef.current.value = null; }}/>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[10px] font-bold">Choose reference files</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Submissions Table */}
            <div className="theme-card border rounded-3xl overflow-hidden shadow-2xl">
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
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
                      <th className="p-5 text-center">Delete</th>
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
                            <div className="flex flex-col items-start gap-1 min-w-[130px]">
                              <span className="text-xs font-black accent-text">AI Marks: {sub.aiScore != null ? `${sub.aiScore}/${sub.totalMarks || sub.assignment?.points || '--'}` : `--/${sub.totalMarks || sub.assignment?.points || '--'}`}</span>
                              <span className="text-xs font-black" style={{color: 'var(--text)'}}>Teacher Marks: {sub.marks != null ? `${sub.marks}/${sub.totalMarks || sub.assignment?.points || '--'}` : `--/${sub.totalMarks || sub.assignment?.points || '--'}`}</span>
                            </div>
                          ) : <span className="theme-muted text-[10px] font-black uppercase">Not checked</span>}
                        </td>

                        {/* ✅ FIX 6: Clean status badge — 4 states */}
                        <td className="p-5">
                          <span className={`px-2 py-1 rounded text-[10px] font-black ${
                            sub.status === 'PUBLISHED'                            ? 'bg-emerald-500/20 text-emerald-500' :
                            sub.status === 'AI_GRADED'                            ? 'bg-orange-500/20 text-orange-400'  :
                            ['graded','GRADED'].includes(sub.status)              ? 'bg-indigo-500/20 text-indigo-400'  :
                            sub.status === 'submitted'                            ? 'bg-amber-500/20 text-amber-500'    :
                                                                                    'bg-slate-500/20 text-slate-400'
                          }`}>
                            {sub.status === 'AI_GRADED'                ? 'AI GRADED' :
                             sub.status === 'PUBLISHED'                ? 'PUBLISHED' :
                             ['graded','GRADED'].includes(sub.status)  ? 'GRADED'    :
                             sub.status === 'submitted'                ? 'SUBMITTED' : 'PENDING'}
                          </span>
                        </td>

                        {/* Eye button — always visible */}
                        <td className="p-5 text-center">
                          <button onClick={() => openReviewModal(sub)} className="p-2 text-slate-400 hover:text-sky-400 transition-colors" title="Review Evaluation"><Eye size={18}/></button>
                          <button onClick={async()=>{try{await openProtectedPreview(teacherService.previewSubmission(sub._id),sub.originalFileName||'submission');}catch(e){alert(e.message);}}} className="p-2 text-slate-400 hover:text-emerald-400" title="Open submitted file"><FileText size={17}/></button>
                        </td>
                        <td className="p-5 text-center"><button onClick={() => handleDeleteSubmission(sub._id)} className="p-2 text-red-400 hover:text-red-300" title="Delete submission"><Trash2 size={17}/></button></td>
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
            <div className="flex items-start justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase">Plagiarism Check</h1>
                <p className="text-slate-500 text-xs max-w-2xl">Local similarity checking compares extracted text from submissions of the same assignment. It is an indicator for teacher review, not an automatic misconduct decision.</p>
              </div>
              <button onClick={handlePlagiarismCheck} disabled={checkingPlagiarism || selectedSubmissions.length === 0} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black px-5 py-3 rounded-xl font-black text-[10px] uppercase flex items-center gap-2">
                {checkingPlagiarism ? <Loader2 size={14} className="animate-spin"/> : <ShieldAlert size={14}/>} Run Check
              </button>
            </div>
            <div className="theme-card border rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
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
                        <td className="p-5"><span className={`px-2 py-1 rounded text-[10px] font-black ${row.status === 'HIGH' ? 'bg-red-500/20 text-red-400' : row.status === 'REVIEW' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{row.status}</span></td>
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
            <h1 className="text-3xl font-black text-white mb-8 tracking-tighter uppercase">Student Directory</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {students.map((st) => (
                // ✅ FIX: key uses _id instead of index
                <div key={st._id} className="theme-card border p-6 rounded-[2rem] flex items-center gap-4 hover:border-sky-50 transition-all group">
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
        <AIChatbot role="teacher" showTrigger={false} />
        <MessagePanel role="teacher" showTrigger={false} />
      </main>

      {/* ══ REVIEW MODAL ══ */}
      {reviewModalOpen && selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="theme-card border w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95">

            <div className="p-8 border-b border-slate-800 flex justify-between items-center theme-surface">
              <div>
                <h2 className="text-white font-black text-xl tracking-tighter uppercase">Review Evaluation</h2>
                <p className="text-sky-500 text-[10px] font-black uppercase tracking-widest">
                 {selectedReview.student?.name || selectedReview.studentName || 'Unknown'}

               {/* ✅ FIXED: Safe regNo fallback */}
              {(selectedReview.student?.registrationNumber || selectedReview.studentRegNo) && (
            <span className="ml-2 text-slate-500">
            — {selectedReview.student?.registrationNumber || selectedReview.studentRegNo}
              </span>
                )}
                </p>
                <div className="mt-3 flex gap-4">
                  <button onClick={async () => { try { await openProtectedPreview(teacherService.previewSubmission(selectedReview._id), selectedReview.originalFileName || 'student-submission'); } catch (error) { alert(error.message); } }} className="text-[10px] font-black uppercase accent-text flex items-center gap-2"><Eye size={14}/> Open file</button>
                  <button onClick={async () => { try { await downloadProtectedFile(teacherService.downloadSubmission(selectedReview._id), selectedReview.originalFileName || 'student-submission'); } catch (error) { alert(error.message); } }} className="text-[10px] font-black uppercase accent-text flex items-center gap-2"><Download size={14}/> Download file</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
              <button type="button" onClick={() => handleResetSubmissionGrade(selectedReview._id)} className="rounded-lg border border-amber-500/40 px-3 py-2 text-[9px] font-black uppercase text-amber-400 hover:bg-amber-500/10" title="Clear current grading to allow regrading">Reset grade</button>
              <button onClick={() => setReviewModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                <X size={24}/>
              </button>
              </div>
            </div>

            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-6">
              {/* AI Feedback */}
              <div className="theme-page p-6 rounded-2xl border border-slate-800">
                <h4 className="text-slate-500 font-black text-[10px] uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Sparkles size={14} className="text-sky-500"/> AI Feedback & Mistakes
                </h4>
                <p className="text-white text-sm leading-relaxed italic">
                  {selectedReview.aiFeedback || 'No AI feedback available yet'}
                </p>
              </div>

              {/* Scores */}
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Maximum marks: {selectedReview.totalMarks || selectedReview.assignment?.points || 'Not set'}</p>
              <div className="grid grid-cols-2 gap-4">
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
                    className="w-24 bg-transparent text-center text-2xl font-black accent-text outline-none border-b"
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

            <div className="p-8 theme-surface border-t border-slate-800 flex gap-4">
              <button
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

    </div>
  );
}