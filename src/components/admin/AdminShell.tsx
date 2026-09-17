import { ReactNode } from "react";
import { AdminHeader } from "./AdminHeader";
import { AdminBottomNav } from "./AdminBottomNav";

export function AdminShell({
  children,
  title,
  updatedAt,
}: {
  children: ReactNode;
  title?: string;
  updatedAt?: string | null;
}) {
  return (
    <div className="dc-admin">
      <AdminHeader title={title} updatedAt={updatedAt} />
      <main className="dc-admin-shell">
        <AdminBottomNav />
        {children}
      </main>
    </div>
  );
}
