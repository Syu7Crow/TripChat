"use client";

import { useState } from "react";
import { resolveAvatar } from "@/lib/avatar";
import { contrastRatio } from "@/lib/theme";

/**
 * メンバーのアイコン。表示の優先順位は 写真 > 絵文字 > 名前の1文字。
 * 写真が読み込めないとき(削除された等)は、絵文字か名前の1文字に自動で切り替わる。
 * size は一辺のpx(既定 36)。ringColor を渡すと、重ねて並べたときの縁取りになる。
 */
export default function Avatar({
  name,
  emoji,
  color,
  url,
  size = 36,
  ringColor,
  className = "",
}: {
  name: string;
  emoji?: string | null;
  color?: string | null;
  url?: string | null;
  size?: number;
  ringColor?: string;
  className?: string;
}) {
  const avatar = resolveAvatar(emoji, color, url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = avatar.url !== null && failedUrl !== avatar.url;
  const textColor = contrastRatio(avatar.color, "#ffffff") >= 3 ? "#ffffff" : "#17222c";

  return (
    <span
      title={name}
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        backgroundColor: avatar.color,
        color: textColor,
        ...(ringColor ? { border: `2px solid ${ringColor}` } : null),
      }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- Storageの小さな正方形画像で、最適化は不要
        <img
          src={avatar.url as string}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailedUrl(avatar.url)}
          className="h-full w-full object-cover"
        />
      ) : (
        (avatar.emoji ?? name.slice(0, 1))
      )}
    </span>
  );
}
