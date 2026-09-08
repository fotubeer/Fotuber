// Face detection helper using @vladmandic/face-api
// Loads models lazily from a public CDN so we don't ship weights in the bundle.
import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
let modelsReady = false;
let loading = null;

export const loadFaceModels = () => {
  if (modelsReady) return Promise.resolve();
  if (loading) return loading;
  loading = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  ]).then(() => { modelsReady = true; });
  return loading;
};

// Detects the largest face in an HTMLImageElement and returns a biometric
// crop rectangle in image-pixel coordinates matching the target photo aspect.
//   spec: { w, h }  (photo size in mm; used only for aspect ratio)
// Returns { cx, cy, w, ok, message } where cx/cy/w are in image pixels.
export const detectBiometricCrop = async (imgEl, spec) => {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(imgEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }))
    .withFaceLandmarks();

  if (!detection) return { ok: false, message: "Yüz tespit edilemedi" };

  const lm = detection.landmarks;
  const leftEye = lm.getLeftEye();
  const rightEye = lm.getRightEye();
  const jaw = lm.getJawOutline();
  const eyeMidX = (avgX(leftEye) + avgX(rightEye)) / 2;
  const eyeMidY = (avgY(leftEye) + avgY(rightEye)) / 2;
  const chinY = jaw[Math.floor(jaw.length / 2)].y; // point 8 of 17-point jaw

  // Head height (chin-to-crown) is roughly 2.2 × (chin-to-eye)
  const chinToEye = chinY - eyeMidY;
  if (chinToEye <= 0) return { ok: false, message: "Yüz açısı uygun değil" };
  const headHeight = chinToEye * 2.2;

  // Framing rules differ by format:
  //  - biometric/passport (ICAO): head fills ~72% of photo height, eyes at 0.45 from top.
  //  - vesikalık (TR studio ID): NO biometric rules — a looser frame that shows more of
  //    the shoulders/chest, so the head fills less of the frame and there is more body.
  const isVesikalik = spec?.format === "vesikalik";
  const headFill = isVesikalik ? 0.52 : 0.72;      // smaller head → more body visible
  const eyesFromTop = isVesikalik ? 0.40 : 0.45;   // eyes higher → more chest below

  const photoH = headHeight / headFill;
  const photoW = photoH * (spec.w / spec.h);

  // Center-Y: eyes sit at eyesFromTop of photo height, so center is
  // (0.5 - eyesFromTop) * photoH below the eyes.
  const cy = eyeMidY + (0.5 - eyesFromTop) * photoH;
  const cx = eyeMidX;

  return { ok: true, cx, cy, w: photoW, h: photoH };
};

const avgX = (pts) => pts.reduce((s, p) => s + p.x, 0) / pts.length;
const avgY = (pts) => pts.reduce((s, p) => s + p.y, 0) / pts.length;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------------------
// Faz 3: ICAO biyometrik uygunluk kontrolü. Bitmiş (çerçevelenmiş) canvas'ı
// analiz eder ve fotoğrafçıya yeşil onay / uyarı rozetleri döndürür.
// ---------------------------------------------------------------------------
export const checkIcao = async (canvasEl) => {
  await loadFaceModels();
  const det = await faceapi
    .detectSingleFace(canvasEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }))
    .withFaceLandmarks();
  if (!det) return { ok: false, checks: [{ key: "face", label: "Yüz tespit edilemedi", ok: false }] };

  const W = canvasEl.width, H = canvasEl.height;
  const lm = det.landmarks;
  const leftEye = lm.getLeftEye();
  const rightEye = lm.getRightEye();
  const jaw = lm.getJawOutline();
  const eyeMidX = (avgX(leftEye) + avgX(rightEye)) / 2;
  const eyeMidY = (avgY(leftEye) + avgY(rightEye)) / 2;
  const chinY = jaw[Math.floor(jaw.length / 2)].y;

  const checks = [];

  // 1) Yüz yüksekliği oranı (ICAO %70-80).
  const headHeight = Math.max(1, (chinY - eyeMidY) * 2.2);
  const ratio = headHeight / H;
  if (ratio < 0.62) checks.push({ key: "ratio", label: "Yüz oranı düşük (yakınlaştırın)", ok: false });
  else if (ratio > 0.88) checks.push({ key: "ratio", label: "Yüz oranı yüksek (uzaklaştırın)", ok: false });
  else checks.push({ key: "ratio", label: `Yüz oranı uygun (%${Math.round(ratio * 100)})`, ok: true });

  // 2) Gözler açık mı (Eye Aspect Ratio).
  const ear = (e) => (dist(e[1], e[5]) + dist(e[2], e[4])) / (2 * dist(e[0], e[3]));
  const avgEar = (ear(leftEye) + ear(rightEye)) / 2;
  checks.push(avgEar < 0.17
    ? { key: "eyes", label: "Gözler kapalı olabilir", ok: false }
    : { key: "eyes", label: "Gözler açık", ok: true });

  // 3) Baş eğikliği (göz hattı açısı).
  const angle = Math.abs(Math.atan2(avgY(rightEye) - avgY(leftEye), avgX(rightEye) - avgX(leftEye)) * 180 / Math.PI);
  const tilt = Math.min(angle, Math.abs(180 - angle));
  checks.push(tilt > 7
    ? { key: "tilt", label: `Baş eğik (${Math.round(tilt)}°)`, ok: false }
    : { key: "tilt", label: "Baş düz", ok: true });

  // 4) Yüz yatayda ortada mı.
  const offset = Math.abs(eyeMidX - W / 2) / W;
  checks.push(offset > 0.12
    ? { key: "center", label: "Yüz ortada değil", ok: false }
    : { key: "center", label: "Yüz ortalanmış", ok: true });

  // 5) Arka plan / gölge analizi — üst köşelerin parlaklık dengesi.
  try {
    const ctx = canvasEl.getContext("2d");
    const bw = Math.max(6, Math.round(W * 0.12));
    const bh = Math.max(6, Math.round(H * 0.12));
    const lum = (data) => {
      let s = 0; const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) s += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      return s / n;
    };
    const tl = lum(ctx.getImageData(0, 0, bw, bh).data);
    const tr = lum(ctx.getImageData(W - bw, 0, bw, bh).data);
    const diff = Math.abs(tl - tr);
    const dark = Math.min(tl, tr);
    if (diff > 28 || dark < 150) checks.push({ key: "bg", label: "Işık/gölge dengesiz olabilir", ok: false });
    else checks.push({ key: "bg", label: "Arka plan dengeli", ok: true });
  } catch {
    // getImageData taint (cross-origin) — atla.
  }

  return { ok: checks.every((c) => c.ok), checks };
};

// Detect facial landmarks and return convenient regions for red-eye removal
// and eye-sharpening tools. Returns eye bounding boxes in image-pixel coords.
export const detectFaceRegions = async (imgEl) => {
  await loadFaceModels();
  const det = await faceapi
    .detectSingleFace(imgEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }))
    .withFaceLandmarks();
  if (!det) return { ok: false, message: "Yüz tespit edilemedi" };
  const lm = det.landmarks;
  const boxFromPts = (pts, padX = 0.35, padY = 0.5) => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const w = xMax - xMin, h = yMax - yMin;
    return {
      x: xMin - w * padX,
      y: yMin - h * padY,
      w: w * (1 + 2 * padX),
      h: h * (1 + 2 * padY),
      cx: (xMin + xMax) / 2,
      cy: (yMin + yMax) / 2,
    };
  };
  return {
    ok: true,
    leftEye: boxFromPts(lm.getLeftEye()),
    rightEye: boxFromPts(lm.getRightEye()),
    box: det.detection.box,
  };
};
