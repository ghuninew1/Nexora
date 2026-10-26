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
  const [name, setName] = useState(file?.name ?? "");
  const [error, setError] = useState("");

  function handleRename() {
    const trimmedName = name.trim();

    if (!trimmedName || trimmedName === file.name) {
      return;
    }

    const renamed = onRename(file.id, trimmedName);
    if (renamed === false) {
      setError("A file or folder with this name already exists here.");
      return;
    }
    setName("");
    setError("");
  }

  function handleOpenChange(value) {
    if (!value) {
      setName("");
      setError("");
    }

    onOpenChange(value);
  }

  if (!file) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
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
          onChange={(event) => { setName(event.target.value); setError(""); }}
          autoFocus
          maxLength={255}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "rename-item-error" : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleRename();
            }
          }}
        />
        {error && <p id="rename-item-error" role="alert" className={cx("text-sm text-destructive")}>{error}</p>}

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
            disabled={!name.trim() || name.trim() === file.name}
            onClick={handleRename}
          >
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RenameDialog;
