export async function downloadProtectedFile(url, fallbackName = "download") {
  const token = localStorage.getItem("token");
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    let message = "File download failed.";
    try { const data = await response.json(); message = data.message || message; } catch (_) {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const name = match?.[1] || fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

// Authenticated in-site preview. It keeps the user inside QuickCheck Hub instead
// of navigating away, and works for server-rendered DOCX/text plus browser-native
// PDF/image/audio/video previews.
export async function openProtectedPreview(url, title = "File preview") {
  const token = localStorage.getItem("token");
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    let message = "File preview failed.";
    try { const data = await response.json(); message = data.message || message; } catch (_) {}
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const old = document.getElementById("quickcheck-file-preview");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "quickcheck-file-preview";
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "9999", background: "rgba(0,0,0,.82)",
    backdropFilter: "blur(7px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px"
  });

  const shell = document.createElement("div");
  Object.assign(shell.style, {
    width: "min(1200px,96vw)", height: "min(820px,92vh)", background: "var(--surface)", color: "var(--text)",
    border: "1px solid var(--border)", borderRadius: "20px", overflow: "hidden", display: "flex", flexDirection: "column",
    boxShadow: "0 28px 90px rgba(0,0,0,.55)"
  });

  const header = document.createElement("div");
  Object.assign(header.style, { display:"flex", alignItems:"center", gap:"12px", padding:"12px 16px", borderBottom:"1px solid var(--border)" });
  const heading = document.createElement("strong");
  heading.textContent = title || "File preview";
  Object.assign(heading.style, { flex:"1", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" });
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close file preview");
  Object.assign(close.style, { border:"0", background:"transparent", color:"var(--text)", fontSize:"20px", cursor:"pointer", padding:"4px 8px" });

  const frame = document.createElement("iframe");
  frame.src = objectUrl;
  frame.title = title || "File preview";
  Object.assign(frame.style, { width:"100%", flex:"1", border:"0", background:"white" });

  const cleanup = () => {
    document.removeEventListener("keydown", onKey);
    URL.revokeObjectURL(objectUrl);
    overlay.remove();
  };
  const onKey = (e) => { if (e.key === "Escape") cleanup(); };
  close.onclick = cleanup;
  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };
  document.addEventListener("keydown", onKey);

  header.append(heading, close);
  shell.append(header, frame);
  overlay.append(shell);
  document.body.appendChild(overlay);
}
