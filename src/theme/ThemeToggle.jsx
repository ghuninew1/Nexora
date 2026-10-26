import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { cx } from "../utils/cx";
import { Button } from "../components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
];

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const current = options.find((option) => option.value === theme) ?? options[1];
    const Icon = current.icon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon-lg"
                        aria-label={`Theme: ${current.label}`}
                        title={`Theme: ${current.label}`}
                    />
                }
            >
                <Icon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cx("min-w-40")}>
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                        {options.map(({ value, label, icon: OptionIcon }) => (
                            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                                <OptionIcon />
                                {label}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
