"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";

const ROLE_LABELS: Record<string, string> = {
  FRONT_DESK: "Front Desk",
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
  MARKETING: "Marketing",
  ADMIN: "Admin",
};

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const name = session?.user?.name || "Account";
  const role = session?.user?.role;
  const image = session?.user?.image;

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative z-40">
      <button
        ref={buttonRef}
        type="button"
        aria-label={compact ? `Account menu for ${name}` : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-full p-1 text-pp-ink transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-accent"
      >
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-pp-accent text-sm font-semibold text-white" aria-hidden="true">
          {image && image !== failedImage ? (
            <Image src={image} alt="" width={36} height={36} unoptimized
              className="size-9 object-cover" onError={() => setFailedImage(image)} />
          ) : name.charAt(0)}
        </span>
        {!compact && <span className="max-w-36 truncate pr-2 text-sm font-medium">{name}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-pp-line bg-white p-2 text-pp-ink shadow-lg">
          <div className="border-b border-pp-line px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            {role && <p className="mt-0.5 text-xs text-pp-ink-3">{ROLE_LABELS[role] ?? role}</p>}
            <p className="mt-0.5 break-all text-xs text-pp-ink-3">{session?.user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-pp-ink transition-colors hover:bg-pp-surface-2 focus-visible:outline-2 focus-visible:outline-pp-accent"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
