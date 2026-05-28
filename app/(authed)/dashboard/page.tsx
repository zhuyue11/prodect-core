// SMOKE ROUTE — placeholder from Subtask 1.1.2.
// Proves that the (authed) route group is gated by /proxy.ts and that
// server-side getSession() returns a populated session for an authenticated
// request. The real dashboard lands in a later Story.
//
// Sign-out moved out of this page into the top-nav user menu (Subtask
// 1.2.6); the (authed) layout now renders TopNav + a padded <main>, so
// this page only owns its own content.

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold text-foreground">Dashboard</h1>
      <p className="text-muted-foreground mt-2 font-sans text-sm">
        Signed in as <strong className="text-foreground">{session.user.email}</strong>
      </p>
    </div>
  );
}
