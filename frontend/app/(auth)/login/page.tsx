"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, Button, addToast } from "@heroui/react";
import { IconLoader2, IconMail, IconLock } from "@tabler/icons-react";
import { useAuth } from "@/components/contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { login } = useAuth();

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    // Email validation
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Password validation
    if (!password) {
      newErrors.password = "Password is required";
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
      const result = await login(email, password);

      if (result.success) {
        addToast({
          title: "Welcome back!",
          description: "You have been logged in successfully",
          color: "success",
        });
      } else {
        addToast({
          title: "Login Failed",
          description: result.error || "Invalid credentials",
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-200 dark:bg-black p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-8 shadow-sm border border-black/5 dark:border-white/5">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200 mb-2">
              vmem
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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
                  if (errors.password) setErrors({ ...errors, password: undefined });
                }}
                placeholder="Enter your password"
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
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="text-black dark:text-white font-medium hover:underline"
              >
                Sign up
              </Link>
            </p>
          </div>

          {/* Demo credentials hint */}
          <div className="mt-6 p-4 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
              Demo credentials: <span className="font-mono">test@example.com</span> / <span className="font-mono">password123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
