import { cn } from "@/lib/utils";
import * as React from "react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-continental-gray-3 bg-white px-3 py-2 text-sm text-continental-black shadow-industrial-xs transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-continental-gray-2 hover:border-continental-gray-2 focus-visible:border-continental-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-continental-yellow/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-continental-gray-5",
          type === "search" &&
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
          type === "file" &&
            "p-0 pr-3 italic text-continental-gray-2 file:me-3 file:h-full file:border-0 file:border-r file:border-solid file:border-continental-gray-3 file:bg-continental-gray-5 file:px-3 file:text-sm file:font-medium file:not-italic file:text-continental-black",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
