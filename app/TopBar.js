"use client";

import React, { useEffect, useRef, useState } from 'react';
import { otherPortals, switchPortal } from './portalSwitch';
import Link from 'next/link';
import axios from 'axios';
import { useRouter, usePathname } from 'next/navigation';
import { authHeaders, endSession } from './authSession';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

// Every page, and every named feature/action on those pages, so typing "approve" or
// "allocate" finds the right place even if the manager doesn't know which page it lives on.
const SEARCH_INDEX = [
  { label: 'Dashboard', href: '/dashboard', keywords: 'home overview welcome' },
  { label: 'Team Management', href: '/team', keywords: 'staff members people workload hours' },
  { label: 'Approvals', href: '/approvals', keywords: 'approve reject review pending requests' },
  { label: 'Progress', href: '/project-codes', keywords: 'project codes progress budget hours' },
  { label: 'Calendar', href: '/calendar', keywords: 'public holidays who is on leave team out of office' },
  { label: 'Profile', href: '/profile', keywords: 'account settings password change devices' },
  { label: 'Leave Requests', href: '/approvals?tab=LEAVE', keywords: 'leave approve reject annual sick emergency mc' },
  { label: 'Budget Requests', href: '/approvals?tab=BUDGET', keywords: 'budget hours approve reject' },
  { label: 'Expense Claims', href: '/approvals?tab=CLAIMS', keywords: 'claims expense receipt reimbursement approve' },
  { label: 'Approval History', href: '/approvals?tab=HISTORY', keywords: 'history past decisions undo' },
  { label: 'Quick Allocation', href: '/dashboard#allocate', keywords: 'allocate staff project hours per week assign' },
  { label: 'Change Password', href: '/profile', keywords: 'password security account reset' },
];

// Bolds/darkens the part of the label that matched what was typed and leaves the rest muted,
// so the row itself explains why it matched.
function HighlightedLabel({ label, query }) {
  if (!query) return <span>{label}</span>;
  const idx = label.toLowerCase().indexOf(query);
  if (idx === -1) return <span className="text-slate-900">{label}</span>;
  return (
    <span className="text-slate-400">
      {label.slice(0, idx)}
      <span className="text-slate-900 font-semibold">{label.slice(idx, idx + query.length)}</span>
      {label.slice(idx + query.length)}
    </span>
  );
}

function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? SEARCH_INDEX.filter((item) => item.label.toLowerCase().includes(q) || item.keywords.includes(q)).slice(0, 8)
    : [];

  useEffect(() => { setActiveIndex(0); }, [query]);

  const go = (item) => {
    setQuery('');
    setOpen(false);
    router.push(item.href);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIndex]) go(results[activeIndex]);
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center gap-3 rounded-2xl bg-white border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.03)] px-4 max-w-xl focus-within:ring-2 focus-within:ring-blue-500" style={{ height: 48 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" placeholder="Search pages and actions, e.g. approve leave" aria-label="Search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none" />
      </div>
      {open && q && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-lg py-2 z-30 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">No matches for &quot;{query}&quot;</p>
          ) : results.map((item, i) => (
            <button key={`${item.href}-${item.label}`} type="button"
              onClick={() => go(item)} onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left rounded-xl ${i === activeIndex ? 'bg-slate-50' : ''}`}>
              <span className="text-sm"><HighlightedLabel label={item.label} query={q} /></span>
              {i === activeIndex && (
                <kbd className="flex-shrink-0 text-[10px] border border-slate-300 rounded px-1.5 py-0.5 text-slate-400">↵</kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ onMenuClick, menuExpanded }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Other portals this person has a role for, opened already signed in (see portalSwitch.js).
  const switchTargets = otherPortals(user, 'manager');
  const [switchError, setSwitchError] = useState('');
  const [switching, setSwitching] = useState(null);
  const goToPortal = async (portalKey) => {
    setSwitchError(''); setSwitching(portalKey);
    const err = await switchPortal(portalKey);
    if (err) { setSwitchError(err); setSwitching(null); }
  };
  const [notifOpen, setNotifOpen] = useState(false);
  const [pending, setPending] = useState(null); // { leave, budget, claims }
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  // Requests waiting for this manager. Refreshed on every page change, so the count drops as
  // soon as the manager has worked through them on Approvals and moves on.
  useEffect(() => {
    if (!user?.user_id) return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
    const count = (res) => (res?.data?.data || []).length;
    Promise.all([
      axios.get(`${base}/api/v1/manager/${user.user_id}/leave-pending`).catch(() => null),
      axios.get(`${base}/api/v1/projects/budget-requests?reviewerId=${user.user_id}`).catch(() => null),
      axios.get(`${base}/api/v1/claims/manager-pending`, { headers: authHeaders() }).catch(() => null),
    ]).then(([leaveRes, budgetRes, claimsRes]) => {
      setPending({ leave: count(leaveRes), budget: count(budgetRes), claims: count(claimsRes) });
    });
  }, [user?.user_id, pathname]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = () => {
    endSession();
    sessionStorage.removeItem('hr_portal_user');
    router.push('/');
  };

  const displayName = deriveNameFromEmail(user?.email) || user?.full_name || 'Manager';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || 'M';
  const totalPending = pending ? pending.leave + pending.budget + pending.claims : 0;
  const notifRows = [
    { label: 'Leave requests', count: pending?.leave || 0, href: '/approvals?tab=LEAVE' },
    { label: 'Budget requests', count: pending?.budget || 0, href: '/approvals?tab=BUDGET' },
    { label: 'Expense claims', count: pending?.claims || 0, href: '/approvals?tab=CLAIMS' },
  ];

  return (
    <div className="sticky top-0 z-20 px-6 pt-4 pb-3 sm:px-8" style={{ background: '#F7F9FD' }}>
      <div className="flex items-center gap-3">
        {/* Menu: collapses/expands the rail on desktop, opens the drawer on small screens */}
        <button type="button" onClick={onMenuClick} aria-label="Toggle menu" aria-expanded={menuExpanded}
          className="flex-shrink-0 flex items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
          style={{ width: 40, height: 40 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <SearchBox />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Notifications: requests waiting for review */}
          <div className="relative" ref={notifRef}>
            <button type="button" onClick={() => setNotifOpen((v) => !v)}
              aria-label={totalPending > 0 ? `Notifications, ${totalPending} waiting for review` : 'Notifications'}
              className="relative flex items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
              style={{ width: 40, height: 40 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {totalPending > 0 && (
                <span className="absolute top-1 right-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#F7F9FD]">
                  {totalPending > 99 ? '99+' : totalPending}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-lg p-2 z-30">
                <p className="px-3 pt-2 pb-1 text-sm font-semibold text-slate-900">Waiting for your review</p>
                {pending === null ? (
                  <p className="px-3 py-3 text-xs text-slate-400">Loading…</p>
                ) : totalPending === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-500">You&apos;re all caught up.</p>
                ) : notifRows.map((row) => (
                  <Link key={row.label} href={row.href} onClick={() => setNotifOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                    {row.label}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.count > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>{row.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href="/calendar" aria-label="Calendar"
            className="flex items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
            style={{ width: 40, height: 40 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </Link>

          <div className="w-px h-6 bg-slate-200 mx-2" />

          {/* Avatar + name dropdown */}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-full pl-1 pr-2 py-1 transition hover:bg-white">
              <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
                style={{ width: 36, height: 36, background: '#1a3a8f', boxShadow: '0 0 0 3px #f0c9dc' }}>
                {initials}
              </div>
              <span className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-sm font-semibold text-slate-800 truncate max-w-[120px]">{displayName}</span>
                <span className="text-xs text-slate-500">Manager</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white shadow-lg py-2 z-30">
                <Link href="/profile" onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Profile</Link>
                {switchTargets.length > 0 && (
                  <div className="my-1 border-y border-slate-100 py-1">
                    <p className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Switch portal</p>
                    {switchTargets.map((p) => (
                      <button key={p.key} type="button" onClick={() => goToPortal(p.key)} disabled={Boolean(switching)}
                        className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {switching === p.key ? 'Opening…' : p.label}
                      </button>
                    ))}
                    {switchError && <p className="px-4 py-1.5 text-xs font-medium text-red-600">{switchError}</p>}
                  </div>
                )}
                <button type="button" onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
