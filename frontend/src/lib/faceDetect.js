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

  // ICAO: head fills ~72% of photo height, eyes ~55% from bottom (i.e. 0.45 from top)
  const photoH = headHeight / 0.72;
  const photoW = photoH * (spec.w / spec.h);

  // Photo center-Y: eyes should sit at 0.45 * photoH from top,
  // so center is 0.05 * photoH below the eyes.
  const cy = eyeMidY + 0.05 * photoH;
  const cx = eyeMidX;

  return { ok: true, cx, cy, w: photoW, h: photoH };
};

const avgX = (pts) => pts.reduce((s, p) => s + p.x, 0) / pts.length;
const avgY = (pts) => pts.reduce((s, p) => s + p.y, 0) / pts.length;

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
