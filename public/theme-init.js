(() => {
    let storedTheme = null;

    try {
        storedTheme = localStorage.getItem("theme");
    } catch {
        // Ignore localStorage errors
    }

    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = ["light", "dark", "system"].includes(storedTheme) ? storedTheme : "dark";

    document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && systemTheme === "dark"),
    );
})();
