import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2 } from "lucide-react";

/**
 * Visual PPTX viewer using MIT pptx-wasm (canvas render of shapes/images/text).
 * Expects the original .pptx ArrayBuffer — never text-extracted HTML.
 */
export default function PptxVisualViewer({ arrayBuffer, fileName = "presentation.pptx" }) {
  const [Viewer, setViewer] = useState(null);
  const [PresentationApi, setPresentationApi] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [slide, setSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [thumbs, setThumbs] = useState([]);
  const handleRef = useRef(null);
  const stageRef = useRef(null);
  const thumbDeckRef = useRef(null);

  const src = useMemo(() => arrayBuffer, [arrayBuffer]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("pptx-wasm/react"),
      import("pptx-wasm"),
    ])
      .then(([reactMod, coreMod]) => {
        if (cancelled) return;
        setViewer(() => reactMod.PresentationViewer);
        setPresentationApi(() => coreMod.Presentation);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || "Could not load PowerPoint visual engine.");
      });
    return () => { cancelled = true; };
  }, []);

  // Build slide thumbnails via Presentation.render onto offscreen canvases.
  useEffect(() => {
    if (!PresentationApi || !src) return undefined;
    let cancelled = false;
    let deck = null;

    const buildThumbs = async () => {
      try {
        deck = await PresentationApi.open(src);
        thumbDeckRef.current = deck;
        const count = deck.slideCount || 0;
        if (cancelled) return;
        setSlideCount(count);
        const urls = [];
        const thumbW = 160;
        const thumbH = 90;
        for (let i = 0; i < count; i += 1) {
          const canvas = document.createElement("canvas");
          canvas.width = thumbW * 2;
          canvas.height = thumbH * 2;
          canvas.style.width = `${thumbW}px`;
          canvas.style.height = `${thumbH}px`;
          await deck.render(i, canvas, { width: thumbW, height: thumbH, fit: "contain", dpr: 2 });
          urls.push(canvas.toDataURL("image/png"));
          if (cancelled) break;
        }
        if (!cancelled) setThumbs(urls);
      } catch (error) {
        // Main viewer can still work without thumbs.
        if (!cancelled) setThumbs([]);
      }
    };

    buildThumbs();
    return () => {
      cancelled = true;
      try { deck?.destroy?.(); } catch (_) { /* ignore */ }
      thumbDeckRef.current = null;
    };
  }, [PresentationApi, src]);

  const go = (delta) => {
    setSlide((prev) => {
      const next = Math.max(0, Math.min((slideCount || 1) - 1, prev + delta));
      return next;
    });
  };

  const toggleFullscreen = () => {
    const node = stageRef.current;
    if (!node) return;
    if (!document.fullscreenElement) node.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  if (loadError) {
    return (
      <div className="qc-file-preview__empty">
        <p className="qc-file-preview__title">PowerPoint visual preview failed</p>
        <p className="theme-muted text-sm mt-2">{loadError}</p>
      </div>
    );
  }

  if (!Viewer || !src) {
    return (
      <div className="qc-file-preview__empty">
        <Loader2 className="animate-spin" size={22} />
        <p>Loading visual slide engine…</p>
      </div>
    );
  }

  return (
    <div className="qc-pptx-viewer" ref={stageRef}>
      <div className="qc-pptx-viewer__toolbar">
        <button type="button" className="qc-btn qc-btn-secondary !min-h-8 !px-3" onClick={() => go(-1)} aria-label="Previous slide" disabled={slide <= 0}>
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="qc-pptx-viewer__counter" aria-live="polite">
          Slide {slideCount ? slide + 1 : 0} / {slideCount || "—"}
        </span>
        <button type="button" className="qc-btn qc-btn-secondary !min-h-8 !px-3" onClick={() => go(1)} aria-label="Next slide" disabled={slideCount > 0 && slide >= slideCount - 1}>
          Next <ChevronRight size={16} />
        </button>
        <button type="button" className="qc-icon-btn" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">
          <Maximize2 size={16} />
        </button>
        <span className="qc-pptx-viewer__hint">{fileName}</span>
      </div>
      <div className="qc-pptx-viewer__main">
        <div className="qc-pptx-viewer__stage">
          <Viewer
            ref={handleRef}
            src={src}
            slide={slide}
            width="100%"
            height="100%"
            fit="contain"
            keyboard
            onLoad={(info) => {
              setSlideCount(info?.slideCount || 0);
              setSlide(0);
            }}
            onSlideChange={(index) => setSlide(index)}
            onError={(error) => setLoadError(error?.message || "Slide render failed.")}
            loading={(
              <div className="qc-file-preview__empty">
                <Loader2 className="animate-spin" size={22} />
                <p>Rendering slides…</p>
              </div>
            )}
          />
        </div>
        {thumbs.length > 0 && (
          <div className="qc-pptx-viewer__thumbs" role="listbox" aria-label="Slide thumbnails">
            {thumbs.map((url, index) => (
              <button
                key={`thumb-${index}`}
                type="button"
                role="option"
                aria-selected={index === slide}
                className={`qc-pptx-viewer__thumb ${index === slide ? "is-active" : ""}`}
                onClick={() => setSlide(index)}
              >
                <img src={url} alt={`Slide ${index + 1}`} />
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
