import { Share2, ArrowRightLeft, Copy, File, FileImage, FileText, FileType2, FileVideo, Folder, MoreHorizontal, Download, Eye, Pencil, Star, Trash2 } from "lucide-react";
import { cx } from "../../utils/cx";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { getStoragePreviewSpec } from "../../utils/storage-preview";

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp", "ico", "heic", "heif", "tif", "tiff"]);
const videoExtensions = new Set(["mp4", "mov", "webm", "mkv", "avi", "mpeg", "mpg", "m4v", "ogv"]);
const textExtensions = new Set(["txt", "md", "markdown", "csv", "log", "json", "xml", "yaml", "yml", "toml", "ini"]);

const fileIcons = { folder: Folder, image: FileImage, video: FileVideo, pdf: FileType2, text: FileText, file: File };

function getFileIcon(file) {
  if (file.type === "folder") return "folder";
  const mime = (file.mimeType || "").split(";", 1)[0].trim().toLowerCase();
  const extension = (file.extension || file.name?.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || ["application/json", "application/xml", "application/csv"].includes(mime)) return "text";
  if (!mime || mime === "application/octet-stream") {
    if (imageExtensions.has(extension)) return "image";
    if (videoExtensions.has(extension)) return "video";
    if (extension === "pdf") return "pdf";
    if (textExtensions.has(extension)) return "text";
  }
  return "file";
}

function FileListItem({ file, isCutItem = false, selected, favorite, view, onSelect, onOpenFolder, onToggleFavorite, allowFavorites = false, capabilities = {}, readOnly = false, busy = false, onPreview, onRename, onDownload, onMove, onCopy, onShare, onTrash }) {
  const Icon = fileIcons[getFileIcon(file)];
  const isFolder = file.type === "folder";
  const canRename = Boolean(capabilities.rename && !readOnly && !busy);
  const canMove = Boolean(capabilities.move && !readOnly && !busy);
  const canCopy = Boolean(capabilities.copy && !readOnly && !busy);
  const canTrash = Boolean(capabilities.trash && !readOnly && !busy);
  const canDownload = Boolean(!isFolder && capabilities.download && !busy);
  const canPreview = Boolean(!isFolder && !busy && (capabilities.preview
    ? capabilities.preview(file)
    : canDownload && getStoragePreviewSpec(file)));
  const handleOpen = () => {
    if (isFolder) onOpenFolder(file.id);
  };
  return (
    <article className={cx(
      "group relative min-w-0 border-border transition-[background-color,border-color] duration-150",
      view === "grid" ? "grid grid-cols-1 rounded-xl border bg-card p-4" : "grid w-full items-center border-b px-4 py-3 pr-12 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_160px_100px_40px] sm:pr-4",
      !selected && "hover:border-primary/20 hover:bg-[var(--glass-surface-hover)] focus-within:bg-[var(--glass-surface-hover)]",
      selected && "bg-primary/5 ring-1 ring-inset ring-primary/30",
      isCutItem && "opacity-50",
    )}>
      <div className={cx("flex min-w-0 items-center gap-3", view === "grid" && "pr-8")}>
        <button type="button" onClick={() => onSelect(file.id)} aria-label={`${selected ? "Deselect" : "Select"} ${file.name}`} aria-pressed={selected} className={cx("flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
          <span className={cx("flex size-4 items-center justify-center rounded border text-[10px] transition-colors", selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>{selected && "✓"}</span>
        </button>
        {allowFavorites && <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className={cx("min-h-11 min-w-11 shrink-0", favorite && "text-amber-500 hover:text-amber-600")}
          onClick={() => onToggleFavorite(file.id)}
          aria-label={`${favorite ? "Remove" : "Add"} ${file.name} ${favorite ? "from" : "to"} favorites`}
          aria-pressed={favorite}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cx(favorite && "fill-amber-400 text-amber-500")} aria-hidden="true" />
        </Button>}
        <button type="button" onClick={handleOpen} disabled={!isFolder} aria-label={isFolder ? `Open folder ${file.name}` : file.name} className={cx("flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default", view === "grid" && "min-h-16")}>
          <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", isFolder ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary")}><Icon className={cx("size-5")} aria-hidden="true" /></span>
          <span className={cx("min-w-0 flex-1")}>
            <span className={cx("block truncate text-sm font-medium text-foreground")}>{file.name}</span>
            <span className={cx(view === "grid" ? "hidden" : "block truncate text-xs text-muted-foreground sm:hidden")}>{file.modified}{file.size ? ` · ${file.size}` : ""}</span>
          </span>
        </button>
      </div>
      <span className={cx(view === "grid" ? "mt-3 text-xs text-muted-foreground" : "hidden text-sm text-muted-foreground sm:block")}>{file.modified}</span>
      <span className={cx(view === "grid" ? "text-xs text-muted-foreground" : "hidden text-right text-sm text-muted-foreground sm:block")}>{file.size ?? "—"}</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={cx(view === "grid" ? "absolute right-2 top-2" : "absolute right-2 top-2 sm:static")} aria-label={`Actions for ${file.name}`}><MoreHorizontal /></Button>} />
        <DropdownMenuContent align="end" className={cx("w-auto")}>
          {!isFolder && <DropdownMenuItem disabled={!canPreview} onClick={() => onPreview?.(file)}><Eye />Preview</DropdownMenuItem>}
          {!isFolder && <DropdownMenuItem disabled={!canDownload} onClick={() => onDownload?.(file)}><Download />Download</DropdownMenuItem>}
          {allowFavorites && <DropdownMenuItem onClick={() => onToggleFavorite(file.id)}><Star />{favorite ? "Remove favorites" : "Add favorites"}</DropdownMenuItem>}
          <DropdownMenuItem disabled={!capabilities.share?.(file) || busy} onClick={() => onShare?.(file)}><Share2 />Share</DropdownMenuItem>
          <DropdownMenuItem disabled={!canRename} onClick={() => onRename?.(file)}><Pencil />Rename</DropdownMenuItem>
          <DropdownMenuItem disabled={!canMove} onClick={() => onMove?.(file)}><ArrowRightLeft />Move</DropdownMenuItem>
          <DropdownMenuItem disabled={!canCopy} onClick={() => onCopy?.(file)}><Copy />Copy</DropdownMenuItem>
          <DropdownMenuItem disabled={!canTrash} variant="destructive" onClick={() => onTrash?.(file)}><Trash2 />Move to Trash</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

export default FileListItem;
