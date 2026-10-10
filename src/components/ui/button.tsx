import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Radix Slot + CVA for behaviour; Geist tokens for every visual.
 *
 * This is the pattern the rest of the shadcn components follow. The variant
 * names and sizes come from shadcn because they encode the right hierarchy, but
 * every colour, radius and height is a Geist token rather than shadcn's
 * neutral palette. Importing shadcn's visual defaults would silently hand the
 * design system to a dependency.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-[14px] font-medium leading-none transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Geist: primary is solid gray-1000 fill on background-100 label.
        primary:
          "bg-[#ededed] text-black border border-[#ededed] hover:bg-white",
        // Geist: background fill, translucent gray-alpha-400 border.
        secondary:
          "bg-black text-[#ededed] border border-white/[0.14] hover:bg-white/[0.07]",
        // Geist: transparent, tints with gray-alpha on hover.
        tertiary:
          "bg-transparent text-[#ededed] border border-transparent hover:bg-white/[0.07]",
        destructive: "bg-[#f32e40] text-white border border-[#f32e40] hover:bg-[#d82534]",
      },
      size: {
        // Geist component defaults: 40px medium, 32px small, 48px large.
        sm: "h-8 px-3 text-[13px]",
        default: "h-10 px-4",
        lg: "h-12 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
