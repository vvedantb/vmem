"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input, Button, addToast, Progress } from "@heroui/react";
import {
  IconLoader2,
  IconMail,
  IconLock,
  IconUser,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/components/contexts/AuthContext";

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: "danger" | "warning" | "success" | "default";
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
  };
}

function getPasswordStrength(password: string): PasswordStrength {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const score = Object.values(requirements).filter(Boolean).length;

  let label: string;
  let color: "danger" | "warning" | "success" | "default";

  switch (score) {
    case 0:
    case 1:
      label = "Weak";
      color = "danger";
      break;
    case 2:
      label = "Fair";
      color = "warning";
      break;
    case 3:
      label = "Good";
      color = "warning";
      break;
    case 4:
      label = "Strong";
      color = "success";
      break;
    default:
      label = "";
      color = "default";
  }

  return { score, label, color, requirements };
}

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const { register } = useAuth();

  const passwordStrength = useMemo(
    () => getPasswordStrength(password),
    [password]
  );

  const validateForm = () => {
    const newErrors: {
      name?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    // Name validation
    if (!name.trim()) {
      newErrors.name = "Name is required";
    } else if (name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    // Email validation
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Password validation
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    // Confirm password validation
    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await register(name.trim(), email.trim(), password);

      if (result.success) {
        addToast({
          title: "Account Created",
          description: "Welcome to vmem! Your account has been created.",
          color: "success",
        });
      } else {
        addToast({
          title: "Registration Failed",
          description: result.error || "Could not create account",
          color: "danger",
        });
      }
    } catch (error) {
      addToast({
        title: "Error",
        description: "An unexpected error occurred",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const RequirementIcon = ({ met }: { met: boolean }) =>
    met ? (
      <IconCheck className="w-3 h-3 text-green-500" />
    ) : (
      <IconX className="w-3 h-3 text-neutral-400" />
    );

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-200 dark:bg-black p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm border border-black/5 dark:border-white/5">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200 mb-2">
              vmem
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400">
              Create your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Name
              </label>
              <Input
                type="text"
                value={name}
                onValueChange={(value) => {
                  setName(value);
                  if (errors.name) setErrors({ ...errors, name: undefined });
                }}
                placeholder="Your name"
                size="lg"
                isDisabled={isSubmitting}
                isInvalid={!!errors.name}
                errorMessage={errors.name}
                startContent={
                  <IconUser className="w-5 h-5 text-neutral-400" />
                }
                classNames={{
                  inputWrapper:
                    "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                  input: "text-black dark:text-white",
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onValueChange={(value) => {
                  setEmail(value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                placeholder="you@example.com"
                size="lg"
                isDisabled={isSubmitting}
                isInvalid={!!errors.email}
                errorMessage={errors.email}
                startContent={
                  <IconMail className="w-5 h-5 text-neutral-400" />
                }
                classNames={{
                  inputWrapper:
                    "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                  input: "text-black dark:text-white",
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onValueChange={(value) => {
                  setPassword(value);
                  if (errors.password)
                    setErrors({ ...errors, password: undefined });
                }}
                placeholder="Create a password"
                size="lg"
                isDisabled={isSubmitting}
                isInvalid={!!errors.password}
                errorMessage={errors.password}
                startContent={
                  <IconLock className="w-5 h-5 text-neutral-400" />
                }
                classNames={{
                  inputWrapper:
                    "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                  input: "text-black dark:text-white",
                }}
              />

              {/* Password strength indicator */}
              {password && (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Progress
                      size="sm"
                      value={passwordStrength.score * 25}
                      color={passwordStrength.color}
                      classNames={{
                        base: "flex-1",
                        track: "bg-black/5 dark:bg-white/5",
                      }}
                      aria-label="Password strength"
                    />
                    <span
                      className={`text-xs font-medium ${
                        passwordStrength.color === "success"
                          ? "text-green-600"
                          : passwordStrength.color === "warning"
                          ? "text-orange-500"
                          : "text-red-500"
                      }`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-xs text-neutral-500">
                    <div className="flex items-center gap-1">
                      <RequirementIcon
                        met={passwordStrength.requirements.length}
                      />
                      <span>8+ characters</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <RequirementIcon
                        met={passwordStrength.requirements.uppercase}
                      />
                      <span>Uppercase</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <RequirementIcon
                        met={passwordStrength.requirements.lowercase}
                      />
                      <span>Lowercase</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <RequirementIcon
                        met={passwordStrength.requirements.number}
                      />
                      <span>Number</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Confirm Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onValueChange={(value) => {
                  setConfirmPassword(value);
                  if (errors.confirmPassword)
                    setErrors({ ...errors, confirmPassword: undefined });
                }}
                placeholder="Confirm your password"
                size="lg"
                isDisabled={isSubmitting}
                isInvalid={!!errors.confirmPassword}
                errorMessage={errors.confirmPassword}
                startContent={
                  <IconLock className="w-5 h-5 text-neutral-400" />
                }
                classNames={{
                  inputWrapper:
                    "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                  input: "text-black dark:text-white",
                }}
              />
            </div>

            <Button
              type="submit"
              size="lg"
              isDisabled={isSubmitting}
              className="w-full bg-black dark:bg-white text-white dark:text-black font-medium"
            >
              {isSubmitting ? (
                <>
                  <IconLoader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-black dark:text-white font-medium hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
