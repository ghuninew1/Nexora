import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, FolderOpen, Info } from "lucide-react";
import { cx } from "../../utils/cx";
import { Button } from "../ui/button";
import useFiles from "../../hooks/useFiles";
import FileBreadcrumbs from "./FileBreadcrumbs";
import FileToolbar from "./FileToolbar";
import FileList from "./FileList";
import NewFolderDialog from "./NewFolderDialog";

function FileListLoading() {
  return <div className={cx("overflow-hidden rounded-xl border border-border bg-card")} role="status" aria-live="polite" aria-busy="true" aria-label="Loading files">
    <div className={cx("sr-only")}>Loading this folder…</div>
    {Array.from({ length: 5 }, (_, index) => <div key={index} className={cx("flex min-h-16 items-center gap-4 border-b border-border px-4 py-3 last:border-b-0")}>
      <span className={cx("size-8 shrink-0 animate-pulse rounded-md bg-muted motion-reduce:animate-none")} />
      <span className={cx("size-10 shrink-0 animate-pulse rounded-xl bg-muted motion-reduce:animate-none")} />
      <span className={cx("h-3 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none")} />
    </div>)}
  </div>;
}

function FileBrowser() {
  const browser = useFiles();
  const navigate = useNavigate();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const selectedCount = browser.selectedIds.length;
  const isLoading = browser.status === "loading";
  const isRefreshing = browser.status === "refreshing";
  const isReady = browser.status === "ready" || browser.status === "empty" || isRefreshing;

  async function handleCreateFolder(name) {
    const result = await browser.createFolder(name);
    if (result.ok) setNewFolderOpen(false);
    return result;
  }

  return (
    <div className={cx("relative")}>
      <section className={cx("flex min-w-0 flex-col gap-5")}>
        <h1 className={cx("sr-only")}>My Files</h1>
        <div className={cx("flex flex-wrap items-center justify-between gap-3")}>
          <FileBreadcrumbs items={browser.breadcrumbs.map((item) => ({ id: item.objectId, label: item.label }))} onNavigate={browser.navigateToBreadcrumb} />
          <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground")}><Info className={cx("size-3.5")} aria-hidden="true" />Nexora storage · file actions are limited in this phase</span>
        </div>
        {browser.notice && <p className={cx("rounded-lg border border-border bg-card/70 px-3 py-2 text-sm text-muted-foreground")} role="status" aria-live="polite">{browser.notice}</p>}
        <FileToolbar
          selectedCount={selectedCount}
          onNewFolder={() => setNewFolderOpen(true)}
          canCreateFolder={browser.canCreateFolder}
          isCreatingFolder={browser.isCreatingFolder}
          onRefresh={browser.refreshCurrentFolder}
          isRefreshing={isRefreshing}
          onClearSelection={browser.clearSelection}
          query={browser.query} onQueryChange={browser.setQuery}
          sortBy={browser.sortBy} onSortChange={browser.setSortBy}
          sortDirection={browser.sortDirection} onSortDirectionChange={() => browser.setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
          view={browser.view} onViewChange={browser.setView}
        />
        <p className={cx("-mt-3 text-xs text-muted-foreground")}>Search and sorting apply to the items loaded in this folder.</p>

        {isLoading && <FileListLoading />}
        {browser.status === "unavailable" && <div className={cx("glass-surface flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between")} role="alert"><div className={cx("flex items-start gap-3")}><AlertCircle className={cx("mt-0.5 size-5 shrink-0 text-destructive")} aria-hidden="true" /><div><h2 className={cx("text-sm font-semibold")}>Storage is not ready</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>{browser.error || "No active storage is available for this account."}</p></div></div><Button variant="outline" onClick={() => navigate("/storage")}>View storage</Button></div>}
        {browser.status === "error" && <div className={cx("glass-surface flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between")} role="alert"><div className={cx("flex items-start gap-3")}><AlertCircle className={cx("mt-0.5 size-5 shrink-0 text-destructive")} aria-hidden="true" /><div><h2 className={cx("text-sm font-semibold")}>Could not load this folder</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>{browser.error}</p></div></div><div className={cx("flex gap-2")}><Button variant="outline" onClick={() => void browser.refreshCurrentFolder()}>Try again</Button>{browser.folderId && <Button variant="ghost" onClick={browser.navigateRoot}><FolderOpen />My Files</Button>}</div></div>}
        {isReady && <>
          <div aria-live="polite" aria-atomic="true" className={cx("sr-only")}>{isRefreshing ? "Refreshing folder contents" : `${browser.items.length} items loaded`}</div>
          <FileList
            files={browser.currentFiles}
            selectedIds={browser.selectedIds}
            query={browser.query}
            view={browser.view}
            favorites={[]}
            onSelect={browser.toggleSelect}
            onSelectAll={browser.selectAll}
            onOpenFolder={browser.openFolder}
            onPreview={() => {}}
            onRename={() => {}}
            onDelete={() => {}}
            onDownload={() => {}}
            onToggleFavorite={() => {}}
            canCreateFolder={browser.canCreateFolder}
            onCreateFolder={() => setNewFolderOpen(true)}
          />
          {browser.paginationError && <p className={cx("text-sm text-destructive")} role="alert">{browser.paginationError}</p>}
          {browser.nextCursor && browser.paginationStatus !== "error" && <div className={cx("flex justify-center")}><Button variant="outline" onClick={() => void browser.loadMore()} disabled={browser.paginationStatus === "loading"} aria-busy={browser.paginationStatus === "loading"}>{browser.paginationStatus === "loading" ? "Loading more…" : "Load more"}</Button></div>}
          {browser.paginationStatus === "error" && <Button variant="ghost" onClick={() => void browser.loadMore()}>Try loading more again</Button>}
        </>}
      </section>
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={handleCreateFolder} />
    </div>
  );
}

export default FileBrowser;
