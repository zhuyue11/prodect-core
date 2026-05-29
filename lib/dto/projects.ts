// DTOs for the project endpoints + surfaces. These define EXACTLY what
// crosses the HTTP / Server-Action boundary — no Prisma model leaks. Add
// fields here when the UI needs them, never on raw Prisma rows in a
// service return type.

export interface ProjectDTO {
  id: string;
  name: string;
  slug: string;
  identifier: string;
}
