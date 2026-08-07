import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

export { PasswordInput }
