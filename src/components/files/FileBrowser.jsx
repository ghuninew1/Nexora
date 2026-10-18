import { useCallback, useRef, useState, useEffect } from "react";

import DragDropOverlay from "./DragDropOverlay";
import initialFiles from "../../data/files";
import FileBreadcrumbs from "./FileBreadcrumbs";
import FileToolbar from "./FileToolbar";
import FileList from "./FileList";
import NewFolderDialog from "./NewFolderDialog";
import RenameDialog from "./RenameDialog";
import DeleteDialog from "./DeleteDialog";
import UploadQueue from "./UploadQueue";
import useUploadQueue from "../../hooks/useUploadQueue";
import getUniqueFileName from "../../utils/getUniqueFileName";

function FileBrowser() {
  const [files, setFiles] = useState(initialFiles);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFile, setRenameFile] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const currentFiles = files.filter((file) => file.parentId === currentFolderId);

  const handleUploadComplete = useCallback(
    (item) => {
      setFiles((current) => {
        const existingNames = current
          .filter((file) => file.parentId === currentFolderId)
          .map((file) => file.name);

        const name = getUniqueFileName(item.name, existingNames);

        const file = {
          id: crypto.randomUUID(),
          parentId: currentFolderId,
          name,
          type: "file",
          extension: name.includes(".") ? name.split(".").pop() : undefined,
          modified: "Just now",
          size: `${Math.max(1, Math.round(item.file.size / 1024))} KB`,
        };

        return [...current, file];
      });
    },
    [currentFolderId],
  );

  const {
    items: uploadItems,
    totalFiles,
    completedFiles,
    totalBytes,
    uploadedBytes,
    progress,
    speed,
    elapsed,
    isCompleted,
    addFiles,
  } = useUploadQueue({
    onComplete: handleUploadComplete,
  });

  function getBreadcrumbs() {
    const breadcrumbs = [];
    let folderId = currentFolderId;

    while (folderId) {
      const folder = files.find((file) => file.id === folderId);

      if (!folder) {
        break;
      }

      breadcrumbs.unshift({
        id: folder.id,
        label: folder.name,
      });

      folderId = folder.parentId;
    }

    return [
      {
        id: null,
        label: "Home",
      },
      ...breadcrumbs,
    ];
  }

  function handleSelect(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
  }

  function handleSelectAll() {
    setSelectedIds((current) =>
      current.length === currentFiles.length ? [] : currentFiles.map((file) => file.id),
    );
  }

  function handleOpenFolder(id) {
    setCurrentFolderId(id);
    setSelectedIds([]);
  }

  function handleBreadcrumbClick(id) {
    setCurrentFolderId(id);
    setSelectedIds([]);
  }

  function handleCreateFolder(name) {
    const folder = {
      id: crypto.randomUUID(),
      parentId: currentFolderId,
      name,
      type: "folder",
      modified: "Just now",
      size: null,
    };

    setFiles((current) => [...current, folder]);
    setNewFolderOpen(false);
  }

  function handleRename(id, name) {
    setFiles((current) => current.map((file) => (file.id === id ? { ...file, name } : file)));

    setRenameFile(null);
    setRenameOpen(false);
  }

  function handleRenameOpen() {
    if (selectedIds.length !== 1) {
      return;
    }

    const file = files.find((item) => item.id === selectedIds[0]);

    if (!file) {
      return;
    }

    setRenameFile(file);
    setRenameOpen(true);
  }

  function handleDeleteOpen() {
    if (selectedIds.length === 0) {
      return;
    }

    setDeleteOpen(true);
  }

  function handleDelete() {
    const idsToDelete = new Set(selectedIds);
    const pendingIds = [...selectedIds];

    while (pendingIds.length > 0) {
      const parentId = pendingIds.pop();

      files.forEach((file) => {
        if (file.parentId === parentId && !idsToDelete.has(file.id)) {
          idsToDelete.add(file.id);
          pendingIds.push(file.id);
        }
      });
    }

    setFiles((current) => current.filter((file) => !idsToDelete.has(file.id)));

    setSelectedIds([]);
    setDeleteOpen(false);
  }

  function handleFilesSelected(files) {
    addFiles(files);
  }

  function handleDragEnter(event) {
    event.preventDefault();

    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    dragCounterRef.current += 1;
    setDragging(true);
  }

  function handleDragOver(event) {
    event.preventDefault();

    if (event.dataTransfer.types.includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();

    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    dragCounterRef.current -= 1;

    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragging(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();

    const files = Array.from(event.dataTransfer.files);

    dragCounterRef.current = 0;
    setDragging(false);

    if (files.length > 0) {
      addFiles(files);
    }
  }

  useEffect(() => {
    function handleWindowDragLeave(event) {
      if (
        event.clientX === 0 ||
        event.clientY === 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        dragCounterRef.current = 0;
        setDragging(false);
      }
    }

    window.addEventListener("dragleave", handleWindowDragLeave);

    return () => {
      window.removeEventListener("dragleave", handleWindowDragLeave);
    };
  }, []);

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <section className="flex min-w-0 flex-col gap-6">
        <FileBreadcrumbs items={getBreadcrumbs()} onNavigate={handleBreadcrumbClick} />

        <FileToolbar
          selectedCount={selectedIds.length}
          onNewFolder={() => setNewFolderOpen(true)}
          onRename={handleRenameOpen}
          onDelete={handleDeleteOpen}
          onFilesSelected={handleFilesSelected}
        />

        <UploadQueue
          items={uploadItems}
          totalFiles={totalFiles}
          completedFiles={completedFiles}
          totalBytes={totalBytes}
          uploadedBytes={uploadedBytes}
          progress={progress}
          speed={speed}
          elapsed={elapsed}
          isCompleted={isCompleted}
        />

        <FileList
          files={currentFiles}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onOpenFolder={handleOpenFolder}
        />

        <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} onCreate={handleCreateFolder} />

        <RenameDialog
          key={renameFile?.id ?? "rename-dialog"}
          open={renameOpen}
          onOpenChange={setRenameOpen}
          file={renameFile}
          onRename={handleRename}
        />

        <DeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          count={selectedIds.length}
          onDelete={handleDelete}
        />
      </section>
      {dragging && <DragDropOverlay />}
    </div>
  );
}

export default FileBrowser;
