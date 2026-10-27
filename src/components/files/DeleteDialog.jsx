import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

function DeleteDialog({
  open,
  onOpenChange,
  count,
  file = null,
  onDelete,
  permanent = false,
  isPending = false,
}) {
  function handleDelete() {
    onDelete();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {file
              ? permanent ? `Permanently delete “${file.name}”?` : `Move “${file.name}” to Trash?`
              : `${permanent ? "Permanently delete" : "Delete"} ${count === 1 ? "item" : "items"}?`}
          </DialogTitle>

          <DialogDescription>
            {file?.type === "folder"
              ? permanent
                ? "This permanently deletes this folder and its trashed contents and cannot be undone."
                : "This folder and its contents will move to Trash and no longer appear in My Files."
              : file
                ? permanent ? "This permanently deletes the item and cannot be undone." : "This item will be moved to Trash."
                : permanent
                  ? "This item will be removed permanently and cannot be restored."
                  : count === 1 ? "This item will move to Trash." : `These ${count} items will move to Trash.`}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            aria-busy={isPending}
            onClick={handleDelete}
          >
            {isPending ? "Working…" : permanent ? "Delete permanently" : "Move to Trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteDialog;
