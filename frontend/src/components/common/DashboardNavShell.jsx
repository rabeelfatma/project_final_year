import React, { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

/**
 * Shared Admin/Teacher/Student dashboard chrome:
 * - Desktop: consistent sidebar width and in-flow layout
 * - Mobile: off-canvas drawer with menu button, backdrop, Escape, and nav-click close
 */
export default function DashboardNavShell({
  sidebar,
  children,
  widthClass = "w-64",
  desktopMode = "flow",
  desktopOffsetClass = "",
  mobileTitle = "QuickCheck Hub",
  headerActions = null,
  pageTitle = null,
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
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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
          "qc-dashboard-sidebar theme-card border-r flex flex-col overflow-y-auto custom-scrollbar",
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out",
          open
            ? "translate-x-0 pointer-events-auto"
            : "-translate-x-full pointer-events-none md:pointer-events-auto",
          desktopPositionClass,
        ].join(" ")}
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-b md:hidden shrink-0"
          style={{ borderColor: "var(--sidebar-border)", color: "var(--sidebar-text)" }}
        >
          <span className="text-sm font-semibold tracking-tight truncate">
            {mobileTitle}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            tabIndex={navVisible ? 0 : -1}
            className="p-2 rounded-qc border transition-colors"
            style={{
              borderColor: "var(--sidebar-border)",
              color: "var(--sidebar-text)",
              background: "var(--sidebar-hover-bg)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0" onClick={handleSidebarClick}>
          {sidebar}
        </div>
      </aside>

      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${desktopOffsetClass}`}>
        <header
          className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 border-b theme-card shrink-0"
          style={{ borderColor: "var(--border)", minHeight: "var(--header-height)" }}
        >
          <button
            ref={menuButtonRef}
            type="button"
            onClick={toggle}
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls={navId}
            className="md:hidden p-2 rounded-qc border theme-surface hover:border-[var(--accent)] transition-colors"
            style={{ borderColor: "var(--border)" }}
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            {pageTitle ? (
              <h1 className="text-sm sm:text-base font-semibold tracking-tight truncate">
                {pageTitle}
              </h1>
            ) : (
              <span className="md:hidden text-sm font-semibold tracking-tight truncate block">
                {mobileTitle}
              </span>
            )}
          </div>

          {headerActions ? (
            <div className="ml-auto flex items-center gap-2 shrink-0">{headerActions}</div>
          ) : null}
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden theme-page relative min-w-0">
          <div className="qc-content px-4 sm:px-6 lg:px-8 py-5 sm:py-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
