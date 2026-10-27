import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Files, FolderClock, HardDrive, Heart, RefreshCw, Share2, ShieldCheck, Trash2, UploadCloud, Users } from "lucide-react";
import { getPageInfo } from "../components/navigation/navigation";
import { Button } from "../components/ui/button";
import { cx } from "../utils/cx";
import { useFilesData } from "../context/FilesProvider";
import { useStorage } from "../hooks/useStorage";
import { useDemoFiles } from "../hooks/useFiles";
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

function DashboardPage({ browser, openFile, navigate }) {
  const sharedCount = browser.files.filter((file) => file.sharedWith || file.sharedByMe).length;
  const stats = [
    { icon: Files, label: "My files", value: browser.files.filter((file) => file.type === "file").length, hint: "Files in this demo workspace" },
    { icon: Heart, label: "Favorites", value: browser.favoriteFiles.length, hint: "Saved for quick access" },
    { icon: Share2, label: "Shared", value: sharedCount, hint: "Sample sharing records" },
    { icon: Trash2, label: "Trash", value: browser.trashFiles.length, hint: "Items awaiting review" },
  ];
  return <div className={cx("flex flex-col gap-8")}>
    <PageHeading eyebrow="Workspace overview" title="Good to see you" description="A quick look at your files and recent activity." action={<Button onClick={() => navigate("/files")}><Files data-icon="inline-start" />Browse files</Button>} />
    <div className={cx("grid gap-3 sm:grid-cols-2 xl:grid-cols-4")}>{stats.map((item) => <StatCard key={item.label} {...item} />)}</div>
    <section className={cx("flex flex-col gap-4")}>
      <div className={cx("flex items-end justify-between gap-3")}><div><h2 className={cx("text-lg font-semibold")}>Recently opened</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Pick up where you left off.</p></div><Button variant="ghost" size="sm" onClick={() => navigate("/recent")}>View all<FolderClock /></Button></div>
      <DemoFileGrid files={browser.recentFiles.slice(0, 3)} mode="recent" emptyTitle="Nothing here yet" emptyDescription="Open a file or folder to see it in Recent." onOpen={openFile} />
    </section>
    <div className={cx("glass-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between")}>
      <div className={cx("flex items-start gap-3")}><span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl text-primary")}><UploadCloud className={cx("size-5")} /></span><div><h2 className={cx("text-sm font-semibold")}>Keep everything organized</h2><p className={cx("mt-1 text-sm text-muted-foreground")}>Create folders or add files to this temporary demo workspace.</p></div></div>
      <Button variant="outline" onClick={() => navigate("/files")}>Open My Files</Button>
    </div>
  </div>;
}

function ListingPage({ page, browser, openFile }) {
  const path = page.to;
  const recent = path === "/recent";
  const favorites = path === "/favorites";
  const shared = path === "/shared";
  const files = recent ? browser.recentFiles : favorites ? browser.favoriteFiles : browser.files.filter((file) => file.sharedWith || file.sharedByMe);
  const descriptions = {
    "/recent": "Files and folders you opened recently in this browser session.",
    "/favorites": "Your starred items, kept in this demo session.",
    "/shared": "Sample sharing records for this workspace. Sharing links and permissions are not connected.",
  };
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Your library" title={page.label} description={descriptions[path]} />
    {shared && <div className={cx("glass-surface flex items-start gap-3 p-4")}><Users className={cx("mt-0.5 size-4 shrink-0 text-muted-foreground")} /><p className={cx("text-sm text-muted-foreground")}>These are illustrative records only. Nexora has no sharing API or access-control service configured.</p></div>}
    <DemoFileGrid files={files} mode={recent ? "recent" : shared ? "shared" : "favorites"} onFavorite={browser.toggleFavorite} onOpen={openFile} emptyTitle={recent ? "No recent activity" : favorites ? "No favorites yet" : "Nothing shared here"} emptyDescription={recent ? "Open a file or folder to see it here." : favorites ? "Use the file actions menu to add an item to Favorites." : "Shared items will appear here when sharing is configured."} />
  </div>;
}

function TrashPage({ page, browser }) {
  const [deleteFile, setDeleteFile] = useState(null);
  return <div className={cx("flex flex-col gap-6")}>
    <PageHeading eyebrow="Recently deleted" title={page.label} description="Restore items to their original folders or permanently remove them from this demo workspace." />
    <div className={cx("glass-surface flex items-start gap-3 p-4")}><Trash2 className={cx("mt-0.5 size-4 shrink-0 text-muted-foreground")} /><p className={cx("text-sm text-muted-foreground")}>Deleting from My Files moves items here. Permanent deletion only removes local demo state; no remote storage is involved.</p></div>
    <DemoFileGrid files={browser.trashFiles} mode="trash" onOpen={() => {}} onRestore={(file) => browser.restore([file.id])} onDelete={setDeleteFile} emptyTitle="Trash is empty" emptyDescription="Items you delete from My Files will show up here." />
    <DeleteDialog open={Boolean(deleteFile)} onOpenChange={(open) => { if (!open) setDeleteFile(null); }} count={1} permanent onDelete={() => { browser.permanentlyDelete([deleteFile.id]); setDeleteFile(null); }} />
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
      <div className={cx("flex items-start gap-3")}><Activity className={cx("mt-0.5 size-4 text-muted-foreground")} /><div><h2 className={cx("text-sm font-semibold")}>Workspace data</h2><p className={cx("mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground")}>Files, Favorites, Recent activity, and Trash are held in app memory. Refreshing the page clears those demo changes. Theme preference is saved locally in this browser.</p></div></div>
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
  else if (pathname === "/dashboard") screen = <DashboardPage browser={browser} openFile={openFile} navigate={navigate} />;
  else if (["/recent", "/favorites", "/shared"].includes(pathname)) screen = <ListingPage page={page} browser={browser} openFile={openFile} />;
  else if (pathname === "/trash") screen = <TrashPage page={page} browser={browser} />;
  else if (pathname === "/storage") screen = <StoragePage page={page} navigate={navigate} />;
  else if (pathname === "/settings") screen = <SettingsPage page={page} />;

  return <>
    {screen}
    <FilePreviewDialog file={previewFile} open={Boolean(previewFile)} onOpenChange={(open) => { if (!open) setPreviewFile(null); }} />
  </>;
}
