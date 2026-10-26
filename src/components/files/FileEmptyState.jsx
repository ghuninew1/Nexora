import { FolderOpen, SearchX } from "lucide-react";
import { cx } from "../../utils/cx";

function FileEmptyState({ searching = false }) {
  const Icon = searching ? SearchX : FolderOpen;
  return (
    <div className={cx("flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center")}>
      <div className={cx("flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground")}>
        <Icon className={cx("size-6")} />
      </div>

      <h2 className={cx("mt-4 text-sm font-semibold text-foreground")}>
        {searching ? "No matching files" : "This folder is empty"}
      </h2>

      <p className={cx("mt-1 max-w-sm text-sm text-muted-foreground")}>
        {searching ? "Try a different search term." : "Upload files or create a new folder to get started."}
      </p>
    </div>
  );
}

export default FileEmptyState;
