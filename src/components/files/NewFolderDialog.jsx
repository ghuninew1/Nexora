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

function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}) {
  const [name, setName] = useState("");

  function handleCreate() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    onCreate(trimmedName);
    setName("");
  }

  function handleOpenChange(value) {
    if (!value) {
      setName("");
    }

    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>

          <DialogDescription>
            Create a new folder in the current location.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Folder name"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleCreate();
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