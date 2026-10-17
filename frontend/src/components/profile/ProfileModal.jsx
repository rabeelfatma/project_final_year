import React, { useEffect, useMemo, useState } from "react";
import { Camera, Save, X, UserCircle } from "lucide-react";
import api from "../../utils/api";
import { getApiOrigin } from "../../utils/apiBase";

const API_ORIGIN = getApiOrigin();

export default function ProfileModal({ onClose, onSaved }) {
  const [profile, setProfile] = useState({ name: "", email: "", profilePicture: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    let alive = true;
    api.get("/user/profile").then(({ data }) => {
      if (!alive) return;
      setProfile({ name: data?.name || "", email: data?.email || "", profilePicture: data?.profilePicture || "" });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const picture = useMemo(() => {
    if (preview) return preview;
    if (!profile.profilePicture) return "";
    return `${API_ORIGIN}/${String(profile.profilePicture).replace(/^\/+/, "")}?v=${encodeURIComponent(profile.updatedAt || "1")}`;
  }, [preview, profile.profilePicture, profile.updatedAt]);

  const save = async (e) => {
    e.preventDefault();
    if (!profile.name.trim() || !profile.email.trim()) return;
    try {
      setSaving(true);
      const form = new FormData();
      form.append("name", profile.name.trim());
      form.append("email", profile.email.trim());
      if (file) form.append("profilePicture", file);
      const { data } = await api.put("/user/profile", form);
      localStorage.setItem("userName", data.name || profile.name);
      localStorage.setItem("userEmail", data.email || profile.email);
      if (data.profilePicture) localStorage.setItem("userProfilePicture", data.profilePicture);
      onSaved?.(data);
      onClose();
    } catch (error) {
      alert(error.response?.data?.message || "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="qc-modal-backdrop z-[200]">
      <div className="qc-modal relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 theme-muted hover:text-[var(--text)] p-2" aria-label="Close profile">
          <X size={18} />
        </button>
        <h2 className="qc-page-title mb-1">My Profile</h2>
        <p className="theme-muted text-sm mb-6">Update only your profile picture, name and email.</p>

        <form onSubmit={save} className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border flex items-center justify-center accent-soft shrink-0" style={{ borderColor: "var(--border)" }}>
              {picture ? <img src={picture} alt="Profile" className="w-full h-full object-cover" /> : <UserCircle size={44} className="accent-text" />}
            </div>
            <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
              <Camera size={16} /> Change picture
              <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <label className="qc-label">
            Name
            <input className="qc-input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
          </label>

          <label className="qc-label">
            Email
            <input className="qc-input" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />
          </label>

          <button disabled={saving} className="btn-primary w-full flex justify-center items-center gap-2">
            {saving ? "Saving..." : <><Save size={16} /> Save Profile</>}
          </button>
        </form>
      </div>
    </div>
  );
}
