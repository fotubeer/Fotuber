import axios from "axios";
import { API_BASE } from "@/lib/api";

// Dedicated axios instance for the Studio Suite (separate token from main site).
export const STUDIO_TOKEN_KEY = "fotuber_studio_token";

export const studioApi = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

studioApi.interceptors.request.use((config) => {
  const t = localStorage.getItem(STUDIO_TOKEN_KEY);
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export function setStudioToken(t) {
  if (t) localStorage.setItem(STUDIO_TOKEN_KEY, t);
}
export function clearStudioToken() {
  localStorage.removeItem(STUDIO_TOKEN_KEY);
}
