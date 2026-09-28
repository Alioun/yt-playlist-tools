import { Monitor, Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Theme } from "@/lib/storage"

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor }
]

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex items-center gap-1 rounded-md border border-border p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "h-7 gap-1.5 px-2 text-xs",
            theme === value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground"
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </Button>
      ))}
    </div>
  )
}
