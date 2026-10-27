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
import RenameDialog from "./RenameDialog";
import FolderDestinationDialog from "./FolderDestinationDialog";
import UploadQueue from "./UploadQueue";
import StorageFilePreviewDialog from "./StorageFilePreviewDialog";
import DeleteDialog from "./DeleteDialog";

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
  const [renameFile, setRenameFile] = useState(null);
  const [destinationAction, setDestinationAction] = useState(null);
  const [trashFile, setTrashFile] = useState(null);
  const selectedCount = browser.selectedIds.length;
  const selectedFile = selectedCount === 1 ? browser.currentFiles.find((file) => file.id === browser.selectedIds[0]) : null;
  const selectedIsBusy = Boolean(selectedFile && browser.mutatingIds.has(selectedFile.objectId));
  const isLoading = browser.status === "loading";
  const isRefreshing = browser.status === "refreshing";
  const isReady = browser.status === "ready" || browser.status === "empty" || isRefreshing;

  async function handleCreateFolder(name) {
    const result = await browser.createFolder(name);
    if (result.ok) setNewFolderOpen(false);
    return result;
  }

  async function handleRename(file, name) {
    const result = await browser.renameObject(file, name);
    if (result.ok) setRenameFile(null);
    return result;
  }

  async function handleDestination(parentId) {
    if (!destinationAction) return { error: "INVALID_INPUT" };
    const result = destinationAction.action === "move"
      ? await browser.moveObject(destinationAction.file, parentId)
      : await browser.copyObject(destinationAction.file, parentId);
    if (result.ok) {
      if (destinationAction.action === "move") browser.clearSelection();
      setDestinationAction(null);
    }
    return result;
  }

  async function handleTrash() {
    if (!trashFile) return;
    const result = await browser.trashObject(trashFile);
    if (result.ok) {
      browser.clearSelection();
      setTrashFile(null);
    }
  }

  return (
    <div className={cx("relative")}>
      <section className={cx("flex min-w-0 flex-col gap-5")}>
        <h1 className={cx("sr-only")}>My Files</h1>
        <div className={cx("flex flex-wrap items-center justify-between gap-3")}>
          <FileBreadcrumbs abbreviated={browser.breadcrumbsAbbreviated} items={browser.breadcrumbs.map((item) => ({ id: item.objectId, label: item.label }))} onNavigate={browser.navigateToBreadcrumb} />
          <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground")}><Info className={cx("size-3.5")} aria-hidden="true" />Connected storage · Preview on demand</span>
        </div>
        {browser.notice && <p className={cx("rounded-lg border border-border bg-card/70 px-3 py-2 text-sm text-muted-foreground")} role="status" aria-live="polite">{browser.notice}</p>}
        {browser.revalidationError && <div className={cx("flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-sm text-muted-foreground")} role="status" aria-live="polite"><span>{browser.revalidationError}</span><Button type="button" variant="ghost" size="sm" onClick={() => void browser.refreshCurrentFolder()}>Refresh</Button></div>}
        <FileToolbar
          selectedCount={selectedCount}
          selectedFile={selectedFile}
          selectedFavorite={Boolean(selectedFile && browser.favorites.includes(selectedFile.id))}
          isSelectionBusy={selectedIsBusy}
          canPreviewSelected={Boolean(selectedFile && browser.canPreviewFile(selectedFile))}
          canMoveSelected={browser.canMove}
          canCopySelected={browser.canCopy}
          canTrashSelected={browser.canTrash}
          onPreviewSelected={() => selectedFile && void browser.openPreview(selectedFile)}
          onToggleFavoriteSelected={() => selectedFile && void browser.toggleFavorite(selectedFile)}
          onMoveSelected={() => selectedFile && setDestinationAction({ action: "move", file: selectedFile, key: crypto.randomUUID() })}
          onCopySelected={() => selectedFile && setDestinationAction({ action: "copy", file: selectedFile, key: crypto.randomUUID() })}
          onTrashSelected={() => selectedFile && setTrashFile(selectedFile)}
          onNewFolder={() => setNewFolderOpen(true)}
          canCreateFolder={browser.canCreateFolder}
          isCreatingFolder={browser.isCreatingFolder}
          canUpload={browser.canUpload}
          onUploadFiles={browser.uploadFiles}
          onRefresh={browser.refreshCurrentFolder}
          isRefreshing={isRefreshing}
          onClearSelection={browser.clearSelection}
          query={browser.query} onQueryChange={browser.setQuery}
          sortBy={browser.sortBy} onSortChange={browser.setSortBy}
          sortDirection={browser.sortDirection} onSortDirectionChange={() => browser.setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
          view={browser.view} onViewChange={browser.setView}
        />
        <p className={cx("-mt-3 text-xs text-muted-foreground")}>Search and sorting apply to the items loaded in this folder.</p>
        {browser.operationFeedback && <p className={cx("rounded-lg border px-3 py-2 text-sm", browser.operationFeedback.type === "error" ? "border-destructive/30 text-destructive" : "border-primary/30 text-foreground")} role={browser.operationFeedback.type === "error" ? "alert" : "status"} aria-live="polite">{browser.operationFeedback.message}</p>}
        <UploadQueue items={browser.uploadQueue.items} concurrency={browser.uploadQueue.concurrency} onCancel={browser.cancelUpload} onRetry={browser.retryUpload} onClearFinished={browser.clearFinishedUploads} />

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
            favorites={browser.favorites}
            onSelect={browser.toggleSelect}
            onSelectAll={browser.selectAll}
            onOpenFolder={browser.openFolder}
            onPreview={(file) => void browser.openPreview(file)}
            onRename={setRenameFile}
            onDownload={(file) => void browser.downloadObject(file)}
            onMove={(file) => setDestinationAction({ action: "move", file, key: crypto.randomUUID() })}
            onCopy={(file) => setDestinationAction({ action: "copy", file, key: crypto.randomUUID() })}
            onTrash={setTrashFile}
            onToggleFavorite={(id) => { const file = browser.currentFiles.find((item) => item.id === id); if (file) void browser.toggleFavorite(file); }}
            allowFavorites
            capabilities={{ download: browser.canDownload, preview: browser.canPreviewFile, rename: browser.canRename, move: browser.canMove, copy: browser.canCopy, trash: browser.canTrash }}
            mutatingIds={browser.mutatingIds}
            canCreateFolder={browser.canCreateFolder}
            onCreateFolder={() => setNewFolderOpen(true)}
          />
          {browser.paginationError && <p className={cx("text-sm text-destructive")} role="alert">{browser.paginationError}</p>}
          {browser.nextCursor && browser.paginationStatus !== "error" && <div className={cx("flex justify-center")}><Button variant="outline" onClick={() => void browser.loadMore()} disabled={browser.paginationStatus === "loading"} aria-busy={browser.paginationStatus === "loading"}>{browser.paginationStatus === "loading" ? "Loading more…" : "Load more"}</Button></div>}
          {browser.paginationStatus === "error" && <Button variant="ghost" onClick={() => void browser.loadMore()}>Try loading more again</Button>}
        </>}
      </section>
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={handleCreateFolder} />
      <RenameDialog open={Boolean(renameFile)} onOpenChange={(open) => { if (!open) setRenameFile(null); }} file={renameFile} onRename={handleRename} />
      <FolderDestinationDialog
        key={destinationAction?.key}
        open={Boolean(destinationAction)}
        onOpenChange={(open) => { if (!open) setDestinationAction(null); }}
        storageId={browser.storageId}
        source={destinationAction?.file}
        action={destinationAction?.action}
        isAllowed={destinationAction?.action === "move" ? browser.canMove : browser.canCopy}
        onConfirm={handleDestination}
      />
      <StorageFilePreviewDialog preview={browser.preview} onOpenChange={(open) => { if (!open) browser.closePreview(); }} onDownload={(file) => void browser.downloadObject(file)} maxTextPreviewBytes={browser.maxTextPreviewBytes} />
      <DeleteDialog open={Boolean(trashFile)} onOpenChange={(open) => { if (!open) setTrashFile(null); }} file={trashFile} permanent={false} isPending={Boolean(trashFile && browser.mutatingIds.has(trashFile.objectId))} onDelete={() => void handleTrash()} />
    </div>
  );
}

export default FileBrowser;
