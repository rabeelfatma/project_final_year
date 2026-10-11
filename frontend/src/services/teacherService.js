import api from '../utils/api';

import { getApiOrigin } from '../utils/apiBase';
const API_ORIGIN = getApiOrigin();

const teacherService = {
  // 1. Dashboard Stats
  getOverviewStats: async () => {
    try {
      const response = await api.get('/teacher/overview-stats');
      return response.data;
    } catch (error) {
      console.error("Error fetching overview stats:", error.response?.data || error.message);
      throw error;
    }
  },

  // 2. Fetch Assignments
  getMyAssignments: async () => {
    try {
      const response = await api.get('/teacher/my-assignments');
      return response.data;
    } catch (error) {
      console.error("Error fetching assignments:", error.response?.data || error.message);
      throw error;
    }
  },

  // 3. Create Assignment (File Upload)
  createAssignment: async (formData) => {
    try {
      if (!formData) throw new Error("FormData is missing");

      const response = await api.post('/teacher/assignments', formData);
      return response.data;

    } catch (error) {
      console.error("Error creating assignment:", error.response?.data || error.message);
      throw error;
    }
  },

  // 4. Fetch Submissions
  getRecentSubmissions: async () => {
    try {
      const response = await api.get('/teacher/recent-submissions');
      return response.data;
    } catch (error) {
      console.error("Error fetching submissions:", error.response?.data || error.message);
      throw error;
    }
  },

  // 5. Fetch Students
  getStudents: async () => {
    try {
      const response = await api.get('/teacher/students');
      return response.data;
    } catch (error) {
      console.error("Error fetching students:", error.response?.data || error.message);
      throw error;
    }
  },

  // 6. Update Assignment
  updateAssignment: async (id, formData) => {
    try {
      if (!id) throw new Error("Assignment ID missing");

      const response = await api.put(
        `/teacher/assignments/${id}`,
        formData
      );
      return response.data;

    } catch (error) {
      console.error("Error updating assignment:", error.response?.data || error.message);
      throw error;
    }
  },

  // 7. Delete Assignment
  deleteAssignment: async (id) => {
    try {
      if (!id) throw new Error("Assignment ID missing");

      const response = await api.delete(`/teacher/assignments/${id}`);
      return response.data;

    } catch (error) {
      console.error("Error deleting assignment:", error.response?.data || error.message);
      throw error;
    }
  },

  // 8. Download files using authenticated browser request
  downloadAssignment: (id) => `${API_ORIGIN}/api/files/assignment/${id}`,
  downloadSubmission: (id) => `${API_ORIGIN}/api/files/submission/${id}`,
  previewAssignment: (id) => `${API_ORIGIN}/api/files/assignment/${id}/preview`,
  previewSubmission: (id) => `${API_ORIGIN}/api/files/submission/${id}/preview`,

  // 9. Update Status
  updateAssignmentStatus: async (id, statusData) => {
    try {
      const response = await api.patch(
        `/teacher/assignments/${id}/status`,
        statusData
      );
      return response.data;

    } catch (error) {
      console.error("Error updating status:", error.response?.data || error.message);
      throw error;
    }
  },

  // 🔥 NEW: Update Final Grade (Manual Marks & Feedback Save)
  // Yeh function aapke "Save & Publish" button ke liye zaroori hai
  updateFinalGrade: async (id, data) => {
    try {
      // Backend route: /api/assignments/evaluate/:id
      const response = await api.put(`/teacher/evaluate/${id}`, data);
      return response.data;
    } catch (error) {
      console.error("Error saving final grade:", error.response?.data || error.message);
      throw error;
    }
  },

  // 🔥 AI BULK EVALUATION (FIXED & CLEAN)
  evaluateWithAiBulk: async (data) => {
    try {
      if (!data?.submissionIds?.length) {
        throw new Error("No submission IDs provided");
      }

      const formData = new FormData();
      data.submissionIds.forEach((id) => formData.append('submissionIds', id));
      formData.append('teacherInstructions', data.teacherInstructions || '');
      formData.append('includeQuestionAssignmentIds', (data.includeQuestionAssignmentIds || []).join(','));
      (data.referenceFiles || []).slice(0, 20).forEach((file) => formData.append('references', file));
      const response = await api.post('/teacher/evaluate-ai', formData);
      return response.data;

    } catch (error) {
      console.error("Bulk Evaluation Error:", error.response?.data || error.message);
      throw error;
    }
  },

  // 🔥 PUBLISH RESULTS
  publishBulkResults: async (data) => {
    try {
      if (!data?.submissionIds?.length) throw new Error("No submission IDs provided");
      const response = await api.post('/teacher/publish-results', { submissionIds: data.submissionIds });
      return response.data;
    } catch (error) {
      console.error("Publish Error:", error.response?.data || error.message);
      throw error;
    }
  },

  deleteAssignmentsBulk: async (ids) => {
    const response = await api.post('/teacher/assignments/bulk-delete', { ids });
    return response.data;
  },
  resetSubmissionGradesBulk: async (ids) => {
    if (!Array.isArray(ids) || !ids.length) throw new Error('Select at least one submission');
    const response = await api.post('/teacher/submissions/bulk-reset-grades', { ids });
    return response.data;
  },
  resetSubmissionGrade: async (id) => {
    if (!id) throw new Error('Submission ID missing');
    const response = await api.patch(`/teacher/submissions/${id}/reset-grade`);
    return response.data;
  },
  deleteSubmission: async (id) => {
    const response = await api.delete(`/teacher/submissions/${id}`);
    return response.data;
  },
  deleteSubmissionsBulk: async (ids) => {
    const response = await api.post('/teacher/submissions/bulk-delete', { ids });
    return response.data;
  }
};

// 🔥 SINGLE AI EVALUATION
export const evaluateWithAI = async (text, instructions = "") => {
  try {
    if (!text) throw new Error("No text provided for evaluation");

    const response = await api.post('/teacher/evaluate-ai', {
      text,
      teacherInstructions: instructions
    });

    return response.data;

  } catch (error) {
    console.error("Single Evaluation Error:", error.response?.data || error.message);
    throw error;
  }
};

export default teacherService;