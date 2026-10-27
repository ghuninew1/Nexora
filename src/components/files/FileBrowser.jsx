import { useCallback, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cx } from "../../utils/cx";
import useFiles from "../../hooks/useFiles";
import useUploadQueue from "../../hooks/useUploadQueue";
import DragDropOverlay from "./DragDropOverlay";
import FileBreadcrumbs from "./FileBreadcrumbs";
import FileToolbar from "./FileToolbar";
import FileList from "./FileList";
import NewFolderDialog from "./NewFolderDialog";
import RenameDialog from "./RenameDialog";
import DeleteDialog from "./DeleteDialog";
import FilePreviewDialog from "./FilePreviewDialog";
import UploadQueue from "./UploadQueue";

function downloadLocalFile(file) {
  if (!file?.sourceFile) return;
  const url = URL.createObjectURL(file.sourceFile);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FileBrowser() {
  const browser = useFiles();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameFile, setRenameFile] = useState(null);
  const [deleteIds, setDeleteIds] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const { addUploadedFile } = browser;
  const handleUploadComplete = useCallback((item) => addUploadedFile(item), [addUploadedFile]);
  const queue = useUploadQueue({ onComplete: handleUploadComplete });
  const selectedFiles = browser.files.filter((file) => browser.selectedIds.includes(file.id));

  const handleFilesSelected = (files) => queue.addFiles(files, { parentId: browser.currentFolderId });
  const handleRename = (id, name) => {
    const renamed = browser.rename(id, name);
    if (!renamed) return false;
    setRenameFile(null);
    return true;
  };
  const confirmDelete = () => {
    browser.remove(deleteIds);
    setDeleteIds([]);
  };

  function handleDragEnter(event) {
    event.preventDefault();
    if (!event.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current += 1;
    setDragging(true);
  }
  function handleDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) event.dataTransfer.dropEffect = "copy";
  }
  function handleDragLeave(event) {
    event.preventDefault();
    if (!event.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false); }
  }
  function handleDrop(event) {
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer.files);
    dragCounterRef.current = 0;
    setDragging(false);
    if (droppedFiles.length) handleFilesSelected(droppedFiles);
  }

  useEffect(() => {
    function handleWindowDragLeave(event) {
      if (event.clientX === 0 || event.clientY === 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
        dragCounterRef.current = 0;
        setDragging(false);
      }
    }
    window.addEventListener("dragleave", handleWindowDragLeave);
    return () => window.removeEventListener("dragleave", handleWindowDragLeave);
  }, []);

  return (
    <div className={cx("relative")} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <section className={cx("flex min-w-0 flex-col gap-5")}>
        <h1 className={cx("sr-only")}>My Files</h1>
        <div className={cx("flex flex-wrap items-center justify-between gap-3")}>
          <FileBreadcrumbs items={browser.breadcrumbs} onNavigate={browser.navigateFolder} />
          <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground")}><Info className={cx("size-3.5")} aria-hidden="true" />Demo files · changes are temporary</span>
        </div>
        <FileToolbar
          selectedCount={browser.selectedIds.length}
          onNewFolder={() => setNewFolderOpen(true)}
          onRename={() => setRenameFile(selectedFiles[0] ?? null)}
          onDelete={() => setDeleteIds(browser.selectedIds)}
          onFilesSelected={handleFilesSelected}
          query={browser.query} onQueryChange={browser.setQuery}
          sortBy={browser.sortBy} onSortChange={browser.setSortBy}
          sortDirection={browser.sortDirection} onSortDirectionChange={() => browser.setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
          view={browser.view} onViewChange={browser.setView}
          canDownload={selectedFiles.length > 0 && selectedFiles.every((file) => Boolean(file.sourceFile))}
          onDownload={() => selectedFiles.forEach(downloadLocalFile)}
        />
        <UploadQueue items={queue.items} totalFiles={queue.totalFiles} completedFiles={queue.completedFiles} totalBytes={queue.totalBytes} uploadedBytes={queue.uploadedBytes} progress={queue.progress} speed={queue.speed} elapsed={queue.elapsed} isCompleted={queue.isCompleted} />
        <FileList
          files={browser.currentFiles} selectedIds={browser.selectedIds} query={browser.query}
          view={browser.view} favorites={browser.favorites}
          onSelect={browser.toggleSelect} onSelectAll={browser.selectAll}
          onOpenFolder={browser.navigateFolder} onPreview={(file) => { browser.recordAccess(file.id); setPreviewFile(file); }}
          onRename={setRenameFile} onDelete={(file) => setDeleteIds([file.id])}
          onDownload={downloadLocalFile} onToggleFavorite={browser.toggleFavorite}
        />
        <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={(name) => { const created = browser.createFolder(name); if (created) setNewFolderOpen(false); return created; }} />
        <RenameDialog key={renameFile?.id ?? "rename-dialog"} open={Boolean(renameFile)} onOpenChange={(open) => { if (!open) setRenameFile(null); }} file={renameFile} onRename={handleRename} />
        <DeleteDialog open={deleteIds.length > 0} onOpenChange={(open) => { if (!open) setDeleteIds([]); }} count={deleteIds.length} onDelete={confirmDelete} />
        <FilePreviewDialog file={previewFile} open={Boolean(previewFile)} onOpenChange={(open) => { if (!open) setPreviewFile(null); }} />
      </section>
      {dragging && <DragDropOverlay />}
    </div>
  );
}

export default FileBrowser;
