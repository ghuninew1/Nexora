import FileEmptyState from "./FileEmptyState";
import FileListItem from "./FileListItem";
import { cx } from "../../utils/cx";

function FileList({
  files,
  selectedIds,
  onSelect,
  onSelectAll,
  onOpenFolder,
}) {
  if (files.length === 0) {
    return <FileEmptyState />;
  }

  const allSelected = selectedIds.length === files.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden grid-cols-[minmax(0,1fr)_180px_120px] items-center border-b border-border bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <button
          type="button"
          onClick={onSelectAll}
          aria-label={allSelected ? "Deselect all files" : "Select all files"}
          aria-pressed={allSelected}
          className="flex items-center gap-3 text-left transition-colors hover:text-foreground"
        >
          <span
            className={cx(
              "flex size-4 items-center justify-center rounded border text-[10px]",
              allSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border",
            )}
          >
            {allSelected && "✓"}
          </span>

          <span>Name</span>
        </button>

        <span>Modified</span>
        <span className="text-right">Size</span>
      </div>

      <div>
        {files.map((file) => (
          <FileListItem
            key={file.id}
            file={file}
            selected={selectedIds.includes(file.id)}
            onSelect={onSelect}
            onOpenFolder={onOpenFolder}
          />
        ))}
      </div>
    </div>
  );
}

export default FileList;