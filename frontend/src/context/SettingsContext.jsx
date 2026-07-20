import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const SettingsContext = createContext(null);

const DEFAULTS = {
  business_name: "Fotuber",
  tagline: "Studio · fotuber.com.tr",
  hero_title: "Anlar, ",
  hero_title_accent: "ışıkla",
  hero_subtitle: "ölümsüzleşir.",
  hero_intro: "",
  about_text: "",
  phone: "05010002523",
  whatsapp: "905010002523",
  email: "info@fotuber.com.tr",
  address: "",
  instagram: "",
  logo_id: null,
  hero_image_url: "",
  google_analytics_id: "",
  font_heading: "",
  font_body: "",
  font_scale: 1.0,
  // Intro animation
  intro_enabled: true,
  intro_sound_enabled: true,
  intro_volume: 0.8,
  intro_greeting_text: "Bugün harika görünüyorsunuz{comma_name}.",
  intro_brand_top: "Fotuber",
  intro_brand_bottom: "Görsel Sanat",
  intro_subtitle_domain: "fotuber.com.tr",
  intro_font_greeting: "'Cormorant Garamond', 'Times New Roman', serif",
  intro_font_brand: "'Manrope', 'Helvetica Neue', Arial, sans-serif",
  intro_font_cursive: "'Great Vibes', 'Pinyon Script', 'Dancing Script', cursive",
  intro_logo_id: null,
};

const applyTypography = (s) => {
  const root = document.documentElement;
  const heading = s?.font_heading?.trim() || "'Cormorant Garamond', serif";
  const body = s?.font_body?.trim() || "'Manrope', sans-serif";
  const scale = Number(s?.font_scale) || 1.0;
  root.style.setProperty("--fotuber-font-heading", heading);
  root.style.setProperty("--fotuber-font-body", body);
  root.style.setProperty("--fotuber-font-scale", String(scale));
};

const injectGA = (gaId) => {
  if (!gaId || typeof gaId !== "string" || !gaId.startsWith("G-")) return;
  if (document.getElementById("ga4-script")) return;
  const s1 = document.createElement("script");
  s1.async = true;
  s1.id = "ga4-script";
  s1.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(s1);
  const s2 = document.createElement("script");
  s2.id = "ga4-init";
  s2.innerHTML =
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
    `gtag('js',new Date());gtag('config','${gaId}',{send_page_view:true});`;
  document.head.appendChild(s2);
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get("/settings");
      const merged = { ...DEFAULTS, ...data };
      setSettings(merged);
      applyTypography(merged);
      injectGA(merged.google_analytics_id);
    } catch (_) {
      applyTypography(DEFAULTS);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Re-apply typography whenever settings change locally (e.g., after admin save)
  useEffect(() => { applyTypography(settings); }, [settings.font_heading, settings.font_body, settings.font_scale]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh: fetchSettings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext) || { settings: DEFAULTS, loading: false };
