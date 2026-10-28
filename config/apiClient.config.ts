import axios, { InternalAxiosRequestConfig } from "axios";
import { getSession, signOut } from "next-auth/react";

const env = process.env.NEXT_PUBLIC_ENVIRONMENT;
const backendUrl = process.env.NEXT_PUBLIC_SERVER_URL;

// Determine baseURL
let baseURL = `${backendUrl}/api`;

// Local dev: FE+BE both on localhost → use proxy:3000/api-proxy → 8000
if (env === "development" && backendUrl?.includes("localhost")) {
  baseURL = "/api-proxy";
}

const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 120000, // 2 minutes timeout for long-running optimization requests
});

// Cache for the latest active tokens to avoid stale session cookies during rotation
let activeAccessToken: string | null = null;
let activeRefreshToken: string | null = null;

// Queue to hold requests while a token refresh is in progress
interface FailedRequest {
  resolve: (token: string) => void;
  reject: (error: any) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];
let isSigningOut = false;

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

async function handleSignOut() {
  if (isSigningOut) return;
  isSigningOut = true;
  activeAccessToken = null;
  activeRefreshToken = null;

  try {
    console.log("🔒 Session expired - clearing stores and signing out");
    const { useIndexStore } = await import("@/store/index.store");
    useIndexStore.getState().clearUser();

    if (typeof window !== "undefined") {
      await signOut({ callbackUrl: "/sign-in", redirect: true });
    }
  } catch (err) {
    console.error("Error during sign out:", err);
    if (typeof window !== "undefined") {
      window.location.href = "/sign-in";
    }
  } finally {
    isSigningOut = false;
  }
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Avoid attaching Authorization header to public auth endpoints
    if (config.url?.includes("/auth/refresh") || config.url?.includes("/auth/verify-credentials")) {
      return config;
    }

    // If an Authorization header was already explicitly provided on retry, preserve it
    if (config.headers?.Authorization && (config as any)._retry) {
      return config;
    }

    // Use active refreshed token if available in memory, otherwise retrieve from session
    let token = activeAccessToken;
    if (!token) {
      const session = await getSession();
      token = session?.access_token || null;
      if (session?.refresh_token && !activeRefreshToken) {
        activeRefreshToken = session.refresh_token;
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401 Unauthorized responses
    if (error.response?.status !== 401 || !originalRequest) {
      return Promise.reject(error.response?.data || error);
    }

    // If this was already a retried request or a failed call to /auth/refresh, sign out
    if (originalRequest._retry || originalRequest.url?.includes("/auth/refresh")) {
      console.log("🔒 Retry or refresh endpoint failed with 401 - signing out");
      await handleSignOut();
      return Promise.reject(error.response?.data || error);
    }

    // If a refresh is already in progress, queue this request
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Find refresh token from memory or current session
      let refreshToken = activeRefreshToken;
      if (!refreshToken) {
        const session = await getSession();
        refreshToken = session?.refresh_token || null;
      }

      if (!refreshToken) {
        console.log("🔒 No refresh token available to renew session");
        processQueue(new Error("No refresh token"), null);
        await handleSignOut();
        return Promise.reject(error.response?.data || error);
      }

      console.log("🔄 Access token expired - requesting fresh token using refresh token");

      // Use a separate Axios call without interceptors to call /auth/refresh
      const refreshResponse = await axios.post(`${baseURL}/auth/refresh`, {
        refresh_token: refreshToken,
      });

      const { access_token: newAccessToken, refresh_token: newRefreshToken } = refreshResponse.data;

      if (!newAccessToken) {
        throw new Error("No access token returned by refresh endpoint");
      }

      // Update in-memory active tokens
      activeAccessToken = newAccessToken;
      if (newRefreshToken) {
        activeRefreshToken = newRefreshToken;
      }

      // Flush queued requests with the new token
      processQueue(null, newAccessToken);

      // Retry original request with the new access token
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshErr) {
      console.error("🔒 Token refresh failed:", refreshErr);
      processQueue(refreshErr, null);
      await handleSignOut();
      return Promise.reject(error.response?.data || refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
