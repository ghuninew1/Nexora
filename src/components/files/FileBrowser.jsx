import ShareDialog from './ShareDialog';
import { useStorage } from '../../hooks/useStorage';
import { useEffect, useRef, useState } from "react";
import { useFilesData } from "../../context/FilesProvider";
import { emptyFileClipboard, invalidCutDestination, isEditableShortcutTarget, remainingCutClipboard } from "../../utils/file-clipboard";
import { useNavigate } from "react-router-dom";
import { AlertCircle, FolderOpen, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
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
  const { clipboard, setClipboard } = useFilesData();
  const [clipboardMessage, setClipboardMessage] = useState("");
  const pasteBusy = useRef(false);
  const { capabilities, activeStorage } = useStorage();
  const [shareFile, setShareFile] = useState(null);
  const canShare = file => Boolean(file && !activeStorage?.readOnly && !capabilities?.readOnly && capabilities?.stat && capabilities?.[file.type === "folder" ? "list" : "download"]);
  const navigate = useNavigate();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameFile, setRenameFile] = useState(null);
  const [destinationAction, setDestinationAction] = useState(null);
  const [trashFile, setTrashFile] = useState(null);
  const [bulkTrashOpen, setBulkTrashOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const selectedCount = browser.selectedIds.length;
  const selectedFile = selectedCount === 1 ? browser.currentFiles.find((file) => file.id === browser.selectedIds[0]) : null;
  const selectedFiles = browser.currentFiles.filter((file) => browser.selectedIds.includes(file.id));
  const selectedIsBusy = bulkBusy || selectedFiles.some((file) => browser.mutatingIds.has(file.objectId));
  const isLoading = browser.status === "loading";
  const isRefreshing = browser.status === "refreshing";
  const isReady = browser.status === "ready" || browser.status === "empty" || isRefreshing;

  const canPaste = Boolean(clipboard.mode && clipboard.items.length && clipboard.sourceStorageId === browser.storageId && isReady && !bulkBusy && (clipboard.mode === "copy" ? browser.canCopy : browser.canMove));
  const clearClipboard = () => { setClipboard(emptyFileClipboard()); setClipboardMessage(""); };
  const captureClipboard = (mode) => {
    if (!selectedFiles.length || selectedIsBusy || !(mode === "copy" ? browser.canCopy : browser.canMove)) return;
    setClipboard({ mode, items: selectedFiles, sourceStorageId: browser.storageId, sourceParentId: browser.folderId });
    setClipboardMessage(`${selectedFiles.length} item(s) ${mode === "copy" ? "copied" : "cut"}.`);
  };
  const paste = async () => {
    if (!canPaste || pasteBusy.current) return;
    if (clipboard.mode === "cut" && invalidCutDestination(clipboard.items, browser.folderId, browser.breadcrumbs, browser.breadcrumbsAbbreviated)) {
      setClipboardMessage("Cannot move a folder into itself, its current location, or a descendant. Navigate from My Files to verify the destination.");
      return;
    }
    if (clipboard.mode === "cut" && clipboard.sourceParentId === browser.folderId) {
      setClipboardMessage("Items are already in this folder.");
      return;
    }
    pasteBusy.current = true;
    setBulkBusy(true);
    const snapshot = clipboard;
    try {
      if (snapshot.mode === "cut") {
        const result = await browser.moveObjects(snapshot.items, browser.folderId);
        const succeeded = new Set(result.succeeded || []);
        setClipboard((current) => remainingCutClipboard(current, snapshot, [...succeeded]));
        if (succeeded.size) browser.removeFromSelection([...succeeded]);
        setClipboardMessage("");
      } else {
        let succeeded = 0;
        const errors = [];
        for (const item of snapshot.items) {
          const result = await browser.copyObject(item, browser.folderId);
          if (result.ok) succeeded += 1;
          else errors.push(`${item.name}: ${result.error || "error"}`);
          if (result.error === "UNAUTHENTICATED") break;
        }
        setClipboardMessage(errors.length ? `${succeeded} copied; ${errors.length} failed. ${errors.slice(0, 3).join(" ")}` : `${succeeded} item(s) copied.`);
      }
    } finally { pasteBusy.current = false; setBulkBusy(false); }
  };
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (isEditableShortcutTarget(target) || document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (event.key === "Escape") { if (clipboard.mode && !pasteBusy.current) { event.preventDefault(); clearClipboard(); } return; }
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "c" && selectedFiles.length && browser.canCopy && !selectedIsBusy) { event.preventDefault(); captureClipboard("copy"); }
      if (key === "x" && selectedFiles.length && browser.canMove && !selectedIsBusy) { event.preventDefault(); captureClipboard("cut"); }
      if (key === "v" && canPaste) { event.preventDefault(); void paste(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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

  async function handleDestination(parentId, onProgress) {
    if (!destinationAction) return { error: "INVALID_INPUT" };
    const isBulk = Array.isArray(destinationAction.file);
    const result = isBulk
      ? await browser.moveObjects(destinationAction.file, parentId, onProgress)
      : destinationAction.action === "move"
        ? await browser.moveObject(destinationAction.file, parentId)
        : await browser.copyObject(destinationAction.file, parentId);
    if (result.ok) {
      if (destinationAction.action === "move") {
        if (isBulk) browser.removeFromSelection(result.succeeded);
        else browser.clearSelection();
      }
      setDestinationAction(null);
    }
    return result;
  }

  async function handleBulkTrash() {
    if (bulkBusy || !selectedFiles.length) return;
    setBulkBusy(true);
    setBulkProgress({ completed: 0, total: selectedFiles.length });
    try {
      const result = await browser.trashObjects(selectedFiles, (completed, total) => {
        setBulkProgress({ completed, total });
      });
      if (result.succeeded?.length) browser.removeFromSelection(result.succeeded);
      setBulkTrashOpen(false);
    } finally {
      setBulkBusy(false);
      setBulkProgress(null);
    }
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
          canPaste={canPaste}
          onClipboardCopy={() => captureClipboard("copy")}
          onClipboardCut={() => captureClipboard("cut")}
          onPaste={() => void paste()}
          onRenameSelected={() => selectedFile && setRenameFile(selectedFile)}
          canRenameSelected={browser.canRename}
          selectedFile={selectedFile}
          isSelectionBusy={selectedIsBusy}
          selectedFavorite={Boolean(selectedFile && browser.favorites.includes(selectedFile.id))}
          canPreviewSelected={Boolean(selectedFile && browser.canPreviewFile(selectedFile))}
          canMoveSelected={browser.canMove}
          canCopySelected={browser.canCopy}
          canShareSelected={canShare(selectedFile)}
          onShareSelected={() => selectedFile && setShareFile({ file: selectedFile, storageId: browser.storageId, folderId: browser.folderId })}
          canTrashSelected={browser.canTrash}
          onPreviewSelected={() => selectedFile && void browser.openPreview(selectedFile)}
          onToggleFavoriteSelected={() => selectedFile && void browser.toggleFavorite(selectedFile)}
          onMoveSelected={() => selectedFiles.length && setDestinationAction({ action: "move", file: selectedFiles.length > 1 ? selectedFiles : selectedFile, key: crypto.randomUUID() })}
          onCopySelected={() => selectedFile && setDestinationAction({ action: "copy", file: selectedFile, key: crypto.randomUUID() })}
          onTrashSelected={() => selectedCount > 1 ? setBulkTrashOpen(true) : selectedFile && setTrashFile(selectedFile)}
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
        {clipboardMessage && <p className={cx("text-sm text-muted-foreground")} role="status" aria-live="polite">{clipboardMessage}</p>}
        {clipboard.mode && clipboard.sourceStorageId !== browser.storageId && <p className={cx("text-sm text-muted-foreground")} role="status">Paste is unavailable across storages.</p>}
        {browser.operationFeedback && <p className={cx("rounded-lg border px-3 py-2 text-sm", browser.operationFeedback.type === "error" ? "border-destructive/30 text-destructive" : "border-primary/30 text-foreground")} role={browser.operationFeedback.type === "error" ? "alert" : "status"} aria-live="polite">{browser.operationFeedback.message}</p>}
        <UploadQueue items={browser.uploadQueue.items} concurrency={browser.uploadQueue.concurrency} onCancel={browser.cancelUpload} onRetry={browser.retryUpload} onClearFinished={browser.clearFinishedUploads} />

        {isLoading && <FileListLoading />}
        {browser.status === "unavailable" && <div className={cx("glass-surface flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between")} role="alert"><div className={cx("flex items-start gap-3")}><AlertCircle className={cx("mt-0.5 size-5 shrink-0 text-destructive")} aria-hidden="true" /><div><h2 className={cx("text-sm font-semibold")}>Storage is not ready</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>{browser.error || "No active storage is available for this account."}</p></div></div><Button variant="outline" onClick={() => navigate("/storage")}>View storage</Button></div>}
        {browser.status === "error" && <div className={cx("glass-surface flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between")} role="alert"><div className={cx("flex items-start gap-3")}><AlertCircle className={cx("mt-0.5 size-5 shrink-0 text-destructive")} aria-hidden="true" /><div><h2 className={cx("text-sm font-semibold")}>Could not load this folder</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>{browser.error}</p></div></div><div className={cx("flex gap-2")}><Button variant="outline" onClick={() => void browser.refreshCurrentFolder()}>Try again</Button>{browser.folderId && <Button variant="ghost" onClick={browser.navigateRoot}><FolderOpen />My Files</Button>}</div></div>}
        {isReady && <>
          <div aria-live="polite" aria-atomic="true" className={cx("sr-only")}>{isRefreshing ? "Refreshing folder contents" : `${browser.items.length} items loaded`}</div>
          <FileList
            files={browser.currentFiles}
            cutIds={clipboard.mode === "cut" && clipboard.sourceStorageId === browser.storageId ? clipboard.items.map((item) => item.objectId) : []}
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
            onShare={(file) => setShareFile({ file, storageId: browser.storageId, folderId: browser.folderId })}
            onTrash={setTrashFile}
            onToggleFavorite={(id) => { const file = browser.currentFiles.find((item) => item.id === id); if (file) void browser.toggleFavorite(file); }}
            allowFavorites
            capabilities={{ share: canShare, download: browser.canDownload, preview: browser.canPreviewFile, rename: browser.canRename, move: browser.canMove, copy: browser.canCopy, trash: browser.canTrash }}
            mutatingIds={browser.mutatingIds}
            canCreateFolder={browser.canCreateFolder}
            onCreateFolder={() => setNewFolderOpen(true)}
          />
          {browser.paginationError && <p className={cx("text-sm text-destructive")} role="alert">{browser.paginationError}</p>}
          {browser.nextCursor && browser.paginationStatus !== "error" && <div className={cx("flex justify-center")}><Button variant="outline" onClick={() => void browser.loadMore()} disabled={browser.paginationStatus === "loading"} aria-busy={browser.paginationStatus === "loading"}>{browser.paginationStatus === "loading" ? "Loading more…" : "Load more"}</Button></div>}
          {browser.paginationStatus === "error" && <Button variant="ghost" onClick={() => void browser.loadMore()}>Try loading more again</Button>}
        </>}
      </section>
      {shareFile && shareFile.storageId === browser.storageId && shareFile.folderId === browser.folderId && <ShareDialog key={`${shareFile.storageId}:${shareFile.file.objectId}`} file={shareFile.file} storageId={shareFile.storageId} onClose={() => setShareFile(null)} />}
      {newFolderOpen && <NewFolderDialog open onOpenChange={setNewFolderOpen} onCreate={handleCreateFolder} />}
      <RenameDialog open={Boolean(renameFile)} onOpenChange={(open) => { if (!open) setRenameFile(null); }} file={renameFile} onRename={handleRename} />
      <FolderDestinationDialog
        key={destinationAction?.key}
        open={Boolean(destinationAction)}
        onOpenChange={(open) => { if (!open) setDestinationAction(null); }}
        storageId={browser.storageId}
        source={destinationAction?.file}
        action={destinationAction?.action}
        isAllowed={destinationAction?.action === "move" ? browser.canMove : browser.canCopy}
        canCreateFolder={browser.canCreateFolder}
        onCreateFolder={browser.createFolder}
        onConfirm={handleDestination}
      />
      <StorageFilePreviewDialog preview={browser.preview} onOpenChange={(open) => { if (!open) browser.closePreview(); }} onDownload={(file) => void browser.downloadObject(file)} maxTextPreviewBytes={browser.maxTextPreviewBytes} />
      <DeleteDialog open={Boolean(trashFile)} onOpenChange={(open) => { if (!open) setTrashFile(null); }} file={trashFile} permanent={false} isPending={Boolean(trashFile && browser.mutatingIds.has(trashFile.objectId))} onDelete={() => void handleTrash()} />
      <Dialog open={bulkTrashOpen} onOpenChange={(open) => { if (!bulkBusy) setBulkTrashOpen(open); }}>
        <DialogContent aria-busy={bulkBusy}>
          <DialogHeader><DialogTitle>Move {selectedFiles.length} items to Trash?</DialogTitle><DialogDescription>Folders and their contents will be moved to Trash. Items are processed independently, so some may succeed if others fail.</DialogDescription></DialogHeader>
          {bulkBusy && <p className={cx("text-sm text-muted-foreground")} role="status" aria-live="polite">Moving to Trash {bulkProgress?.completed ?? 0} of {bulkProgress?.total ?? selectedFiles.length}…</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={bulkBusy} onClick={() => setBulkTrashOpen(false)}>Cancel</Button><Button type="button" variant="destructive" disabled={bulkBusy || !browser.canTrash} onClick={() => void handleBulkTrash()}>{bulkBusy ? "Working…" : "Move to Trash"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FileBrowser;
