import { File, FileCode2, FileText, Folder, Heart, Users, Eye, FolderOpen } from "lucide-react";
import { Button } from "../ui/button";
import { cx } from "../../utils/cx";

const icons = { md: FileCode2, pdf: FileText };

export default function DemoFileGrid({ files, emptyTitle, emptyDescription, onOpen, onFavorite, mode = "files" }) {
  if (files.length === 0) {
    return <div className={cx("glass-surface flex min-h-64 flex-col items-center justify-center px-6 text-center")}>
      <span className={cx("glass-control flex size-12 items-center justify-center rounded-2xl text-muted-foreground")}><FolderOpen className={cx("size-5")} aria-hidden="true" /></span>
      <h2 className={cx("mt-4 text-sm font-semibold")}>{emptyTitle}</h2>
      <p className={cx("mt-1 max-w-sm text-sm text-muted-foreground")}>{emptyDescription}</p>
    </div>;
  }
  return <div className={cx("grid gap-3 sm:grid-cols-2 xl:grid-cols-3")}>
    {files.map((file) => {
      const Icon = file.type === "folder" ? Folder : icons[file.extension] ?? File;
      return <article key={file.id} className={cx("glass-surface group min-w-0 p-4 transition-[background-color,border-color] duration-150 hover:border-primary/20 hover:bg-[var(--glass-surface-hover)] focus-within:bg-[var(--glass-surface-hover)]")}>
        <div className={cx("flex items-start justify-between gap-3")}>
          <span className={cx("glass-control flex size-10 shrink-0 items-center justify-center rounded-xl text-primary")}><Icon className={cx("size-5")} aria-hidden="true" /></span>
          {mode === "favorites" ? <Button variant="ghost" size="icon-sm" onClick={() => onFavorite(file.id)} aria-label={`Remove ${file.name} from favorites`} title="Remove from favorites"><Heart className={cx("fill-rose-500 text-rose-500")} /></Button> : null}
        </div>
        <button type="button" onClick={() => onOpen(file)} className={cx("mt-4 block min-w-0 max-w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
          <span className={cx("block truncate text-sm font-medium text-foreground")}>{file.name}</span>
        </button>}
        <div className={cx("mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground")}>
          <span>{file.size ?? (file.type === "folder" ? "Folder" : "File")}</span>
          <span aria-hidden="true">·</span>
          <span>{mode === "recent" ? `Opened ${file.accessedAt ? new Date(file.accessedAt).toLocaleDateString() : "recently"}` : file.modified ?? "—"}</span>
        </div>
        {mode === "shared" && <p className={cx("mt-3 flex items-center gap-1.5 text-xs text-muted-foreground")}><Users className={cx("size-3.5")} aria-hidden="true" />{file.sharedWith ? `Shared with ${file.sharedWith}` : "Shared by you · demo record"}</p>}
        {mode === "recent" && <div className={cx("mt-3")}><Button variant="outline" size="sm" onClick={() => onOpen(file)}>{file.type === "folder" ? <FolderOpen /> : <Eye />}{file.type === "folder" ? "Open folder" : "Preview"}</Button></div>}
      </article>;
    })}
  </div>;
}
