import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Layout, Users, GraduationCap, FileText, Activity, 
  Trash2, Plus, Edit2, X, UserRound, UsersRound, ClipboardList,
  UserPlus, Check, Ban
} from 'lucide-react';
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, PieChart, Pie, Cell 
} from 'recharts';
import adminService from '../../services/adminService';
import SidebarControls from '../../components/common/SidebarControls';
import DashboardNavShell from '../../components/common/DashboardNavShell';
import DashboardLogoutButton from '../../components/common/DashboardLogoutButton';
import AIChatbot from '../../components/common/AIChatbot';
import MessagePanel from '../../components/common/MessagePanel';

export default function AdminDashboard() {
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [loading, setLoading] = useState(false);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [systemStats, setSystemStats] = useState({ 
    totalUsers: 0, totalTeachers: 0, totalStudents: 0, totalAssignments: 0, 
    chartData: [], assignmentBarData: [], pieData: [] 
  });
  const [viewData, setViewData] = useState([]);
  const [registrationFilter, setRegistrationFilter] = useState('pending');
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [pendingRegistrationCount, setPendingRegistrationCount] = useState(0);
  const [readyForApprovalCount, setReadyForApprovalCount] = useState(0);
  const [awaitingVerificationCount, setAwaitingVerificationCount] = useState(0);
  const [totalPendingCount, setTotalPendingCount] = useState(0);
  const [registrationActionId, setRegistrationActionId] = useState(null);

  const applyRegistrationCounts = (payload) => {
    const ready = Number(payload?.readyForApprovalCount ?? payload?.pendingCount ?? 0) || 0;
    const awaiting = Number(payload?.awaitingVerificationCount ?? 0) || 0;
    const total = Number(payload?.totalPendingCount ?? ready + awaiting) || 0;
    setReadyForApprovalCount(ready);
    setAwaitingVerificationCount(awaiting);
    setTotalPendingCount(total);
    // Sidebar badge = approval-ready (verified) only.
    setPendingRegistrationCount(ready);
  };

  const COLORS = ['var(--chart-primary)', 'var(--chart-secondary)', 'var(--chart-tertiary)', 'var(--chart-quaternary)'];

  // List of 40 Subjects
  const SUBJECTS = [
    "Introduction to IT (CS)", "Programming Fundamentals (CS)", "Object Oriented Programming (CS)",
    "Data Structures (CS)", "Digital Logic Design (CS)", "Operating Systems (CS)",
    "Database Systems (CS)", "Software Engineering (CS)", "Computer Networks (CS)",
    "Analysis of Algorithms (CS)", "Artificial Intelligence (CS)", "Web Engineering (CS)",
    "Mobile App Development (CS)", "Cyber Security (CS)", "Data Science (CS)",
    "Cloud Computing (CS)", "Theory of Automata (CS)", "Compiler Construction (CS)",
    "Human Computer Interaction (CS)", "Digital Image Processing (CS)", "Discrete Structures (SE)",
    "Software Requirement Eng. (SE)", "Software Design & Architecture (SE)", "Software Quality Assurance (SE)",
    "Software Project Management (SE)", "Formal Methods (SE)", "Software Re-Engineering (SE)",
    "Calculus & Analytical Geometry", "Linear Algebra", "Probability & Statistics",
    "Numerical Computing", "Differential Equations", "Pakistan Studies",
    "Islamic Studies", "English Composition", "Communication Skills",
    "Technical Report Writing", "Professional Ethics", "Psychology", "Management"
  ];

  useEffect(() => {
    fetchContent();
  }, [activeTab, registrationFilter]);

  const fetchContent = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Dashboard') {
        const res = await adminService.getSystemInsights();
        if (res) {
          setSystemStats({
            totalUsers: res.totalUsers || 0,
            totalTeachers: res.totalTeachers || 0,
            totalStudents: res.totalStudents || 0,
            totalAssignments: res.totalAssignments || 0,
            chartData: res.chartData || [],
            assignmentBarData: res.assignmentBarData || [],
            pieData: res.pieData || []
          });
        }
        try {
          const pending = await adminService.getRegistrationRequests('pending');
          applyRegistrationCounts(pending);
        } catch {
          /* non-blocking badge refresh */
        }
      } else if (activeTab === 'Registration Requests') {
        const res = await adminService.getRegistrationRequests(registrationFilter);
        setRegistrationRequests(Array.isArray(res?.requests) ? res.requests : []);
        applyRegistrationCounts(res);
      } else {
        let data = [];
        if (activeTab === 'Students') data = await adminService.getRecentUsers();
        else if (activeTab === 'Teachers') data = await adminService.getAllTeachers();
        else if (activeTab === 'Assignments') data = await adminService.getAllAssignments();
        
        setViewData(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
      setViewData([]);
      if (activeTab === 'Registration Requests') setRegistrationRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrationAction = async (id, action) => {
    if (!id || registrationActionId) return;
    setRegistrationActionId(id);
    try {
      if (action === 'approve') {
        await adminService.approveRegistrationRequest(id);
      } else {
        await adminService.rejectRegistrationRequest(id);
      }
      await fetchContent();
    } catch (err) {
      alert(err?.response?.data?.message || `Failed to ${action} registration request.`);
    } finally {
      setRegistrationActionId(null);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this?")) {
      try {
        if (activeTab === 'Assignments') await adminService.deleteAssignment(id);
        else await adminService.deleteUser(id);
        fetchContent();
      } catch (err) {
        const status = err?.response?.status;
        if (!err?.response) {
          alert("Server unavailable. Nothing was deleted. Connect the API/database and try again.");
        } else if (status === 401 || status === 403) {
          alert(err.response?.data?.message || "Not authorized to delete this record.");
        } else {
          alert(err.response?.data?.message || "Delete failed");
        }
      }
    }
  };

  const handleEditClick = (item) => {
    setEditingItem({...item}); // Spread to avoid direct state mutation
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
        await adminService.updateUser(editingItem._id, editingItem);
        setIsEditModalOpen(false);
        fetchContent();
        alert("Updated Successfully!");
    } catch {
        alert("Update failed");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/admin');
  };

  return (
    <DashboardNavShell
      widthClass="w-64"
      desktopMode="fixed"
      desktopOffsetClass="md:ml-64"
      mobileTitle="QuickCheck Hub"
      headerActions={<DashboardLogoutButton onClick={handleLogout} />}
      sidebar={
        <div className="p-6 flex flex-col flex-1 min-h-0">
          <div className="text-xl font-black mb-10 flex items-center gap-2 uppercase tracking-tighter text-white">
            <Activity className="text-sky-500" /> QuickCheck Hub
          </div>

          <nav className="space-y-2">
            <AdminLink icon={<Layout/>} label="Dashboard" active={activeTab === 'Dashboard'} onClick={() => setActiveTab('Dashboard')} />
            <AdminLink icon={<Users/>} label="Students" active={activeTab === 'Students'} onClick={() => setActiveTab('Students')} />
            <AdminLink icon={<GraduationCap/>} label="Teachers" active={activeTab === 'Teachers'} onClick={() => setActiveTab('Teachers')} />
            <AdminLink icon={<FileText/>} label="Assignments" active={activeTab === 'Assignments'} onClick={() => setActiveTab('Assignments')} />
            <AdminLink
              icon={<UserPlus/>}
              label="Registration Requests"
              active={activeTab === 'Registration Requests'}
              onClick={() => setActiveTab('Registration Requests')}
              badge={pendingRegistrationCount > 0 ? pendingRegistrationCount : null}
            />
          </nav>

          <SidebarControls
            role="admin"
            onRegistrationNotificationClick={() => {
              setRegistrationFilter('pending');
              setActiveTab('Registration Requests');
            }}
          />
        </div>
      }
    >
        <header className="flex flex-wrap justify-between items-center gap-3 mb-6 md:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black italic tracking-tighter uppercase">{activeTab}</h1>
          
          {(activeTab === 'Students' || activeTab === 'Teachers') && (
            <button 
              onClick={() => navigate(activeTab === 'Students' ? '/signup/student' : '/signup/teacher')} 
              className="bg-sky-500 text-black px-4 sm:px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20 text-xs tracking-widest"
            >
              <Plus size={18}/> ADD {activeTab.slice(0, -1).toUpperCase()}
            </button>
          )}
        </header>

        {loading ? (
          <div className="h-64 flex items-center justify-center font-bold text-sky-500 animate-pulse uppercase tracking-widest">Fetching System Data...</div>
        ) : activeTab === 'Dashboard' ? (
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <StatBox label="Total Users" value={systemStats.totalUsers} icon={<UsersRound size={20}/>} />
              <StatBox label="Teachers" value={systemStats.totalTeachers} icon={<GraduationCap size={20}/>} />
              <StatBox label="Students" value={systemStats.totalStudents} icon={<UserRound size={20}/>} />
              <StatBox label="Assignments" value={systemStats.totalAssignments} icon={<ClipboardList size={20}/>} />
            </div>
            {pendingRegistrationCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRegistrationFilter('pending');
                  setActiveTab('Registration Requests');
                }}
                className="w-full text-left p-4 sm:p-5 rounded-2xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/15 transition-colors"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-400 mb-1">Registration Requests</p>
                <p className="text-sm font-bold text-slate-200">
                  {readyForApprovalCount} ready for Admin approval
                  {awaitingVerificationCount > 0
                    ? ` · ${awaitingVerificationCount} awaiting email verification`
                    : ''}
                </p>
              </button>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <div className="p-4 sm:p-8 rounded-[2rem] border theme-card">
                <h3 className="mb-2 font-black uppercase text-slate-500 text-xs tracking-widest">Total Users</h3>
                <p className="text-[10px] text-slate-600 mb-5">User growth over the latest six months</p>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={systemStats.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
                      <XAxis dataKey="name" stroke="var(--chart-axis)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="var(--chart-axis)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border)', borderRadius: '12px'}} />
                      <Line type="monotone" dataKey="users" stroke="var(--chart-primary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-4 sm:p-8 rounded-[2rem] border theme-card">
                <h3 className="mb-2 font-black uppercase text-slate-500 text-xs tracking-widest">Total Assignments</h3>
                <p className="text-[10px] text-slate-600 mb-5">Assignments created over the latest six months</p>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={systemStats.assignmentBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
                      <XAxis dataKey="name" stroke="var(--chart-axis)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="var(--chart-axis)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--border)', borderRadius: '12px'}} />
                      <Bar dataKey="assignments" fill="var(--chart-primary)" radius={[8,8,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-4 sm:p-8 rounded-[2rem] border theme-card lg:col-span-2">
                <h3 className="mb-6 font-black uppercase text-slate-500 text-xs tracking-widest">Department Distribution</h3>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={systemStats.pieData} innerRadius={70} outerRadius={100} dataKey="value" paddingAngle={8}>
                        {systemStats.pieData.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'Registration Requests' ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-wrap justify-between items-end gap-3">
              <h2 className="text-xl sm:text-2xl font-black italic text-sky-500 uppercase tracking-tighter">
                Registration Requests
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total Pending</p>
                <p className="text-lg font-black text-slate-100">{totalPendingCount}</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-amber-400">Awaiting Email Verification</p>
                <p className="text-lg font-black text-amber-300">{awaitingVerificationCount}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Ready for Admin Approval</p>
                <p className="text-lg font-black text-emerald-300">{readyForApprovalCount}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setRegistrationFilter(status)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    registrationFilter === status
                      ? 'bg-sky-500 text-black'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {status === 'pending' ? 'Pending Requests' : status}
                </button>
              ))}
            </div>
            <RegistrationRequestsTable
              data={registrationRequests}
              filter={registrationFilter}
              actionId={registrationActionId}
              onApprove={(id) => handleRegistrationAction(id, 'approve')}
              onReject={(id) => handleRegistrationAction(id, 'reject')}
            />
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-wrap justify-between items-end gap-3">
                <h2 className="text-xl sm:text-2xl font-black italic text-sky-500 uppercase tracking-tighter">LISTING: {activeTab}</h2>
                <span className="text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">{viewData.length} Records found</span>
            </div>
            <DataTable data={viewData} onDelete={handleDelete} onEdit={handleEditClick} type={activeTab} />
          </div>
        )}
        <AIChatbot role="admin" showTrigger={false} />
        <MessagePanel role="admin" showTrigger={false} />

      {/* --- EDIT MODAL (FIXED WITH EMAIL AND DROPDOWN) --- */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
          <div className="theme-card border w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-8 relative shadow-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto my-0 sm:my-auto">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="absolute top-4 right-4 sm:top-6 sm:right-6 text-slate-500 hover:text-white p-2" aria-label="Close edit dialog">
              <X size={24}/>
            </button>
            <h2 className="text-xl sm:text-2xl font-black text-white italic uppercase mb-6 tracking-tighter pr-10">Edit {activeTab.slice(0,-1)}</h2>
            
            <form onSubmit={handleUpdate} className="space-y-4 custom-scrollbar">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={editingItem.name || editingItem.title || ''} 
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value, title: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white focus:border-sky-500 outline-none"
                />
              </div>

              {/* Email Field (Visible for both) */}
              {(activeTab === 'Students' || activeTab === 'Teachers') && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={editingItem.email || ''} 
                    onChange={(e) => setEditingItem({...editingItem, email: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white focus:border-sky-500 outline-none"
                  />
                </div>
              )}

              {/* Department Field */}
              {(activeTab === 'Students' || activeTab === 'Teachers') && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-1">Department</label>
                  <select 
                    value={editingItem.department || 'CS'} 
                    onChange={(e) => setEditingItem({...editingItem, department: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white focus:border-sky-500 outline-none"
                  >
                    <option value="CS">Computer Science (CS)</option>
                    <option value="SE">Software Engineering (SE)</option>
                  </select>
                </div>
              )}

              {/* Subject Dropdown ONLY for Teachers (Fixed with 40 subjects) */}
              {activeTab === 'Teachers' && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-1">Assigned Subject</label>
                  <select 
                    value={editingItem.subject || ''} 
                    onChange={(e) => setEditingItem({...editingItem, subject: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white focus:border-sky-500 outline-none"
                  >
                    <option value="">Select Subject</option>
                    {SUBJECTS.map((sub, idx) => (
                      <option key={idx} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reg # for Students */}
              {activeTab === 'Students' && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-1">Registration Number</label>
                  <input 
                    type="text" 
                    value={editingItem.registrationNumber || ''} 
                    readOnly
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-slate-500 cursor-not-allowed outline-none"
                  />
                </div>
              )}

              <button type="submit" className="w-full bg-sky-500 text-black font-black py-4 rounded-2xl hover:bg-sky-400 transition-all uppercase tracking-widest text-xs mt-4">
                Update Record
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardNavShell>
  );
}

// Sub-components
function AdminLink({ icon, label, active, onClick, badge = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 rounded-2xl cursor-pointer font-black transition-all text-left ${active ? 'bg-sky-500 text-black shadow-lg shadow-sky-500/30' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-widest flex-1">{label}</span>
      {badge != null && (
        <span className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] flex items-center justify-center ${active ? 'bg-black/20 text-black' : 'bg-sky-500 text-black'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function RegistrationRequestsTable({ data, filter, actionId, onApprove, onReject }) {
  const colSpan = filter === 'pending' ? 7 : 6;
  return (
    <div className="rounded-3xl border theme-card overflow-hidden shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left">
          <thead className="theme-surface text-[10px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
            <tr>
              <th className="p-3 sm:p-5">Full Name</th>
              <th className="p-3 sm:p-5">Email</th>
              <th className="p-3 sm:p-5">Requested Role</th>
              <th className="p-3 sm:p-5">Registration Date</th>
              <th className="p-3 sm:p-5">Email Verified</th>
              <th className="p-3 sm:p-5">Status</th>
              {filter === 'pending' && <th className="p-3 sm:p-5 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.length > 0 ? data.map((item) => (
              <tr key={item.id} className="hover:bg-sky-500/5 transition-colors">
                <td className="p-3 sm:p-5 font-bold text-sm text-slate-200">{item.name}</td>
                <td className="p-3 sm:p-5 text-slate-400 text-sm break-all">{item.email}</td>
                <td className="p-3 sm:p-5 text-[10px] font-black uppercase tracking-widest text-sky-400">
                  {item.role}
                </td>
                <td className="p-3 sm:p-5 text-slate-400 text-sm whitespace-nowrap">
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                </td>
                <td className="p-3 sm:p-5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                  {item.emailVerified === true ? (
                    <span className="text-emerald-400">Verified</span>
                  ) : item.approvalStatus === 'pending' ? (
                    <span className="text-amber-400">Unverified</span>
                  ) : (
                    <span className="text-slate-500">Not recorded</span>
                  )}
                </td>
                <td className="p-3 sm:p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {item.approvalStatus}
                </td>
                {filter === 'pending' && (
                  <td className="p-3 sm:p-5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        disabled={actionId === item.id || item.emailVerified !== true}
                        onClick={() => onApprove(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 rounded-xl hover:bg-emerald-400 hover:text-black transition-all disabled:opacity-50"
                        aria-label={`Approve ${item.name}`}
                        title={item.emailVerified !== true ? 'Email must be verified first' : 'Approve'}
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionId === item.id}
                        onClick={() => onReject(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-400/10 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                        aria-label={`Reject ${item.name}`}
                      >
                        <Ban size={14} /> Reject
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )) : (
              <tr>
                <td colSpan={colSpan} className="p-10 sm:p-20 text-center italic text-slate-500 uppercase tracking-widest text-xs font-bold">
                  No {filter} registration requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon }) {
  const [selected, setSelected] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setSelected((current) => !current)}
      aria-pressed={selected}
      className={`w-full text-left p-5 sm:p-8 rounded-[2rem] border theme-card shadow-lg transition-all duration-200 hover:-translate-y-1 hover:border-[var(--accent)] ${selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <span className={`p-3 rounded-xl border transition-colors ${selected ? 'accent-soft accent-text' : 'theme-page theme-muted'}`} style={{borderColor: selected ? 'var(--accent)' : 'var(--border)'}}>{icon}</span>
      </div>
      <p className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">{label}</p>
      <h3 className="text-4xl font-black accent-text">{value || 0}</h3>
    </button>
  );
}

function DataTable({ data, onDelete, onEdit, type }) {
  const isAssignment = type === 'Assignments';
  const isStudent = type === 'Students';

  return (
    <div className="rounded-3xl border theme-card overflow-hidden shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead className="theme-surface text-[10px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
            <tr>
              <th className="p-3 sm:p-5">{isAssignment ? 'Title' : 'Full Name'}</th>
              <th className="p-3 sm:p-5">{isStudent ? 'Reg #' : (isAssignment ? 'Teacher' : 'Subject')}</th>
              <th className="p-3 sm:p-5">{isAssignment ? 'Due Date' : 'Dept'}</th>
              <th className="p-3 sm:p-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.length > 0 ? data.map((item) => (
              <tr key={item._id} className="hover:bg-sky-500/5 transition-colors group">
                <td className="p-3 sm:p-5 font-bold text-sm text-slate-200">
                  {isAssignment ? item.title : item.name}
                  {!isAssignment && <div className="text-[10px] text-slate-500 font-normal break-all">{item.email}</div>}
                </td>
                <td className="p-3 sm:p-5 text-slate-400 text-sm whitespace-nowrap">
                  {isStudent ? (item.registrationNumber || 'N/A') : (isAssignment ? (item.teacherName || "Admin") : (item.subject || 'Not Assigned'))}
                </td>
                <td className="p-3 sm:p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  {isAssignment ? (item.deadline ? new Date(item.deadline).toLocaleDateString() : 'N/A') : (item.department || 'CS')}
                </td>
                <td className="p-3 sm:p-5 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2 justify-end">
                    {!isAssignment && <button type="button" onClick={() => onEdit(item)} className="p-2 text-sky-400 bg-sky-400/10 rounded-xl hover:bg-sky-400 hover:text-black transition-all" aria-label="Edit record">
                      <Edit2 size={16}/>
                    </button>}
                    <button type="button" onClick={() => onDelete(item._id)} className="p-2 text-red-500 bg-red-500/10 rounded-xl hover:bg-red-500 hover:text-white transition-all" aria-label="Delete record">
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="4" className="p-10 sm:p-20 text-center italic text-slate-500 uppercase tracking-widest text-xs font-bold">No {type} found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

