import { Mail, MessageSquare, Phone, Sparkles, UserPlus, Send } from "lucide-react";
import { CHANNEL_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";

const ICON = {
  email: Mail,
  linkedin_connect: UserPlus,
  linkedin_message: MessageSquare,
  linkedin_inmail: Send,
  call: Phone,
  other: Sparkles,
} as const;

export function ChannelIcon({ channel, size = 14, className }: { channel: string; size?: number; className?: string }) {
  const Icon = ICON[channel as keyof typeof ICON] ?? Sparkles;
  return <Icon size={size} strokeWidth={2} className={className} aria-label={CHANNEL_LABEL[channel] ?? channel} />;
}

export function ChannelTag({ channel }: { channel: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-700 border border-line")}>
      <ChannelIcon channel={channel} size={12} />
      {CHANNEL_LABEL[channel] ?? channel}
    </span>
  );
}
