import { CheckCheck } from "lucide-react";

interface WhatsAppPreviewCardProps {
  recipientTitle: string;
  recipientSubtitle?: string;
  message: string;
  timeLabel?: string;
}

export function WhatsAppPreviewCard({
  recipientTitle,
  recipientSubtitle,
  message,
  timeLabel,
}: WhatsAppPreviewCardProps) {
  const now = new Date();
  const displayTime =
    timeLabel ||
    `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

  const initials = recipientTitle
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");

  return (
    <div className="rounded-xl overflow-hidden border border-[#E2DFD7] shadow-xs bg-[#EFEAE2]">
      {/* WhatsApp-style header */}
      <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-xs font-semibold tracking-wide shrink-0">
          {initials || "MK"}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{recipientTitle}</div>
          {recipientSubtitle && (
            <div className="text-[11px] text-emerald-100/90 truncate">
              {recipientSubtitle}
            </div>
          )}
        </div>
      </div>

      {/* Chat body */}
      <div className="p-4 min-h-[210px] flex flex-col justify-end bg-[radial-gradient(#d8d2c7_0.75px,transparent_0.75px)] [background-size:14px_14px]">
        <div className="ml-auto max-w-[94%] bg-[#D9FDD3] text-zinc-900 rounded-xl rounded-tr-xs px-3.5 py-2.5 shadow-xs border border-emerald-900/5">
          <div className="text-[13.5px] leading-[1.45] whitespace-pre-wrap break-words">
            {message}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-500 font-mono-tabular">
            <span>{displayTime}</span>
            <CheckCheck className="w-3.5 h-3.5 text-sky-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
