// ✅ Import api without curly braces
import api from '../utils/api';

export const getStudentStats = async () => {
  try {
    const res = await api.get('/analytics/student-stats');
    return res.data;
  } catch (err) {
    console.error("Student stats fetch error", err);
    return null;
  }
};

export const getTeacherStats = async () => {
  try {
    const res = await api.get('/analytics/teacher-stats');
    return res.data;
  } catch (err) {
    console.error("Teacher stats fetch error", err);
    return null;
  }
};

export const getAdminStats = async () => {
  try {
    const res = await api.get('/analytics/admin-stats');
    return res.data;
  } catch (err) {
    console.error("Admin stats fetch error", err);
    return null;
  }
};