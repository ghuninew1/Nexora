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

function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleCreate() {
    if (isPending) return;
    if (!name.trim()) {
      setError("Enter a folder name.");
      return;
    }

    setIsPending(true);
    try {
      const result = await onCreate(name);
      if (result === false || result?.error) {
        const messages = {
          NAME_CONFLICT: "A file or folder with this name already exists here.",
          INVALID_INPUT: "Use a non-empty name up to 255 UTF-8 bytes without slashes or control characters.",
          FORBIDDEN: "Folder creation is unavailable for this storage.",
          RATE_LIMITED: "Storage is temporarily busy. Try again shortly.",
          PROVIDER_UNAVAILABLE: "Storage is temporarily unavailable. Try again later.",
          INTERNAL_ERROR: "The folder could not be created. Try again later.",
        };
        setError(messages[result?.error] || "The folder could not be created. Try again later.");
        return;
      }
      setName("");
      setError("");
    } finally {
      setIsPending(false);
    }
  }

  function handleOpenChange(value) {
    if (!value) {
      setName("");
      setError("");
    }

    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-busy={isPending}>
        <DialogHeader>
          <DialogTitle id="new-folder-title">New folder</DialogTitle>

          <DialogDescription>
            Create a new folder in the current location.
          </DialogDescription>
        </DialogHeader>

        <Input
          id="new-folder-name"
          aria-labelledby="new-folder-title"
          aria-label="Folder name"
          value={name}
          onChange={(event) => { setName(event.target.value); setError(""); }}
          placeholder="Folder name"
          maxLength={255}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "new-folder-error" : undefined}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleCreate();
            }
          }}
        />
        {error && <p id="new-folder-error" role="alert" className={cx("text-sm text-destructive")}>{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            disabled={!name.trim() || isPending}
            onClick={() => void handleCreate()}
          >
            {isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewFolderDialog;
