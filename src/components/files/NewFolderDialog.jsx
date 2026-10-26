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

  function handleCreate() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const created = onCreate(trimmedName);
    if (created === false) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
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
            disabled={!name.trim()}
            onClick={handleCreate}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewFolderDialog;
