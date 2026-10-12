import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBase';

const adminClient = axios.create({
    baseURL: `${getApiBaseUrl()}/admin`,
});

adminClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

const handleResponse = async (request, defaultValue = []) => {
    try {
        const response = await request;

        console.log("API RESPONSE:", response.data); // ✅ DEBUG

        return response.data || defaultValue;
    } catch (error) {
        console.error("Admin Service Error:", error.response?.data || error.message);
        return defaultValue;
    }
};

const adminService = {
    getSystemInsights: async () => {
        const defaultStats = { 
            totalUsers: 0, 
            totalTeachers: 0, 
            totalStudents: 0, 
            totalAssignments: 0, 
            chartData: [], 
            pieData: [] 
        };

        return handleResponse(adminClient.get('/insights'), defaultStats);
    },

    addUser: async (data) => {
        const response = await adminClient.post('/users', data);
        return response.data;
    },

    updateUser: async (id, data) => {
        const response = await adminClient.put(`/users/${id}`, data);
        return response.data;
    },

    deleteUser: async (id) => {
        const response = await adminClient.delete(`/users/${id}`);
        return response.data;
    },

    deleteAssignment: async (id) => {
        const response = await adminClient.delete(`/assignments/${id}`);
        return response.data;
    },

    getAllTeachers: async () => {
        return handleResponse(adminClient.get('/teachers'), []);
    },

    getAllAssignments: async () => {
        return handleResponse(adminClient.get('/assignments'), []);
    },

    getRecentUsers: async () => {
        return handleResponse(adminClient.get('/users/recent'), []);
    },

    getRegistrationRequests: async (status = 'pending') => {
        const response = await adminClient.get('/registration-requests', {
            params: { status },
        });
        return (
          response.data || {
            requests: [],
            pendingCount: 0,
            readyForApprovalCount: 0,
            awaitingVerificationCount: 0,
            totalPendingCount: 0,
          }
        );
    },

    approveRegistrationRequest: async (id) => {
        const response = await adminClient.post(`/registration-requests/${id}/approve`);
        return response.data;
    },

    rejectRegistrationRequest: async (id) => {
        const response = await adminClient.post(`/registration-requests/${id}/reject`);
        return response.data;
    },
};

export default adminService;
