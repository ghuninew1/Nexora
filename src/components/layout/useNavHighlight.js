import { useState } from "react";

export function useNavHighlight() {
    const [highlight, setHighlight] = useState(null);
    const move = (event) => {
        const link = event.target.closest("a[data-nav-highlight]");
        const nav = event.currentTarget;
        if (!link || !nav.contains(link)) return;
        const bounds = nav.getBoundingClientRect();
        const item = link.getBoundingClientRect();
        setHighlight({ x: item.left - bounds.left + nav.scrollLeft, y: item.top - bounds.top + nav.scrollTop, width: item.width, height: item.height, visible: true });
    };
    const hide = () => setHighlight((current) => current && { ...current, visible: false });
    return {
        onMouseOver: move,
        onFocus: move,
        onMouseLeave: hide,
        onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); },
        highlight,
    };
}

