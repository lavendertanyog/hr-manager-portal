"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { formatLeaveDate } from '../leaveFormat';
import { useConfirm } from '../ConfirmDialog';
import ComingUp from '../ComingUp';

function deriveNameFromEmail(email) {
  return String(email || '')
    .split('@')[0]
    .split('.')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const DEFAULT_WEEKLY_CAPACITY = 40;
const PROJECT_PREVIEW_COUNT = 6;

// A YYYY-MM-DD calendar date as-is, or a full timestamp converted to its SGT date.
function toYMD(value) {
  const s = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function dayMonth(ymd) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

// "16 Oct · 1 day" or "16 Oct – 17 Oct · 2 days"
function leaveRange(item) {
  const start = toYMD(item.start_date);
  const end = toYMD(item.end_date);
  if (!start || !end) return '';
  const days = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
  return start === end ? `${dayMonth(start)} · 1 day` : `${dayMonth(start)} – ${dayMonth(end)} · ${days} days`;
}

function initialsOf(name) {
  return String(name || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || '?';
}

const LEAVE_LABELS = { ANNUAL: 'Annual leave', EMERGENCY: 'Emergency leave', SICK: 'Sick leave' };
const STATUS_COLORS = {
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  MANAGER_APPROVED: 'bg-[#E8EEFF] text-[#1a3a8f]',
};
const AVATAR_COLORS = ['#1a3a8f', '#2f56b8', '#16307a', '#1540A8'];
const OUT_COLORS = ['#e48ab0', '#8fa6e6'];

// Card surface used across the new dashboard: white, no border, a soft navy-tinted shadow.
const CARD = 'rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(22,48,122,0.18)]';

function Avatar({ name }) {
  const n = String(name || '');
  const color = AVATAR_COLORS[[...n].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }} aria-hidden="true">
      {initialsOf(n)}
    </span>
  );
}

function ArrowLink({ href, children }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#1540A8]">
      {children}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </Link>
  );
}

function StatIcon({ name }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'leave') return <svg {...common}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>;
  if (name === 'budget') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3" /></svg>;
}

export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState('LEAVE');
  const [pendingLeave, setPendingLeave] = useState([]);
  const [pendingBudget, setPendingBudget] = useState([]);
  const [historyLeave, setHistoryLeave] = useState([]);
  const [historyBudget, setHistoryBudget] = useState([]);
  const [activeHistoryType, setActiveHistoryType] = useState('LEAVE');
  const [projects, setProjects] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [workloadMap, setWorkloadMap] = useState({});
  const [allocation, setAllocation] = useState({ userId: '', projectCode: '', hours: '' });
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [allocMessage, setAllocMessage] = useState('');
  const [sessionUser, setSessionUser] = useState(null);
  const [toast, setToast] = useState(null); // { message, onUndo }
  const [confirm, confirmDialog] = useConfirm();
  const [loaded, setLoaded] = useState(false);
  // Which stat card the user clicked; only that card gets the outline (none on first load).
  const [selectedCard, setSelectedCard] = useState(null);
  const [outToday, setOutToday] = useState(null);

  const approvalsRef = useRef(null);
  const allocateRef = useRef(null);
  const toastTimerRef = useRef(null);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  // Load session user
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (stored) setSessionUser(JSON.parse(stored));
    } catch {}
  }, []);

  const managerId = sessionUser?.user_id || '';
  const managerName = deriveNameFromEmail(sessionUser?.email) || sessionUser?.full_name || 'Manager';
  const firstName = managerName.split(' ')[0];

  // Worked out only once the session user is loaded (always client-side), so the server render
  // and the first client render match and the time-based text can't cause a hydration mismatch.
  const greeting = (() => {
    if (!sessionUser) return 'Welcome back';
    const hour = Number(new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', hour12: false }));
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const todayLabel = sessionUser
    ? new Date().toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short' })
    : '';

  // Who in the company is on approved leave today (the company leave calendar, names only).
  useEffect(() => {
    if (!managerId) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    axios.get(`${backendBaseUrl}/api/v1/calendar/leave`, { params: { requesterId: managerId, from: today, to: today } })
      .then((r) => setOutToday(r.data?.data || []))
      .catch(() => setOutToday([]));
  }, [backendBaseUrl, managerId]);

  useEffect(() => {
    if (!managerId) {
      return;
    }

    let ignore = false;

    const loadData = async () => {
      try {
        const [leaveRes, budgetRes, projectsRes, staffRes, histLeaveRes, histBudgetRes, workloadRes] = await Promise.all([
          axios.get(`${backendBaseUrl}/api/v1/manager/${managerId}/leave-pending`).catch(() => ({ data: { data: [] } })),
          axios.get(`${backendBaseUrl}/api/v1/projects/budget-requests?reviewerId=${managerId}`).catch(() => ({ data: { data: [] } })),
          axios.get(`${backendBaseUrl}/api/v1/projects`).catch(() => ({ data: { data: [] } })),
          axios.get(`${backendBaseUrl}/api/v1/users`).catch(() => ({ data: { data: [] } })),
          axios.get(`${backendBaseUrl}/api/v1/manager/${managerId}/leave-all`).catch(() => ({ data: { data: [] } })),
          axios.get(`${backendBaseUrl}/api/v1/projects/budget-requests/history`).catch(() => ({ data: { data: [] } })),
          axios.get(`${backendBaseUrl}/api/v1/staff/workload-summary`).catch(() => ({ data: { data: [] } })),
        ]);

        if (!ignore) {
          setPendingLeave(leaveRes.data.data || []);
          setPendingBudget(budgetRes.data.data || []);
          setProjects(projectsRes.data.data || []);
          setStaffList((staffRes.data.data || []).filter((u) => u.user_role?.toLowerCase() === 'staff'));
          setHistoryLeave((histLeaveRes.data.data || []).filter((l) => l.status !== 'PENDING'));
          setHistoryBudget(histBudgetRes.data.data || []);
          const wMap = {};
          (workloadRes.data.data || []).forEach((w) => { wMap[w.user_id] = Number(w.total_hours || 0); });
          setWorkloadMap(wMap);
          setLoaded(true);
        }
      } catch {
        if (!ignore) {
          setPendingLeave([]);
          setPendingBudget([]);
          setProjects([]);
          setStaffList([]);
          setHistoryLeave([]);
          setHistoryBudget([]);
          setLoaded(true);
        }
      }
    };

    void loadData();

    return () => {
      ignore = true;
    };
  }, [backendBaseUrl, managerId]);

  const reloadApprovals = async () => {
    try {
      const [leaveRes, budgetRes] = await Promise.all([
        axios.get(`${backendBaseUrl}/api/v1/manager/${managerId}/leave-pending`),
        axios.get(`${backendBaseUrl}/api/v1/projects/budget-requests?reviewerId=${managerId}`),
      ]);
      setPendingLeave(leaveRes.data.data || []);
      setPendingBudget(budgetRes.data.data || []);
    } catch {
      setPendingLeave([]);
      setPendingBudget([]);
    }
  };

  const activeProjects = projects.filter((p) => !['INACTIVE', 'DEPLOYED'].includes((p.status || 'ACTIVE').toUpperCase()));

  const handleAllocation = async () => {
    if (!managerId) {
      setAllocMessage('Please sign in again as a manager.');
      return;
    }
    const userRole = String(sessionUser?.user_role || '').toLowerCase();
    if (userRole !== 'manager' && userRole !== 'hr') {
      setAllocMessage('Only Manager users can submit allocations from this page.');
      return;
    }
    if (!allocation.userId || !allocation.projectCode || !allocation.hours) {
      setAllocMessage('Please fill in all fields.');
      return;
    }
    setAllocSubmitting(true);
    setAllocMessage('');
    try {
      await axios.post(`${backendBaseUrl}/api/v1/allocations`, {
        managerId,
        userId: allocation.userId,
        projectCode: allocation.projectCode,
        hoursPerWeek: parseFloat(allocation.hours),
      });
      setAllocMessage('Allocation request submitted. Waiting for Account Manager approval.');
      setAllocation({ userId: '', projectCode: '', hours: '' });
    } catch (err) {
      setAllocMessage(err.response?.data?.error || err.response?.data?.detail || 'Allocation failed.');
    } finally {
      setAllocSubmitting(false);
    }
  };

  const showToast = (message, onUndo) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, onUndo });
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  };

  // Returns true/false rather than swallowing the error, so a failed review can't be mistaken
  // for a successful one by whatever called it.
  const submitReview = async (id, action) => {
    try {
      if (activeTab === 'LEAVE') {
        await axios.patch(`${backendBaseUrl}/api/v1/leave/review`, {
          leaveId: id,
          reviewerId: managerId,
          action,
          reviewerRemarks: action === 'APPROVED' ? 'Approved via Manager Dashboard.' : 'Rejected via Manager Dashboard.',
        });
      } else {
        const budgetAction = action === 'APPROVED' ? 'MANAGER_APPROVED' : action;
        await axios.patch(`${backendBaseUrl}/api/v1/projects/budget-request/review`, {
          requestId: id,
          reviewerId: managerId,
          action: budgetAction,
        });
      }
      await reloadApprovals();
      return { ok: true };
    } catch (error) {
      console.error('Approval action failed:', error);
      return { ok: false, message: error.response?.data?.error || 'Something went wrong — please try again.' };
    }
  };

  const handleReview = async (item, action) => {
    const id = activeTab === 'LEAVE' ? item.leave_id : item.request_id;
    const name = activeTab === 'LEAVE' ? item.full_name : (item.project_name || item.project_code);
    const confirmed = await confirm({
      title: action === 'APPROVED' ? 'Approve request' : 'Reject request',
      message: `${action === 'APPROVED' ? 'Approve' : 'Reject'} this ${activeTab === 'LEAVE' ? 'leave' : 'budget'} request for ${name}?`,
      confirmLabel: action === 'APPROVED' ? 'Approve' : 'Reject',
      danger: action !== 'APPROVED',
    });
    if (!confirmed) return;

    submitReview(id, action).then((result) => {
      if (!result.ok) { showToast(result.message); return; }
      const kind = activeTab === 'LEAVE' ? 'leave' : 'budget';
      showToast(
        `${action === 'APPROVED' ? 'Approved' : 'Rejected'} ${kind} request for ${name}.`,
        () => {
          const undo = kind === 'leave'
            ? axios.patch(`${backendBaseUrl}/api/v1/leave/undo-review`, { leaveId: id, reviewerId: managerId })
            : axios.patch(`${backendBaseUrl}/api/v1/projects/budget-request/undo-review`, { requestId: id, reviewerId: managerId });
          return undo
            .then(() => reloadApprovals())
            .then(() => showToast(`Undone. The ${kind} request for ${name} is pending again.`))
            .catch((err) => showToast(err.response?.data?.error || 'Could not undo. Use Approvals > History to change the decision.'));
        }
      );
    });
  };

  const goToApprovals = (tab) => {
    setActiveTab(tab);
    approvalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openCard = (tab) => {
    setSelectedCard(tab);
    goToApprovals(tab);
  };

  const stats = [
    { key: 'PROJECTS', label: 'Active projects', value: activeProjects.length, icon: 'projects', tint: 'bg-[#E8EEFF] text-[#16307a]' },
    { key: 'LEAVE', label: 'Leave to review', value: pendingLeave.length, icon: 'leave', tint: 'bg-yellow-100 text-yellow-700' },
    { key: 'BUDGET', label: 'Budget to review', value: pendingBudget.length, icon: 'budget', tint: 'bg-pink-100 text-pink-800' },
  ];

  const totalPending = pendingLeave.length + pendingBudget.length;

  // Staff with the most hours allocated first, so anyone near or over capacity is at the top.
  const workloadRows = staffList
    .map((s) => ({ id: s.user_id, name: s.full_name || s.email, hours: workloadMap[s.user_id] || 0 }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);

  const pendingRows = activeTab === 'LEAVE' ? pendingLeave : pendingBudget;
  const historyRows = activeHistoryType === 'LEAVE' ? historyLeave : historyBudget;

  return (
    <div className="px-6 pb-8 pt-2 sm:px-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">

        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-col gap-8">

          {/* Greeting */}
          <section className="relative overflow-hidden rounded-3xl px-8 py-9 text-white sm:px-10" style={{ background: '#16307a' }}>
            <svg className="pointer-events-none absolute -right-8 -top-12 hidden sm:block" width="320" height="320" viewBox="0 0 320 320" fill="none" aria-hidden="true">
              <circle cx="160" cy="160" r="130" stroke="#2f56b8" strokeWidth="2" />
              <circle cx="160" cy="160" r="96" stroke="#2f56b8" strokeWidth="2" strokeDasharray="4 8" />
              <circle cx="160" cy="160" r="62" fill="#1a3a8f" stroke="#E8EEFF" strokeWidth="3" />
              <path d="M134 162l18 18 36-38" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="268" cy="80" r="13" fill="#f0c9dc" />
              <circle cx="52" cy="226" r="8" fill="#E8EEFF" />
            </svg>
            <div className="relative max-w-lg">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#aab8e0]">{todayLabel || 'Manager Dashboard'}</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{greeting}, {firstName}</h1>
              <p className="mt-3 text-sm text-[#d6def5]">
                {!loaded ? 'Checking for requests…'
                  : totalPending === 0 ? 'You’re all caught up. Nothing is waiting for your review.'
                    : `${totalPending} ${totalPending === 1 ? 'request from your team is' : 'requests from your team are'} waiting for review.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => goToApprovals(pendingLeave.length === 0 && pendingBudget.length > 0 ? 'BUDGET' : 'LEAVE')}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-[#16307a] transition hover:bg-[#E8EEFF]">
                  Review requests
                </button>
                <button type="button" onClick={() => allocateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="rounded-2xl border border-[#4a6bc4] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                  Allocate staff
                </button>
              </div>
            </div>
          </section>

          {/* Stat cards: each one opens its list in the panel below */}
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((item) => (
              <button key={item.label} type="button" onClick={() => openCard(item.key)} aria-pressed={selectedCard === item.key}
                className={`${CARD} flex items-center gap-4 px-5 py-5 text-left transition hover:shadow-md ${selectedCard === item.key ? 'ring-2 ring-[#1540A8]' : ''}`}>
                <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${item.tint}`}>
                  <StatIcon name={item.icon} />
                </span>
                <span className="flex flex-col">
                  <span className="text-2xl font-extrabold leading-tight text-slate-900 tabular-nums">{loaded ? item.value : '—'}</span>
                  <span className="text-xs text-slate-500">{item.label}</span>
                </span>
              </button>
            ))}
          </div>

          <ComingUp user={sessionUser} />

          {/* Waiting for you */}
          <section ref={approvalsRef} className="flex scroll-mt-24 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold text-slate-900">{activeTab === 'HISTORY' ? 'Recent decisions' : activeTab === 'PROJECTS' ? 'Active projects' : 'Waiting for you'}</h2>
              <div className="flex gap-1 rounded-full bg-white p-1 shadow-sm">
                {[
                  { id: 'PROJECTS', label: `Projects · ${activeProjects.length}` },
                  { id: 'LEAVE', label: `Leave · ${pendingLeave.length}` },
                  { id: 'BUDGET', label: `Budget · ${pendingBudget.length}` },
                  { id: 'HISTORY', label: 'History' },
                ].map((t) => (
                  <button key={t.id} type="button" onClick={() => { setActiveTab(t.id); setSelectedCard(t.id === 'HISTORY' ? null : t.id); }}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${activeTab === t.id ? 'bg-[#1540A8] text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${CARD} px-6 py-2`}>
              {activeTab === 'HISTORY' && (
                <div className="flex gap-2 pt-4 pb-2">
                  {[{ id: 'LEAVE', label: 'Leave' }, { id: 'BUDGET', label: 'Budget' }].map((t) => (
                    <button key={t.id} type="button" onClick={() => setActiveHistoryType(t.id)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold ${activeHistoryType === t.id ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'PROJECTS' ? (
                !loaded ? (
                  <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
                ) : activeProjects.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No active projects.</p>
                ) : (
                  <>
                    <ul className="divide-y divide-slate-100">
                      {activeProjects.slice(0, PROJECT_PREVIEW_COUNT).map((p) => {
                        const budget = Number(p.budget_hours || 0);
                        const pct = budget > 0 ? Math.round((Number(p.total_tracked_hours || 0) / budget) * 100) : null;
                        const color = pct === null ? '#cbd5e1' : pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#1540A8';
                        const end = toYMD(p.end_date);
                        return (
                          <li key={p.project_code} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(120px,200px)]">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8EEFF] text-[#16307a]">
                              <StatIcon name="projects" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-slate-900" title={p.project_name}>{p.project_name || p.project_code}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {p.project_code}{end ? ` · Ends ${dayMonth(end)}` : ''}
                              </span>
                            </span>
                            <span className="col-span-2 flex items-center gap-3 sm:col-span-1">
                              <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF2FB]" aria-hidden="true">
                                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct || 0)}%`, background: color }} />
                              </span>
                              <span className="w-24 text-right text-xs font-semibold tabular-nums text-slate-600">
                                {pct === null ? 'No budget' : `${pct}% of ${budget} h`}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex items-center justify-between border-t border-slate-100 py-3">
                      <span className="text-xs text-slate-400">
                        {activeProjects.length > PROJECT_PREVIEW_COUNT ? `Showing ${PROJECT_PREVIEW_COUNT} of ${activeProjects.length}` : 'Hours used against budget'}
                      </span>
                      <ArrowLink href="/project-codes">Open Progress</ArrowLink>
                    </div>
                  </>
                )
              ) : activeTab === 'HISTORY' ? (
                historyRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No decisions yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {historyRows.map((item) => {
                      const isLeave = activeHistoryType === 'LEAVE';
                      const name = isLeave ? item.full_name : (item.project_name || item.project_code);
                      const detail = isLeave
                        ? `${LEAVE_LABELS[String(item.category)] || item.category} · ${leaveRange(item)}`
                        : `${item.project_code} · ${item.requested_hours} hrs · Requested by ${item.requester_name || item.requester_email || 'Unknown'}`;
                      const statusLabel = item.status === 'MANAGER_APPROVED' ? 'With account manager' : String(item.status || '').charAt(0) + String(item.status || '').slice(1).toLowerCase();
                      return (
                        <li key={isLeave ? item.leave_id : item.request_id} className="flex flex-wrap items-center gap-4 py-4">
                          <Avatar name={name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-900">{name}</span>
                            <span className="block truncate text-xs text-slate-500">{detail}</span>
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>{statusLabel}</span>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : pendingRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {loaded ? `No ${activeTab === 'LEAVE' ? 'leave' : 'budget'} requests waiting for you.` : 'Loading…'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pendingRows.map((item) => {
                    const isLeave = activeTab === 'LEAVE';
                    const name = isLeave ? item.full_name : (item.project_name || item.project_code);
                    const detail = isLeave
                      ? `${LEAVE_LABELS[String(item.category)] || item.category} · ${leaveRange(item)}`
                      : `${item.project_code} · ${item.requested_hours} hrs requested${item.requester_name ? ` · by ${item.requester_name}` : ''}`;
                    return (
                      <li key={isLeave ? item.leave_id : item.request_id} className="flex flex-wrap items-center gap-4 py-4">
                        <Avatar name={isLeave ? name : item.requester_name || name} />
                        <span className="min-w-0 flex-1 basis-48">
                          <span className="block truncate text-sm font-bold text-slate-900">{name}</span>
                          <span className="block truncate text-xs text-slate-500">{detail}</span>
                        </span>
                        <span className="flex gap-2">
                          <button type="button" onClick={() => handleReview(item, 'REJECTED')}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600">
                            Reject
                          </button>
                          <button type="button" onClick={() => handleReview(item, 'APPROVED')}
                            className="rounded-xl bg-[#1540A8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#12378F]">
                            Approve
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ── Side column ── */}
        <aside className="flex min-w-0 flex-col gap-7 rounded-3xl bg-white p-6 xl:self-start">
          {/* Team workload */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-900">Team workload</h2>
              <ArrowLink href="/team">Team</ArrowLink>
            </div>
            {!loaded ? (
              <p className="py-4 text-sm text-slate-400">Loading…</p>
            ) : workloadRows.length === 0 ? (
              <p className="py-4 text-sm text-slate-400">No staff to show yet.</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {workloadRows.map((w) => {
                  const over = w.hours > DEFAULT_WEEKLY_CAPACITY;
                  const color = over ? '#dc2626' : w.hours >= DEFAULT_WEEKLY_CAPACITY * 0.8 ? '#d97706' : '#1540A8';
                  return (
                    <li key={w.id} className="flex flex-col gap-1.5">
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-slate-700">{w.name}</span>
                        <span className={`flex-shrink-0 font-bold tabular-nums ${over ? 'text-red-700' : 'text-slate-900'}`}>{w.hours} / {DEFAULT_WEEKLY_CAPACITY} h</span>
                      </span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-[#EEF2FB]" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (w.hours / DEFAULT_WEEKLY_CAPACITY) * 100)}%`, background: color }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Quick allocation */}
          <section id="allocate" ref={allocateRef} className="scroll-mt-24">
            <h2 className="mb-4 text-base font-extrabold text-slate-900">Quick allocation</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="alloc-staff" className="mb-1.5 block text-sm font-semibold text-slate-700">Staff member</label>
                <select id="alloc-staff"
                  value={allocation.userId}
                  onChange={(e) => setAllocation({ ...allocation, userId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-[#F7F9FD] px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select staff member</option>
                  {staffList.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name} ({workloadMap[s.user_id] || 0}/{DEFAULT_WEEKLY_CAPACITY} hrs allocated)
                    </option>
                  ))}
                </select>
                {allocation.userId && (
                  <p className="mt-1.5 text-xs text-slate-400">
                    Currently allocated: {workloadMap[allocation.userId] || 0} / {DEFAULT_WEEKLY_CAPACITY} hrs per week
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="alloc-project" className="mb-1.5 block text-sm font-semibold text-slate-700">Project code</label>
                <select id="alloc-project"
                  value={allocation.projectCode}
                  onChange={(e) => setAllocation({ ...allocation, projectCode: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-[#F7F9FD] px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select project code</option>
                  {activeProjects.map((p) => (
                    <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="alloc-hours" className="mb-1.5 block text-sm font-semibold text-slate-700">Hours per week</label>
                <input id="alloc-hours"
                  type="number"
                  min="1"
                  value={allocation.hours}
                  onChange={(e) => setAllocation({ ...allocation, hours: e.target.value })}
                  placeholder="e.g. 8"
                  className="w-full rounded-xl border border-slate-200 bg-[#F7F9FD] px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {allocMessage && <p className={`text-xs ${allocMessage.includes('submitted') ? 'text-green-600' : 'text-red-500'}`}>{allocMessage}</p>}
              <button type="button"
                onClick={handleAllocation}
                disabled={allocSubmitting}
                className="rounded-2xl bg-[#1540A8] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#12378F] disabled:opacity-60"
              >
                {allocSubmitting ? 'Submitting…' : 'Allocate'}
              </button>
            </div>
          </section>

          {/* Out today */}
          <section className="relative overflow-hidden rounded-3xl p-6 text-white" style={{ background: '#0f2463' }}>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#aab8e0]">Out today</p>
            {outToday === null ? (
              <p className="mt-3 text-sm text-[#d6def5]">Loading…</p>
            ) : outToday.length === 0 ? (
              <p className="mt-3 text-base font-bold">Everyone&apos;s in today.</p>
            ) : (
              <>
                <div className="mt-3 flex items-center">
                  {outToday.slice(0, 4).map((p, i) => (
                    <span key={p.leave_id} className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                      style={{ marginLeft: i ? -8 : 0, boxShadow: '0 0 0 3px #0f2463', background: OUT_COLORS[i % OUT_COLORS.length], color: i % 2 ? '#0f2463' : '#ffffff' }}
                      title={p.full_name}>
                      {initialsOf(p.full_name)}
                    </span>
                  ))}
                  <span className="ml-3 text-base font-bold">{outToday.length} {outToday.length === 1 ? 'person' : 'people'}</span>
                </div>
                <p className="mt-2 truncate text-xs text-[#d6def5]">{outToday.map((p) => p.full_name).join(', ')}</p>
              </>
            )}
            <Link href="/calendar" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[#E8EEFF]">
              View calendar
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </section>
        </aside>
      </div>

      {confirmDialog}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-4 rounded-full border border-slate-950 bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button type="button" onClick={toast.onUndo} className="font-bold text-blue-300 hover:text-blue-200">Undo</button>
          )}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="text-slate-400 hover:text-white">&times;</button>
        </div>
      )}
    </div>
  );
}
