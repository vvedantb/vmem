const PRESENTER_AUTH_KEY = "vmem:presenter-unlocked";

/** Presenter pop-out only — main `/slides` deck stays public. */
const PRESENTER_PASSWORD = "appleorange123";

export function isPresenterPasswordRequired(): boolean {
  return PRESENTER_PASSWORD.length > 0;
}

export function isPresenterUnlocked(): boolean {
  if (!isPresenterPasswordRequired()) return true;
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(PRESENTER_AUTH_KEY) === "1";
}

export function unlockPresenter(password: string): boolean {
  if (password !== PRESENTER_PASSWORD) return false;
  window.sessionStorage.setItem(PRESENTER_AUTH_KEY, "1");
  return true;
}

export function lockPresenter(): void {
  window.sessionStorage.removeItem(PRESENTER_AUTH_KEY);
}
