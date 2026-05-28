// DTOs for the workspace settings surfaces. These define EXACTLY what
// crosses the Server-Action / HTTP boundary into client components — no
// Prisma model leaks. Add fields here when the UI needs them, never on
// raw Prisma rows in a service return type.

export interface WorkspaceMemberDTO {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface WorkspaceSummaryDTO {
  id: string;
  name: string;
  slug: string;
}
