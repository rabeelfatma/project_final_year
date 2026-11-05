/**
 * Synchronous in-flight guard. React state updates are too late to stop a
 * second click before the next render.
 */
export function createSubmitLock() {
  let pending = false;
  return {
    tryBegin() {
      if (pending) return false;
      pending = true;
      return true;
    },
    end() {
      pending = false;
    },
    get pending() {
      return pending;
    },
  };
}
