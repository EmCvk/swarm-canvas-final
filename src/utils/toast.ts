export type ToastTone = 'success' | 'info' | 'warning' | 'error';

/** Fires a lightweight, non-blocking toast notification. Listened for by the toast host
 *  mounted in Workspace.tsx; safe to call from anywhere (components, the store, api layer). */
export const emitToast = (message: string, tone: ToastTone = 'info') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('swarm-toast', { detail: { message, tone } }));
};
