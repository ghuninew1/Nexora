import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cx } from "../../utils/cx";

function RenameDialog({
  open,
  onOpenChange,
  file,
  onRename,
}) {
  const [draft, setDraft] = useState({ fileId: null, name: "", error: "" });
  const [isPending, setIsPending] = useState(false);
  const name = draft.fileId === file?.id ? draft.name : file?.name ?? "";
  const error = draft.fileId === file?.id ? draft.error : "";

  async function handleRename() {
    const trimmedName = name.trim();

    if (!trimmedName || trimmedName === file.name) {
      return;
    }

    setIsPending(true);
    try {
      const result = await onRename(file, trimmedName);
      if (result === false || result?.error) {
        const messages = {
          NAME_CONFLICT: "A file or folder with this name already exists here.",
          INVALID_INPUT: "Use a name up to 255 UTF-8 bytes without slashes or control characters.",
          FORBIDDEN: "You do not have permission to rename this item.",
          CAPABILITY_UNAVAILABLE: "Rename is unavailable for this storage.",
          NOT_FOUND: "This item is no longer available.",
          RATE_LIMITED: "Storage is temporarily busy. Try again shortly.",
          PROVIDER_UNAVAILABLE: "Storage is temporarily unavailable. Try again later.",
          TRANSFER_INCOMPLETE: "The rename did not complete. Try again.",
        };
        setDraft((current) => ({ ...current, fileId: file.id, name: trimmedName, error: messages[result?.error] || "The item could not be renamed. Try again later." }));
        return;
      }
      setDraft({ fileId: file.id, name: trimmedName, error: "" });
      onOpenChange(false);
    } finally {
      setIsPending(false);
    }
  }

  function handleOpenChange(value) {
    if (!value) {
      setDraft({ fileId: file?.id ?? null, name: file?.name ?? "", error: "" });
    }

    onOpenChange(value);
  }

  if (!file) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-busy={isPending}>
        <DialogHeader>
          <DialogTitle id="rename-item-title">Rename</DialogTitle>

          <DialogDescription>
            Enter a new name for this item.
          </DialogDescription>
        </DialogHeader>

        <Input
          id="rename-item-name"
          aria-labelledby="rename-item-title"
          aria-label={`New name for ${file.name}`}
          value={name}
          onChange={(event) => setDraft({ fileId: file.id, name: event.target.value, error: "" })}
          autoFocus
          maxLength={255}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "rename-item-error" : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleRename();
            }
          }}
        />
        {error && <p id="rename-item-error" role="alert" className={cx("text-sm text-destructive")}>{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            disabled={!name.trim() || name.trim() === file.name || isPending}
            onClick={() => void handleRename()}
          >
            {isPending ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RenameDialog;
