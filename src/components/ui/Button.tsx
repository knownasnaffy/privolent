import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-700 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer";

    const variants = {
      default: "bg-teal-700 text-white shadow hover:bg-teal-800 active:bg-teal-900",
      destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
      outline: "border border-slate-300 bg-white shadow-sm hover:bg-slate-100 text-slate-800",
      secondary: "bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-200",
      ghost: "hover:bg-slate-100 text-slate-700",
      link: "text-teal-700 underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-10 rounded-md px-8",
      icon: "size-9",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
