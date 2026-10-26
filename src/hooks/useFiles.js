import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFilesData } from "../context/FilesProvider";

export default function useFiles() {
  const data = useFilesData();
  const { files: allFiles } = data;
  const activeFiles = useMemo(() => allFiles.filter((file) => !file.trashedAt), [allFiles]);
  const trashFiles = useMemo(() => allFiles.filter((file) => file.trashedAt), [allFiles]);
  const files = activeFiles;
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
    if (id) data.recordAccess(id);
    setSearchParams(id ? { folder: id } : {});
  }, [data.recordAccess, setSearchParams]);

  const toggleSelect = useCallback((id) => setSelection((current) => {
    const ids = current.folderId === currentFolderId ? current.ids : [];
    return { folderId: currentFolderId, ids: ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id] };
  }), [currentFolderId]);

  const selectAll = useCallback(() => setSelection((current) => {
    const ids = current.folderId === currentFolderId ? current.ids : [];
    const allSelected = currentFiles.length > 0 && currentFiles.every((file) => ids.includes(file.id));
    return { folderId: currentFolderId, ids: allSelected ? ids.filter((id) => !currentFiles.some((file) => file.id === id)) : [...new Set([...ids, ...currentFiles.map((file) => file.id)])] };
  }), [currentFiles, currentFolderId]);

  const createFolder = useCallback((name) => data.createFolder(currentFolderId, name), [data.createFolder, currentFolderId]);
  const remove = useCallback((ids) => {
    data.trash(ids);
    setSelection((current) => ({ ...current, ids: current.ids.filter((id) => !ids.includes(id)) }));
    if (ids.includes(currentFolderId)) navigateFolder(null);
  }, [data.trash, currentFolderId, navigateFolder]);

  const recentFiles = useMemo(() => data.recent.map((entry) => ({ ...activeFiles.find((file) => file.id === entry.id), accessedAt: entry.accessedAt })).filter((file) => file.id), [data.recent, activeFiles]);
  const favoriteFiles = useMemo(() => activeFiles.filter((file) => data.favorites.includes(file.id)), [activeFiles, data.favorites]);

  return { files, allFiles, trashFiles, currentFolderId, currentFiles, breadcrumbs, selectedIds, query, setQuery, sortBy, setSortBy, sortDirection, setSortDirection, view, setView, favorites: data.favorites, favoriteFiles, recent: data.recent, recentFiles, toggleFavorite: data.toggleFavorite, recordAccess: data.recordAccess, restore: data.restore, permanentlyDelete: data.permanentlyDelete, navigateFolder, toggleSelect, selectAll, createFolder, addUploadedFile: data.addUploadedFile, rename: data.rename, remove, clearSelection: () => setSelection({ folderId: currentFolderId, ids: [] }) };
}
