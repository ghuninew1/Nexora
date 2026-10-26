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
  onDelete,
  permanent = false,
}) {
  function handleDelete() {
    onDelete();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {permanent ? "Permanently delete" : "Delete"} {count === 1 ? "item" : "items"}?
          </DialogTitle>

          <DialogDescription>
            {permanent
              ? "This item will be removed permanently and cannot be restored."
              : count === 1 ? "This item will move to Trash." : `These ${count} items will move to Trash.`}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
          >
            {permanent ? "Delete permanently" : "Move to Trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteDialog;
