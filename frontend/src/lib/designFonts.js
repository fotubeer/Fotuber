// Dynamic Google Fonts loader for the Design Studio.
// Injects one <link> per family (once) and resolves when glyphs are ready.
const loaded = new Set();

export function loadGoogleFont(family, weights = "400;600;700") {
  if (!family) return Promise.resolve();
  if (!loaded.has(family)) {
    loaded.add(family);
    const id = `gf-${family.replace(/\s+/g, "-")}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      const fam = family.replace(/\s+/g, "+");
      link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights}&display=swap`;
      document.head.appendChild(link);
    }
  }
  if (document.fonts && document.fonts.load) {
    return document.fonts
      .load(`24px "${family}"`)
      .then(() => document.fonts.load(`700 24px "${family}"`))
      .catch(() => {});
  }
  return new Promise((r) => setTimeout(r, 400));
}

export function preloadFonts(families = []) {
  return Promise.all(families.map((f) => loadGoogleFont(f)));
}
