import React, { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

/**
 * Shared Admin/Teacher/Student dashboard chrome:
 * - Desktop: existing sidebar layout (fixed or in-flow)
 * - Mobile: off-canvas drawer with menu button, backdrop, Escape, and nav-click close
 */
export default function DashboardNavShell({
  sidebar,
  children,
  widthClass = "w-64",
  desktopMode = "flow",
  desktopOffsetClass = "",
  mobileTitle = "Menu",
  headerActions = null,
}) {
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true
  );
  const navId = useId();
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const wasOpenRef = useRef(false);

  const close = () => setOpen(false);
  const toggle = () => setOpen((value) => !value);
  const navVisible = isDesktop || open;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeDrawer = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("quickcheck:close-drawer", closeDrawer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("quickcheck:close-drawer", closeDrawer);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = (event) => {
      setIsDesktop(event.matches);
      if (event.matches) setOpen(false);
    };
    setIsDesktop(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Mobile: move focus into the drawer on open; restore to Menu on dismiss.
  useEffect(() => {
    if (isDesktop) {
      wasOpenRef.current = open;
      return;
    }

    if (open && !wasOpenRef.current) {
      closeButtonRef.current?.focus();
    } else if (!open && wasOpenRef.current) {
      menuButtonRef.current?.focus();
    }

    wasOpenRef.current = open;
  }, [open, isDesktop]);

  const handleSidebarClick = (event) => {
    if (event.target.closest("nav button, nav a, nav [role='button']")) {
      close();
    }
  };

  const desktopPositionClass =
    desktopMode === "fixed"
      ? "md:translate-x-0 md:fixed md:inset-y-0 md:left-0 md:h-screen md:z-20"
      : "md:translate-x-0 md:static md:h-auto md:shrink-0 md:z-0";

  return (
    <div className="flex min-h-screen h-screen theme-page font-sans overflow-hidden">
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
        className={`fixed inset-0 z-40 bg-black/60 md:hidden transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
      />

      <aside
        id={navId}
        aria-hidden={!navVisible}
        inert={!navVisible ? true : undefined}
        className={[
          widthClass,
          "theme-card border-r flex flex-col overflow-y-auto custom-scrollbar",
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out",
          open
            ? "translate-x-0 pointer-events-auto"
            : "-translate-x-full pointer-events-none md:pointer-events-auto",
          desktopPositionClass,
        ].join(" ")}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-b md:hidden shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-xs font-black uppercase tracking-widest text-white">
            {mobileTitle}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            tabIndex={navVisible ? 0 : -1}
            className="p-2 rounded-xl border theme-surface hover:border-sky-500 transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0" onClick={handleSidebarClick}>
          {sidebar}
        </div>
      </aside>

      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${desktopOffsetClass}`}>
        <div
          className={[
            "sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b theme-card shrink-0",
            headerActions ? "" : "md:hidden",
          ].join(" ")}
          style={{ borderColor: "var(--border)" }}
        >
          <button
            ref={menuButtonRef}
            type="button"
            onClick={toggle}
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls={navId}
            className="md:hidden p-2 rounded-xl border theme-surface hover:border-sky-500 transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            <Menu size={20} />
          </button>
          <span className="md:hidden text-xs font-black uppercase tracking-widest truncate min-w-0">
            {mobileTitle}
          </span>
          {headerActions ? (
            <div className="ml-auto flex items-center gap-2 shrink-0">{headerActions}</div>
          ) : null}
        </div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-10 theme-page relative min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
