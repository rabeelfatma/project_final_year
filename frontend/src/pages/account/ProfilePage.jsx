import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Save, UserCircle } from "lucide-react";
import api from "../../utils/api";
import { getApiOrigin } from "../../utils/apiBase";

const API_ORIGIN = getApiOrigin();

/**
 * Dedicated profile page: picture, full name, and email only.
 * Preserves existing GET/PUT /user/profile behaviour.
 */
export default function ProfilePage({ onBack }) {
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    profilePicture: "",
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get("/user/profile")
      .then(({ data }) => {
        if (!alive) return;
        setProfile({
          name: data?.name || "",
          email: data?.email || "",
          profilePicture: data?.profilePicture || "",
          updatedAt: data?.updatedAt,
        });
      })
      .catch(() => {
        if (!alive) return;
        setMessage("Profile could not be loaded. Check your connection and try again.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
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

  const save = async (event) => {
    event.preventDefault();
    if (!profile.name.trim() || !profile.email.trim()) return;
    try {
      setSaving(true);
      setMessage("");
      const form = new FormData();
      form.append("name", profile.name.trim());
      form.append("email", profile.email.trim());
      if (file) form.append("profilePicture", file);
      const { data } = await api.put("/user/profile", form);
      localStorage.setItem("userName", data.name || profile.name);
      localStorage.setItem("userEmail", data.email || profile.email);
      if (data.profilePicture) {
        localStorage.setItem("userProfilePicture", data.profilePicture);
      }
      setProfile({
        name: data.name || profile.name,
        email: data.email || profile.email,
        profilePicture: data.profilePicture || profile.profilePicture,
        updatedAt: data.updatedAt || Date.now(),
      });
      setFile(null);
      window.dispatchEvent(
        new CustomEvent("quickcheck:profile-saved", { detail: data })
      );
      setMessage("Profile saved successfully.");
    } catch (error) {
      setMessage(
        error.response?.data?.message || "Profile could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="qc-page-header">
        <div>
          <h2 className="qc-page-title">My Profile</h2>
          <p className="qc-page-subtitle">
            Update your profile picture, full name, and email address.
          </p>
        </div>
        {typeof onBack === "function" && (
          <button type="button" onClick={onBack} className="qc-btn qc-btn-secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
        )}
      </div>

      <div className="qc-card">
        {loading ? (
          <p className="theme-muted text-sm py-10 text-center">Loading profile…</p>
        ) : (
          <form onSubmit={save} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div
                className="w-24 h-24 rounded-qc-xl overflow-hidden border flex items-center justify-center accent-soft shrink-0"
                style={{ borderColor: "var(--border)" }}
              >
                {picture ? (
                  <img
                    src={picture}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserCircle size={52} className="accent-text" />
                )}
              </div>
              <div>
                <p className="qc-label mb-2">Profile picture</p>
                <label className="qc-btn qc-btn-secondary cursor-pointer inline-flex">
                  <Camera size={16} aria-hidden="true" />
                  Change picture
                  <input
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
                <p className="theme-muted text-xs mt-2">
                  PNG, JPEG, WebP, or GIF.
                </p>
              </div>
            </div>

            <label className="block">
              <span className="qc-label">Full name</span>
              <input
                className="qc-input"
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
                required
                autoComplete="name"
              />
            </label>

            <label className="block">
              <span className="qc-label">Email address</span>
              <input
                className="qc-input"
                type="email"
                value={profile.email}
                onChange={(e) =>
                  setProfile({ ...profile, email: e.target.value })
                }
                required
                autoComplete="email"
              />
            </label>

            {message && (
              <p
                className={`text-sm font-medium ${
                  message.includes("successfully")
                    ? "text-[var(--success)]"
                    : "text-[var(--danger)]"
                }`}
                role="status"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="qc-btn qc-btn-primary"
            >
              {saving ? (
                "Saving…"
              ) : (
                <>
                  <Save size={16} aria-hidden="true" />
                  Save Profile
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
