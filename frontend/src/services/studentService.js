import api from '../utils/api';

import { getApiOrigin } from '../utils/apiBase';
const API_ORIGIN = getApiOrigin();

const studentService = {
  // 1. Dashboard Stats
  getDashboardStats: async () => {
    const response = await api.get('/student/dashboard-stats');
    return response.data;
  },

  // 2. Get available assignments
  getAssignments: async () => {
    const response = await api.get('/student/assignments');
    return response.data;
  },

  // 3. ✅ FIX: Get student's own submissions (needed for results tab + marks display)
  getMySubmissions: async () => {
    try {
      const response = await api.get('/student/my-submissions');
      return response.data;
    } catch (error) {
      console.error("❌ Error fetching my submissions:", error.response?.data || error.message);
      throw error;
    }
  },

  // 4. Submit Assignment
  submitAssignment: async (assignmentId, formData) => {
    try {
      // Let the browser set multipart boundary. Auth header comes from api.js.
      const response = await api.post(
        `/student/assignments/${assignmentId}/submit`,
        formData
      );
      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      console.error("❌ Submit Assignment Error:", errorMsg);
      throw error;
    }
  },
  deleteMySubmission: async (id) => (await api.delete(`/student/submissions/${id}`)).data,
  deleteMySubmissionsBulk: async (ids) => (await api.post('/student/submissions/bulk-delete', { ids })).data,
  downloadAssignment: (id) => `${API_ORIGIN}/api/files/assignment/${id}`,
  downloadSubmission: (id) => `${API_ORIGIN}/api/files/submission/${id}`,
  previewAssignment: (id) => `${API_ORIGIN}/api/files/assignment/${id}/preview`,
  previewSubmission: (id) => `${API_ORIGIN}/api/files/submission/${id}/preview`,
};

export default studentService;