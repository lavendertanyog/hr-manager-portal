"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

function deriveNameFromEmail(email) {
  return String(email || '')
    .split('@')[0]
    .split('.')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const DEFAULT_WEEKLY_CAPACITY = 40;

export default function ManagerDashboard() {
  const router = useRouter();
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

  const approvalsRef = useRef(null);
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

  useEffect(() => {
    if (!managerId) {
      return;
    }

    let ignore = false;

    const loadData = async () => {
      try {
        const [leaveRes, budgetRes, projectsRes, staffRes, histLeaveRes, histBudgetRes, workloadRes] = await Promise.all([
          axios.get(`${backendBaseUrl}/api/v1/manager/${managerId}/leave-pending`).catch(() => ({ data: { data: [] } })),
          axios.get(`${backendBaseUrl}/api/v1/projects/budget-requests`).catch(() => ({ data: { data: [] } })),
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
        }
      } catch {
        if (!ignore) {
          setPendingLeave([]);
          setPendingBudget([]);
          setProjects([]);
          setStaffList([]);
          setHistoryLeave([]);
          setHistoryBudget([]);
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
        axios.get(`${backendBaseUrl}/api/v1/projects/budget-requests`),
      ]);
      setPendingLeave(leaveRes.data.data || []);
      setPendingBudget(budgetRes.data.data || []);
    } catch {
      setPendingLeave([]);
      setPendingBudget([]);
    }
  };

  const activeProjects = projects.filter((p) => (p.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');

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
    } catch (error) {
      console.error('Approval action failed:', error);
    }
  };

  const handleReview = (item, action) => {
    const id = activeTab === 'LEAVE' ? item.leave_id : item.request_id;
    const name = activeTab === 'LEAVE' ? item.full_name : (item.project_name || item.project_code);
    const verb = action === 'APPROVED' ? 'approve' : 'reject';
    const confirmed = window.confirm(`${action === 'APPROVED' ? 'Approve' : 'Reject'} this ${activeTab === 'LEAVE' ? 'leave' : 'budget'} request for ${name}?`);
    if (!confirmed) return;

    submitReview(id, action).then(() => {
      const opposite = action === 'APPROVED' ? 'REJECTED' : 'APPROVED';
      showToast(
        `${action === 'APPROVED' ? 'Approved' : 'Rejected'} ${activeTab === 'LEAVE' ? 'leave' : 'budget'} request for ${name}.`,
        () => { submitReview(id, opposite).then(() => setToast(null)); }
      );
    });
  };

  const stats = [
    { label: 'Total Active Projects', value: projects.length, onClick: () => router.push('/project-codes') },
    { label: 'Pending Leave Requests', value: pendingLeave.length, onClick: () => { setActiveTab('LEAVE'); approvalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    { label: 'Pending Budget Requests', value: pendingBudget.length, onClick: () => { setActiveTab('BUDGET'); approvalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
  ];

  return (
    <div className="p-8">
      <div className="mb-10">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Manager Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Welcome back, {managerName}</h1>
        <p className="mt-2 text-sm text-slate-500">Monitor approvals, project codes, and team workload in one place.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3 mb-10">
        {stats.map((item) => (
          <button key={item.label} type="button" onClick={item.onClick}
            className="text-left rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-slate-300 cursor-pointer">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{item.label}</p>
            <p className="mt-4 text-4xl font-semibold text-slate-950">{item.value}</p>
          </button>
        ))}
      </div>

      <div ref={approvalsRef} className="grid gap-8 xl:grid-cols-[2fr_1fr] mb-10 scroll-mt-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Pending Approvals</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Review inbox</h2>
          </div>

          <div className="flex flex-wrap gap-3 mb-5">
            <button
              onClick={() => setActiveTab('LEAVE')}
              className={`rounded-full px-5 py-3 text-sm font-semibold ${activeTab === 'LEAVE' ? 'bg-[#1540A8] text-white shadow-[0_12px_24px_rgba(21,64,168,0.24)]' : 'bg-[#E8EEFF] text-[#163EAF]'}`}
            >
              Leave Requests {pendingLeave.length > 0 && <span className="ml-1.5 bg-red-500 text-white rounded-full text-xs px-1.5 py-0.5">{pendingLeave.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('BUDGET')}
              className={`rounded-full px-5 py-3 text-sm font-semibold ${activeTab === 'BUDGET' ? 'bg-[#1540A8] text-white shadow-[0_12px_24px_rgba(21,64,168,0.24)]' : 'bg-[#E8EEFF] text-[#163EAF]'}`}
            >
              Budget Requests {pendingBudget.length > 0 && <span className="ml-1.5 bg-red-500 text-white rounded-full text-xs px-1.5 py-0.5">{pendingBudget.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`rounded-full px-5 py-3 text-sm font-semibold ${activeTab === 'HISTORY' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              History
            </button>
          </div>

          {activeTab === 'HISTORY' ? (
            <div>
              <div className="flex gap-3 mb-4">
                <button onClick={() => setActiveHistoryType('LEAVE')} className={`rounded-full px-4 py-2 text-xs font-semibold ${activeHistoryType === 'LEAVE' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>Leave</button>
                <button onClick={() => setActiveHistoryType('BUDGET')} className={`rounded-full px-4 py-2 text-xs font-semibold ${activeHistoryType === 'BUDGET' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>Budget</button>
              </div>
              {(activeHistoryType === 'LEAVE' ? historyLeave : historyBudget).length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-500">No history found.</div>
              ) : (
                <div className="space-y-4">
                  {(activeHistoryType === 'LEAVE' ? historyLeave : historyBudget).map((item) => {
                    const isLeave = activeHistoryType === 'LEAVE';
                    const key = isLeave ? item.leave_id : item.request_id;
                    const title = isLeave ? item.full_name : item.project_name;
                    const sub = isLeave
                      ? `${item.category} • ${String(item.start_date || '').slice(0, 10)} → ${String(item.end_date || '').slice(0, 10)}`
                      : `${item.project_code} • ${item.requested_hours} hrs • Requested by ${item.requester_name || item.requester_email || 'Unknown'}`;
                    const statusColor = item.status === 'APPROVED' ? 'text-green-600 bg-green-50' : item.status === 'REJECTED' ? 'text-red-600 bg-red-50' : item.status === 'MANAGER_APPROVED' ? 'text-blue-600 bg-blue-50' : 'text-yellow-600 bg-yellow-50';
                    const statusLabel = item.status === 'MANAGER_APPROVED' ? 'Pending AM Approval' : item.status;
                    return (
                      <div key={key} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">{isLeave ? 'Leave' : 'Budget'}</p>
                            <h3 className="mt-2 text-xl font-semibold text-slate-950">{title}</h3>
                            <p className="mt-2 text-sm text-slate-500">{sub}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (activeTab === 'LEAVE' ? pendingLeave : pendingBudget).length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
              No pending approvals found.
            </div>
          ) : (
            <div className="space-y-4">
              {(activeTab === 'LEAVE' ? pendingLeave : pendingBudget).map((item) => {
                const key = activeTab === 'LEAVE' ? item.leave_id : item.request_id;
                const title = activeTab === 'LEAVE' ? item.full_name : item.project_name;
                const subtitle = activeTab === 'LEAVE'
                  ? `${item.category} • START DATE: ${String(item.start_date || '').slice(0, 10)} - END DATE: ${String(item.end_date || '').slice(0, 10)}`
                  : `${item.project_code} • ${item.requested_hours} hrs requested`;

                return (
                  <div key={key} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">{activeTab === 'LEAVE' ? 'Leave request' : 'Budget request'}</p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-950">{title}</h3>
                        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
                        {activeTab === 'BUDGET' && item.requester_name && (
                          <p className="mt-1 text-xs text-slate-400">Requested by: {item.requester_name}</p>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleReview(item, 'APPROVED')}
                          className="rounded-2xl bg-[#1540A8] px-4 py-2 text-sm font-semibold text-white"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReview(item, 'REJECTED')}
                          className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-400 hover:text-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-950 mb-4">Quick Allocation</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Staff member</label>
              <select
                value={allocation.userId}
                onChange={(e) => setAllocation({ ...allocation, userId: e.target.value })}
                className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
              >
                <option value="">Select staff member</option>
                {staffList.map((s) => {
                  const used = workloadMap[s.user_id] || 0;
                  return (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name} ({used}/{DEFAULT_WEEKLY_CAPACITY} hrs allocated)
                    </option>
                  );
                })}
              </select>
              {allocation.userId && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Currently allocated: {workloadMap[allocation.userId] || 0} / {DEFAULT_WEEKLY_CAPACITY} hrs per week
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Project code</label>
              <select
                value={allocation.projectCode}
                onChange={(e) => setAllocation({ ...allocation, projectCode: e.target.value })}
                className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
              >
                <option value="">Select project code</option>
                {activeProjects.map((p) => (
                  <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Hours per week</label>
              <input
                type="number"
                min="1"
                value={allocation.hours}
                onChange={(e) => setAllocation({ ...allocation, hours: e.target.value })}
                placeholder="e.g. 8"
                className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
              />
            </div>
            {allocMessage && <p className={`text-xs ${allocMessage.includes('success') ? 'text-green-600' : 'text-red-500'}`}>{allocMessage}</p>}
            <button
              onClick={handleAllocation}
              disabled={allocSubmitting}
              className="w-full rounded-3xl bg-[#1540A8] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {allocSubmitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-medium text-white shadow-2xl">
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button onClick={toast.onUndo} className="font-bold text-blue-300 hover:text-blue-200">Undo</button>
          )}
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">&times;</button>
        </div>
      )}
    </div>
  );
}
