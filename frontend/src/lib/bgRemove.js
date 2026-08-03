// Client-side background removal using @imgly/background-removal.
// Runs entirely in the browser (WASM + ONNX). First call downloads a ~40MB
// model that is cached by the browser for subsequent runs.

let _remove = null;
const loadLib = async () => {
  if (_remove) return _remove;
  const mod = await import("@imgly/background-removal");
  _remove = mod.removeBackground || mod.default;
  return _remove;
};

// Remove background from a File / Blob / data-URL string and return a
// PNG blob with a transparent background. Progress callback receives a
// number 0..1 while the model downloads / runs.
export const removeBackground = async (input, onProgress) => {
  const remove = await loadLib();
  const config = {
    output: { format: "image/png", quality: 0.9 },
  };
  if (typeof onProgress === "function") {
    config.progress = (_key, current, total) => {
      const pct = total ? current / total : 0;
      onProgress(Math.min(1, pct));
    };
  }
  return remove(input, config);
};

// Composite the transparent PNG blob onto a solid background color and
// return a data URL. Used to produce the final "beyaz arka planlı" photo.
export const compositeOnColor = (blob, color = "#ffffff") =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.95), w: img.width, h: img.height });
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
