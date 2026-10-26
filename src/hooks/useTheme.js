import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "theme";
const THEME_CHANGE = "nexora:theme-change";
const SYSTEM_QUERY = "(prefers-color-scheme: dark)";
const THEMES = { LIGHT: "light", DARK: "dark", SYSTEM: "system" };
let sessionTheme = null;

function getStoredTheme() {
    if (sessionTheme !== null) return sessionTheme;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return Object.values(THEMES).includes(stored) ? stored : THEMES.DARK;
    } catch {
        return THEMES.DARK;
    }
}

function subscribeTheme(onChange) {
    function handleStorage(event) {
        if (event.key === STORAGE_KEY || event.key === null) {
            sessionTheme = null;
            onChange();
        }
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener(THEME_CHANGE, onChange);
    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(THEME_CHANGE, onChange);
    };
}

function subscribeSystem(onChange) {
    const media = window.matchMedia(SYSTEM_QUERY);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
}

const getSystemDark = () => window.matchMedia(SYSTEM_QUERY).matches;
const getDefaultTheme = () => THEMES.DARK;
const getDefaultSystemDark = () => true;

function setTheme(nextTheme) {
    if (!Object.values(THEMES).includes(nextTheme)) return;
    try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
        sessionTheme = null;
    } catch {
        // Theme switching still works for this session when storage is blocked.
        sessionTheme = nextTheme;
    }
    window.dispatchEvent(new Event(THEME_CHANGE));
}

export function useTheme() {
    const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, getDefaultTheme);
    const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, getDefaultSystemDark);
    const resolvedTheme = theme === THEMES.SYSTEM ? (systemDark ? THEMES.DARK : THEMES.LIGHT) : theme;

    useEffect(() => {
        document.documentElement.classList.toggle("dark", resolvedTheme === THEMES.DARK);
    }, [resolvedTheme]);

    return { theme, resolvedTheme, setTheme, themes: THEMES };
}
