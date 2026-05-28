'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { renameWorkspaceAction, type ActionResult } from '../actions';

export function NameCard({ initialName }: { initialName: string }) {
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    renameWorkspaceAction,
    { ok: true },
  );
  // Only toast on a real submit result, not the initial { ok: true } seed.
  const submitted = useRef(false);

  useEffect(() => {
    if (!submitted.current) return;
    if (state.ok) {
      toast({ variant: 'success', title: 'Workspace renamed' });
    } else if (state.error) {
      toast({ variant: 'error', title: 'Could not rename', description: state.error });
    }
  }, [state, toast]);

  return (
    <Card
      header={
        <div>
          <h2 className="font-sans text-base font-semibold text-foreground">Workspace name</h2>
        </div>
      }
    >
      <form
        action={(formData) => {
          submitted.current = true;
          formAction(formData);
        }}
        className="flex items-end gap-3"
      >
        <div className="flex-1">
          <Input
            name="name"
            aria-label="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="Visible to everyone in this workspace."
          />
        </div>
        <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>
          Save
        </Button>
      </form>
    </Card>
  );
}
