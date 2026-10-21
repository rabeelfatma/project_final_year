/**
 * In-app notification centre preference (device-local).
 * Default is ON. Does not control browser push or email.
 */
export const IN_APP_NOTIFICATIONS_KEY = "qc_in_app_notifications";
export const IN_APP_NOTIFICATIONS_EVENT = "quickcheck:notifications-pref";

export function getInAppNotificationsEnabled() {
  const stored = localStorage.getItem(IN_APP_NOTIFICATIONS_KEY);
  if (stored === null || stored === "") return true;
  return stored !== "off" && stored !== "false" && stored !== "0";
}

export function setInAppNotificationsEnabled(enabled) {
  localStorage.setItem(IN_APP_NOTIFICATIONS_KEY, enabled ? "on" : "off");
  window.dispatchEvent(
    new CustomEvent(IN_APP_NOTIFICATIONS_EVENT, { detail: { enabled: Boolean(enabled) } })
  );
}
