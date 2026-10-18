import { FolderOpen } from "lucide-react";

function FileEmptyState() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <FolderOpen className="size-6" />
      </div>

      <h2 className="mt-4 text-sm font-semibold text-foreground">
        This folder is empty
      </h2>

      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Upload files or create a new folder to get started.
      </p>
    </div>
  );
}

export default FileEmptyState;