import { type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getWorkspaceContext } from '@/lib/workspaces';
import { workspacesService } from '@/lib/services/workspacesService';
import { toWorkspaceSummaryDTO } from '@/lib/mappers/workspaceMappers';
import { ToastProvider } from '@/components/ui/Toast';
import { TopNav } from './_components/TopNav';

// Layout for every authenticated route. Renders the minimal top-nav on
// every page and wraps the tree in ToastProvider so any client component
// under (authed) can dispatch toasts. The proxy.ts gate already bounces
// unauthenticated requests to /sign-in; we re-check here because the
// proxy only does an optimistic cookie-presence check, and we need the
// session to populate the user menu + workspace switcher anyway.

export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const ctx = await getWorkspaceContext();
  const workspaceModels = await workspacesService.listUserWorkspaces(session.user.id);
  const workspaces = workspaceModels.map(toWorkspaceSummaryDTO);

  return (
    <ToastProvider>
      <TopNav
        workspaces={workspaces}
        activeWorkspaceId={ctx?.workspaceId ?? null}
        user={{ name: session.user.name, email: session.user.email }}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </ToastProvider>
  );
}
