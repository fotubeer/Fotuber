import React, { useEffect, useState } from "react";
import { api, galleryFileUrl } from "@/lib/api";
import { SEO } from "@/components/SEO";

const Gallery = () => {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api.get("/gallery/categories").then((r) => {
      const raw = r.data;
      setCategories(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.categories) ? raw.categories : Array.isArray(raw?.results) ? raw.results : []);
    }).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const params = selected ? { category: selected } : {};
    api.get("/gallery", { params }).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [selected]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-24">
      <SEO title="Galeri" description="Fotuber Studio galerisi — düğün, nişan, bebek, aile, portre ve etkinlik çekimlerinden seçkiler." path="/galeri" />
      <div className="text-xs tracking-[0.3em] uppercase text-[#d4af37] mb-3">Galeri</div>
      <h1 className="hero-title text-5xl md:text-6xl mb-10">
        <em>Işıkta</em> yakalanan anlar.
      </h1>

      <div className="flex flex-wrap gap-2 mb-10">
        <button
          data-testid="gallery-cat-all"
          onClick={() => setSelected(null)}
          className={`px-4 py-2 rounded-full text-sm border ${!selected ? "bg-[#d4af37] text-black border-[#d4af37]" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"}`}
        >Tümü</button>
        {categories.map((c) => (
          <button
            key={c.slug}
            data-testid={`gallery-cat-${c.slug}`}
            onClick={() => setSelected(c.slug)}
            className={`px-4 py-2 rounded-full text-sm border ${selected === c.slug ? "bg-[#d4af37] text-black border-[#d4af37]" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"}`}
          >{c.name}</button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="border border-neutral-900 rounded-2xl py-20 text-center text-neutral-500">
          Henüz bu kategoride medya yüklenmedi.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((g) => (
            <div
              key={g.id}
              data-testid={`gallery-item-${g.id}`}
              className="aspect-[4/5] overflow-hidden rounded-xl border border-neutral-900 group cursor-pointer relative"
              onClick={() => setPreview(g)}
            >
              {g.media_type === "video" ? (
                <>
                  <video src={galleryFileUrl(g.id)} className="w-full h-full object-cover" muted playsInline />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-black text-lg">▶</span>
                  </div>
                </>
              ) : (
                <img src={galleryFileUrl(g.id)} alt={g.title || "Galeri"} loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              )}
              {g.title && (
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                  <div className="text-sm text-white font-medium">{g.title}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
          data-testid="gallery-preview-modal"
        >
          <button className="absolute top-6 right-6 text-white text-2xl" onClick={() => setPreview(null)}>×</button>
          <div className="max-w-5xl w-full max-h-[90vh]">
            {preview.media_type === "video" ? (
              <video src={galleryFileUrl(preview.id)} controls autoPlay className="w-full max-h-[85vh] object-contain" />
            ) : (
              <img src={galleryFileUrl(preview.id)} alt={preview.title || ""} className="w-full max-h-[85vh] object-contain" />
            )}
            {(preview.title || preview.description) && (
              <div className="mt-4 text-center">
                <div className="font-serif text-2xl">{preview.title}</div>
                <div className="text-sm text-neutral-400">{preview.description}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
