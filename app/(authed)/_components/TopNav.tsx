import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { UserMenu } from './UserMenu';
import type { WorkspaceSummaryDTO } from '@/lib/dto/workspaces';

// Minimal top-nav shell for every (authed)/* route. Two slots only:
// the workspace switcher (left) and the user menu (right). Story 1.5
// (app shell) expands this with project nav / search by composing ATOP
// this structure — add slots between the two existing ones rather than
// replacing the file. No wordmark slot (brand-mark deferral, PRODECT.md).

export interface TopNavProps {
  workspaces: WorkspaceSummaryDTO[];
  activeWorkspaceId: string | null;
  user: { name: string; email: string };
}

export function TopNav({ workspaces, activeWorkspaceId, user }: TopNavProps) {
  return (
    <header className="border-(--color-hairline) bg-background sticky top-0 z-30 border-b">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
        </div>
        <div className="flex items-center gap-2">
          <UserMenu name={user.name} email={user.email} />
        </div>
      </nav>
    </header>
  );
}
