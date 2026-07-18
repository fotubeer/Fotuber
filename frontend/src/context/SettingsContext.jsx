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
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get("/settings");
      setSettings({ ...DEFAULTS, ...data });
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh: fetchSettings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext) || { settings: DEFAULTS, loading: false };
