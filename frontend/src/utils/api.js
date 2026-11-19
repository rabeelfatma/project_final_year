import axios from 'axios';
import { getApiBaseUrl } from './apiBase';
import { clearAuthSession, getAuthToken } from './authToken';

const api = axios.create({
  baseURL: getApiBaseUrl(),
});

api.interceptors.request.use(
  (config) => {
    if (!config.headers) {
      config.headers = {};
    }

    const token = getAuthToken();
    if (token) {
      // Always set a clean single Bearer header (never duplicate / empty).
      config.headers.Authorization = `Bearer ${token}`;
    } else if (config.headers.Authorization) {
      delete config.headers.Authorization;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let handlingUnauthorized = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    if (status === 401 && !handlingUnauthorized) {
      handlingUnauthorized = true;
      const hadToken = Boolean(getAuthToken());
      clearAuthSession();
      // Avoid infinite retry storms — hard navigate once when a session dies.
      if (hadToken && typeof window !== 'undefined') {
        const path = window.location.pathname || '';
        const onAuthPage =
          path.startsWith('/login') ||
          path.startsWith('/admin') ||
          path.startsWith('/signup') ||
          path.startsWith('/forgot') ||
          path.startsWith('/reset');
        if (!onAuthPage) {
          const toAdmin = path.startsWith('/dashboard/admin');
          window.location.assign(toAdmin ? '/admin' : '/login');
        }
      }
      window.setTimeout(() => {
        handlingUnauthorized = false;
      }, 1500);
    } else if (status !== 401) {
      console.error('❌ API ERROR:', message);
    }

    return Promise.reject(error);
  }
);

export default api;
