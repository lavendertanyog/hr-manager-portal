"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/approvals", label: "Approvals" },
  { href: "/project-codes", label: "Project Codes" },
  { href: "/attendance", label: "Attendance" },
  { href: "/audit", label: "Audit" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SidebarNav() {
  const pathname = usePathname();
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <aside className="sticky top-0 flex h-screen w-80 flex-col border-r border-[#E6EAFE] bg-[linear-gradient(180deg,#FFFFFF_0%,#F6F8FF_100%)] p-6">
      <div>
        <div className="mb-10 px-2 py-1">
          {!logoMissing ? (
            <Image
              src="/nextan-logo.png"
              alt="Nextan"
              width={140}
              height={46}
              priority
              className="mx-auto h-auto w-full max-w-[140px] object-contain"
              onError={() => setLogoMissing(true)}
            />
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#163EAF]">Nextan</p>
              <p className="mt-2 text-xl font-semibold text-[#2D376B]">Manager Portal</p>
            </div>
          )}
        </div>

        <nav className="space-y-3">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block rounded-[22px] px-5 py-3.5 text-sm font-semibold transition-all duration-200",
                  active
                    ? "bg-[#1540A8] text-white shadow-[0_14px_30px_rgba(21,64,168,0.28)]"
                    : "bg-white/75 text-[#5F6B99] shadow-[0_10px_24px_rgba(22,62,175,0.06)] hover:bg-[#E8EEFF] hover:text-[#163EAF]",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between rounded-2xl border border-[#D8E4FF] bg-[#F4F8FF] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#1540A8] text-sm font-semibold text-white">
              JD
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">Jane Dela Cruz</p>
              <p className="text-sm text-slate-500">Manager</p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Log out"
            title="Log out"
            className="grid h-9 w-9 place-items-center rounded-full border border-[#C9D9FF] text-[#1540A8] transition-colors hover:bg-[#E8EEFF]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
