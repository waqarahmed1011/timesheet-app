"use client";

import { useEffect, useRef } from "react";
import SignaturePadLib from "signature_pad";

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const pad = new SignaturePadLib(canvas, { backgroundColor: "rgb(255,255,255)" });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")!.scale(ratio, ratio);
      pad.clear();
      onChange(null);
    };
    resize();
    pad.addEventListener("endStroke", () => onChange(pad.isEmpty() ? null : pad.toDataURL("image/png")));
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, [onChange]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid="signature-pad"
        className="h-36 w-full touch-none rounded-md border-2 border-dashed border-stone-400 bg-white"
      />
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>Sign with your finger or mouse</span>
        <button type="button" className="underline" onClick={() => { padRef.current?.clear(); onChange(null); }}>
          Clear
        </button>
      </div>
    </div>
  );
}
