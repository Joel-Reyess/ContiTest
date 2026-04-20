import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-tight transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-continental-yellow aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-industrial-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-industrial-sm hover:bg-destructive/90 focus-visible:ring-destructive/60 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-continental-gray-3 bg-background shadow-industrial-xs hover:bg-continental-gray-5 hover:border-continental-gray-2 dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-industrial-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-continental-gray-4 hover:text-continental-black dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        continental:
          "bg-continental-yellow text-continental-black shadow-industrial-sm hover:bg-[#f79400] hover:shadow-industrial-md",
        continentalOutline:
          "border border-continental-yellow bg-transparent text-continental-black shadow-industrial-xs hover:bg-continental-yellow hover:shadow-industrial-sm",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded-md px-6 has-[>svg]:px-5",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
