import {
  ChevronDown, Download, FolderPlus, Grid2X2, List, Pencil, Plus,
  Search, Share2, Trash2, ArrowUpDown,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { cx } from "../../utils/cx";
import UploadButton from "./UploadButton";

function FileToolbar({ selectedCount, onNewFolder, onRename, onDelete, onFilesSelected, query, onQueryChange, sortBy, onSortChange, sortDirection, onSortDirectionChange, view, onViewChange, onDownload, canDownload }) {
  const hasSelection = selectedCount > 0;
  return (
    <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
      <div className={cx("flex min-w-0 items-center gap-2 overflow-x-auto")}>
        {hasSelection ? <>
          <span className={cx("shrink-0 text-sm font-medium text-foreground")}>{selectedCount} selected</span>
          <Button variant="outline" size="sm" disabled={!canDownload} onClick={onDownload}><Download />Download</Button>
          <Button variant="outline" size="sm" disabled title="Sharing will be available after Storage is connected"><Share2 />Share</Button>
          {selectedCount === 1 && <Button variant="outline" size="sm" onClick={onRename}><Pencil />Rename</Button>}
          <Button variant="outline" size="sm" onClick={onDelete}><Trash2 />Delete</Button>
        </> : <>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button><Plus />New<ChevronDown /></Button>} />
            <DropdownMenuContent align="start"><DropdownMenuItem onClick={onNewFolder}><FolderPlus />Folder</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
          <UploadButton onFilesSelected={onFilesSelected} />
        </>}
      </div>
      <div className={cx("flex min-w-0 items-center gap-2")}>
        <div className={cx("relative min-w-0 flex-1 sm:w-52 sm:flex-none")}>
          <Search className={cx("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground")} aria-hidden="true" />
          <Input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search files..." aria-label="Search files" className={cx("pl-9")} />
        </div>
        <Separator orientation="vertical" className={cx("hidden h-6 sm:block")} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={`Sort by ${sortBy}, ${sortDirection}ending`}><ArrowUpDown /></Button>} />
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
