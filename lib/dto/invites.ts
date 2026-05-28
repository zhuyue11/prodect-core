// DTOs for the invite endpoints. These define EXACTLY what crosses the
// HTTP boundary — no Prisma model leaks. Add fields here when the UI
// needs them, never on raw Prisma rows in the service return type.

export interface SendInviteResultDTO {
  ok: true;
}

export interface ValidateInviteResultDTO {
  workspaceName: string;
  inviterName: string;
  email: string;
}

export interface AcceptInviteResultDTO {
  workspaceId: string;
}

// Discriminated result for the acceptance UI's initial page load. Lets
// the page render the distinct mockup states (valid / expired / used)
// instead of collapsing them the way validateInvite() does for the
// public GET endpoint.
export type InspectInviteResultDTO =
  | { status: 'valid'; workspaceName: string; inviterName: string; email: string }
  | { status: 'expired' }
  | { status: 'used' };
