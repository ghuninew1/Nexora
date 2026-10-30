import { useCallback, useContext, useMemo, useState } from "react";
import initialFiles from "../data/files";
import { FilesContext, RemoteFilesContext } from "./files-context";
import { emptyFileClipboard } from "../utils/file-clipboard";
import useRemoteFilesState from "../hooks/useRemoteFilesState";

export function FilesProvider({ children }) {
  const remoteFiles = useRemoteFilesState();
  const [clipboard, setClipboard] = useState(emptyFileClipboard);
  const [files, setFiles] = useState(initialFiles);
  const [favorites, setFavorites] = useState(["documents-report", "images-logo"]);
  const [recent, setRecent] = useState([
    { id: "documents-report", accessedAt: "2026-10-27T08:00:00.000Z" },
    { id: "documents", accessedAt: "2026-10-26T10:00:00.000Z" },
    { id: "projects-report", accessedAt: "2026-10-25T11:00:00.000Z" },
  ]);

  const createFolder = useCallback((parentId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setFiles((current) => [...current, { id: crypto.randomUUID(), parentId, name: trimmed, type: "folder", modified: "Just now", modifiedAt: new Date().toISOString(), size: null }]);
  }, []);

  const addUploadedFile = useCallback(({ file, parentId, name }) => {
    setFiles((current) => {
      const existing = current.filter((item) => item.parentId === (parentId ?? null)).map((item) => item.name);
      let uniqueName = name;
      let suffix = 1;
      while (existing.includes(uniqueName)) {
        const dot = name.lastIndexOf(".");
        uniqueName = dot > 0 ? `${name.slice(0, dot)} (${suffix})${name.slice(dot)}` : `${name} (${suffix})`;
        suffix += 1;
      }
      return [...current, { id: crypto.randomUUID(), parentId: parentId ?? null, name: uniqueName, type: "file", extension: uniqueName.includes(".") ? uniqueName.split(".").pop().toLowerCase() : undefined, modified: "Just now", modifiedAt: new Date().toISOString(), size: `${Math.max(1, Math.round(file.size / 1024))} KB`, sizeBytes: file.size, sourceFile: file }];
    });
  }, []);

  const rename = useCallback((id, name) => setFiles((current) => current.map((file) => file.id === id ? { ...file, name: name.trim(), modified: "Just now", modifiedAt: new Date().toISOString() } : file)), []);

  const toggleFavorite = useCallback((id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]), []);
  const recordAccess = useCallback((id) => setRecent((current) => [{ id, accessedAt: new Date().toISOString() }, ...current.filter((entry) => entry.id !== id)].slice(0, 30)), []);

  const value = useMemo(() => ({ clipboard, setClipboard, files, favorites, recent, createFolder, addUploadedFile, rename, toggleFavorite, recordAccess }), [clipboard, files, favorites, recent, createFolder, addUploadedFile, rename, toggleFavorite, recordAccess]);
  return <FilesContext.Provider value={value}>
    <RemoteFilesContext.Provider value={remoteFiles}>{children}</RemoteFilesContext.Provider>
  </FilesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFilesData() {
  const value = useContext(FilesContext);
  if (!value) throw new Error("useFilesData must be used inside FilesProvider");
  return value;
}
