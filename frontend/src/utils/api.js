import axios from 'axios';
import { getApiBaseUrl } from './apiBase';

const api = axios.create({
  baseURL: getApiBaseUrl(),
});

// Add token automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    // 🔥 FIX: Always ensure headers object exists
    if (!config.headers) {
      config.headers = {};
    }

    if (!token) {
      console.warn("⚠️ No token found in localStorage");
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Debug response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("❌ API ERROR:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
