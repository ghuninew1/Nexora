import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Download, Eye, File, FileText, Files, Folder, FolderClock, HardDrive, Heart, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck, Star, Trash2, Users } from "lucide-react";
import { getPageInfo } from "../components/navigation/navigation";
import { Button } from "../components/ui/button";
import { cx } from "../utils/cx";
import { useFilesData } from "../context/FilesProvider";
import { useStorage } from "../hooks/useStorage";
import useFiles, { useDemoFiles } from "../hooks/useFiles";
import ThemeToggle from "../theme/ThemeToggle";
import DemoFileGrid from "../components/files/DemoFileGrid";
import FilePreviewDialog from "../components/files/FilePreviewDialog";
import DeleteDialog from "../components/files/DeleteDialog";

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
      <span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl text-primary")}><Icon className={cx("size-5")} aria-hidden="true" /></span>
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
        <Button type="button" variant="outline" size={compact ? "sm" : "default"} disabled={!canPreview} onClick={() => void browser.openPreview(item)} aria-label={`Preview ${item.name}`}><Eye data-icon="inline-start" />Preview</Button>
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
  return <div className={cx("flex flex-col gap-3")}>{items.map((item) => <RecentItemRow key={`${item.storageId}:${item.objectId}`} item={item} browser={browser} compact={compact} />)}</div>;
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
    {storage.status === "empty" && <div className={cx("glass-surface px-4 py-3 text-sm text-muted-foreground")} role="status">No active storage mount is connected.</div>}
    <RecentPanel browser={browser} items={browser.recentItems} emptyTitle="No recent activity" />
  </div>;
}

function ListingPage({ page, browser, openFile }) {
  const connected = useFiles();
  const path = page.to;
  const favorites = path === "/favorites";
  const shared = path === "/shared";
  const files = favorites ? connected.favoriteFiles : browser.files.filter((file) => file.sharedWith || file.sharedByMe);
  const descriptions = {
    "/favorites": "Your starred items from connected storage.",
    "/shared": "Sample sharing records for this workspace. Sharing links and permissions are not connected.",
  };
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Your library" title={page.label} description={descriptions[path]} />
    {shared && <div className={cx("glass-surface flex items-start gap-3 p-4")}><Users className={cx("mt-0.5 size-4 shrink-0 text-muted-foreground")} /><p className={cx("text-sm text-muted-foreground")}>These are illustrative records only. Nexora has no sharing API or access-control service configured.</p></div>}
    {favorites ? <section className={cx("flex flex-col gap-3")} aria-label="Favorite files">
      {connected.favoritesStatus === "loading" || connected.favoritesStatus === "refreshing" ? <div className={cx("glass-surface flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground")} role="status" aria-live="polite"><LoaderCircle className={cx("size-4 animate-spin motion-reduce:animate-none")} />Loading Favorites…</div>
        : connected.favoritesStatus === "error" ? <div className={cx("glass-surface flex flex-col items-start gap-3 p-5")} role="alert"><p className={cx("text-sm text-destructive")}>{connected.favoritesError}</p><Button variant="outline" onClick={() => void connected.refreshFavorites()}>Try again<RefreshCw /></Button></div>
          : files.length === 0 ? <div className={cx("glass-surface flex min-h-64 flex-col items-center justify-center px-6 text-center")}><span className={cx("glass-control flex size-12 items-center justify-center rounded-2xl text-muted-foreground")}><Folder className={cx("size-5")} aria-hidden="true" /></span><h2 className={cx("mt-4 text-sm font-semibold")}>No favorites yet</h2><p className={cx("mt-1 max-w-sm text-sm text-muted-foreground")}>Star a connected file or folder to keep it here.</p></div>
            : files.map((file) => <article key={`${file.storageId}:${file.objectId}`} className={cx("glass-surface flex min-w-0 items-center gap-3 p-4")}>
              <span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl text-primary")}>{file.type === "folder" ? <Folder className={cx("size-5")} aria-hidden="true" /> : <File className={cx("size-5")} aria-hidden="true" />}</span>
              <div className={cx("min-w-0 flex-1")}><p className={cx("truncate text-sm font-medium")}>{file.name}</p><p className={cx("mt-1 truncate text-xs text-muted-foreground")}>{file.storageName} · {file.type === "folder" ? "Folder" : file.size ?? "File"}</p></div>
              <Button type="button" variant="ghost" size="icon-lg" className={cx("min-h-11 min-w-11 shrink-0 text-amber-500")} onClick={() => void connected.toggleFavorite(file)} aria-label={`Remove ${file.name} from Favorites`} title="Remove from Favorites"><Heart className={cx("fill-amber-400")} aria-hidden="true" /></Button>
            </article>)}
    </section> : <DemoFileGrid files={files} mode="shared" onOpen={openFile} emptyTitle="Nothing shared here" emptyDescription="Shared items will appear here when sharing is configured." />}
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

function TrashItemRow({ file, browser, onPermanentDelete }) {
  const Icon = file.type === "folder" ? Folder : file.mimeType === "application/pdf" ? FileText : File;
  const isPending = browser.mutatingIds.has(file.objectId);
  const details = [file.type === "folder" ? "Folder" : formatTrashSize(file.sizeBytes), formatTrashDate(file.deletedAt)];
  return <article className={cx("glass-surface flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between")}>
    <div className={cx("flex min-w-0 items-start gap-3")}>
      <span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl text-primary")}><Icon className={cx("size-5")} aria-hidden="true" /></span>
      <div className={cx("min-w-0")}>
        <p className={cx("break-all text-sm font-medium text-foreground")}>{file.name}</p>
        <p className={cx("mt-1 text-xs text-muted-foreground")}>{details.join(" · ")}</p>
      </div>
    </div>
    <div className={cx("flex flex-wrap gap-2 sm:shrink-0")}>
      <Button type="button" variant="outline" className={cx("min-h-11")} onClick={() => void browser.restoreTrashObject(file)} disabled={!browser.canRestore || isPending} aria-busy={isPending} aria-label={`Restore ${file.name}`}><RotateCcw aria-hidden="true" />Restore</Button>
      <Button type="button" variant="destructive" className={cx("min-h-11")} onClick={() => onPermanentDelete(file)} disabled={!browser.canPermanentDelete || isPending} aria-busy={isPending} aria-label={`Permanently delete ${file.name}`}><Trash2 aria-hidden="true" />Delete permanently</Button>
    </div>
  </article>;
}

function TrashPage({ page }) {
  const browser = useFiles();
  const [deleteFile, setDeleteFile] = useState(null);
  const isLoading = browser.trashStatus === "loading" || (browser.trashStatus === "refreshing" && browser.trashItems.length === 0);

  async function handlePermanentDelete() {
    if (!deleteFile) return;
    const result = await browser.permanentlyDeleteTrashObject(deleteFile);
    if (result.ok) setDeleteFile(null);
  }

  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Recently deleted" title={page.label} description="Restore items or permanently delete them from connected storage." action={<Button type="button" variant="outline" onClick={() => void browser.refreshTrash()} disabled={isLoading || ["no-storage", "unavailable", "unsupported"].includes(browser.trashStatus)} aria-busy={isLoading}><RefreshCw data-icon="inline-start" />{isLoading ? "Refreshing…" : "Refresh"}</Button>} />
    {browser.trashStatus === "no-storage" && <div className={cx("glass-surface p-5")} role="status"><h2 className={cx("text-sm font-semibold")}>No connected storage</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Connect an active storage mount to view Trash.</p></div>}
    {browser.trashStatus === "unsupported" && <div className={cx("glass-surface p-5")} role="status"><h2 className={cx("text-sm font-semibold")}>Trash is unavailable</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>This storage does not report Trash, Restore, or Permanent Delete support.</p></div>}
    {browser.trashStatus === "unavailable" && <div className={cx("glass-surface p-5")} role="alert"><h2 className={cx("text-sm font-semibold")}>Storage is unavailable</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>{browser.error || "Storage could not be reached. Try again later."}</p></div>}
    {isLoading && <div className={cx("glass-surface flex min-h-40 items-center justify-center gap-3 p-5 text-sm text-muted-foreground")} role="status" aria-live="polite" aria-busy="true"><LoaderCircle className={cx("size-5 animate-spin motion-reduce:animate-none")} aria-hidden="true" />Loading Trash…</div>}
    {browser.trashStatus === "error" && <div className={cx("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4")} role="alert"><p className={cx("text-sm text-destructive")}>{browser.trashError || "Trash could not be loaded."}</p><Button type="button" variant="outline" onClick={() => void browser.refreshTrash()}>Try again</Button></div>}
    {browser.trashError && browser.trashStatus !== "error" && <p className={cx("rounded-lg border border-border bg-card/70 px-3 py-2 text-sm text-muted-foreground")} role="status">Could not refresh Trash. Showing the last loaded items.</p>}
    {browser.operationFeedback && <p className={cx("rounded-lg border px-3 py-2 text-sm", browser.operationFeedback.type === "error" ? "border-destructive/30 text-destructive" : "border-primary/30 text-foreground")} role={browser.operationFeedback.type === "error" ? "alert" : "status"} aria-live="polite">{browser.operationFeedback.message}</p>}
    {browser.trashStatus === "empty" && <div className={cx("glass-surface flex min-h-56 flex-col items-center justify-center px-6 text-center")}><span className={cx("glass-control flex size-12 items-center justify-center rounded-2xl text-muted-foreground")}><Trash2 className={cx("size-5")} aria-hidden="true" /></span><h2 className={cx("mt-4 text-sm font-semibold")}>Trash is empty.</h2></div>}
    {(browser.trashStatus === "ready" || browser.trashStatus === "refreshing") && <>
      <div className={cx("flex flex-col gap-3")} aria-label="Items in Trash">{browser.trashItems.map((file) => <TrashItemRow key={file.objectId} file={file} browser={browser} onPermanentDelete={setDeleteFile} />)}</div>
      {browser.trashPaginationError && <p className={cx("text-sm text-destructive")} role="alert">{browser.trashPaginationError}</p>}
      {browser.trashNextCursor && <div className={cx("flex justify-center")}><Button type="button" variant="outline" onClick={() => void browser.loadMoreTrash()} disabled={browser.trashPaginationStatus === "loading"} aria-busy={browser.trashPaginationStatus === "loading"}>{browser.trashPaginationStatus === "loading" ? "Loading more…" : "Load more"}</Button></div>}
    </>}
    <DeleteDialog open={Boolean(deleteFile)} onOpenChange={(open) => { if (!open) setDeleteFile(null); }} file={deleteFile} permanent isPending={Boolean(deleteFile && browser.mutatingIds.has(deleteFile.objectId))} onDelete={() => void handlePermanentDelete()} />
  </div>;
}

function StoragePage({ page }) {
  const storage = useStorage();
  const { status, activeStorage, capabilities, usage, error, refresh } = storage;
  const statusLabel = status === "ready" ? "Connected" : status === "loading" ? "Checking connection" : status === "empty" ? "No active storage" : "Unavailable";
  const description = status === "ready"
    ? "Nexora can reach this storage through its secure server-side connection. File Browser content and upload progress are still demo data."
    : status === "empty"
      ? "No active storage mount is available for this account. File Browser content and upload progress remain demo data."
      : status === "unavailable"
        ? (error || "Storage could not be reached. Try refreshing the connection.")
        : "Checking the storage mount assigned to this account.";
  const capabilityLabels = [
    ["list", "Browse"], ["stat", "Read metadata"], ["upload", "Upload"], ["download", "Download"], ["createFolder", "Create folders"],
    ["rename", "Rename"], ["move", "Move"], ["copy", "Copy"], ["trash", "Trash"], ["restore", "Restore"],
    ["permanentDelete", "Permanent delete"], ["preview", "Preview"], ["share", "Share"], ["rangeRead", "Range reads"],
  ];
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Connections" title={page.label} description="Review storage connection status for this Nexora workspace." />
    <section className={cx("glass-surface p-5 sm:p-6")}>
      <div className={cx("flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between")}>
        <div className={cx("flex items-start gap-4")}><span className={cx("glass-control flex size-12 shrink-0 items-center justify-center rounded-xl text-muted-foreground")}><HardDrive className={cx("size-5")} /></span><div><div className={cx("flex flex-wrap items-center gap-2")}><h2 className={cx("text-base font-semibold")}>{activeStorage?.name || "Storage provider"}</h2><span className={cx("rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground")} role="status" aria-live="polite">{statusLabel}</span></div><p className={cx("mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground")}>{description}</p></div></div>
        <Button variant="outline" onClick={() => void refresh()} disabled={status === "loading"} aria-busy={status === "loading"}><RefreshCw data-icon="inline-start" />{status === "loading" ? "Checking…" : "Refresh connection"}</Button>
      </div>
      <div className={cx("mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-3")}>
        <div><p className={cx("text-xs text-muted-foreground")}>Storage type</p><p className={cx("mt-1 text-sm font-medium")}>{activeStorage?.providerLabel || "Unavailable"}</p></div>
        <div><p className={cx("text-xs text-muted-foreground")}>Usage</p><p className={cx("mt-1 text-sm font-medium")}>{usage.status === "available" && usage.usedBytes !== null ? `${usage.usedBytes.toLocaleString()} bytes used` : "Not reported"}</p></div>
        <div><p className={cx("text-xs text-muted-foreground")}>Access</p><p className={cx("mt-1 text-sm font-medium")}>{activeStorage ? (activeStorage.readOnly ? "Read only" : "Read and write") : "Not available"}</p></div>
      </div>
      {status === "ready" && capabilities && <div className={cx("mt-5 border-t border-border pt-5")}>
        <div className={cx("flex flex-wrap items-baseline justify-between gap-2")}><h3 className={cx("text-sm font-semibold")}>Storage capabilities</h3><p className={cx("text-xs text-muted-foreground")}>Reported by the connected storage service</p></div>
        <ul className={cx("mt-3 flex flex-wrap gap-2")} aria-label="Storage capabilities">
          {capabilityLabels.map(([key, label]) => <li key={key} className={cx("rounded-full border px-2.5 py-1 text-xs", capabilities[key] ? "border-primary/30 bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
            {label}: {capabilities[key] ? "Available" : "Unavailable"}
          </li>)}
          {capabilities.readOnly && <li className={cx("rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground")}>Read only</li>}
        </ul>
      </div>}
    </section>
    <div className={cx("glass-surface flex items-start gap-3 p-4")}><ShieldCheck className={cx("mt-0.5 size-4 shrink-0 text-muted-foreground")} /><p className={cx("text-sm text-muted-foreground")}>Provider credentials and file operations belong on a reviewed server-side integration. They are not stored in this frontend.</p></div>
  </div>;
}

function SettingsPage({ page }) {
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Preferences" title={page.label} description="Adjust the appearance of this workspace." />
    <section className={cx("glass-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between")}>
      <div><h2 className={cx("text-sm font-semibold")}>Appearance</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Choose light, dark, or follow your system preference.</p></div><ThemeToggle />
    </section>
    <section className={cx("glass-surface p-5")}>
      <div className={cx("flex items-start gap-3")}><Activity className={cx("mt-0.5 size-4 text-muted-foreground")} /><div><h2 className={cx("text-sm font-semibold")}>Workspace data</h2><p className={cx("mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground")}>Dashboard, Recent, Favorites, File Browser, and Trash use connected Nexora data where available. Shared remains an illustrative page; Theme preference is saved locally in this browser.</p></div></div>
    </section>
  </div>;
}

export default function WorkspacePage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const page = getPageInfo(pathname);
  const browser = useDemoFiles();
  const { recordAccess } = useFilesData();
  const [previewFile, setPreviewFile] = useState(null);
  const openFile = (file) => {
    if (file.type === "folder") {
      recordAccess(file.id);
      navigate("/files", { state: { fileBrowserNotice: "This sample folder is not part of connected storage. Showing My Files." } });
      return;
    }
    recordAccess(file.id);
    setPreviewFile(file);
  };
  let screen;
  if (!page) screen = <section className={cx("glass-surface p-8 text-center")}><h1 className={cx("text-xl font-semibold")}>Page not found</h1><Button variant="outline" className={cx("mt-4")} onClick={() => navigate("/files")}>Back to My Files</Button></section>;
  else if (pathname === "/dashboard") screen = <DashboardPage navigate={navigate} />;
  else if (pathname === "/recent") screen = <RecentPage page={page} />;
  else if (["/favorites", "/shared"].includes(pathname)) screen = <ListingPage page={page} browser={browser} openFile={openFile} />;
  else if (pathname === "/trash") screen = <TrashPage page={page} />;
  else if (pathname === "/storage") screen = <StoragePage page={page} navigate={navigate} />;
  else if (pathname === "/settings") screen = <SettingsPage page={page} />;

  return <>
    {screen}
    <FilePreviewDialog file={previewFile} open={Boolean(previewFile)} onOpenChange={(open) => { if (!open) setPreviewFile(null); }} />
  </>;
}
