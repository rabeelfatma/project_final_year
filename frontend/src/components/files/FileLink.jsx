import React from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from "lucide-react";
import { describeFile } from "../../utils/fileTypeMeta";

const ICONS = {
  pdf: FileText,
  image: FileImage,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  text: FileText,
  code: FileCode2,
  audio: FileAudio,
  video: FileVideo,
  archive: FileArchive,
  file: File,
};

/**
 * Clickable filename chip with type icon — used for reference, question, and submission files.
 */
export default function FileLink({
  fileName,
  onOpen,
  className = "",
  subtitle = "",
  disabled = false,
}) {
  const meta = describeFile(fileName || "file");
  const Icon = ICONS[meta.icon] || File;

  return (
    <button
      type="button"
      className={`qc-file-link ${className}`.trim()}
      onClick={onOpen}
      disabled={disabled || typeof onOpen !== "function"}
      title={`${meta.name} (${meta.label})`}
      aria-label={`Open ${meta.name}`}
    >
      <Icon size={15} className="qc-file-link__icon" aria-hidden="true" />
      <span className="qc-file-link__copy">
        <span className="qc-file-link__name">{meta.name}</span>
        <span className="qc-file-link__meta">
          {meta.displayType}
          {subtitle ? ` · ${subtitle}` : ""}
        </span>
      </span>
    </button>
  );
}
