'use client';
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

/** Camera QR scanner. Calls onCode once with the first code it reads. */
export default function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        tick();
      } catch {
        setError('Camera not available. Allow camera access in the browser settings, or type the card number instead.');
      }
    }

    function tick() {
      if (done) return;
      const v = video.current, c = canvas.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * 640) || 480;
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, w, h);
        const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          done = true;
          if (navigator.vibrate) navigator.vibrate(60);
          onCode(found.data);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => { done = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [onCode]);

  return (
    <div className="scanner">
      <div className="cam">
        <video ref={video} playsInline muted />
        <div className="frame" aria-hidden="true" />
      </div>
      <canvas ref={canvas} hidden />
      {error && <p className="err">{error}</p>}
      <button className="btn ghost" type="button" onClick={onClose}>Type the number instead</button>
      <style>{`
        .scanner { display: flex; flex-direction: column; gap: 14px; }
        .scanner .cam { position: relative; overflow: hidden; border-radius: 6px; }
        .scanner video { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: #000; }
        .scanner .frame { position: absolute; left: 50%; top: 50%; width: 58%; aspect-ratio: 1; transform: translate(-50%, -50%); border: 3px solid #fff; border-radius: 12px; box-shadow: 0 0 0 999px rgba(0,0,0,.25); pointer-events: none; }
      `}</style>
    </div>
  );
}
