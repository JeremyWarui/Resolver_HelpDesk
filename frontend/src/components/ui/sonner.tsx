import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--toast-success-bg)",
          "--success-text": "var(--toast-success-text)",
          "--success-border": "var(--toast-success-border)",
          "--error-bg": "var(--toast-error-bg)",
          "--error-text": "var(--toast-error-text)",
          "--error-border": "var(--toast-error-border)",
          "--font-weight": "500",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          description: 'text-gray-900 dark:text-gray-100 font-medium',
          toast: 'group toast group-[.toaster]:shadow-lg',
          success: 'bg-[--success-bg] text-[--success-text] border-[--success-border]',
          error: 'bg-[--error-bg] text-[--error-text] border-[--error-border]'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
