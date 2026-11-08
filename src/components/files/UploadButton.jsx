import { useRef, useState } from "react";
import { directoryFiles } from "../../utils/folder-upload";
import { Upload, FolderUp } from "lucide-react";
import { cx } from "../../utils/cx";
import { Button } from "../ui/button";

function UploadButton({ onFilesSelected, disabled = false, canUploadFolder = false }) {
  const inputRef = useRef(null);
  const directoryRef = useRef(null);
  const [error, setError] = useState('');

  function handleChange(event) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    onFilesSelected(files);
    event.target.value = "";
  }

  function handleClick() {
    inputRef.current?.click();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={disabled}
      >
        <Upload />
        Upload
      </Button>

      <Button type="button" variant="outline" title="Directory picker preserves file paths. Empty folders require supported folder drag and drop." disabled={disabled || !canUploadFolder} onClick={() => {
        if (!('webkitdirectory' in document.createElement('input'))) { setError('Folder selection is unavailable. Use Upload to select individual files.'); return; }
        setError(''); directoryRef.current?.click();
      }}><FolderUp />Upload Folder</Button>
      <input ref={directoryRef} type="file" webkitdirectory="" multiple className={cx('hidden')} aria-label="Upload folder" onChange={event => {
        try { const entries = directoryFiles(event.target.files ?? []); if (entries.length) onFilesSelected([], entries); }
        catch (error) { setError(error.message); }
        event.target.value = '';
      }} />
      {error && <p role="alert" className={cx('text-xs text-destructive')}>{error}</p>}
      <input
        ref={inputRef}
        type="file"
        multiple
        className={cx("hidden")}
        disabled={disabled}
        onChange={handleChange}
      />
    </>
  );
}

export default UploadButton;
