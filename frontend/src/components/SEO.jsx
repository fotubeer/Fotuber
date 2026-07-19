import React from "react";
import { Helmet } from "react-helmet-async";
import { useSettings } from "@/context/SettingsContext";
import { API_BASE } from "@/lib/api";

const DEFAULTS = {
  siteUrl: "https://fotuber.com.tr",
  title: "Fotuber Studio | Düğün, Nişan & Portre Fotoğrafçılığı",
  description:
    "Fotuber Studio — Ankara'da profesyonel düğün, nişan, bebek, aile ve kurumsal fotoğraf çekimi. Online randevu ve galeri.",
  keywords:
    "fotoğrafçı, düğün fotoğrafçısı, nişan fotoğrafçısı, bebek çekimi, aile fotoğrafı, kurumsal çekim, fotuber",
};

/**
 * <SEO title="Randevu Al" description="..." path="/randevu" />
 * Uses the admin-configurable SEO settings from /api/settings as base and lets
 * each page override title/description/path. Also injects LocalBusiness JSON-LD
 * on the home page.
 */
export const SEO = ({ title, description, path = "/", noIndex = false, jsonLd = null, image }) => {
  const { settings } = useSettings();
  const siteUrl = (settings?.seo_site_url || DEFAULTS.siteUrl).replace(/\/+$/, "");
  const baseTitle = settings?.seo_title || DEFAULTS.title;
  const finalTitle = title ? `${title} | ${settings?.business_name || "Fotuber"}` : baseTitle;
  const finalDesc = description || settings?.seo_description || DEFAULTS.description;
  const finalKeywords = settings?.seo_keywords || DEFAULTS.keywords;
  const canonical = `${siteUrl}${path}`;
  const ogImage =
    image ||
    settings?.seo_og_image_url ||
    (settings?.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : `${siteUrl}/logo.png`);
  const verification = settings?.google_search_console_verification;

  return (
    <Helmet>
      <title>{finalTitle}</title>
      <meta name="description" content={finalDesc} />
      <meta name="keywords" content={finalKeywords} />
      <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow"} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={finalDesc} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={settings?.business_name || "Fotuber Studio"} />
      <meta property="og:locale" content="tr_TR" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={finalTitle} />
      <meta name="twitter:description" content={finalDesc} />
      <meta name="twitter:image" content={ogImage} />
      {verification && <meta name="google-site-verification" content={verification} />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
};

/** LocalBusiness / PhotographyBusiness structured data for Home page. */
export const buildLocalBusinessLd = (settings) => {
  if (!settings) return null;
  const siteUrl = (settings.seo_site_url || DEFAULTS.siteUrl).replace(/\/+$/, "");
  const image = settings.seo_og_image_url || (settings.logo_id ? `${API_BASE}/settings/logo/${settings.logo_id}` : undefined);
  return {
    "@context": "https://schema.org",
    "@type": settings.seo_business_type || "PhotographyBusiness",
    name: settings.business_name || "Fotuber Studio",
    url: siteUrl,
    image,
    logo: image,
    description: settings.seo_description || DEFAULTS.description,
    telephone: settings.phone || undefined,
    email: settings.email || undefined,
    address: settings.address ? {
      "@type": "PostalAddress",
      streetAddress: settings.address,
      addressCountry: "TR",
    } : undefined,
    priceRange: settings.seo_price_range || "₺₺",
    openingHours: settings.seo_opening_hours || "Mo-Sa 09:00-19:00",
    sameAs: [
      settings.instagram_url,
      settings.facebook_url,
      settings.tiktok_url,
      settings.youtube_url,
    ].filter(Boolean),
  };
};

export default SEO;
