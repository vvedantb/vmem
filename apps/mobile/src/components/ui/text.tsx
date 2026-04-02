import { createContext, useContext } from "react";
import { Text as RNText, type TextProps } from "react-native";
import { cn } from "@/lib/utils";

const TextClassContext = createContext<string>("");

function Text({ className, ...props }: TextProps) {
  const textClassName = useContext(TextClassContext);
  return (
    <RNText
      className={cn(
        "text-base text-foreground font-sans",
        textClassName,
        className,
      )}
      {...props}
    />
  );
}

export { Text, TextClassContext };
