// Shared by buttons and navigation, matching IssueDesk's pointer-following glass.
export const glassHover = "glass-interactive";

export function updateGlassPointer(event) {
    if (event.pointerType !== "mouse" || event.currentTarget.matches(":disabled, [data-disabled], [aria-disabled='true']")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - bounds.top}px`);
}
