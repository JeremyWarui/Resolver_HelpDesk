import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import type { UseFormReturn, FieldValues } from "react-hook-form";
import type { ReactNode } from "react";

interface FormDialogProps<T extends FieldValues> {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  form: UseFormReturn<T>;
  children: ReactNode;
  onSubmit: (values: T) => Promise<void>;
  isSubmitting: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export function FormDialog<T extends FieldValues>({
  isOpen,
  onOpenChange,
  title,
  description,
  form,
  children,
  onSubmit,
  isSubmitting,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  size = "md",
}: FormDialogProps<T>) {
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={sizeClasses[size]}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {children}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  form.reset();
                }}
                disabled={isSubmitting}
              >
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
