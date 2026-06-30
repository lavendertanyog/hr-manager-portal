"use client";

import { usePathname } from 'next/navigation';
import SidebarClient from './SidebarClient';

const SIDEBAR_PATH_PREFIXES = ['/dashboard', '/team', '/approvals', '/project-codes', '/attendance', '/audit'];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const shouldShowSidebar = Boolean(pathname) && SIDEBAR_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!shouldShowSidebar) {
    return <main className="min-h-screen bg-gray-50">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SidebarClient />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}