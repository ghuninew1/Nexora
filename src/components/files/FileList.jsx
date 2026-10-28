import { cx } from "../../utils/cx";
import FileEmptyState from "./FileEmptyState";
import FileListItem from "./FileListItem";

function FileList({ files, selectedIds, query, view, favorites, onSelect, onSelectAll, onOpenFolder, onPreview, onRename, onDownload, onMove, onCopy, onShare, onTrash, onToggleFavorite, allowFavorites = false, canCreateFolder = false, capabilities, readOnly = false, mutatingIds, onCreateFolder }) {
  if (files.length === 0) return <FileEmptyState searching={Boolean(query.trim())} canCreateFolder={canCreateFolder} onCreateFolder={onCreateFolder} />;
  const allSelected = files.every((file) => selectedIds.includes(file.id));
  return (
    <div className={cx(view === "list" ? "overflow-hidden rounded-xl border border-border bg-card" : "")}>
      {view === "list" && <div className={cx("grid grid-cols-[minmax(0,1fr)] items-center border-b border-border bg-muted/30 px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid-cols-[minmax(0,1fr)_160px_100px_40px] sm:px-4 sm:py-3")}>
        <button type="button" onClick={onSelectAll} aria-label={allSelected ? "Deselect all files" : "Select all files"} aria-pressed={allSelected} className={cx("flex items-center gap-3 text-left transition-colors hover:text-foreground")}>
          <span className={cx("flex size-4 items-center justify-center rounded border text-[10px]", allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{allSelected && "✓"}</span>Name
        </button><span className={cx("hidden sm:block")}>Modified</span><span className={cx("hidden text-right sm:block")}>Size</span><span />
      </div>}
      {view === "grid" && <div className={cx("mb-2 flex justify-end")}><button type="button" onClick={onSelectAll} aria-pressed={allSelected} className={cx("min-h-10 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground")}>{allSelected ? "Deselect all" : "Select all"}</button></div>}
      <div className={cx(view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "")}>
        {files.map((file) => <FileListItem key={file.id} file={file} selected={selectedIds.includes(file.id)} favorite={favorites.includes(file.id)} view={view} onSelect={onSelect} onOpenFolder={onOpenFolder} onPreview={onPreview} onRename={onRename} onDownload={onDownload} onMove={onMove} onCopy={onCopy} onShare={onShare} onTrash={onTrash} onToggleFavorite={onToggleFavorite} allowFavorites={allowFavorites} capabilities={capabilities} readOnly={readOnly} busy={mutatingIds.has(file.objectId)} />)}
      </div>
    </div>
  );
}

export default FileList;
