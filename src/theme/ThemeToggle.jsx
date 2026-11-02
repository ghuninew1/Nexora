import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { cx } from "../utils/cx";
import { useState } from 'react';
import { usePreferences } from '../hooks/usePreferences';
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
    const { preferences, save } = usePreferences();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const current = options.find((option) => option.value === theme) ?? options[1];
    const Icon = current.icon;

    async function changeTheme(value) {
        const previous = theme;
        setError(''); setPending(true); setTheme(value);
        try { await save({ theme: value }); }
        catch { setTheme(previous); setError('Could not save theme. Try again.'); }
        finally { setPending(false); }
    }
    return (<>
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon-lg"
                        aria-label={`Theme: ${current.label}`}
                        title={`Theme: ${current.label}`}
                        disabled={pending || !preferences}
                    />
                }
            >
                <Icon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cx("min-w-40")}>
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={theme} onValueChange={changeTheme}>
                        {options.map(({ value, label, icon: OptionIcon }) => (
                            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                                <OptionIcon />
                                {label}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>{error && <span role="alert" className={cx('text-xs text-destructive')}>{error}</span>}</>
    );
}
