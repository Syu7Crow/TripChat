import { formatBadge } from "@/lib/unread";

/** 未読件数などの小さな丸いバッジ。0件のときは何も出さない */
export default function Badge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      role="status"
      aria-label={`未読${count}件`}
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white ${className}`}
    >
      {formatBadge(count)}
    </span>
  );
}
