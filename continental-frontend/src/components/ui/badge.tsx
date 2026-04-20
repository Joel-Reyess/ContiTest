import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-sm border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border-continental-gray-3 text-continental-gray-1 bg-white [a&]:hover:bg-continental-gray-5 [a&]:hover:text-continental-black",
        continental:
          "border-transparent bg-continental-yellow-soft text-[#8a5a00] border-[color:var(--color-continental-yellow)]",
        success:
          "border-transparent bg-[color-mix(in_srgb,var(--color-continental-green)_14%,white)] text-continental-green-dark border-[color-mix(in_srgb,var(--color-continental-green)_40%,white)]",
        warning:
          "border-transparent bg-continental-yellow-soft text-[#8a5a00] border-[color-mix(in_srgb,var(--color-continental-yellow)_55%,white)]",
        danger:
          "border-transparent bg-[color-mix(in_srgb,var(--color-continental-red)_10%,white)] text-continental-red border-[color-mix(in_srgb,var(--color-continental-red)_35%,white)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
