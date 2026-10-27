"use client";

import { avatarInitials, avatarTone } from "@/lib/avatar";

type Props = {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = {
  sm: "h-8 w-8 text-[0.7rem]",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
};

export function UserAvatar({ name, email, size = "md", className = "" }: Props) {
  const initials = avatarInitials(name, email);
  const tone = avatarTone(email || name);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZE[size]} ${tone} ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}
