import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function DeleteRequestButton({
  requestId,
  onDeleted,
}: {
  requestId: string;
  onDeleted: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await getSupabaseClient().rpc("teacher_delete_peer_request", {
        p_request_id: requestId,
      });
      if (result.error || result.data !== true) {
        toast.error("Could not delete the request. Please try again.");
        return;
      }
      setOpen(false);
      toast.success("Request deleted.");
      try {
        await onDeleted();
      } catch {
        toast.error("The list could not be refreshed. Please try Refresh.");
      }
    } catch {
      toast.error("Could not delete the request. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <button
          type="button"
          aria-label="Delete request"
          title="Delete request"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-swag-pink/40 text-swag-navy hover:bg-swag-pink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-swag-blue"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent
        className="max-w-[calc(100%-2rem)] rounded-2xl border-swag-pink/30 sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this request?</AlertDialogTitle>
          <AlertDialogDescription>
            This request will be removed from staff request lists and will no longer be available
            for claiming, assignment or scheduling. No email will be sent. The record will be
            retained internally.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-swag-navy px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? "Deleting…" : "Delete request"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
