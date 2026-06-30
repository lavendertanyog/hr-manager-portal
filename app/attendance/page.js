"use client";

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(fileName, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AttendancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameSearch, setNameSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [locationSearch, setLocationSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [managerId, setManagerId] = useState('');

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setManagerId(u.user_id);
    } catch {}
  }, []);

  const loadData = async (mid) => {
    if (!mid) return;
    try {
      setLoading(true);
      const res = await axios.get(`${backendBaseUrl}/api/v1/manager/${mid}/attendance-logs`);
      setRows(res.data.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!managerId) return;
    loadData(managerId);
    const timer = setInterval(() => loadData(managerId), 15000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerId, backendBaseUrl]);

  const filteredRows = useMemo(() => {
    const nameQ = nameSearch.trim().toLowerCase();
    const locQ = locationSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && String(row.status || '').toUpperCase() !== statusFilter) return false;
      if (nameQ && !String(row.full_name || '').toLowerCase().includes(nameQ)) return false;
      if (locQ && !String(row.location_name || '').toLowerCase().includes(locQ)) return false;
      if (dateFrom) {
        const d = row.clock_in_time ? new Date(row.clock_in_time) : null;
        if (!d || d < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const d = row.clock_in_time ? new Date(row.clock_in_time) : null;
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (!d || d > end) return false;
      }
      return true;
    });
  }, [rows, nameSearch, statusFilter, locationSearch, dateFrom, dateTo]);

  const handleExport = () => {
    const csv = toCsv(filteredRows.map((row) => ({
      attendance_id: row.attendance_id,
      full_name: row.full_name,
      project_code: row.project_code,
      clock_in: row.clock_in_time,
      clock_out: row.clock_out_time,
      location: row.location_name,
      country: row.country_code,
      travel_mode: row.travel_mode,
      hours: row.daily_worktime_hours,
      ot_hours: row.ot_hours_accrued,
      status: row.status,
    })));
    if (csv) downloadCsv(`attendance-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const resetFilters = () => {
    setNameSearch('');
    setStatusFilter('ALL');
    setLocationSearch('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Attendance Logs</h1>
        </div>
        <button onClick={handleExport} className="rounded-3xl bg-[#1540A8] px-5 py-3 text-sm font-semibold text-white">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {/* Employee name search */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Employee Name</label>
            <input
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              placeholder="Search employee name…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="CLOSED">CLOSED</option>
              <option value="VOIDED">VOIDED</option>
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Location</label>
            <input
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              placeholder="Search location…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900"
            />
          </div>

          {/* Reset */}
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-[0.22em] text-[0.65rem]">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Clock In</th>
              <th className="px-4 py-3">Clock Out</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Travel</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">OT</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading attendance logs…</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No records match the selected filters.</td></tr>
            ) : filteredRows.map((row) => (
              <tr key={row.attendance_id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{row.full_name}</td>
                <td className="px-4 py-3 text-slate-700">{row.project_code || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{formatDt(row.clock_in_time)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.clock_out_time ? formatDt(row.clock_out_time) : <span className="text-green-600 font-semibold text-xs">ACTIVE</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.location_name ? `${row.location_name}${row.country_code ? ` (${row.country_code})` : ''}` : '—'}</td>
                <td className="px-4 py-3 text-slate-600">{row.travel_mode || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{row.daily_worktime_hours ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{row.ot_hours_accrued ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    row.status === 'ACTIVE' ? 'bg-green-100 text-green-700'
                    : row.status === 'CLOSED' ? 'bg-slate-100 text-slate-600'
                    : 'bg-red-100 text-red-600'
                  }`}>{row.status || 'UNKNOWN'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}



