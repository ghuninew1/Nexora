import { FolderOpen, SearchX } from "lucide-react";
import { cx } from "../../utils/cx";
import { Button } from "../ui/button";

function FileEmptyState({ searching = false, canCreateFolder = false, onCreateFolder }) {
  const Icon = searching ? SearchX : FolderOpen;
  return (
    <div className={cx("flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center")}>
      <div className={cx("flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground")}>
        <Icon className={cx("size-6")} />
      </div>

      <h2 className={cx("mt-4 text-sm font-semibold text-foreground")}>
        {searching ? "No matching loaded items" : "This folder is empty"}
      </h2>

      <p className={cx("mt-1 max-w-sm text-sm text-muted-foreground")}>
        {searching ? "Search only checks items loaded in this folder. Try a different search term." : "There are no items in this location."}
      </p>
      {!searching && canCreateFolder && <Button className={cx("mt-4")} onClick={onCreateFolder}>Create folder</Button>}
    </div>
  );
}

export default FileEmptyState;
