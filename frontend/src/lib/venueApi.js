import axios from "axios";
import { API_BASE } from "@/lib/api";

// Dedicated axios instance for the Salon (venue) portal — separate token.
export const VENUE_TOKEN_KEY = "fotuber_venue_token";

export const venueApi = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

venueApi.interceptors.request.use((config) => {
  const t = localStorage.getItem(VENUE_TOKEN_KEY);
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export function setVenueToken(t) {
  if (t) localStorage.setItem(VENUE_TOKEN_KEY, t);
}
export function clearVenueToken() {
  localStorage.removeItem(VENUE_TOKEN_KEY);
}
