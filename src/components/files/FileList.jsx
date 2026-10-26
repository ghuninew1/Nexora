import { cx } from "../../utils/cx";
import FileEmptyState from "./FileEmptyState";
import FileListItem from "./FileListItem";

function FileList({ files, selectedIds, query, view, favorites, onSelect, onSelectAll, onOpenFolder, onPreview, onRename, onDelete, onDownload, onToggleFavorite }) {
  if (files.length === 0) return <FileEmptyState searching={Boolean(query.trim())} />;
  const allSelected = files.every((file) => selectedIds.includes(file.id));
  return (
    <div className={cx(view === "list" ? "overflow-hidden rounded-xl border border-border bg-card" : "")}>
      {view === "list" && <div className={cx("hidden grid-cols-[minmax(0,1fr)_160px_100px_40px] items-center border-b border-border bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid")}>
        <button type="button" onClick={onSelectAll} aria-label={allSelected ? "Deselect all files" : "Select all files"} aria-pressed={allSelected} className={cx("flex items-center gap-3 text-left transition-colors hover:text-foreground")}>
          <span className={cx("flex size-4 items-center justify-center rounded border text-[10px]", allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{allSelected && "✓"}</span>Name
        </button><span>Modified</span><span className={cx("text-right")}>Size</span><span />
      </div>}
      <div className={cx(view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "")}>
        {files.map((file) => <FileListItem key={file.id} file={file} selected={selectedIds.includes(file.id)} favorite={favorites.includes(file.id)} view={view} onSelect={onSelect} onOpenFolder={onOpenFolder} onPreview={onPreview} onRename={onRename} onDelete={onDelete} onDownload={onDownload} onToggleFavorite={onToggleFavorite} />)}
      </div>
    </div>
  );
}

export default FileList;
