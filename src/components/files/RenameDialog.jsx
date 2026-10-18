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

function RenameDialog({
  open,
  onOpenChange,
  file,
  onRename,
}) {
  const [name, setName] = useState(file?.name ?? "");

  function handleRename() {
    const trimmedName = name.trim();

    if (!trimmedName || trimmedName === file.name) {
      return;
    }

    onRename(file.id, trimmedName);
    setName("");
  }

  function handleOpenChange(value) {
    if (!value) {
      setName("");
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
          <DialogTitle>Rename</DialogTitle>

          <DialogDescription>
            Enter a new name for this item.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleRename();
            }
          }}
        />

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