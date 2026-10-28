import { Files, FolderClock, Heart, LayoutDashboard, Settings, Share2, HardDrive, Trash2 } from "lucide-react";

export const navigationGroups = [
    { label: "Workspace", items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "An overview of your cloud workspace." },
        { to: "/files", label: "My Files", icon: Files, description: "Browse and organize your files and folders." },
        { to: "/recent", label: "Recent", icon: FolderClock, description: "Your recently accessed files, in one place." },
        { to: "/favorites", label: "Favorites", icon: Heart, description: "Keep your important files close at hand." },
    ] },
    { label: "Library", items: [
        { to: "/shared", label: "Shared", icon: Share2, description: "Manage your public file and folder links." },
        { to: "/trash", label: "Trash", icon: Trash2, description: "Review and restore deleted files." },
    ] },
    { label: "Manage", items: [
        { to: "/storage", label: "Storage", icon: HardDrive, description: "Manage your connected storage and capacity." },
        { to: "/settings", label: "Settings", icon: Settings, description: "Make your workspace feel like home." },
    ] },
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);
export function getPageInfo(pathname) {
    return navigationItems.find((item) => item.to === pathname);
}
