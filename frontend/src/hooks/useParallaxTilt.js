import { useEffect, useRef, useState, useCallback } from "react";

// 3D parallax tilt driven by the device gyroscope (mobile) OR mouse (desktop).
// Returns { rx, ry } in degrees + gyro helpers. iOS 13+ needs a user gesture to
// grant DeviceOrientation permission, exposed via requestGyro().
export function useParallaxTilt({ max = 10, enabled = true } = {}) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [gyroActive, setGyroActive] = useState(false);
  const targetRef = useRef({ rx: 0, ry: 0 });
  const raf = useRef(0);
  const needsPermission =
    typeof window !== "undefined" &&
    typeof window.DeviceOrientationEvent !== "undefined" &&
    typeof window.DeviceOrientationEvent.requestPermission === "function";

  const clamp = (v) => Math.max(-max, Math.min(max, v));

  useEffect(() => {
    if (!enabled) return;
    const smooth = () => {
      setTilt((prev) => {
        const t = targetRef.current;
        const rx = prev.rx + (t.rx - prev.rx) * 0.12;
        const ry = prev.ry + (t.ry - prev.ry) * 0.12;
        return { rx, ry };
      });
      raf.current = requestAnimationFrame(smooth);
    };
    raf.current = requestAnimationFrame(smooth);

    const onOrient = (e) => {
      if (e.gamma == null && e.beta == null) return;
      setGyroActive(true);
      // gamma: left-right (-90..90) → ry ; beta: front-back (-180..180) → rx
      targetRef.current = {
        ry: clamp((e.gamma || 0) / 3),
        rx: clamp((-(e.beta || 0) + 45) / 4),
      };
    };
    const onMouse = (e) => {
      if (gyroActive) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      targetRef.current = {
        ry: clamp(((e.clientX - cx) / cx) * max),
        rx: clamp((-(e.clientY - cy) / cy) * max),
      };
    };

    if (!needsPermission) window.addEventListener("deviceorientation", onOrient, true);
    window.addEventListener("mousemove", onMouse);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("deviceorientation", onOrient, true);
      window.removeEventListener("mousemove", onMouse);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gyroActive]);

  const requestGyro = useCallback(async () => {
    if (!needsPermission) return true;
    try {
      const res = await window.DeviceOrientationEvent.requestPermission();
      if (res === "granted") {
        const handler = (e) => {
          if (e.gamma == null && e.beta == null) return;
          setGyroActive(true);
          targetRef.current = {
            ry: Math.max(-max, Math.min(max, (e.gamma || 0) / 3)),
            rx: Math.max(-max, Math.min(max, (-(e.beta || 0) + 45) / 4)),
          };
        };
        window.addEventListener("deviceorientation", handler, true);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }, [needsPermission, max]);

  return { tilt, requestGyro, needsPermission, gyroActive };
}

export default useParallaxTilt;
