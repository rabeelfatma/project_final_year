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
 * File control for LMS surfaces.
 * - chip: icon + name + type meta (legacy)
 * - icon: compact clickable glyph only
 * - named: clickable glyph + visible filename (filename is display-only)
 */
export default function FileLink({
  fileName,
  onOpen,
  className = "",
  subtitle = "",
  disabled = false,
  variant = "chip",
  openLabel = "",
  stopPropagation = true,
}) {
  const meta = describeFile(fileName || "file");
  const Icon = ICONS[meta.icon] || File;
  const isIcon = variant === "icon";
  const isNamed = variant === "named";
  const visibleName = meta.displayName || meta.name;
  const tip = openLabel || `Open ${meta.name}`;
  const canOpen = !disabled && typeof onOpen === "function";

  const handleOpen = (event) => {
    if (stopPropagation) event.stopPropagation();
    if (canOpen) onOpen(event);
  };

  const stopDbl = (event) => {
    if (stopPropagation) event.stopPropagation();
  };

  if (isNamed) {
    return (
      <span className={`qc-file-named ${className}`.trim()}>
        <button
          type="button"
          className="qc-file-link qc-file-link--icon"
          onClick={handleOpen}
          onDoubleClick={stopDbl}
          disabled={!canOpen}
          title={tip}
          aria-label={tip}
        >
          <Icon size={16} className="qc-file-link__icon" aria-hidden="true" />
        </button>
        <span className="qc-file-named__name" title={meta.name}>
          {visibleName}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`qc-file-link ${isIcon ? "qc-file-link--icon" : ""} ${className}`.trim()}
      onClick={handleOpen}
      onDoubleClick={stopDbl}
      disabled={!canOpen}
      title={tip}
      aria-label={tip}
    >
      <Icon size={isIcon ? 16 : 15} className="qc-file-link__icon" aria-hidden="true" />
      {!isIcon ? (
        <span className="qc-file-link__copy">
          <span className="qc-file-link__name" title={meta.name}>{visibleName}</span>
          <span className="qc-file-link__meta">
            {meta.displayType}
            {subtitle ? ` · ${subtitle}` : ""}
          </span>
        </span>
      ) : null}
    </button>
  );
}
