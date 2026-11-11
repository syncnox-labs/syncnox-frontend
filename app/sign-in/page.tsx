"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useIndexStore } from "@/store/index.store";
import { useState } from "react";
import { Button } from "antd";

export default function SignInPage() {
  const router = useRouter();
  const { setCurrentTab } = useIndexStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password. Please try again.");
        return;
      }

      if (result?.ok) {
        router.replace("/dashboard");
        setCurrentTab("dashboard");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh w-full overflow-y-auto bg-white font-sans lg:flex">
      {/* ── Left brand panel ─────────────────────────────── */}
      <div className="sticky top-0 hidden h-dvh shrink-0 items-center justify-center overflow-hidden bg-[#003220] lg:flex lg:w-[44%] xl:w-1/2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Synced for Smarter Ops_page-0001.jpg.jpeg"
          alt="Synced for Smarter Ops"
          className="h-full w-full object-fill"
        />
      </div>

      {/* ── Right form panel ──────────────────────────────── */}
      <div className="flex min-h-full min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-12 lg:px-12 lg:py-8">
        <div className="m-auto flex w-full max-w-[380px] flex-col py-4">
          {/* Logo + title */}
          <div className="text-center mb-6 flex flex-col items-center">
            <Image
              src="/syncnox.svg"
              alt="Syncnox"
              width={140}
              height={38}
              priority
              className="mb-2"
            />
            <p className="text-2xl font-bold text-gray-900 mt-3 mb-1">Sign in</p>
            {/* <p className="text-xs text-gray-500">Welcome back. Let&apos;s plan some routes.</p> */}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="mt-6 flex flex-col gap-3.5">
              {/* Email */}
              <div>
                <label htmlFor="si-email" className="mb-1.5 block text-sm font-semibold text-gray-800 sm:text-xs">
                  Email <span className="text-red-600">*</span>
                </label>
                <input
                  id="si-email"
                  type="email"
                  className="min-h-12 lg:min-h-10 w-full rounded-none border border-gray-300 bg-white px-3 py-2.5 lg:py-2 text-base text-gray-900 transition-all focus:border-[#003220] focus:outline-none focus:ring-2 focus:ring-[#ecfdf5] lg:text-sm"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="email"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="si-password" className="mb-1.5 block text-sm font-semibold text-gray-800 sm:text-xs">
                  Password <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="si-password"
                    type={showPw ? "text" : "password"}
                    className="min-h-12 lg:min-h-10 w-full rounded-none border border-gray-300 bg-white px-3 py-2.5 lg:py-2 pr-16 text-base text-gray-900 transition-all focus:border-[#003220] focus:outline-none focus:ring-2 focus:ring-[#ecfdf5] lg:text-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex min-h-11 lg:min-h-10 w-14 cursor-pointer items-center justify-center rounded-none border-none bg-transparent text-xs font-semibold text-gray-500 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-[#003220]"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    aria-pressed={showPw}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div role="alert" className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>

            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className="mt-5 !h-12 lg:!h-10 w-full rounded-none !border-[#003220] bg-[#003220] text-sm font-semibold transition-all hover:bg-[#002a00]"
              id="si-submit-btn"
            >
              Sign In
            </Button>

          </form>

          <p className="text-center mt-4 text-xs text-gray-500">✓ No credit card required · 14-day free trial</p>
        </div>
      </div>
    </div>
  );
}
