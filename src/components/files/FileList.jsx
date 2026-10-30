import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { cx } from "../../utils/cx";
import FileEmptyState from "./FileEmptyState";
import FileListItem from "./FileListItem";

function SortHeading({ label, field, sortBy, sortDirection, onSort, alignEnd = false }) {
  const active = sortBy === field;
  const Icon = sortDirection === "asc" ? ArrowUp : ArrowDown;
  return <button type="button" onClick={() => onSort(field)} aria-label={`Sort by ${label}${active ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`} className={cx("inline-flex min-h-10 items-center gap-1 rounded-md text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", alignEnd && "justify-self-end")}>
    {label}{active && <Icon className={cx("size-3.5")} aria-hidden="true" />}
  </button>;
}

function FileList({ sortBy, sortDirection, onSort, cutIds = [], files, selectedIds, query, view, favorites, onSelect, onSelectAll, onOpenFolder, onPreview, onRename, onDownload, onMove, onCopy, onShare, onTrash, onToggleFavorite, allowFavorites = false, canCreateFolder = false, capabilities, readOnly = false, mutatingIds, onCreateFolder }) {
  if (files.length === 0) return <FileEmptyState searching={Boolean(query.trim())} canCreateFolder={canCreateFolder} onCreateFolder={onCreateFolder} />;
  const allSelected = files.every((file) => selectedIds.includes(file.id));
  return (
    <div className={cx(view === "list" ? "overflow-hidden rounded-xl border border-border bg-card" : "")}>
      {view === "list" && <div className={cx("grid grid-cols-[minmax(0,1fr)] items-center border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid-cols-[minmax(0,1fr)_160px_100px_56px] sm:px-4 sm:py-3")}>
        <div className={cx("flex min-w-0 items-center gap-3")}>
          <button type="button" onClick={onSelectAll} aria-label={allSelected ? "Deselect all files" : "Select all files"} aria-pressed={allSelected} className={cx("flex size-8 shrink-0 items-center justify-center rounded-md text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
            <span className={cx("flex size-4 items-center justify-center rounded border text-[10px]", allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{allSelected && "✓"}</span>
          </button>
          {allowFavorites && <span className={cx("flex size-11 shrink-0 items-center justify-center")} aria-label="Favorites"><Star className={cx("size-4")} aria-hidden="true" /></span>}
          <span className={cx("size-10 shrink-0")} aria-hidden="true" />
          <SortHeading label="Name" field="name" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
        </div><div className={cx("hidden sm:block")}><SortHeading label="Modified" field="modified" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></div><div className={cx("hidden sm:flex sm:justify-end")}><SortHeading label="Size" field="size" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} alignEnd /></div><span />
      </div>}
      {view === "grid" && <div className={cx("mb-2 flex justify-end")}><button type="button" onClick={onSelectAll} aria-pressed={allSelected} className={cx("min-h-10 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground")}>{allSelected ? "Deselect all" : "Select all"}</button></div>}
      <div className={cx(view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "")}>
        {files.map((file) => <FileListItem key={file.id} file={file} isCutItem={cutIds.includes(file.objectId)} selected={selectedIds.includes(file.id)} favorite={favorites.includes(file.id)} view={view} onSelect={onSelect} onOpenFolder={onOpenFolder} onPreview={onPreview} onRename={onRename} onDownload={onDownload} onMove={onMove} onCopy={onCopy} onShare={onShare} onTrash={onTrash} onToggleFavorite={onToggleFavorite} allowFavorites={allowFavorites} capabilities={capabilities} readOnly={readOnly} busy={mutatingIds.has(file.objectId)} />)}
      </div>
    </div>
  );
}

export default FileList;
