import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

const Input = forwardRef<TextInput, TextInputProps & { className?: string }>(
  ({ className, placeholderTextColor, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={placeholderTextColor ?? "hsl(0, 0%, 45%)"}
        className={cn(
          "h-11 w-full rounded-lg border border-input bg-surface px-4 text-base text-foreground",
          props.editable === false && "opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
