import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Layout, Users, GraduationCap, FileText, Activity, 
  Trash2, Edit2, X, UserRound, UsersRound, ClipboardList,
  UserPlus, Check, Ban
} from 'lucide-react';
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, PieChart, Pie, Cell 
} from 'recharts';
import adminService from '../../services/adminService';
import SidebarControls from '../../components/common/SidebarControls';
import DashboardNavShell from '../../components/common/DashboardNavShell';
import DashboardNavItem from '../../components/common/DashboardNavItem';
import DashboardTopBar from '../../components/common/DashboardTopBar';
import AIChatbot from '../../components/common/AIChatbot';
import MessagePanel from '../../components/common/MessagePanel';
import ProfilePage from '../account/ProfilePage';
import SettingsPage from '../account/SettingsPage';

export default function AdminDashboard() {
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [shellView, setShellView] = useState('main');
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

        // Defense in depth: backend already filters; exclude pending/rejected if present.
        if (
          (activeTab === 'Students' || activeTab === 'Teachers') &&
          Array.isArray(data)
        ) {
          data = data.filter(
            (row) =>
              row?.approvalStatus !== 'pending' &&
              row?.approvalStatus !== 'rejected'
          );
        }

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

  const openMainTab = (tab) => {
    setShellView('main');
    setActiveTab(tab);
  };

  const PAGE_COPY = {
    Dashboard: {
      title: 'Dashboard',
      subtitle: 'System overview, growth trends, and approval activity.',
    },
    Students: {
      title: 'Students',
      subtitle: 'Review student accounts, departments, and registration numbers.',
    },
    Teachers: {
      title: 'Teachers',
      subtitle: 'Manage teacher accounts, departments, and assigned subjects.',
    },
    Assignments: {
      title: 'Assignments',
      subtitle: 'Monitor assignments created across the platform.',
    },
    'Registration Requests': {
      title: 'Registration Requests',
      subtitle: 'Approve or reject new teacher and student registrations.',
    },
  };

  const pageCopy = PAGE_COPY[activeTab] || {
    title: activeTab,
    subtitle: 'Manage users, assignments, and registration approvals.',
  };

  const pageTitle =
    shellView === 'profile'
      ? 'My Profile'
      : shellView === 'settings'
        ? 'Settings'
        : pageCopy.title;

  const editEntityLabel =
    activeTab === 'Students'
      ? 'Student'
      : activeTab === 'Teachers'
        ? 'Teacher'
        : 'Record';

  return (
    <DashboardNavShell
      widthClass="w-64"
      desktopMode="flow"
      mobileTitle="QuickCheck Hub"
      pageTitle={pageTitle}
      headerActions={
        <DashboardTopBar
          role="admin"
          onLogout={handleLogout}
          onOpenProfile={() => setShellView('profile')}
          onOpenSettings={() => setShellView('settings')}
          onRegistrationNotificationClick={() => {
            setRegistrationFilter('pending');
            openMainTab('Registration Requests');
          }}
        />
      }
      sidebar={
        <div className="p-5 flex flex-col flex-1 min-h-0">
          <div className="qc-sidebar-brand">
            <span className="qc-sidebar-brand__mark"><Activity size={18} /></span>
            <div>
              <span className="qc-sidebar-brand__text">QuickCheck Hub</span>
              <span className="qc-sidebar-brand__role">Admin</span>
            </div>
          </div>

          <nav className="space-y-1" aria-label="Admin navigation">
            <DashboardNavItem icon={<Layout size={18}/>} label="Dashboard" active={shellView === 'main' && activeTab === 'Dashboard'} onClick={() => openMainTab('Dashboard')} />
            <DashboardNavItem icon={<Users size={18}/>} label="Students" active={shellView === 'main' && activeTab === 'Students'} onClick={() => openMainTab('Students')} />
            <DashboardNavItem icon={<GraduationCap size={18}/>} label="Teachers" active={shellView === 'main' && activeTab === 'Teachers'} onClick={() => openMainTab('Teachers')} />
            <DashboardNavItem icon={<FileText size={18}/>} label="Assignments" active={shellView === 'main' && activeTab === 'Assignments'} onClick={() => openMainTab('Assignments')} />
            <DashboardNavItem
              icon={<UserPlus size={18}/>}
              label="Registration Requests"
              active={shellView === 'main' && activeTab === 'Registration Requests'}
              onClick={() => openMainTab('Registration Requests')}
              badge={pendingRegistrationCount > 0 ? pendingRegistrationCount : null}
            />
          </nav>

          <SidebarControls />
        </div>
      }
    >
        {shellView === 'profile' ? (
          <ProfilePage onBack={() => setShellView('main')} />
        ) : shellView === 'settings' ? (
          <SettingsPage role="admin" onBack={() => setShellView('main')} />
        ) : (
        <>
        <div className="qc-page-header">
          <div>
            <h2 className="qc-page-title">{pageCopy.title}</h2>
            <p className="qc-page-subtitle">{pageCopy.subtitle}</p>
          </div>
        </div>

        {loading ? (
          <div className="h-56 flex items-center justify-center text-sm font-semibold accent-text">Loading system data…</div>
        ) : activeTab === 'Dashboard' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatBox label="Total Users" value={systemStats.totalUsers} icon={<UsersRound size={18}/>} />
              <StatBox label="Teachers" value={systemStats.totalTeachers} icon={<GraduationCap size={18}/>} />
              <StatBox label="Students" value={systemStats.totalStudents} icon={<UserRound size={18}/>} />
              <StatBox label="Assignments" value={systemStats.totalAssignments} icon={<ClipboardList size={18}/>} />
            </div>
            {pendingRegistrationCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRegistrationFilter('pending');
                  setActiveTab('Registration Requests');
                }}
                className="w-full text-left qc-card hover:border-[var(--accent)] transition-colors"
              >
                <p className="qc-section-title mb-1">Registration Requests</p>
                <p className="text-sm font-medium">
                  {readyForApprovalCount} ready for Admin approval
                  {awaitingVerificationCount > 0
                    ? ` · ${awaitingVerificationCount} awaiting email verification`
                    : ''}
                </p>
              </button>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              <div className="qc-card">
                <h3 className="qc-section-title">Total Users</h3>
                <p className="text-xs theme-muted mb-4">User growth over the latest six months</p>
                <div style={{ width: '100%', height: 280 }}>
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

              <div className="qc-card">
                <h3 className="qc-section-title">Total Assignments</h3>
                <p className="text-xs theme-muted mb-4">Assignments created over the latest six months</p>
                <div style={{ width: '100%', height: 280 }}>
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

              <div className="qc-card lg:col-span-2">
                <h3 className="qc-section-title mb-4">Department Distribution</h3>
                <div style={{ width: '100%', height: 280 }}>
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
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="qc-card !py-3">
                <p className="qc-stat-label">Total Pending</p>
                <p className="text-xl font-bold">{totalPendingCount}</p>
              </div>
              <div className="qc-card !py-3" style={{ borderColor: 'color-mix(in srgb, var(--warning) 35%, var(--border))' }}>
                <p className="qc-stat-label" style={{ color: 'var(--warning)' }}>Awaiting Email Verification</p>
                <p className="text-xl font-bold" style={{ color: 'var(--warning)' }}>{awaitingVerificationCount}</p>
              </div>
              <div className="qc-card !py-3" style={{ borderColor: 'color-mix(in srgb, var(--success) 35%, var(--border))' }}>
                <p className="qc-stat-label" style={{ color: 'var(--success)' }}>Ready for Admin Approval</p>
                <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{readyForApprovalCount}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setRegistrationFilter(status)}
                  className={`qc-filter-chip ${registrationFilter === status ? 'is-active' : ''}`}
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
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <p className="text-sm theme-muted">{viewData.length} records</p>
            </div>
            <DataTable data={viewData} onDelete={handleDelete} onEdit={handleEditClick} type={activeTab} />
          </div>
        )}
        </>
        )}
        <AIChatbot role="admin" showTrigger={false} />
        <MessagePanel role="admin" showTrigger={false} />

      {isEditModalOpen && editingItem && (
        <div className="qc-modal-backdrop">
          <div className="qc-modal">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="absolute top-3 right-3 p-2 theme-muted hover:text-[var(--text)]" aria-label="Close edit dialog">
              <X size={20}/>
            </button>
            <h2 className="qc-page-title pr-10 mb-5">Edit {editEntityLabel}</h2>
            
            <form onSubmit={handleUpdate} className="space-y-4 custom-scrollbar">
              <div>
                <label className="qc-label">Full Name</label>
                <input 
                  type="text" 
                  value={editingItem.name || editingItem.title || ''} 
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value, title: e.target.value})}
                  className="qc-input"
                />
              </div>

              {(activeTab === 'Students' || activeTab === 'Teachers') && (
                <div>
                  <label className="qc-label">Email Address</label>
                  <input 
                    type="email" 
                    value={editingItem.email || ''} 
                    onChange={(e) => setEditingItem({...editingItem, email: e.target.value})}
                    className="qc-input"
                  />
                </div>
              )}

              {(activeTab === 'Students' || activeTab === 'Teachers') && (
                <div>
                  <label className="qc-label">Department</label>
                  <select 
                    value={editingItem.department || 'CS'} 
                    onChange={(e) => setEditingItem({...editingItem, department: e.target.value})}
                    className="qc-input"
                  >
                    <option value="CS">Computer Science (CS)</option>
                    <option value="SE">Software Engineering (SE)</option>
                  </select>
                </div>
              )}

              {activeTab === 'Teachers' && (
                <div>
                  <label className="qc-label">Assigned Subject</label>
                  <select 
                    value={editingItem.subject || ''} 
                    onChange={(e) => setEditingItem({...editingItem, subject: e.target.value})}
                    className="qc-input"
                  >
                    <option value="">Select Subject</option>
                    {SUBJECTS.map((sub, idx) => (
                      <option key={idx} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeTab === 'Students' && (
                <div>
                  <label className="qc-label">Registration Number</label>
                  <input 
                    type="text" 
                    value={editingItem.registrationNumber || ''} 
                    readOnly
                    className="qc-input opacity-70 cursor-not-allowed"
                  />
                </div>
              )}

              <button type="submit" className="qc-btn qc-btn-primary qc-btn-block mt-2">
                Update Record
              </button>
            </form>
          </div>
        </div>
      )}
    </DashboardNavShell>
  );
}

function RegistrationRequestsTable({ data, filter, actionId, onApprove, onReject }) {
  const colSpan = filter === 'pending' ? 7 : 6;
  return (
    <div className="qc-table-wrap">
      <table className="qc-table min-w-[780px]">
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Email</th>
            <th>Requested Role</th>
            <th>Registration Date</th>
            <th>Email Verified</th>
            <th>Status</th>
            {filter === 'pending' && <th className="text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? data.map((item) => (
            <tr key={item.id}>
              <td className="font-semibold">{item.name}</td>
              <td className="theme-muted break-all">{item.email}</td>
              <td className="accent-text text-xs font-semibold uppercase tracking-wide">{item.role}</td>
              <td className="theme-muted whitespace-nowrap">
                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
              </td>
              <td className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
                {item.emailVerified === true ? (
                  <span style={{ color: 'var(--success)' }}>Verified</span>
                ) : item.approvalStatus === 'pending' ? (
                  <span style={{ color: 'var(--warning)' }}>Unverified</span>
                ) : (
                  <span className="theme-muted">Not recorded</span>
                )}
              </td>
              <td className="theme-muted text-xs font-semibold uppercase tracking-wide">
                {item.approvalStatus}
              </td>
              {filter === 'pending' && (
                <td className="text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      disabled={actionId === item.id || item.emailVerified !== true}
                      onClick={() => onApprove(item.id)}
                      className="qc-btn qc-btn-secondary !min-h-8 !px-2.5 !text-xs"
                      style={{ color: 'var(--success)' }}
                      aria-label={`Approve ${item.name}`}
                      title={item.emailVerified !== true ? 'Email must be verified first' : 'Approve'}
                    >
                      <Check size={14} /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={actionId === item.id}
                      onClick={() => onReject(item.id)}
                      className="qc-btn qc-btn-danger !min-h-8 !px-2.5 !text-xs"
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
              <td colSpan={colSpan} className="qc-empty">
                No {filter} registration requests.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
      className="qc-stat-card"
    >
      <div className="flex items-start justify-between mb-3">
        <span
          className={`p-2.5 rounded-qc border ${selected ? 'accent-soft accent-text' : 'theme-muted'}`}
          style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)' }}
        >
          {icon}
        </span>
      </div>
      <p className="qc-stat-label">{label}</p>
      <h3 className="qc-stat-value">{value || 0}</h3>
    </button>
  );
}

function DataTable({ data, onDelete, onEdit, type }) {
  const isAssignment = type === 'Assignments';
  const isStudent = type === 'Students';

  return (
    <div className="qc-table-wrap">
      <table className="qc-table min-w-[560px]">
        <thead>
          <tr>
            <th>{isAssignment ? 'Title' : 'Full Name'}</th>
            <th>{isStudent ? 'Reg #' : (isAssignment ? 'Teacher' : 'Subject')}</th>
            <th>{isAssignment ? 'Due Date' : 'Dept'}</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? data.map((item) => (
            <tr key={item._id}>
              <td className="font-semibold">
                {isAssignment ? item.title : item.name}
                {!isAssignment && <div className="text-xs theme-muted font-normal break-all mt-0.5">{item.email}</div>}
              </td>
              <td className="theme-muted whitespace-nowrap">
                {isStudent ? (item.registrationNumber || 'N/A') : (isAssignment ? (item.teacherName || "Admin") : (item.subject || 'Not Assigned'))}
              </td>
              <td className="theme-muted text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
                {isAssignment ? (item.deadline ? new Date(item.deadline).toLocaleDateString() : 'N/A') : (item.department || 'CS')}
              </td>
              <td className="text-right whitespace-nowrap">
                <div className="inline-flex items-center gap-2 justify-end">
                  {!isAssignment && (
                    <button type="button" onClick={() => onEdit(item)} className="qc-btn qc-btn-secondary !min-h-8 !px-2 !py-1.5" aria-label="Edit record">
                      <Edit2 size={15}/>
                    </button>
                  )}
                  <button type="button" onClick={() => onDelete(item._id)} className="qc-btn qc-btn-danger !min-h-8 !px-2 !py-1.5" aria-label="Delete record">
                    <Trash2 size={15}/>
                  </button>
                </div>
              </td>
            </tr>
          )) : (
            <tr><td colSpan="4" className="qc-empty">No {type} found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

