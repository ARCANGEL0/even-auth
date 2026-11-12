const LOCK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.25" y="10.25" width="15.5" height="10.5" rx="3.25" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7.6a4 4 0 0 1 8 0V10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1.35" fill="currentColor"/><path d="M12 16.4v1.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`

const UNLOCK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.25" y="10.25" width="15.5" height="10.5" rx="3.25" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7.6a4 4 0 0 1 7.6-1.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1.35" fill="currentColor"/><path d="M12 16.4v1.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`

const EYE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.8 12s3.2-5.6 9.2-5.6S21.2 12 21.2 12s-3.2 5.6-9.2 5.6S2.8 12 2.8 12Z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/></svg>`

const EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.9 6.7A10.6 10.6 0 0 1 12 6.4c6 0 9.2 5.6 9.2 5.6a17 17 0 0 1-3.2 3.7M6.3 8.2A16.8 16.8 0 0 0 2.8 12s3.2 5.6 9.2 5.6c1.2 0 2.3-.2 3.3-.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`

const COPY = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 8.5V6.9A2.4 2.4 0 0 0 13.1 4.5H6.9A2.4 2.4 0 0 0 4.5 6.9v6.2a2.4 2.4 0 0 0 2.4 2.4h1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`

const TRASH = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7m-8 0 .7 11.1A2 2 0 0 0 9.2 20h5.6a2 2 0 0 0 2-1.9L17.5 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 11v5M14 11v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`

const CHECK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const SHIELD = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2 19 6v5.3c0 4.3-2.8 7.7-7 9.5-4.2-1.8-7-5.2-7-9.5V6l7-2.8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m8.8 11.8 2.2 2.2 4.2-4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const ARROW_DOWN = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v14m0 0 5-5m-5 5-5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const CHEVRON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const CLOSE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`

const PLUS = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`

const SPARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7L12 3.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" fill="currentColor"/></svg>`

export const icons = {
  lock: LOCK,
  unlock: UNLOCK,
  eye: EYE,
  eyeOff: EYE_OFF,
  copy: COPY,
  trash: TRASH,
  check: CHECK,
  shield: SHIELD,
  arrowDown: ARROW_DOWN,
  chevron: CHEVRON,
  close: CLOSE,
  plus: PLUS,
  spark: SPARK,
}
