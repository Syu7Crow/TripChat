"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CROP_DIAMETER,
  MAX_ZOOM,
  OUTPUT_SIZE,
  STAGE_SIZE,
  applyZoom,
  clampOffset,
  cropSourceRect,
  displayScale,
  type CropView,
  type Size,
} from "@/lib/crop";

/**
 * アイコン用の写真を、丸い枠で切り抜く画面(LINEのプロフィール写真と同じ操作)。
 * - 丸い枠の外側(アイコンとして表示されない部分)は暗く表示する
 * - ドラッグで位置を合わせ、スライダー・ホイール・2本指のピンチで拡大縮小する
 * - 「決定」で、枠の中だけを OUTPUT_SIZE 四方の JPEG にして onConfirm に渡す
 */
export default function AvatarCropper({
  file,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: {
  file: File;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [view, setView] = useState<CropView>({ zoom: 1, x: 0, y: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  // 選んだファイルを画面に出すための一時URL(閉じるときに破棄する)
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ファイルが決まった時点で一時URLを作るため意図的
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 表示中はページ側がスクロールしないようにし、Escで閉じられるようにする
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, onCancel]);

  const moveBy = useCallback(
    (dx: number, dy: number) => {
      if (!natural) return;
      setView((v) => ({ ...v, ...clampOffset(v.x + dx, v.y + dy, natural, v.zoom) }));
    },
    [natural]
  );

  const zoomTo = useCallback(
    (zoom: number) => {
      if (!natural) return;
      setView((v) => applyZoom(v, zoom, natural));
    },
    [natural]
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      moveBy(e.clientX - previous.x, e.clientY - previous.y);
    } else if (pointers.current.size === 2 && pinch.current && pinch.current.distance > 0) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(pinch.current.zoom * (distance / pinch.current.distance));
    }
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    zoomTo(view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = 12;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      moveBy(move[0], move[1]);
    } else if (e.key === "+" || e.key === "=") {
      zoomTo(view.zoom * 1.1);
    } else if (e.key === "-") {
      zoomTo(view.zoom / 1.1);
    }
  }

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img || !natural) return;
    setExporting(true);
    try {
      const { sx, sy, size } = cropSourceRect(natural, view);
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.88)
      );
      if (!blob) throw new Error("blob");
      await onConfirm(blob);
    } catch {
      setLoadError("画像を切り抜けませんでした。別の写真で試してください。");
    } finally {
      setExporting(false);
    }
  }

  // 写真の表示位置・大きさ(ステージの中心を基準にする)
  const scale = natural ? displayScale(natural, view.zoom) : 1;
  const photoStyle: React.CSSProperties | undefined = natural
    ? {
        width: natural.w * scale,
        height: natural.h * scale,
        left: STAGE_SIZE / 2 + view.x - (natural.w * scale) / 2,
        top: STAGE_SIZE / 2 + view.y - (natural.h * scale) / 2,
      }
    : undefined;

  const working = busy || exporting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="アイコンの写真を切り抜く"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-4 py-6"
    >
      <div className="w-full max-w-sm rounded-3xl bg-ink p-5 text-paper shadow-xl">
        <p className="text-center font-display text-lg">アイコンの範囲を選ぶ</p>
        <p className="mt-1 text-center text-xs text-paper/60">
          ドラッグで位置を合わせ、ピンチやスライダーで大きさを変えます
        </p>

        {/* ステージ: 写真の上に、丸く抜いた暗幕を重ねる */}
        <div
          tabIndex={0}
          role="application"
          aria-label="写真の位置と大きさ。矢印キーで移動、プラスとマイナスで拡大縮小"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          className="relative mx-auto mt-4 cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-amber active:cursor-grabbing"
          style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- 切り抜き用に自由に動かす写真で、next/image は不向き
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalWidth === 0 || el.naturalHeight === 0) {
                  setLoadError("この画像は読み込めませんでした。JPEG・PNG・WebPの写真を選んでください。");
                  return;
                }
                setNatural({ w: el.naturalWidth, h: el.naturalHeight });
                setView({ zoom: 1, x: 0, y: 0 });
              }}
              onError={() =>
                setLoadError("この画像は読み込めませんでした。JPEG・PNG・WebPの写真を選んでください。")
              }
              className="pointer-events-none absolute max-w-none"
              style={photoStyle ?? { opacity: 0 }}
            />
          )}

          {/* 丸い枠。外側の大きな影が「アイコンとして表示されない部分」を暗くする */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-2 border-white/90"
            style={{
              width: CROP_DIAMETER,
              height: CROP_DIAMETER,
              left: (STAGE_SIZE - CROP_DIAMETER) / 2,
              top: (STAGE_SIZE - CROP_DIAMETER) / 2,
              boxShadow: "0 0 0 999px rgba(0, 0, 0, 0.62)",
            }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span aria-hidden="true" className="text-xs text-paper/60">
            小
          </span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            disabled={!natural || working}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="拡大率"
            className="h-2 flex-1 cursor-pointer accent-amber"
          />
          <span aria-hidden="true" className="text-xs text-paper/60">
            大
          </span>
        </div>

        {(loadError || error) && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {loadError ?? error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="rounded-lg border border-paper/30 px-4 py-2 text-sm text-paper/80 hover:bg-paper/10 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!natural || working}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {working ? "保存中…" : "決定"}
          </button>
        </div>
      </div>
    </div>
  );
}
