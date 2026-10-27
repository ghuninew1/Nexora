import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFilesData } from "../context/FilesProvider";
import { RemoteFilesContext } from "../context/files-context";

export function useDemoFiles() {
  const {
    files: allFiles,
    createFolder: createFolderData,
    addUploadedFile,
    rename: renameData,
    favorites,
    recent,
    toggleFavorite,
    recordAccess,
  } = useFilesData();
  const files = allFiles;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFolderId = searchParams.get("folder");
  const currentFolderId = files.some((file) => file.id === requestedFolderId && file.type === "folder")
    ? requestedFolderId
    : null;
  const [selection, setSelection] = useState({ folderId: null, ids: [] });
  const selectedIds = selection.folderId === currentFolderId ? selection.ids : [];
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [view, setView] = useState("list");

  useEffect(() => {
    if (requestedFolderId && !currentFolderId) setSearchParams({}, { replace: true });
  }, [requestedFolderId, currentFolderId, setSearchParams]);

  const currentFiles = useMemo(() => {
    const filtered = files.filter((file) => file.parentId === currentFolderId
      && file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return [...filtered].sort((a, b) => {
      const left = sortBy === "size" ? (a.sizeBytes ?? -1) : sortBy === "modified" ? (a.modifiedAt ?? "") : a.name.toLocaleLowerCase();
      const right = sortBy === "size" ? (b.sizeBytes ?? -1) : sortBy === "modified" ? (b.modifiedAt ?? "") : b.name.toLocaleLowerCase();
      const order = typeof left === "string" ? left.localeCompare(right) : left - right;
      return sortDirection === "asc" ? order : -order;
    });
  }, [files, currentFolderId, query, sortBy, sortDirection]);

  const breadcrumbs = useMemo(() => {
    const items = [];
    let folder = files.find((file) => file.id === currentFolderId);
    while (folder) {
      items.unshift({ id: folder.id, label: folder.name });
      folder = files.find((file) => file.id === folder.parentId);
    }
    return [{ id: null, label: "My Files" }, ...items];
  }, [files, currentFolderId]);

  const navigateFolder = useCallback((id) => {
    setSelection({ folderId: id ?? null, ids: [] });
    if (id) recordAccess(id);
    setSearchParams(id ? { folder: id } : {});
  }, [recordAccess, setSearchParams]);

  const toggleSelect = useCallback((id) => setSelection((current) => {
    const ids = current.folderId === currentFolderId ? current.ids : [];
    return { folderId: currentFolderId, ids: ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id] };
  }), [currentFolderId]);

  const selectAll = useCallback(() => setSelection((current) => {
    const ids = current.folderId === currentFolderId ? current.ids : [];
    const allSelected = currentFiles.length > 0 && currentFiles.every((file) => ids.includes(file.id));
    return { folderId: currentFolderId, ids: allSelected ? ids.filter((id) => !currentFiles.some((file) => file.id === id)) : [...new Set([...ids, ...currentFiles.map((file) => file.id)])] };
  }), [currentFiles, currentFolderId]);

  const createFolder = useCallback((name) => {
    const trimmed = name.trim();
    const duplicate = files.some((file) => file.parentId === currentFolderId && file.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    if (duplicate) return false;
    createFolderData(currentFolderId, trimmed);
    return true;
  }, [createFolderData, currentFolderId, files]);
  const rename = useCallback((id, name) => {
    const target = files.find((file) => file.id === id);
    if (!target) return false;
    const trimmed = name.trim();
    const duplicate = files.some((file) => file.id !== id && file.parentId === target.parentId && file.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
    if (duplicate) return false;
    renameData(id, trimmed);
    return true;
  }, [renameData, files]);
  const recentFiles = useMemo(() => recent.map((entry) => ({ ...files.find((file) => file.id === entry.id), accessedAt: entry.accessedAt })).filter((file) => file.id), [recent, files]);
  const favoriteFiles = useMemo(() => files.filter((file) => favorites.includes(file.id)), [files, favorites]);

  return { files, currentFolderId, currentFiles, breadcrumbs, selectedIds, query, setQuery, sortBy, setSortBy, sortDirection, setSortDirection, view, setView, favorites, favoriteFiles, recent, recentFiles, toggleFavorite, recordAccess, navigateFolder, toggleSelect, selectAll, createFolder, addUploadedFile, rename, clearSelection: () => setSelection({ folderId: currentFolderId, ids: [] }) };
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return null;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatModified(value) {
  if (!value) return 'Not available';
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 'Not available' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp);
}

export default function useFiles() {
  const remote = useContext(RemoteFilesContext);
  if (!remote) throw new Error('useFiles must be used inside FilesProvider');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [view, setView] = useState('list');
  const [selection, setSelection] = useState({ storageId: null, folderId: null, ids: [] });

  const files = useMemo(() => remote.items.map((item) => {
    const extension = item.type === 'file' && item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : undefined;
    return {
      id: item.objectId,
      objectId: item.objectId,
      parentId: item.parentId,
      name: item.name,
      type: item.type,
      extension,
      mimeType: item.mimeType,
      createdAt: item.createdAt,
      modifiedAt: item.modifiedAt,
      modified: formatModified(item.modifiedAt),
      sizeBytes: item.sizeBytes,
      size: item.type === 'folder' ? null : formatBytes(item.sizeBytes),
    };
  }), [remote.items]);

  const currentFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = files.filter((file) => file.name.toLocaleLowerCase().includes(normalizedQuery));
    return [...filtered].sort((a, b) => {
      const left = sortBy === 'size' ? (a.sizeBytes ?? -1) : sortBy === 'modified' ? (a.modifiedAt ?? '') : a.name.toLocaleLowerCase();
      const right = sortBy === 'size' ? (b.sizeBytes ?? -1) : sortBy === 'modified' ? (b.modifiedAt ?? '') : b.name.toLocaleLowerCase();
      const order = typeof left === 'string' ? left.localeCompare(right) : left - right;
      return sortDirection === 'asc' ? order : -order;
    });
  }, [files, query, sortBy, sortDirection]);

  const selectedIds = selection.storageId === remote.storageId && selection.folderId === remote.folderId
    ? selection.ids.filter((id) => currentFiles.some((file) => file.id === id))
    : [];
  const toggleSelect = useCallback((id) => setSelection((current) => {
    const ids = current.storageId === remote.storageId && current.folderId === remote.folderId ? current.ids : [];
    return { storageId: remote.storageId, folderId: remote.folderId, ids: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id] };
  }), [remote.storageId, remote.folderId]);
  const selectAll = useCallback(() => setSelection((current) => {
    const ids = current.storageId === remote.storageId && current.folderId === remote.folderId ? current.ids : [];
    const allSelected = currentFiles.length > 0 && currentFiles.every((file) => ids.includes(file.id));
    return { storageId: remote.storageId, folderId: remote.folderId, ids: allSelected ? ids.filter((id) => !currentFiles.some((file) => file.id === id)) : [...new Set([...ids, ...currentFiles.map((file) => file.id)])] };
  }), [currentFiles, remote.storageId, remote.folderId]);
  const clearSelection = useCallback(() => setSelection({ storageId: remote.storageId, folderId: remote.folderId, ids: [] }), [remote.storageId, remote.folderId]);
  const favorites = remote.favorites.filter((file) => file.storageId === remote.storageId).map((file) => file.objectId);
  const favoriteFiles = remote.favorites.map((item) => {
    const extension = item.type === 'file' && item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : undefined;
    return { ...item, id: item.objectId, extension, modified: formatModified(item.modifiedAt),
      size: item.type === 'folder' ? null : formatBytes(item.sizeBytes) };
  });
  const recentItems = remote.recentItems.map((item) => {
    const extension = item.type === 'file' && item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : undefined;
    return { ...item, id: item.objectId, extension, modified: formatModified(item.modifiedAt),
      size: item.type === 'folder' ? null : formatBytes(item.sizeBytes) };
  });

  return {
    ...remote,
    files,
    currentFiles,
    selectedIds,
    query,
    setQuery,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    view,
    setView,
    favorites,
    favoriteFiles,
    recentItems,
    toggleSelect,
    selectAll,
    clearSelection,
    navigateFolder: remote.openFolder,
  };
}
