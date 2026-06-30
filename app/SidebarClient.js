"use client";

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

function deriveNameFromEmail(email) {
  return String(email || '')
    .split('@')[0]
    .split('.')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatRole(role) {
  return String(role || '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Team Management', href: '/team' },
  { label: 'Approvals', href: '/approvals' },
  { label: 'Project Codes', href: '/project-codes' },
  { label: 'Attendance', href: '/attendance' },
];

const SIDEBAR_PATH_PREFIXES = ['/dashboard', '/team', '/approvals', '/project-codes', '/attendance'];

export default function SidebarClient() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, [pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem('hr_portal_user');
    router.push('/');
  };

  const shouldShowSidebar = Boolean(pathname) && SIDEBAR_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!shouldShowSidebar || !user) return null;

  const displayName = deriveNameFromEmail(user?.email) || user?.full_name || 'Manager';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || 'M';

  return (
    <aside
      className="flex flex-col bg-white"
      style={{ width: 240, minHeight: '100vh', borderRight: '1px solid #e5e7eb' }}
    >
      {/* Logo */}
      <div className="flex items-center justify-center" style={{ padding: '28px 24px 20px' }}>
        {!logoMissing ? (
          <Image
            src="/nextan-logo.png"
            alt="Nextan"
            width={120}
            height={36}
            className="object-contain"
            onError={() => setLogoMissing(true)}
          />
        ) : (
          <span className="text-lg font-bold text-blue-900 tracking-tight">nextan</span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3" style={{ paddingTop: 8 }}>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-2xl text-sm font-medium transition-colors"
              style={{
                padding: '13px 18px',
                marginBottom: 6,
                background: active ? '#e8edf8' : 'white',
                color: active ? '#1a3a8f' : '#374151',
                fontWeight: active ? 600 : 500,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile block */}
      <div className="px-3 pb-5 pt-3" style={{ borderTop: '1px solid #f0f0f0' }}>
        <div
          className="flex items-center gap-3 rounded-2xl"
          style={{ background: '#f5f7fc', padding: '12px 14px' }}
        >
          {/* Avatar */}
          <div
            className="flex items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0"
            style={{ width: 38, height: 38, background: '#1a3a8f', fontSize: 13 }}
          >
            {initials}
          </div>

          {/* Name + role */}
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold truncate" style={{ color: '#111827', lineHeight: 1.3 }}>
              {displayName}
            </p>
            <p className="text-xs truncate" style={{ color: '#6b7280', marginTop: 1 }}>
              {formatRole(user?.user_role)}
            </p>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            title="Log out"
            className="flex-shrink-0 flex items-center justify-center rounded-lg transition hover:bg-red-50"
            style={{ width: 30, height: 30, color: '#9ca3af' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
