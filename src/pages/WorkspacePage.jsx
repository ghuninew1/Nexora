import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Activity, Download, Eye, File, FileText, Files, Folder, FolderClock, HardDrive, Heart, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck, Star, Trash2 } from "lucide-react";
import { getPageInfo } from "../components/navigation/navigation";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { getStorageCapabilities, listStorageTrash, StorageApiError } from "../services/storage";
import { useAuth } from "../hooks/useAuth";
import { cx } from "../utils/cx";
import { useStorage } from "../hooks/useStorage";
import useFiles from "../hooks/useFiles";
import ThemeToggle from "../theme/ThemeToggle";
import DeleteDialog from "../components/files/DeleteDialog";
import StorageFilePreviewDialog from "../components/files/StorageFilePreviewDialog";
import { MAX_TEXT_PREVIEW_BYTES } from "../utils/storage-preview";
import UploadPreferences from "../components/settings/UploadPreferences";
import AdminMaintenance from "../components/settings/AdminMaintenance";
import AdminStorageOverview from "../components/storage/AdminStorageOverview";
import { usePreferences } from "../hooks/usePreferences";
import { selectDefaultStorage } from "../utils/default-storage";

function PageHeading({ eyebrow, title, description, action }) {
  return <div className={cx("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between")}>
    <div className={cx("min-w-0")}>
      {eyebrow && <p className={cx("text-xs font-medium uppercase tracking-widest text-muted-foreground")}>{eyebrow}</p>}
      <h1 className={cx("mt-1 text-2xl font-semibold tracking-tight sm:text-3xl")}>{title}</h1>
      <p className={cx("mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground")}>{description}</p>
    </div>
    {action}
  </div>;
}

function StatCard({ icon: Icon, label, value, hint }) {
  return <article className={cx("glass-surface flex min-w-0 items-start gap-4 p-4 sm:p-5")}>
    <span className={cx("glass-control flex size-11 shrink-0 items-center justify-center rounded-xl text-primary")}><Icon className={cx("size-5")} aria-hidden="true" /></span>
    <div className={cx("min-w-0")}><p className={cx("text-sm text-muted-foreground")}>{label}</p><p className={cx("mt-1 text-2xl font-semibold tracking-tight")}>{value}</p><p className={cx("mt-1 text-xs text-muted-foreground")}>{hint}</p></div>
  </article>;
}

function formatRelativeAccess(value) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Time unavailable";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const units = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
  let amount = seconds;
  let unit = "second";
  for (const [threshold, nextUnit] of units) {
    if (Math.abs(amount) < threshold) { unit = nextUnit; break; }
    amount /= threshold;
    unit = nextUnit;
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(amount), unit);
}

function RecentItemRow({ item, browser, compact = false }) {
  const isFolder = item.type === "folder";
  const isCurrentStorage = item.storageId === browser.storageId;
  const isFavorite = browser.favorites.some((favorite) => favorite.storageId === item.storageId && favorite.objectId === item.objectId);
  const isPending = browser.mutatingIds.has(item.objectId);
  const canPreview = isCurrentStorage && !isFolder && browser.canPreviewFile(item);
  const Icon = isFolder ? Folder : item.mimeType === "application/pdf" ? FileText : File;
  return <article className={cx("glass-surface flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between")}>
    <div className={cx("flex min-w-0 items-start gap-3")}>
      <span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl", isFolder ? "text-amber-700 dark:text-amber-300" : "text-primary")}><Icon className={cx("size-5")} aria-hidden="true" /></span>
      <div className={cx("min-w-0 flex-1")}>
        <p className={cx("truncate text-sm font-medium")}>{item.name}</p>
        <p className={cx("mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground")}>
          <span>{item.storageName} · {isFolder ? "Folder" : item.size ?? "File"}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.accessedAt} title={new Date(item.accessedAt).toLocaleString()}>{formatRelativeAccess(item.accessedAt)}</time>
        </p>
      </div>
    </div>
    <div className={cx("flex flex-wrap gap-1 sm:shrink-0")}>
      {isFolder ? <Button type="button" variant="outline" size={compact ? "sm" : "default"} disabled={!isCurrentStorage} onClick={() => browser.openRecentFolder(item)} aria-label={`Open folder ${item.name}`}><Folder data-icon="inline-start" />Open folder</Button> : <>
        {canPreview && <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => void browser.openPreview(item)} aria-label={`Preview ${item.name}`}><Eye data-icon="inline-start" />Preview</Button>}
        <Button type="button" variant="ghost" size={compact ? "sm" : "default"} disabled={!isCurrentStorage || !browser.canDownload || isPending} onClick={() => void browser.downloadObject(item)} aria-label={`Download ${item.name}`}><Download data-icon="inline-start" />Download</Button>
        {item.parentId !== undefined && <Button type="button" variant="ghost" size={compact ? "sm" : "default"} disabled={!isCurrentStorage} onClick={() => browser.openContainingFolder(item)} aria-label={`Open containing folder for ${item.name}`}>Open folder</Button>}
      </>}
      <Button type="button" variant="ghost" size="icon-lg" className={cx("min-h-11 min-w-11 shrink-0", isFavorite && "text-amber-500")} disabled={isPending} onClick={() => void browser.toggleFavorite(item)} aria-label={`${isFavorite ? "Remove" : "Add"} ${item.name} ${isFavorite ? "from" : "to"} Favorites`} aria-pressed={isFavorite} title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}><Star className={cx(isFavorite && "fill-amber-400")} aria-hidden="true" /></Button>
    </div>
  </article>;
}

function RecentPanel({ browser, items, compact = false, emptyTitle = "Nothing here yet" }) {
  if (["loading", "refreshing", "idle"].includes(browser.recentStatus)) return <div className={cx("glass-surface flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground")} role="status" aria-live="polite"><LoaderCircle className={cx("size-4 animate-spin motion-reduce:animate-none")} />Loading Recent activity…</div>;
  if (browser.recentStatus === "error") return <div className={cx("glass-surface flex flex-col items-start gap-3 p-5")} role="alert"><p className={cx("text-sm text-destructive")}>{browser.recentError}</p><Button type="button" variant="outline" onClick={() => void browser.refreshRecent()}>Try again<RefreshCw /></Button></div>;
  if (items.length === 0) return <div className={cx("glass-surface flex min-h-40 flex-col items-center justify-center px-6 text-center")}><h2 className={cx("text-sm font-semibold")}>{emptyTitle}</h2><p className={cx("mt-1 max-w-sm text-sm text-muted-foreground")}>Open a connected folder, preview a file, or download it to see it here.</p></div>;
  return <div className={cx("flex flex-col gap-3")}>
    {items.map((item) => <RecentItemRow key={`${item.storageId}:${item.objectId}`} item={item} browser={browser} compact={compact} />)}
    <StorageFilePreviewDialog preview={browser.preview} onOpenChange={(open) => { if (!open) browser.closePreview(); }} onDownload={(file) => void browser.downloadObject(file)} maxTextPreviewBytes={MAX_TEXT_PREVIEW_BYTES} />
  </div>;
}

function formatUsage(usage) {
  if (usage.status !== "available" || usage.usedBytes === null) return "Not reported";
  const used = `${usage.usedBytes.toLocaleString()} bytes used`;
  return usage.quotaBytes === null ? used : `${used} of ${usage.quotaBytes.toLocaleString()} bytes`;
}

function DashboardPage({ navigate }) {
  const browser = useFiles();
  const { refreshRecent } = browser;
  const storage = useStorage();
  useEffect(() => { void refreshRecent(6); }, [refreshRecent]);
  const connection = storage.status === "ready" ? "Connected"
    : storage.status === "empty" ? "No active storage"
      : storage.status === "unavailable" ? "Unavailable" : "Checking…";
  const storageName = storage.activeStorage?.name ?? connection;
  const stats = [
    { icon: HardDrive, label: "Storage", value: storageName, hint: `${connection}${storage.activeStorage ? ` · ${storage.activeStorage.providerLabel}${storage.activeStorage.readOnly ? " · Read only" : ""}` : ""}` },
    { icon: Files, label: "Storage usage", value: formatUsage(storage.usage), hint: storage.usage.measuredAt ? `Measured ${new Date(storage.usage.measuredAt).toLocaleString()}` : "Reported by connected storage" },
  ];
  return <div className={cx("flex flex-col gap-8")}>
    <PageHeading eyebrow="Workspace overview" title="Good to see you" description="Your connected storage, recent access, and useful shortcuts." action={<Button type="button" onClick={() => navigate("/files")}><Files data-icon="inline-start" />Browse files</Button>} />
    {storage.status === "unavailable" && <p className={cx("rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive")} role="status">{storage.error || "Storage connection is unavailable."}</p>}
    <div className={cx("grid gap-3 sm:grid-cols-2")}>{stats.map((item) => <StatCard key={item.label} {...item} />)}</div>
    <section className={cx("flex flex-col gap-4")}>
      <div className={cx("flex flex-wrap items-end justify-between gap-3")}><div><h2 className={cx("text-lg font-semibold")}>Recently accessed</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Folders you opened and files you previewed or downloaded.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => navigate("/recent")}>View all<FolderClock /></Button></div>
      <RecentPanel browser={browser} items={browser.recentItems.slice(0, 6)} compact />
    </section>
    <section className={cx("flex flex-col gap-3")} aria-labelledby="dashboard-shortcuts-heading">
      <div><h2 id="dashboard-shortcuts-heading" className={cx("text-lg font-semibold")}>Quick links</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Go straight to the places you use most.</p></div>
      <div className={cx("flex flex-wrap gap-2")}>
        <Button type="button" variant="outline" onClick={() => navigate("/files")}><Files data-icon="inline-start" />My Files</Button>
        <Button type="button" variant="outline" onClick={() => navigate("/recent")}><FolderClock data-icon="inline-start" />Recent</Button>
        <Button type="button" variant="outline" onClick={() => navigate("/favorites")}><Star data-icon="inline-start" />Favorites</Button>
        <Button type="button" variant="outline" onClick={() => navigate("/trash")}><Trash2 data-icon="inline-start" />Trash</Button>
      </div>
    </section>
  </div>;
}

function RecentPage({ page }) {
  const browser = useFiles();
  const { refreshRecent } = browser;
  const storage = useStorage();
  useEffect(() => { void refreshRecent(); }, [refreshRecent]);
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Your library" title={page.label} description="Files and folders you explicitly accessed most recently." action={<Button type="button" variant="outline" onClick={() => void browser.refreshRecent()} disabled={["loading", "refreshing"].includes(browser.recentStatus)} aria-busy={["loading", "refreshing"].includes(browser.recentStatus)}><RefreshCw data-icon="inline-start" />Refresh</Button>} />
    {storage.status === "empty" && <div className={cx("glass-surface px-4 py-3 text-sm text-muted-foreground")} role="status">No storage assigned. Contact an administrator for access.</div>}
    <RecentPanel browser={browser} items={browser.recentItems} emptyTitle="No recent activity" />
  </div>;
}

function ListingPage({ page }) {
  const connected = useFiles();
  const files = connected.favoriteFiles;
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Your library" title={page.label} description="Your starred items from connected storage." />
    {<section className={cx("flex flex-col gap-3")} aria-label="Favorite files">
      {connected.favoritesStatus === "loading" || connected.favoritesStatus === "refreshing" ? <div className={cx("glass-surface flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground")} role="status" aria-live="polite"><LoaderCircle className={cx("size-4 animate-spin motion-reduce:animate-none")} />Loading Favorites…</div>
        : connected.favoritesStatus === "error" ? <div className={cx("glass-surface flex flex-col items-start gap-3 p-5")} role="alert"><p className={cx("text-sm text-destructive")}>{connected.favoritesError}</p><Button variant="outline" onClick={() => void connected.refreshFavorites()}>Try again<RefreshCw /></Button></div>
          : files.length === 0 ? <div className={cx("glass-surface flex min-h-64 flex-col items-center justify-center px-6 text-center")}><span className={cx("glass-control flex size-12 items-center justify-center rounded-2xl text-muted-foreground")}><Folder className={cx("size-5")} aria-hidden="true" /></span><h2 className={cx("mt-4 text-sm font-semibold")}>No favorites yet</h2><p className={cx("mt-1 max-w-sm text-sm text-muted-foreground")}>Star a connected file or folder to keep it here.</p></div>
            : files.map((file) => <article key={`${file.storageId}:${file.objectId}`} className={cx("glass-surface flex min-w-0 items-center gap-3 p-4")}>
              <span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl", file.type === "folder" ? "text-amber-700 dark:text-amber-300" : "text-primary")}>{file.type === "folder" ? <Folder className={cx("size-5")} aria-hidden="true" /> : <File className={cx("size-5")} aria-hidden="true" />}</span>
              <div className={cx("min-w-0 flex-1")}><p className={cx("truncate text-sm font-medium")}>{file.name}</p><p className={cx("mt-1 truncate text-xs text-muted-foreground")}>{file.storageName} · {file.type === "folder" ? "Folder" : file.size ?? "File"}</p></div>
              {file.type === "folder" ? <Button type="button" variant="outline" size="sm" disabled={file.storageId !== connected.storageId} onClick={() => connected.openRecentFolder(file)} aria-label={`Open folder ${file.name}`}><Folder data-icon="inline-start" />Open folder</Button>
                : file.parentId !== undefined && <Button type="button" variant="ghost" size="sm" disabled={file.storageId !== connected.storageId} onClick={() => connected.openContainingFolder(file)} aria-label={`Open containing folder for ${file.name}`}>Open folder</Button>}
              <Button type="button" variant="ghost" size="icon-lg" className={cx("min-h-11 min-w-11 shrink-0 text-amber-500")} onClick={() => void connected.toggleFavorite(file)} aria-label={`Remove ${file.name} from Favorites`} title="Remove from Favorites"><Heart className={cx("fill-amber-400")} aria-hidden="true" /></Button>
            </article>)}
    </section>}
  </div>;
}

function formatTrashSize(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return "Size unavailable";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTrashDate(value) {
  if (typeof value !== "string") return "Deletion date unavailable";
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? "Deletion date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function TrashItemRow({ file, browser, onPermanentDelete, bulkBusy = false }) {
  const Icon = file.type === "folder" ? Folder : file.mimeType === "application/pdf" ? FileText : File;
  const isPending = browser.mutatingIds.has(file.objectId);
  const details = [file.type === "folder" ? "Folder" : formatTrashSize(file.sizeBytes), formatTrashDate(file.deletedAt)];
  return <article className={cx("glass-surface flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between")}>
    <div className={cx("flex min-w-0 items-start gap-3")}>
      <span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl", file.type === "folder" ? "text-amber-700 dark:text-amber-300" : "text-primary")}><Icon className={cx("size-5")} aria-hidden="true" /></span>
      <div className={cx("min-w-0")}>
        <p className={cx("break-all text-sm font-medium text-foreground")}>{file.name}</p>
        <p className={cx("mt-1 text-xs text-muted-foreground")}>{details.join(" · ")}</p>
      </div>
    </div>
    <div className={cx("flex flex-wrap gap-2 sm:shrink-0")}>
      <Button type="button" variant="outline" className={cx("min-h-11")} onClick={() => void browser.restoreTrashObject(file)} disabled={!browser.canRestore || isPending || bulkBusy} aria-busy={isPending} aria-label={`Restore ${file.name}`}><RotateCcw aria-hidden="true" />Restore</Button>
      <Button type="button" variant="destructive" className={cx("min-h-11")} onClick={() => onPermanentDelete(file)} disabled={!browser.canPermanentDelete || isPending || bulkBusy} aria-busy={isPending} aria-label={`Permanently delete ${file.name}`}><Trash2 aria-hidden="true" />Delete permanently</Button>
    </div>
  </article>;
}

function TrashPage({ page }) {
  const browser = useFiles();
  const [deleteFile, setDeleteFile] = useState(null);
  const { expireSession } = useAuth();
  const [deleteAllItems, setDeleteAllItems] = useState(null);
  const [deleteAllStorage, setDeleteAllStorage] = useState(null);
  const [bulkStatus, setBulkStatus] = useState('idle');
  const [bulkMessage, setBulkMessage] = useState('');
  const bulkController = useRef(null);
  const scopeRef = useRef(browser.storageId);
  useEffect(() => { scopeRef.current = browser.storageId; }, [browser.storageId]);
  useEffect(() => () => { bulkController.current?.abort(); scopeRef.current = null; }, []);
  const bulkBusy = bulkStatus === 'loading' || bulkStatus === 'deleting';
  const isLoading = browser.trashStatus === "loading" || (browser.trashStatus === "refreshing" && browser.trashItems.length === 0);

  async function handlePermanentDelete() {
    if (!deleteFile) return;
    const result = await browser.permanentlyDeleteTrashObject(deleteFile);
    if (result.ok) setDeleteFile(null);
  }

  async function prepareDeleteAll() {
    if (bulkBusy || !browser.storageId || !browser.canPermanentDelete) return;
    const storageId = browser.storageId;
    const controller = new AbortController();
    bulkController.current = controller;
    setBulkStatus('loading');
    setBulkMessage('');
    try {
      const items = new Map();
      const cursors = new Set();
      let cursor = null;
      do {
        const page = await listStorageTrash(storageId, { cursor, limit: 50, signal: controller.signal });
        if (controller.signal.aborted || scopeRef.current !== storageId) return;
        page.items.forEach((item) => items.set(item.objectId, item));
        cursor = page.nextCursor;
        if (cursor && (cursors.has(cursor) || cursors.size >= 10000 || items.size > 10000)) throw new Error('Trash listing is too large or did not finish.');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      if (items.size) { setDeleteAllStorage(storageId); setDeleteAllItems([...items.values()]); }
      else setBulkMessage('Trash is empty.');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof StorageApiError && error.status === 401) expireSession();
      else setBulkMessage('Could not load all Trash items. No items were deleted.');
    } finally {
      if (bulkController.current === controller) { bulkController.current = null; setBulkStatus('idle'); }
    }
  }

  async function handleDeleteAll() {
    if (!deleteAllItems?.length || bulkBusy || deleteAllStorage !== browser.storageId) return;
    const storageId = browser.storageId;
    const controller = new AbortController();
    bulkController.current = controller;
    setBulkStatus('deleting');
    let succeeded = 0;
    let failed = 0;
    for (const file of deleteAllItems) {
      if (controller.signal.aborted || scopeRef.current !== storageId) break;
      const result = await browser.permanentlyDeleteTrashObject(file);
      if (result.ok) succeeded += 1;
      else failed += 1;
      if (result.error === 'UNAUTHENTICATED') break;
    }
    if (!controller.signal.aborted && scopeRef.current === storageId) {
      setDeleteAllItems(null);
      setBulkMessage(`${succeeded} permanently deleted${failed ? `; ${failed} failed. Refresh Trash and try again.` : '.'}`);
      await browser.refreshTrash();
    }
    if (bulkController.current === controller) { bulkController.current = null; setBulkStatus('idle'); }
  }

  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Recently deleted" title={page.label} description="Restore items or permanently delete them from connected storage." action={<div className={cx("flex flex-wrap gap-2")}><Button type="button" variant="outline" onClick={() => void browser.refreshTrash()} disabled={bulkBusy || isLoading || ["no-storage", "unavailable", "unsupported"].includes(browser.trashStatus)} aria-busy={isLoading}><RefreshCw data-icon="inline-start" />{isLoading ? "Refreshing…" : "Refresh"}</Button><Button type="button" variant="destructive" onClick={() => void prepareDeleteAll()} disabled={bulkBusy || isLoading || !browser.canPermanentDelete || !browser.trashItems.length || browser.trashStatus !== "ready"} aria-busy={bulkStatus === "loading"}><Trash2 />{bulkStatus === "loading" ? "Loading Trash…" : "Delete permanently all"}</Button></div>} />
    {browser.trashStatus === "no-storage" && <div className={cx("glass-surface p-5")} role="status"><h2 className={cx("text-sm font-semibold")}>No connected storage</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Connect an active storage mount to view Trash.</p></div>}
    {browser.trashStatus === "unsupported" && <div className={cx("glass-surface p-5")} role="status"><h2 className={cx("text-sm font-semibold")}>Trash is unavailable</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>This storage does not report Trash, Restore, or Permanent Delete support.</p></div>}
    {browser.trashStatus === "unavailable" && <div className={cx("glass-surface p-5")} role="alert"><h2 className={cx("text-sm font-semibold")}>Storage is unavailable</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>{browser.error || "Storage could not be reached. Try again later."}</p></div>}
    {isLoading && <div className={cx("glass-surface flex min-h-40 items-center justify-center gap-3 p-5 text-sm text-muted-foreground")} role="status" aria-live="polite" aria-busy="true"><LoaderCircle className={cx("size-5 animate-spin motion-reduce:animate-none")} aria-hidden="true" />Loading Trash…</div>}
    {browser.trashStatus === "error" && <div className={cx("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4")} role="alert"><p className={cx("text-sm text-destructive")}>{browser.trashError || "Trash could not be loaded."}</p><Button type="button" variant="outline" onClick={() => void browser.refreshTrash()}>Try again</Button></div>}
    {browser.trashError && browser.trashStatus !== "error" && <p className={cx("rounded-lg border border-border bg-card/70 px-3 py-2 text-sm text-muted-foreground")} role="status">Could not refresh Trash. Showing the last loaded items.</p>}
    {bulkMessage && <p className={cx("rounded-lg border border-border px-3 py-2 text-sm")} role="status" aria-live="polite">{bulkMessage}</p>}
    {browser.operationFeedback && !bulkMessage && <p className={cx("rounded-lg border px-3 py-2 text-sm", browser.operationFeedback.type === "error" ? "border-destructive/30 text-destructive" : "border-primary/30 text-foreground")} role={browser.operationFeedback.type === "error" ? "alert" : "status"} aria-live="polite">{browser.operationFeedback.message}</p>}
    {browser.trashStatus === "empty" && <div className={cx("glass-surface flex min-h-56 flex-col items-center justify-center px-6 text-center")}><span className={cx("glass-control flex size-12 items-center justify-center rounded-2xl text-muted-foreground")}><Trash2 className={cx("size-5")} aria-hidden="true" /></span><h2 className={cx("mt-4 text-sm font-semibold")}>Trash is empty.</h2></div>}
    {(browser.trashStatus === "ready" || browser.trashStatus === "refreshing") && <>
      <div className={cx("flex flex-col gap-3")} aria-label="Items in Trash">{browser.trashItems.map((file) => <TrashItemRow key={file.objectId} file={file} browser={browser} onPermanentDelete={setDeleteFile} bulkBusy={bulkBusy} />)}</div>
      {browser.trashPaginationError && <p className={cx("text-sm text-destructive")} role="alert">{browser.trashPaginationError}</p>}
      {browser.trashNextCursor && <div className={cx("flex justify-center")}><Button type="button" variant="outline" onClick={() => void browser.loadMoreTrash()} disabled={bulkBusy || browser.trashPaginationStatus === "loading"} aria-busy={browser.trashPaginationStatus === "loading"}>{browser.trashPaginationStatus === "loading" ? "Loading more…" : "Load more"}</Button></div>}
    </>}
    <Dialog open={Boolean(deleteAllItems && deleteAllStorage === browser.storageId)} onOpenChange={(open) => { if (!open && !bulkBusy) setDeleteAllItems(null); }}>
      <DialogContent aria-busy={bulkStatus === 'deleting'}>
        <DialogHeader><DialogTitle>Permanently delete all {deleteAllItems?.length ?? 0} items?</DialogTitle><DialogDescription>This permanently deletes the listed Trash items and any contents of trashed folders. This cannot be undone. Items added after this list was loaded are not included.</DialogDescription></DialogHeader>
        {bulkStatus === 'deleting' && <p className={cx('text-sm text-muted-foreground')} role="status">Deleting items…</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={bulkBusy} onClick={() => setDeleteAllItems(null)}>Cancel</Button><Button type="button" variant="destructive" disabled={bulkBusy || !browser.canPermanentDelete} onClick={() => void handleDeleteAll()}>{bulkBusy ? 'Deleting…' : 'Delete permanently all'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <DeleteDialog open={Boolean(deleteFile)} onOpenChange={(open) => { if (!open) setDeleteFile(null); }} file={deleteFile} permanent isPending={Boolean(deleteFile && browser.mutatingIds.has(deleteFile.objectId))} onDelete={() => void handlePermanentDelete()} />
  </div>;
}

function StoragePage({ page }) {
  const { status, storages, activeStorage, capabilities, error, refresh } = useStorage();
  const { user, expireSession } = useAuth();
  const { preferences, status: preferencesStatus } = usePreferences();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const selected = storages.find((item) => item.storageId === selectedId);
  const retryController = useRef(null);
  const [retryId, setRetryId] = useState(null);
  const [retryError, setRetryError] = useState('');
  useEffect(() => () => retryController.current?.abort(), []);
  const effective = selectDefaultStorage(storages, null, preferences?.defaultStorageId);
  const preferred = storages.find(item => item.storageId === preferences?.defaultStorageId);
  const assignmentDefault = storages.find(item => item.isDefault);
  const visible = storages.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()) && (filter === "all" || filter === item.connectionStatus));
  async function retryStorage(item) {
    retryController.current?.abort();
    const controller = new AbortController();
    retryController.current = controller;
    setRetryId(item.storageId); setRetryError('');
    try {
      await getStorageCapabilities(item.storageId, { signal: controller.signal });
      if (!controller.signal.aborted) await refresh();
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof StorageApiError && failure.status === 401) expireSession();
        else setRetryError(failure?.message || 'Connection check failed. Try again.');
      }
    } finally { if (!controller.signal.aborted) setRetryId(null); }
  }
  const capabilityLabels = [["list", "Browse"], ["stat", "Read metadata"], ["download", "Download"], ["upload", "Upload"], ["createFolder", "Create folders"], ["rename", "Rename"], ["move", "Move"], ["copy", "Copy"], ["trash", "Trash"], ["restore", "Restore"], ["permanentDelete", "Permanent delete"]];
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Connections" title={page.label} description="Review the storages assigned to your account." action={<Button variant="outline" onClick={() => void refresh()} disabled={status === "loading"} aria-busy={status === "loading"}><RefreshCw data-icon="inline-start" />{status === "loading" ? "Refreshing…" : "Refresh"}</Button>} />
    {user?.role === "admin" && <AdminStorageOverview />}
    {status === "loading" && <div className={cx("glass-surface p-5 text-sm text-muted-foreground")} role="status">Loading storage information…</div>}
    {status === "unavailable" && <div className={cx("glass-surface p-5 text-sm text-destructive")} role="alert">{error || "Storage information could not be loaded."} <Button variant="outline" onClick={() => void refresh()}>Retry</Button></div>}
    {status !== "loading" && (status !== "unavailable" || storages.length > 0) && <>
      <div className={cx("grid gap-3 sm:grid-cols-2 xl:grid-cols-4")}>
        <StatCard icon={HardDrive} label="Assigned storages" value={storages.length} hint="Active storages visible to your account" />
        <StatCard icon={ShieldCheck} label="Connected" value={storages.filter(item => item.connectionStatus === "connected").length} hint="Capability response received" />
        <StatCard icon={HardDrive} label="Unavailable" value={storages.filter(item => item.connectionStatus === "unavailable").length} hint="Capability check failed" />
        <StatCard icon={HardDrive} label="Unknown" value={storages.filter(item => !["connected", "unavailable"].includes(item.connectionStatus)).length} hint="No recognized connection result" />
      </div>
      <section className={cx("glass-surface p-5 sm:p-6")} aria-labelledby="usage-overview-title"><h2 id="usage-overview-title" className={cx("font-semibold")}>Storage usage</h2><p className={cx("mt-2 text-sm text-muted-foreground")}>Unavailable — the backend does not report an authorized project usage aggregate. Used space, active and Trash usage, file count and last updated are not reported.</p><p className={cx("mt-2 text-xs text-muted-foreground")}>Assigned storages can refer to the same project. No combined usage is calculated.</p></section>
      <section className={cx("glass-surface p-5 sm:p-6")}><h2 className={cx("font-semibold")}>Storage defaults</h2><div className={cx("mt-3 grid gap-3 text-sm sm:grid-cols-3")}><p>Assignment default: <span className={cx("text-muted-foreground")}>{assignmentDefault?.name || 'None assigned'}</span></p><p>User preferred: <span className={cx("text-muted-foreground")}>{preferencesStatus !== 'ready' ? 'Unknown' : preferred?.name || (preferences?.defaultStorageId ? 'Unavailable' : 'Not set')}</span></p><p>Effective default: <span className={cx("text-muted-foreground")}>{preferencesStatus !== 'ready' ? 'Unknown' : effective?.name || 'None'}</span></p></div><p className={cx("mt-2 text-xs text-muted-foreground")}>An accessible route selection takes precedence while browsing. Change your preference in Settings; no files are moved.</p></section>
      <section className={cx("glass-surface p-5 sm:p-6")}>
        <div className={cx("flex flex-wrap items-end justify-between gap-3")}><div><h2 className={cx("font-semibold")}>Assigned storages</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Connection reflects capability discovery, not a full provider health check.</p></div>{user?.role === "admin" && <Button variant="outline" onClick={() => navigate("/admin/users")}>Manage user access</Button>}</div>
        <div className={cx("mt-5 grid gap-3 sm:grid-cols-2")}><label className={cx("flex flex-col gap-1 text-sm")}>Search storage<input className={cx("glass-control min-h-11 rounded-lg px-3")} value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={cx("flex flex-col gap-1 text-sm")}>Connection status<select className={cx("glass-control min-h-11 rounded-lg px-3")} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="connected">Connected</option><option value="unavailable">Unavailable</option><option value="unknown">Unknown</option></select></label></div>
        {storages.length === 0 ? <p className={cx("mt-5 text-sm text-muted-foreground")}>No active storage assigned. Contact an administrator for access.</p> : visible.length === 0 ? <p className={cx("mt-5 text-sm text-muted-foreground")}>No storages match your search and filter.</p> : <div className={cx("mt-5 grid gap-3")}>{visible.map((item) => <article key={item.storageId} className={cx("flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4")}><div className={cx("min-w-0")}><h3 className={cx("break-words font-medium")}>{item.name} {item.isDefault && <span className={cx("rounded-full bg-primary/15 px-2 py-1 text-xs text-primary")}>Assigned default</span>}</h3><p className={cx("mt-1 text-sm text-muted-foreground")}>{item.providerLabel} · {item.connectionStatus} · Usage unavailable</p></div><div className={cx("flex flex-wrap gap-2")}>{item.connectionStatus === "unavailable" && <Button variant="outline" disabled={Boolean(retryId)} onClick={() => void retryStorage(item)}>{retryId === item.storageId ? "Checking…" : "Retry connection"}</Button>}<Button variant="outline" onClick={() => setSelectedId(item.storageId)}>Details</Button></div></article>)}</div>}
        {retryError && <p role="alert" className={cx("mt-3 text-sm text-destructive")}>{retryError}</p>}
      </section>
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}><DialogContent className={cx("max-h-[90dvh] overflow-y-auto")}><DialogHeader><DialogTitle>{selected?.name || "Storage details"}</DialogTitle><DialogDescription>Information reported for this assigned storage.</DialogDescription></DialogHeader>{selected && <div className={cx("grid gap-3 text-sm")}><p>Storage ID: <span className={cx("break-all text-muted-foreground")}>{selected.storageId}</span></p><p>Description: {selected.description || "Not provided"}</p><p>Provider: {selected.providerLabel}</p><p>Connection: {selected.connectionStatus}</p><p>Assigned default: {selected.isDefault ? "Yes" : "No"}</p><p>Usage: Unavailable</p><p>File count: Not reported</p><p>Last updated: Not reported</p><p className={cx("text-muted-foreground")}>Last successful connection check and response time are not reported.</p>{selected.storageId === activeStorage?.storageId && capabilities && <div><h3 className={cx("font-medium")}>Effective capabilities</h3><ul className={cx("mt-2 flex flex-wrap gap-2")}>{capabilityLabels.map(([key, label]) => <li key={key} className={cx("rounded-full border border-border px-2 py-1 text-xs")}>{label}: {capabilities[key] ? "Available" : "Unavailable"}</li>)}</ul></div>}</div>}</DialogContent></Dialog>
  </div>;
}

function SettingsPage({ page }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Preferences" title={page.label} description="Adjust the appearance of this workspace." />
    <section className={cx("glass-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between")}>
      <div><h2 className={cx("text-sm font-semibold")}>Appearance</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Choose light, dark, or follow your system preference.</p></div><ThemeToggle />
    </section>
    <UploadPreferences />
    {user?.role === 'admin' && <><section className={cx('glass-surface flex flex-wrap items-center justify-between gap-3 p-5')}><div><h2 className={cx('font-semibold')}>Administration · Users</h2><p className={cx('mt-1 text-sm text-muted-foreground')}>Create and manage user accounts.</p></div><Button variant="outline" onClick={() => navigate('/admin/users')}>Manage users</Button></section><AdminMaintenance /></>}
    <section className={cx("glass-surface p-5")}>
      <div className={cx("flex items-start gap-3")}><Activity className={cx("mt-0.5 size-4 text-muted-foreground")} /><div><h2 className={cx("text-sm font-semibold")}>Workspace data</h2><p className={cx("mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground")}>Dashboard, Recent, Favorites, File Browser, and Trash use connected Nexora data where available. Shared manages persistent public links; account preferences are stored with your account.</p></div></div>
    </section>
  </div>;
}

export default function WorkspacePage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const page = getPageInfo(pathname);
  let screen;
  if (!page) screen = <section className={cx("glass-surface p-8 text-center")}><h1 className={cx("text-xl font-semibold")}>Page not found</h1><Button variant="outline" className={cx("mt-4")} onClick={() => navigate("/files")}>Back to My Files</Button></section>;
  else if (pathname === "/dashboard") screen = <DashboardPage navigate={navigate} />;
  else if (pathname === "/recent") screen = <RecentPage page={page} />;
  else if (pathname === "/favorites") screen = <ListingPage page={page} />;
  else if (pathname === "/trash") screen = <TrashPage page={page} />;
  else if (pathname === "/storage") screen = <StoragePage page={page} navigate={navigate} />;
  else if (pathname === "/settings") screen = <SettingsPage page={page} />;

  return screen;
}
