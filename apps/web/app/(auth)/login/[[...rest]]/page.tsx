import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-200 dark:bg-black p-4">
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/register"
        fallbackRedirectUrl="/"
      />
    </div>
  );
}
