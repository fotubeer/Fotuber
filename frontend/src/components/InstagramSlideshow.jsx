import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Instagram, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { api, API_BASE } from "@/lib/api";

const AUTO_INTERVAL = 5500; // ms per slide

const InstagramSlideshow = () => {
  const [posts, setPosts] = useState([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    api.get("/instagram-posts").then((r) => {
      const raw = r.data;
      const normalized = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.posts)
        ? raw.posts
        : Array.isArray(raw?.results)
        ? raw.results
        : [];
      setPosts(normalized);
    }).catch(() => setPosts([]));
  }, []);

  useEffect(() => {
    if (paused || posts.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % posts.length), AUTO_INTERVAL);
    return () => clearInterval(t);
  }, [paused, posts.length]);

  if (posts.length === 0) return null;

  const current = posts[idx];
  const prev = () => setIdx((i) => (i - 1 + posts.length) % posts.length);
  const next = () => setIdx((i) => (i + 1) % posts.length);

  return (
    <section
      className="relative bg-neutral-950 border-y border-neutral-900 overflow-hidden"
      data-testid="instagram-slideshow"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Ambient background layer */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-pink-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-[#d4af37]/10 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-16 md:py-20 grid lg:grid-cols-12 gap-10 items-center">
        {/* Left: heading */}
        <div className="lg:col-span-4 order-2 lg:order-1">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-xs uppercase tracking-[0.35em] text-pink-400 mb-3 flex items-center gap-2">
              <Instagram className="w-4 h-4" /> Instagram
            </div>
            <h2 className="hero-title text-3xl md:text-5xl leading-tight mb-4">
              Son <em>karelerimiz</em>.
            </h2>
            <p className="text-neutral-400 text-sm md:text-base leading-relaxed mb-6">
              Instagram sayfalarımızda paylaştığımız son işlerden bir seçki. Fotoğrafın üzerine tıklayarak orijinal Instagram sayfamıza ulaşabilir, kaldığınız yerden takibe devam edebilirsiniz.
            </p>

            {/* Account chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              <a href="https://www.instagram.com/fotuberphotography/" target="_blank" rel="noopener noreferrer" data-testid="insta-account-1">
                <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 hover:border-pink-400/60 hover:bg-pink-500/10 transition-colors px-3 py-1.5 text-xs text-neutral-300">
                  <Instagram className="w-3.5 h-3.5 text-pink-400" /> @fotuberphotography
                </span>
              </a>
              <a href="https://www.instagram.com/cankirinisanevii/" target="_blank" rel="noopener noreferrer" data-testid="insta-account-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 hover:border-pink-400/60 hover:bg-pink-500/10 transition-colors px-3 py-1.5 text-xs text-neutral-300">
                  <Instagram className="w-3.5 h-3.5 text-pink-400" /> @cankirinisanevii
                </span>
              </a>
            </div>

            <div className="text-xs text-neutral-500">
              {idx + 1} / {posts.length}
            </div>
          </motion.div>
        </div>

        {/* Right: slideshow card */}
        <div className="lg:col-span-8 order-1 lg:order-2">
          <div className="relative rounded-3xl overflow-hidden bg-black shadow-2xl aspect-[4/3] sm:aspect-[16/10] group">
            <AnimatePresence mode="wait">
              <motion.a
                key={current.id}
                href={current.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`insta-slide-${current.id}`}
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 block"
              >
                <img
                  src={`${API_BASE}/instagram-posts/${current.id}/image`}
                  alt={current.caption || "Instagram"}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Bottom overlay with caption + account */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 md:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.35em] text-pink-300 mb-1 flex items-center gap-2">
                        <Instagram className="w-3.5 h-3.5" /> {current.account_label || "@fotuberphotography"}
                      </div>
                      {current.caption && (
                        <div className="text-white text-lg md:text-xl font-serif leading-tight line-clamp-2 pr-4">
                          {current.caption}
                        </div>
                      )}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 backdrop-blur px-3 py-1.5 text-xs text-white whitespace-nowrap self-start sm:self-auto">
                      Instagram'da Aç <ExternalLink className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </motion.a>
            </AnimatePresence>

            {/* Prev / Next controls */}
            {posts.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); prev(); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Önceki"
                  data-testid="insta-prev"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); next(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Sonraki"
                  data-testid="insta-next"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnail dots */}
          {posts.length > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              {(Array.isArray(posts) ? posts : []).map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setIdx(i)}
                  aria-label={`Slayt ${i + 1}`}
                  data-testid={`insta-dot-${i}`}
                  className={`transition-all duration-300 rounded-full ${i === idx
                    ? "w-8 h-1.5 bg-pink-400"
                    : "w-1.5 h-1.5 bg-neutral-700 hover:bg-neutral-500"
                    }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default InstagramSlideshow;
