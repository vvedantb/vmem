import { TouchableOpacity, Text } from "react-native";

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: "default" | "outline";
  disabled?: boolean;
}

export function Button({
  onPress,
  title,
  variant = "default",
  disabled = false,
}: ButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`py-3 px-6 rounded-lg items-center ${
        variant === "outline"
          ? "border border-gray-300 bg-transparent"
          : "bg-black"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`font-semibold text-base ${
          variant === "outline" ? "text-black" : "text-white"
        }`}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}
