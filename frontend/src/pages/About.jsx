import React from "react";
import { useSettings } from "@/context/SettingsContext";

const About = () => {
  const { settings } = useSettings();
  const brand = settings?.business_name || "Fotuber";
  const text = settings?.about_text || "Fotuber, düğün ve nişan çekimlerinden podcast prodüksiyonuna, stüdyo portresinden klip yapımına ve karaoke etkinliklerine kadar geniş bir hizmet yelpazesi sunan modern bir prodüksiyon stüdyosudur.";
  const paragraphs = text.split(/\n{2,}/g);

  return (
    <div className="max-w-4xl mx-auto px-6 py-24">
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Hakkımızda</div>
      <h1 className="hero-title text-5xl md:text-6xl mb-10">
        {brand} <em>Studio</em>
      </h1>
      <div className="text-neutral-300 space-y-6 leading-relaxed">
        {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </div>
  );
};
export default About;
