import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Layout, Users, GraduationCap, FileText, Activity, LogOut, 
  Trash2, Plus, Edit2, X, UserRound, UsersRound, ClipboardList
} from 'lucide-react';
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, PieChart, Pie, Cell 
} from 'recharts';
import adminService from '../../services/adminService';
import SidebarControls from '../../components/common/SidebarControls';
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
  }, [activeTab]);

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
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this?")) {
      try {
        if (activeTab === 'Assignments') await adminService.deleteAssignment(id);
        else await adminService.deleteUser(id);
        fetchContent();
      } catch (err) { alert("Delete failed"); }
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
    } catch (err) {
        alert("Update failed");
    }
  };

  return (
    <div className="flex min-h-screen theme-page">
      <aside className="w-64 border-r p-6 flex flex-col fixed h-screen z-20 overflow-y-auto custom-scrollbar theme-card">
        <div className="text-xl font-black mb-10 flex items-center gap-2 uppercase tracking-tighter text-white">
          <Activity className="text-sky-500" /> EDUCORRE HQ
        </div>
        
        <nav className="space-y-2">
          <AdminLink icon={<Layout/>} label="Dashboard" active={activeTab === 'Dashboard'} onClick={() => setActiveTab('Dashboard')} />
          <AdminLink icon={<Users/>} label="Students" active={activeTab === 'Students'} onClick={() => setActiveTab('Students')} />
          <AdminLink icon={<GraduationCap/>} label="Teachers" active={activeTab === 'Teachers'} onClick={() => setActiveTab('Teachers')} />
          <AdminLink icon={<FileText/>} label="Assignments" active={activeTab === 'Assignments'} onClick={() => setActiveTab('Assignments')} />
        </nav>

        <SidebarControls role="admin" />
        <button onClick={() => {localStorage.clear(); navigate('/login');}} className="mt-auto flex items-center gap-2 p-3 text-red-500 font-bold hover:bg-red-500/10 rounded-xl transition-all">
            <LogOut size={20}/> LOGOUT
        </button>
      </aside>

      <main className="flex-1 ml-64 p-10 min-w-0">
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase">{activeTab}</h1>
          
          {(activeTab === 'Students' || activeTab === 'Teachers') && (
            <button 
              onClick={() => navigate(activeTab === 'Students' ? '/signup/student' : '/signup/teacher')} 
              className="bg-sky-500 text-black px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20 text-xs tracking-widest"
            >
              <Plus size={18}/> ADD {activeTab.slice(0, -1).toUpperCase()}
            </button>
          )}
        </header>

        {loading ? (
          <div className="h-64 flex items-center justify-center font-bold text-sky-500 animate-pulse uppercase tracking-widest">Fetching System Data...</div>
        ) : activeTab === 'Dashboard' ? (
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatBox label="Total Users" value={systemStats.totalUsers} icon={<UsersRound size={20}/>} />
              <StatBox label="Teachers" value={systemStats.totalTeachers} icon={<GraduationCap size={20}/>} />
              <StatBox label="Students" value={systemStats.totalStudents} icon={<UserRound size={20}/>} />
              <StatBox label="Assignments" value={systemStats.totalAssignments} icon={<ClipboardList size={20}/>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="p-8 rounded-[2rem] border theme-card">
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

              <div className="p-8 rounded-[2rem] border theme-card">
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

              <div className="p-8 rounded-[2rem] border theme-card lg:col-span-2">
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
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <h2 className="text-2xl font-black italic text-sky-500 uppercase tracking-tighter">LISTING: {activeTab}</h2>
                <span className="text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">{viewData.length} Records found</span>
            </div>
            <DataTable data={viewData} onDelete={handleDelete} onEdit={handleEditClick} type={activeTab} />
          </div>
        )}
        <AIChatbot role="admin" showTrigger={false} />
        <MessagePanel role="admin" showTrigger={false} />
      </main>

      {/* --- EDIT MODAL (FIXED WITH EMAIL AND DROPDOWN) --- */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="theme-card border w-full max-w-md rounded-[2rem] p-8 relative shadow-2xl">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white">
              <X size={24}/>
            </button>
            <h2 className="text-2xl font-black text-white italic uppercase mb-6 tracking-tighter">Edit {activeTab.slice(0,-1)}</h2>
            
            <form onSubmit={handleUpdate} className="space-y-4 overflow-y-auto max-h-[75vh] pr-2 custom-scrollbar">
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
    </div>
  );
}

// Sub-components
function AdminLink({ icon, label, active, onClick }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 p-4 rounded-2xl cursor-pointer font-black transition-all ${active ? 'bg-sky-500 text-black shadow-lg shadow-sky-500/30' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}>
      {icon} <span className="text-[10px] uppercase tracking-widest">{label}</span>
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
      className={`w-full text-left p-8 rounded-[2rem] border theme-card shadow-lg transition-all duration-200 hover:-translate-y-1 hover:border-[var(--accent)] ${selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20' : ''}`}
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
      <table className="w-full text-left">
        <thead className="theme-surface text-[10px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
          <tr>
            <th className="p-5">{isAssignment ? 'Title' : 'Full Name'}</th>
            <th className="p-5">{isStudent ? 'Reg #' : (isAssignment ? 'Teacher' : 'Subject')}</th>
            <th className="p-5">{isAssignment ? 'Due Date' : 'Dept'}</th>
            <th className="p-5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.length > 0 ? data.map((item) => (
            <tr key={item._id} className="hover:bg-sky-500/5 transition-colors group">
              <td className="p-5 font-bold text-sm text-slate-200">
                {isAssignment ? item.title : item.name}
                {!isAssignment && <div className="text-[10px] text-slate-500 font-normal">{item.email}</div>}
              </td>
              <td className="p-5 text-slate-400 text-sm">
                {isStudent ? (item.registrationNumber || 'N/A') : (isAssignment ? (item.teacherName || "Admin") : (item.subject || 'Not Assigned'))}
              </td>
              <td className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {isAssignment ? (item.deadline ? new Date(item.deadline).toLocaleDateString() : 'N/A') : (item.department || 'CS')}
              </td>
              <td className="p-5 text-right space-x-2">
                {!isAssignment && <button onClick={() => onEdit(item)} className="p-2 text-sky-400 bg-sky-400/10 rounded-xl hover:bg-sky-400 hover:text-black transition-all group-hover:opacity-100">
                  <Edit2 size={16}/>
                </button>}
                <button onClick={() => onDelete(item._id)} className="p-2 text-red-500 bg-red-500/10 rounded-xl hover:bg-red-500 hover:text-white transition-all group-hover:opacity-100">
                  <Trash2 size={16}/>
                </button>
              </td>
            </tr>
          )) : (
            <tr><td colSpan="4" className="p-20 text-center italic text-slate-500 uppercase tracking-widest text-xs font-bold">No {type} found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

