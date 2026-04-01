import { useState } from "react";
import { TextInput, View, Text } from "react-native";

interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  label?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "number-pad";
}

export function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  label,
  autoCapitalize,
  keyboardType,
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`border rounded-lg px-4 py-3 text-base text-gray-900 bg-white ${
          focused ? "border-black" : "border-gray-300"
        }`}
      />
    </View>
  );
}
