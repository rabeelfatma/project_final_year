import api from '../utils/api';

export const getAssignments = async () => {
  try {
    const res = await api.get('/assignments/my-assignments');
    return res.data;
  } catch (err) {
    console.error("Assignments fetch error", err);
    return [];
  }
};

export const submitAssignment = async (formData) => {
  const res = await api.post('/assignments/upload/file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return res.data;
};