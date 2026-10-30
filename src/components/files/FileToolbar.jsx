import {
  ChevronDown, FolderPlus, Grid2X2, List, Plus, RefreshCw,
  Share2, Search, Trash2, ArrowUpDown, Eye, Star, Copy, ArrowRightLeft, Scissors, ClipboardPaste, Pencil,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { cx } from "../../utils/cx";
import UploadButton from "./UploadButton";

function FileToolbar({ canPaste, onClipboardCopy, onClipboardCut, onPaste, onRenameSelected, canRenameSelected, canShareSelected, onShareSelected, selectedCount, selectedFile, selectedFavorite, isSelectionBusy = false, canPreviewSelected = false, canMoveSelected = false, canCopySelected = false, canTrashSelected = false, onPreviewSelected, onToggleFavoriteSelected, onMoveSelected, onCopySelected, onTrashSelected, onNewFolder, canCreateFolder, isCreatingFolder, canUpload, onUploadFiles, onRefresh, isRefreshing, query, onQueryChange, sortBy, onSortChange, sortDirection, onSortDirectionChange, view, onViewChange }) {
  const hasSelection = selectedCount > 0;
  const isBusy = isRefreshing || isCreatingFolder;
  return (
    <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
      <div className={cx("flex min-w-0 items-center gap-2 overflow-x-auto")}>
        <div className={cx("flex shrink-0 items-center gap-1")} role="group" aria-label="Clipboard actions">
          <Button variant="ghost" size="sm" onClick={onClipboardCopy} disabled={!hasSelection || !canCopySelected || isSelectionBusy} title="Copy (Ctrl or Command + C)"><Copy />Copy</Button>
          <Button variant="ghost" size="sm" onClick={onClipboardCut} disabled={!hasSelection || !canMoveSelected || isSelectionBusy} title="Cut (Ctrl or Command + X)"><Scissors />Cut</Button>
          <Button variant="outline" size="sm" onClick={onPaste} disabled={!canPaste} title="Paste (Ctrl or Command + V)"><ClipboardPaste />Paste</Button>
          <Button variant="ghost" size="sm" onClick={onRenameSelected} disabled={!selectedFile || !canRenameSelected || isSelectionBusy}><Pencil />Rename</Button>
        </div>
        {hasSelection ? <>
          {selectedCount > 1 ? <div className={cx("flex shrink-0 items-center gap-1")} role="group" aria-label="Actions for selected items">
            <Button variant="ghost" size="sm" onClick={onMoveSelected} disabled={!canMoveSelected || isSelectionBusy} title="Move selected items"><ArrowRightLeft />Move</Button>
            <Button variant="outline" size="sm" onClick={onTrashSelected} disabled={!canTrashSelected || isSelectionBusy} title="Move selected items to Trash"><Trash2 />Move to Trash</Button>
          </div> : selectedCount === 1 && selectedFile && <div className={cx("flex shrink-0 items-center gap-1")} role="group" aria-label={`Actions for ${selectedFile.name}`}>
            {selectedFile.type === "file" && <Button variant="ghost" size="sm" onClick={onPreviewSelected} disabled={!canPreviewSelected || isSelectionBusy} title="Preview selected file"><Eye />Preview</Button>}
            <Button variant="ghost" size="sm" onClick={onToggleFavoriteSelected} disabled={isSelectionBusy} aria-pressed={selectedFavorite} title={selectedFavorite ? "Remove from Favorites" : "Add to Favorites"}><Star className={cx(selectedFavorite && "fill-amber-400 text-amber-500")} />{selectedFavorite ? "Unfavorite" : "Favorite"}</Button>
            <Button variant="ghost" size="sm" onClick={onShareSelected} disabled={!canShareSelected || isSelectionBusy}><Share2 />Share</Button>
            <Button variant="ghost" size="sm" onClick={onCopySelected} disabled={!canCopySelected || isSelectionBusy} title="Copy selected item to a folder"><Copy />Copy to…</Button>
            <Button variant="ghost" size="sm" onClick={onMoveSelected} disabled={!canMoveSelected || isSelectionBusy} title="Move selected item"><ArrowRightLeft />Move</Button>
            <Button variant="outline" size="sm" onClick={onTrashSelected} disabled={!canTrashSelected || isSelectionBusy} title="Move selected item to Trash"><Trash2 />Move to Trash</Button>
          </div>}
        </> : <>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button disabled={isBusy}><Plus />New<ChevronDown /></Button>} />
            <DropdownMenuContent align="start" className={cx("file-browser-menu")}>
              <DropdownMenuItem disabled={!canCreateFolder || isBusy} onClick={onNewFolder}><FolderPlus />Folder</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <UploadButton onFilesSelected={onUploadFiles} disabled={!canUpload || isBusy} />
        </>}
      </div>
      <div className={cx("flex min-w-0 items-center gap-2")}>
        <Button variant="outline" size="icon-sm" onClick={() => void onRefresh()} disabled={isBusy} aria-label="Refresh current folder" aria-busy={isRefreshing} title="Refresh current folder"><RefreshCw className={cx(isRefreshing && "motion-safe:animate-spin")} /></Button>
        <div className={cx("relative min-w-0 flex-1 sm:w-52 sm:flex-none")}>
          <Search className={cx("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground")} aria-hidden="true" />
          <Input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search loaded items..." aria-label="Search loaded items" className={cx("pl-9")} />
        </div>
        <Separator orientation="vertical" className={cx("hidden h-6 sm:block")} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={`Sort loaded items by ${sortBy}, ${sortDirection}ending`}><ArrowUpDown /></Button>} />
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortChange}>
              {[{ key: "name", label: "Name" }, { key: "modified", label: "Last modified" }, { key: "size", label: "File size" }].map((item) => <DropdownMenuRadioItem key={item.key} value={item.key} closeOnClick>{item.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            <Separator className={cx("my-1")} />
            <DropdownMenuItem onClick={onSortDirectionChange}>Order: {sortDirection === "asc" ? "Ascending" : "Descending"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className={cx("flex items-center rounded-lg border border-border p-0.5")} role="group" aria-label="File view">
          <Button variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" aria-label="List view" aria-pressed={view === "list"} onClick={() => onViewChange("list")}><List /></Button>
          <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => onViewChange("grid")}><Grid2X2 /></Button>
        </div>
      </div>
    </div>
  );
}

export default FileToolbar;
