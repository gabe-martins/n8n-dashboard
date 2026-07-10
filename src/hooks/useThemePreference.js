import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'theme-preference';
const VALID_PREFERENCES = ['light', 'dark', 'system'];
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function getSystemTheme() {
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

function getStoredPreference() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return VALID_PREFERENCES.includes(stored) ? stored : 'system';
}

// Manages the light/dark/system theme preference: persists an explicit user
// choice in localStorage, falls back to the OS preference when set to
// "system" (and keeps reacting live if the OS preference changes), and
// mirrors the effective theme onto `data-theme` on <html>. Every page's CSS
// already styles itself off the shared variables in index.css, so nothing
// else needs to know the theme — components only need this for the toggle.
function useThemePreference() {
  const [preference, setPreferenceState] = useState(getStoredPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (e) => setSystemTheme(e.matches ? 'dark' : 'light');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const effectiveTheme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }, [effectiveTheme]);

  const setPreference = useCallback((next) => {
    if (!VALID_PREFERENCES.includes(next)) return;
    setPreferenceState(next);
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const cyclePreference = useCallback(() => {
    const order = ['system', 'light', 'dark'];
    const currentIndex = order.indexOf(preference);
    setPreference(order[(currentIndex + 1) % order.length]);
  }, [preference, setPreference]);

  return { preference, effectiveTheme, setPreference, cyclePreference };
}

export default useThemePreference;
