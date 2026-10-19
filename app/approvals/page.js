"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { formatLeaveDate, openMcFile } from '../leaveFormat';
import { useConfirm } from '../ConfirmDialog';
import { authHeaders } from '../authSession';
import { useT } from '../i18n/LanguageProvider';

// One line summing up a claim's charges and tax, e.g. "Service charge 5% 40.66 · SST 6% 48.79".
const CHARGE_KIND_LABELS = { SERVICE_CHARGE: 'Service charge', TAX: 'Tax', ROUNDING: 'Rounding', DISCOUNT: 'Discount', OTHER: 'Other' };
const chargesSummary = (c) => {
  const lines = (c.charges || []).map((ch) => `${ch.label || CHARGE_KIND_LABELS[ch.kind] || ch.kind} ${ch.kind === 'DISCOUNT' ? '−' : ''}${Number(ch.amount).toFixed(2)}`);
  if (lines.length === 0) return '';
  return lines.join(' · ') + (c.tax_inclusive ? ' (prices include tax)' : '');
};

// Claims in another currency also carry the amount in SGD at the purchase date's rate.
const fxNote = (c) => (c.currency !== 'SGD' && c.amount_base != null ? `≈ SGD ${Number(c.amount_base).toFixed(2)}` : '');
const fxDetail = (c) => {
  if (c.currency === 'SGD') return '';
  if (c.fx_rate == null) return `No exchange rate found for ${c.currency} on the purchase date.`;
  return `1 ${c.currency} = ${Number(c.fx_rate)} SGD (${c.fx_source || 'rate'} for ${c.fx_rate_date})`;
};

// Amber note on a claim that looks like the same receipt as another claim (same date, amount,
// currency and merchant), from the server's possible_duplicates.
const DUP_STATUS = { PENDING: 'waiting for manager', MANAGER_APPROVED: 'waiting for HR', APPROVED: 'approved', PAID: 'paid' };
function DuplicateFlag({ claim }) {
  const { t } = useT();
  const dups = claim.possible_duplicates || [];
  if (dups.length === 0) return null;
  const who = dups.map((d) => `${d.same_person ? 'their own earlier claim' : `${d.claimant_name || 'another employee'}'s claim`} (${DUP_STATUS[d.status] || d.status.toLowerCase()})`);
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <p><span className="font-semibold">{t("Possible duplicate:")}</span>{" "}{t("same date, amount and merchant as {v}.", { v: who.join(', ') })}</p>
      {claim.duplicate_acknowledged && <p className="mt-0.5">{t("The claimant was warned and submitted it anyway.")}</p>}
    </div>
  );
}


const money = (currency, amount) => `${currency} ${Number(amount || 0).toFixed(2)}`;

function formatDateOnly(d) {
  if (!d) return '—';
  return formatLeaveDate(String(d).slice(0, 10));
}

function formatDateTime(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(String(start).slice(0, 10));
  const e = new Date(String(end).slice(0, 10));
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : null;
}

function statusBadge(status) {
  const s = String(status || '').toUpperCase();
  const colors = {
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    PENDING:  'bg-yellow-100 text-yellow-700',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[s] || 'bg-slate-100 text-slate-600'}`}>{s}</span>;
}

const TAB_IDS = ['LEAVE', 'BUDGET', 'CLAIMS', 'HISTORY'];

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('LEAVE');
  // ?tab=LEAVE|BUDGET|CLAIMS|HISTORY opens that tab (used by the top bar's notifications and
  // search). Watched, not just read once, so it also switches tab while already on this page.
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (TAB_IDS.includes(tabParam)) setActiveTab(tabParam);
  }, [tabParam]);
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [budgetRecords, setBudgetRecords] = useState([]);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [budgetHistoryRecords, setBudgetHistoryRecords] = useState([]);
  const [claimRecords, setClaimRecords] = useState([]);
  const [claimHistoryRecords, setClaimHistoryRecords] = useState([]);
  const [claimCategories, setClaimCategories] = useState([]);
  const [managerId, setManagerId] = useState('');
  const [reviewModal, setReviewModal] = useState(null); // { item, type, isHistory }
  const [reviewAction, setReviewAction] = useState('APPROVED');
  const [reviewRemark, setReviewRemark] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [balanceMap, setBalanceMap] = useState({}); // user_id -> { remainingDays, totalDays }
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirm, confirmDialog] = useConfirm();
  const toastTimerRef = useRef(null);

  // History filters
  const [historyCategory, setHistoryCategory] = useState('ALL'); // ALL | LEAVE | BUDGET
  const [historyStatus, setHistoryStatus] = useState('ALL'); // ALL | APPROVED | REJECTED
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setManagerId(u.user_id);
    } catch {}
  }, []);

  const loadPending = useCallback(async () => {
    if (!managerId) return;
    try {
      const [leaveRes, budgetRes, claimRes] = await Promise.all([
        axios.get(`${backendBaseUrl}/api/v1/manager/${managerId}/leave-pending`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/projects/budget-requests?reviewerId=${managerId}`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/claims/manager-pending`, { headers: authHeaders() }).catch(() => ({ data: { data: [] } })),
      ]);
      const freshLeave = leaveRes.data.data || [];
      const freshBudget = budgetRes.data.data || [];
      const freshClaims = claimRes.data.data || [];
      setLeaveRecords(freshLeave);
      setBudgetRecords(freshBudget);
      setClaimRecords(freshClaims);
      // Prune any checkbox selection that no longer matches a still-pending item — otherwise a
      // stale id (e.g. one just approved individually) lingers in selectedIds and poisons the
      // next Bulk Approve, which aborts the whole batch on that item's 404.
      const stillPendingIds = new Set([
        ...freshLeave.map((item) => item.leave_id),
        ...freshBudget.map((item) => item.request_id),
        ...freshClaims.map((item) => item.claim_id),
      ]);
      setSelectedIds((prev) => prev.filter((id) => stillPendingIds.has(id)));
    } catch {
      setLeaveRecords([]); setBudgetRecords([]); setClaimRecords([]);
    }
  }, [backendBaseUrl, managerId]);

  const loadHistory = useCallback(async () => {
    if (!managerId) return;
    try {
      const [leaveRes, budgetHistRes, claimHistRes] = await Promise.all([
        axios.get(`${backendBaseUrl}/api/v1/manager/${managerId}/leave-all`),
        axios.get(`${backendBaseUrl}/api/v1/projects/budget-requests/history`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/claims/manager-history`, { headers: authHeaders() }).catch(() => ({ data: { data: [] } })),
      ]);
      setHistoryRecords(leaveRes.data.data || []);
      setBudgetHistoryRecords(budgetHistRes.data.data || []);
      setClaimHistoryRecords(claimHistRes.data.data || []);
    } catch {
      setHistoryRecords([]);
    }
  }, [backendBaseUrl, managerId]);

  useEffect(() => {
    if (!managerId) return;
    loadPending();
    if (activeTab === 'HISTORY') loadHistory();
  }, [activeTab, managerId, loadPending, loadHistory]);

  useEffect(() => { setSelectedIds([]); }, [activeTab]);

  useEffect(() => {
    axios.get(`${backendBaseUrl}/api/v1/claims/categories`).then((r) => setClaimCategories(r.data?.data || [])).catch(() => setClaimCategories([]));
  }, [backendBaseUrl]);
  const claimCategoryLabel = (code) => claimCategories.find((c) => c.code === code)?.label || code;

  const viewClaimReceipt = async (claimId) => {
    try {
      const res = await axios.get(`${backendBaseUrl}/api/v1/claims/${claimId}/receipt`, { headers: authHeaders() });
      openMcFile(res.data?.data?.receiptImage);
    } catch (err) {
      showToast(t(err.response?.data?.error || 'Failed to open the receipt.'));
    }
  };

  // Fetch leave balance for each pending applicant so the card/modal can show remaining days context
  useEffect(() => {
    const uniqueUserIds = [...new Set(leaveRecords.map((r) => r.user_id).filter(Boolean))];
    const missing = uniqueUserIds.filter((id) => !(id in balanceMap));
    if (missing.length === 0) return;
    Promise.all(missing.map((id) =>
      axios.get(`${backendBaseUrl}/api/v1/leave/balance/${id}`).then((r) => [id, r.data?.data]).catch(() => [id, null])
    )).then((pairs) => {
      setBalanceMap((prev) => {
        const next = { ...prev };
        pairs.forEach(([id, val]) => { next[id] = val; });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveRecords]);

  const showToast = (message, onUndo) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, onUndo });
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  };

  const openReviewModal = (item, type, isHistory, presetAction) => {
    setReviewModal({ item, type, isHistory });
    setReviewAction(presetAction || (isHistory ? (item.workflow_status || item.manager_status || item.status || 'APPROVED') : 'APPROVED'));
    setReviewRemark(isHistory ? (item.reviewer_remarks || '') : '');
    setReviewError('');
    setFeedback('');
  };

  const runReview = async (type, id, action, remarks) => {
    if (type === 'CLAIMS') {
      await axios.patch(`${backendBaseUrl}/api/v1/claims/${id}/manager-review`, { action, remarks: remarks || undefined }, { headers: authHeaders() });
    } else if (type === 'BUDGET') {
      const budgetAction = action === 'APPROVED' ? 'MANAGER_APPROVED' : action;
      await axios.patch(`${backendBaseUrl}/api/v1/projects/budget-request/review`, {
        requestId: id, reviewerId: managerId, action: budgetAction, reviewerRemarks: remarks || undefined,
      });
    } else {
      await axios.patch(`${backendBaseUrl}/api/v1/leave/review`, {
        leaveId: id, reviewerId: managerId, action, reviewerRemarks: remarks || undefined,
      });
    }
  };

  const runUndo = async (type, id) => {
    if (type === 'BUDGET') {
      await axios.patch(`${backendBaseUrl}/api/v1/projects/budget-request/undo-review`, { requestId: id, reviewerId: managerId });
    } else {
      await axios.patch(`${backendBaseUrl}/api/v1/leave/undo-review`, { leaveId: id, reviewerId: managerId });
    }
  };

  const runReReview = async (id, action, remarks) => {
    await axios.patch(`${backendBaseUrl}/api/v1/leave/re-review`, {
      leaveId: id, reviewerId: managerId, action, reviewerRemarks: remarks,
    });
  };

  const submitModalReview = async () => {
    if (!reviewModal) return;
    // Mandatory reason: rejecting a request, or editing any past decision, requires a written reason
    if ((reviewAction === 'REJECTED' && !reviewModal.isHistory) || reviewModal.isHistory) {
      if (!reviewRemark.trim()) {
        setReviewError(reviewModal.isHistory
          ? 'A reason is required when changing a past decision.'
          : 'Please provide a reason for rejecting this request.');
        return;
      }
    }
    setSubmitting(true);
    setFeedback(''); setReviewError('');
    try {
      const isClaim = reviewModal.type === 'CLAIMS';
      const id = isClaim ? reviewModal.item.claim_id : reviewModal.type === 'BUDGET' ? reviewModal.item.request_id : reviewModal.item.leave_id;
      const name = isClaim ? reviewModal.item.claimant_name : reviewModal.type === 'BUDGET' ? (reviewModal.item.project_name || reviewModal.item.project_code) : reviewModal.item.full_name;
      const kind = isClaim ? 'claim' : reviewModal.type === 'BUDGET' ? 'budget request' : 'leave request';
      if (reviewModal.isHistory) {
        await runReReview(id, reviewAction, reviewRemark.trim());
      } else {
        await runReview(reviewModal.type, id, reviewAction, reviewRemark.trim());
      }
      setFeedback('Done! Staff has been notified.');
      setTimeout(() => {
        setReviewModal(null);
        loadPending();
        if (reviewModal.isHistory) loadHistory();
        if (!reviewModal.isHistory) {
          // Claims have no Undo yet (planned for a later version).
          showToast(
            t("{v} {kind} for {name}.", { v: reviewAction === 'APPROVED' ? 'Approved' : 'Rejected', kind: kind, name: name }),
            isClaim ? undefined : () => {
              runUndo(reviewModal.type, id, reviewAction)
                .then(() => { loadPending(); showToast(t("Undone. The {kind} for {name} is pending again.", { kind: kind, name: name })); })
                .catch((err) => showToast(t(err.response?.data?.error || 'Could not undo. Use History to change the decision.')));
            }
          );
        }
      }, 900);
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Action failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const currentPendingList = activeTab === 'LEAVE' ? leaveRecords : activeTab === 'CLAIMS' ? claimRecords : budgetRecords;
  const currentIdOf = (item) => activeTab === 'LEAVE' ? item.leave_id : activeTab === 'CLAIMS' ? item.claim_id : item.request_id;
  const tabNoun = activeTab === 'LEAVE' ? 'leave request' : activeTab === 'CLAIMS' ? 'claim' : 'budget request';
  const allSelected = currentPendingList.length > 0 && selectedIds.length === currentPendingList.length;

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await confirm({
      title: t("Bulk approve"),
      message: t("Approve {length} selected {tabNoun}(s)?", { length: selectedIds.length, tabNoun: tabNoun }),
      confirmLabel: 'Approve',
    });
    if (!confirmed) return;
    setBulkSubmitting(true);
    // Each item is reviewed independently — one item that's already been processed elsewhere
    // (e.g. approved individually a moment ago) shouldn't abort the rest of the batch, and the
    // list is always refreshed afterward so the UI can't drift out of sync with the backend.
    let succeeded = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        await runReview(activeTab, id, 'APPROVED', undefined);
        succeeded += 1;
      } catch (err) {
        failed += 1;
      }
    }
    await loadPending();
    setBulkSubmitting(false);
    if (failed === 0) {
      showToast(t("Approved {succeeded} request(s).", { succeeded: succeeded }));
    } else if (succeeded === 0) {
      showToast(t("Bulk approve failed — {failed} request(s) could not be processed (likely already handled elsewhere). List refreshed.", { failed: failed }));
    } else {
      showToast(t("Approved {succeeded} request(s); {failed} could not be processed (likely already handled elsewhere). List refreshed.", { succeeded: succeeded, failed: failed }));
    }
  };

  // ─── Unified, filterable history list (leave + budget) ───
  const combinedHistory = useMemo(() => {
    const leave = historyRecords.map((item) => ({
      type: 'LEAVE',
      key: `leave-${item.leave_id}`,
      raw: item,
      title: item.full_name,
      status: item.workflow_status,
      sortDate: item.updated_at || item.created_at,
    }));
    const budget = budgetHistoryRecords.map((item) => ({
      type: 'BUDGET',
      key: `budget-${item.request_id}`,
      raw: item,
      title: item.project_name || item.project_code,
      status: item.manager_status || item.status,
      sortDate: item.reviewed_at || item.created_at,
    }));
    // The manager's own decision on a claim: a claim HR rejected after the manager approved it
    // still counts as approved here.
    const claims = claimHistoryRecords.map((item) => ({
      type: 'CLAIM',
      key: `claim-${item.claim_id}`,
      raw: item,
      title: item.claimant_name,
      status: item.status === 'REJECTED' && !item.hr_reviewed_by ? 'REJECTED' : 'APPROVED',
      sortDate: item.manager_reviewed_at || item.created_at,
    }));
    return [...leave, ...budget, ...claims].sort((a, b) => new Date(b.sortDate || 0) - new Date(a.sortDate || 0));
  }, [historyRecords, budgetHistoryRecords, claimHistoryRecords]);

  const filteredHistory = combinedHistory.filter((row) => {
    if (historyCategory !== 'ALL' && row.type !== historyCategory) return false;
    if (historyStatus !== 'ALL' && String(row.status || '').toUpperCase() !== historyStatus) return false;
    const q = historySearch.trim().toLowerCase();
    if (q) {
      const name = row.type === 'LEAVE' ? row.raw.full_name
        : row.type === 'CLAIM' ? row.raw.claimant_name
        : (row.raw.requester_name || row.raw.requester_email || '');
      if (!String(name || '').toLowerCase().includes(q)) return false;
    }
    if (historyDateFrom && new Date(row.sortDate) < new Date(historyDateFrom)) return false;
    if (historyDateTo) {
      const end = new Date(historyDateTo); end.setHours(23, 59, 59, 999);
      if (new Date(row.sortDate) > end) return false;
    }
    return true;
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="mt-2 text-4xl font-semibold text-slate-950">{t("Approvals")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("Review outstanding leave, budget and claim requests.")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-gray-100 px-4 pt-4">
          {[
            { id: 'LEAVE', label: t("Leave Requests ({length})", { length: leaveRecords.length }) },
            { id: 'BUDGET', label: t("Budget Escalations ({length})", { length: budgetRecords.length }) },
            { id: 'CLAIMS', label: t("Claims ({length})", { length: claimRecords.length }) },
            { id: 'HISTORY', label: t("History") },
          ].map((tabItem) => (
            <button
              key={tabItem.id}
              className={`rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${activeTab === tabItem.id ? 'bg-[#e8edf8] text-[#1a3a8f]' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab(tabItem.id)}
            >
              {t(tabItem.label)}
            </button>
          ))}
        </div>

      {/* ─── LEAVE / BUDGET (pending) ─── */}
      {(activeTab === 'LEAVE' || activeTab === 'BUDGET' || activeTab === 'CLAIMS') && (
        <div className="p-6">
          <div className="flex flex-wrap items-center justify-end gap-4 mb-5">
            {currentPendingList.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={allSelected}
                    onChange={(e) => setSelectedIds(e.target.checked ? currentPendingList.map(currentIdOf) : [])}
                    className="rounded border-slate-300" />{t("Select All")}</label>
                <button type="button" onClick={handleBulkApprove} disabled={selectedIds.length === 0 || bulkSubmitting}
                  className="rounded-2xl bg-[#1540A8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:bg-[#12378F]">
                  {bulkSubmitting ? t("Approving…") : t("Bulk Approve{v}", { v: selectedIds.length > 0 ? ` (${selectedIds.length})` : '' })}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {currentPendingList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">{t("No pending {tabNoun}s.", { tabNoun: tabNoun })}</div>
            ) : currentPendingList.map((item) => {
              const id = currentIdOf(item);
              const isLeave = activeTab === 'LEAVE';
              const isClaim = activeTab === 'CLAIMS';
              const duration = isLeave ? daysBetween(item.start_date, item.end_date) : null;
              const balance = isLeave ? balanceMap[item.user_id] : null;
              return (
                <div key={id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggleSelected(id)}
                        className="mt-1.5 rounded border-slate-300" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{isLeave ? t("Leave Request") : isClaim ? t("Claim") : t("Budget Request")}</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">{isLeave ? item.full_name : isClaim ? item.claimant_name : (item.project_name || item.project_code)}</h3>
                        {isClaim ? (
                          <>
                            <p className="mt-1 text-sm text-slate-500">
                              {item.merchant} • {claimCategoryLabel(item.category)} • {formatDateOnly(item.purchase_date)}
                              <span className="ml-1.5 font-semibold text-[#1540A8]">{money(item.currency, item.total_amount)}</span>
                              {fxNote(item) && <span className="ml-1.5 text-xs text-slate-400" title={fxDetail(item)}>{fxNote(item)}</span>}
                            </p>
                            {item.items?.length > 0 && (
                              <p className="mt-1 text-xs text-slate-500">
                                {item.items.map((it) => `${it.quantity ? `${Number(it.quantity)} × ` : ''}${it.description}`).join(', ')}
                              </p>
                            )}
                            {chargesSummary(item) && <p className="mt-1 text-xs text-slate-500">{chargesSummary(item)}</p>}
                            <DuplicateFlag claim={item} />
                            {item.project_code && <p className="mt-1 text-xs text-slate-500">{t("Project: {project_code}", { project_code: item.project_code })}{item.project_name ? ` · ${item.project_name}` : ''}</p>}
                            {item.notes && <p className="mt-1 text-xs text-slate-500 italic">&quot;{item.notes}&quot;</p>}
                            <button type="button" onClick={() => viewClaimReceipt(item.claim_id)}
                              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline">{t("View receipt")}</button>
                          </>
                        ) : isLeave ? (
                          <>
                            <p className="mt-1 text-sm text-slate-500">
                              {t(item.category)} • {formatDateOnly(item.start_date)} → {formatDateOnly(item.end_date)}
                              {duration && <span className="ml-1.5 font-semibold text-[#1540A8]">{t("({duration} Day", { duration: duration })}{duration !== 1 ? 's' : ''})</span>}
                            </p>
                            {balance && (
                              <p className="mt-1 text-xs text-slate-500">{t("Leave balance:")}{" "}<span className="font-semibold text-slate-700">{t("{remainingDays}/{totalDays} days remaining", { remainingDays: balance.remainingDays, totalDays: balance.totalDays })}</span>
                              </p>
                            )}
                            {item.category === 'SICK' && (
                              item.mc_file_url ? (
                                <button type="button" onClick={() => openMcFile(item.mc_file_url)}
                                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline">{t("View MC Document")}</button>
                              ) : (
                                <p className="mt-1.5 text-xs font-medium text-amber-600">{t("MC not yet uploaded")}</p>
                              )
                            )}
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-slate-500">{t("{project_code} • {requested_hours} hrs requested", { project_code: item.project_code, requested_hours: item.requested_hours })}</p>
                        )}
                        {isLeave && item.is_late_submission && (
                          <span className="mt-1.5 inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-600">{t("Late submission")}</span>
                        )}
                        {!isLeave && !isClaim && item.requester_name && (
                          <p className="mt-1 text-xs text-slate-400">{t("Requested by: {requester_name}", { requester_name: item.requester_name })}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => openReviewModal(item, activeTab, false, 'APPROVED')}
                        className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F]"
                      >{t("Approve")}</button>
                      <button
                        onClick={() => openReviewModal(item, activeTab, false, 'REJECTED')}
                        className="rounded-2xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-red-400 hover:text-red-600"
                      >{t("Reject")}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── HISTORY TAB ─── */}
      {activeTab === 'HISTORY' && (
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{t("Decision History")}</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">{t("All reviewed requests")}</h2>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-slate-100">
            <div className="flex gap-1.5">
              {['ALL', 'LEAVE', 'BUDGET', 'CLAIM'].map((c) => (
                <button key={c} type="button" onClick={() => setHistoryCategory(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    historyCategory === c ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {['ALL', 'APPROVED', 'REJECTED'].map((s) => (
                <button key={s} type="button" onClick={() => setHistoryStatus(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    historyStatus === s ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                placeholder={t("Search staff name…")}
                className="rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-1.5 text-sm text-slate-900 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-slate-400">{t("to")}</span>
            <input type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {filteredHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">{t("No reviewed records match this filter.")}</div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((row) => {
                const item = row.raw;
                const isLeave = row.type === 'LEAVE';
                const isClaim = row.type === 'CLAIM';
                const duration = isLeave ? daysBetween(item.start_date, item.end_date) : null;
                const decidedOn = formatDateTime(isLeave ? item.updated_at : isClaim ? item.manager_reviewed_at : item.reviewed_at);
                const reviewerName = isClaim ? item.manager_reviewer_name : item.reviewer_name;
                const remarks = isClaim ? item.manager_remarks : item.reviewer_remarks;
                return (
                  <div key={row.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                          {isLeave ? t("Leave — {full_name}", { full_name: item.full_name }) : isClaim ? t("Claim — {claimant_name}", { claimant_name: item.claimant_name }) : t("Budget — {project_code}", { project_code: item.project_code })}
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {isLeave
                            ? <>{t(item.category)} • {formatDateOnly(item.start_date)} → {formatDateOnly(item.end_date)}
                                {duration && <span className="ml-1.5 font-semibold text-[#1540A8]">{t("({duration} Day", { duration: duration })}{duration !== 1 ? 's' : ''})</span>}</>
                            : isClaim
                              ? <>{item.merchant} • {formatDateOnly(item.purchase_date)} • {money(item.currency, item.total_amount)}</>
                              : <>{item.project_name || item.project_code}{" "}{t("• {requested_hours} hrs", { requested_hours: item.requested_hours })}</>}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {statusBadge(row.status)}
                          {remarks && <span className="text-xs text-slate-500 italic">"{remarks}"</span>}
                          {isClaim && item.status === 'REJECTED' && item.hr_reviewed_by && <span className="text-xs text-red-600">{t("Later rejected by HR")}</span>}
                          {isClaim && item.status === 'APPROVED' && <span className="text-xs text-slate-500">{t("Approved by HR")}</span>}
                          {isClaim && item.status === 'PAID' && <span className="text-xs text-slate-500">{t("Paid")}</span>}
                        </div>
                        {isClaim && (
                          <button type="button" onClick={() => viewClaimReceipt(item.claim_id)}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline">{t("View receipt")}</button>
                        )}
                        {isLeave && item.category === 'SICK' && (
                          item.mc_file_url ? (
                            <button type="button" onClick={() => openMcFile(item.mc_file_url)}
                              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline">{t("View MC Document")}</button>
                          ) : (
                            <p className="mt-1.5 text-xs font-medium text-amber-600">{t("MC not yet uploaded")}</p>
                          )
                        )}
                        {decidedOn && (
                          <p className="mt-1.5 text-xs text-slate-400">
                            {String(row.status).toUpperCase() === 'REJECTED' ? t("Rejected") : t("Approved")}{" "}{t("on {decidedOn}", { decidedOn: decidedOn })}{reviewerName ? t(" by {reviewerName}", { reviewerName: reviewerName }) : ''}
                          </p>
                        )}
                      </div>
                      {isLeave && (
                        <button onClick={() => openReviewModal(item, 'LEAVE', true)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">{t("Edit")}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>

      {/* ─── REVIEW MODAL ─── */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-900 mb-1">
              {reviewModal.isHistory ? t("Edit Past Decision") : (reviewModal.type === 'BUDGET' ? t("Review Budget Request") : reviewModal.type === 'CLAIMS' ? t("Review Claim") : t("Review Leave Request"))}
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              {reviewModal.type === 'CLAIMS' ? (
                <><strong>{reviewModal.item.claimant_name}</strong> — {reviewModal.item.merchant} • {formatDateOnly(reviewModal.item.purchase_date)} • {money(reviewModal.item.currency, reviewModal.item.total_amount)}</>
              ) : reviewModal.type === 'BUDGET' ? (
                <><strong>{reviewModal.item.project_code}</strong> — {reviewModal.item.project_name || reviewModal.item.project_code}{" "}{t("• {requested_hours} hrs requested", { requested_hours: reviewModal.item.requested_hours })}</>
              ) : (
                <><strong>{reviewModal.item.full_name}</strong>{" "}{t("— {category} • START DATE: {formatDateOnly} - END DATE: {formatDateOnly2}", { category: reviewModal.item.category, formatDateOnly: formatDateOnly(reviewModal.item.start_date), formatDateOnly2: formatDateOnly(reviewModal.item.end_date) })}{" "}{(() => { const d = daysBetween(reviewModal.item.start_date, reviewModal.item.end_date); return d ? ` (${d} Day${d !== 1 ? 's' : ''})` : ''; })()}
                </>
              )}
            </p>
            {reviewModal.isHistory && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">{t("Changing a past decision can impact payroll or project tracking. A reason is required.")}</div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t("Decision")}</label>
              <div className="flex gap-3">
                {['APPROVED', 'REJECTED'].map((a) => (
                  <button
                    key={a}
                    onClick={() => setReviewAction(a)}
                    className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold transition ${
                      reviewAction === a
                        ? a === 'APPROVED' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {a === 'APPROVED' ? t("✓ Approve") : t("✕ Reject")}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {reviewModal.isHistory ? t("Reason for change") : t("Remark")}
                {(reviewModal.isHistory || reviewAction === 'REJECTED') ? <span className="text-red-500"> *</span> : <span className="font-normal text-slate-400">{t("(optional)")}</span>}
              </label>
              <textarea
                rows={3}
                value={reviewRemark}
                onChange={(e) => setReviewRemark(e.target.value)}
                placeholder={reviewModal.isHistory ? t("Why is this past decision being changed?") : t("Add a note for the staff member…")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {reviewError && <p className="mt-2 text-sm font-medium text-red-500">{reviewError}</p>}
            </div>

            {feedback && (
              <p className={`mb-4 text-sm font-medium ${feedback.includes('Done') ? 'text-green-600' : 'text-red-500'}`}>{feedback}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setReviewModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700"
              >{t("Cancel")}</button>
              <button
                onClick={submitModalReview}
                disabled={submitting}
                className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? t("Submitting…") : reviewModal.isHistory ? t("Update Decision") : t("Submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-medium text-white shadow-2xl">
          <span>{t(toast.message)}</span>
          {toast.onUndo && (
            <button onClick={toast.onUndo} className="font-bold text-blue-300 hover:text-blue-200">{t("Undo")}</button>
          )}
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">&times;</button>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const { t } = useT();
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">{t("Loading…")}</div>}>
      <ApprovalsContent />
    </Suspense>
  );
}
