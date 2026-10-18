import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

const THEMES = {
    LIGHT: "light",
    DARK: "dark",
    SYSTEM: "system",
};

const getSystemTheme = () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? THEMES.DARK : THEMES.LIGHT);

const getStoredTheme = () => {
    try {
        const storedTheme = localStorage.getItem(STORAGE_KEY);

        if (Object.values(THEMES).includes(storedTheme)) {
            return storedTheme;
        }
    } catch {
        // Ignore localStorage errors
    }

    return THEMES.SYSTEM;
};

const resolveTheme = (theme) => (theme === THEMES.SYSTEM ? getSystemTheme() : theme);

const applyTheme = (theme) => {
    document.documentElement.classList.toggle("dark", theme === THEMES.DARK);
};

export const useTheme = () => {
    const [theme, setThemeState] = useState(getStoredTheme);
    const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(theme));

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

        const updateTheme = () => {
            const nextTheme = resolveTheme(theme);

            setResolvedTheme(nextTheme);
            applyTheme(nextTheme);
        };

        updateTheme();

        mediaQuery.addEventListener("change", updateTheme);

        return () => {
            mediaQuery.removeEventListener("change", updateTheme);
        };
    }, [theme]);

    const setTheme = (nextTheme) => {
        if (!Object.values(THEMES).includes(nextTheme)) {
            return;
        }

        setThemeState(nextTheme);

        try {
            localStorage.setItem(STORAGE_KEY, nextTheme);
        } catch {
            // Ignore localStorage errors
        }
    };

    return {
        theme,
        resolvedTheme,
        setTheme,
        themes: THEMES,
    };
};
