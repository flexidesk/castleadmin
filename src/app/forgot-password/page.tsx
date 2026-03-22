'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';

interface ForgotPasswordFormData {
  email: string;
}

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (resetError) throw resetError;
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      <div className="w-full max-w-md">
        {/* Logo & heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-6">
            <AppLogo size={40} />
            <span
              className="text-2xl font-bold"
              style={{ color: 'hsl(var(--primary))' }}
            >
              CastleAdmin
            </span>
          </div>
          <h1
            className="text-2xl font-semibold text-center"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {/* Card */}
        <div
          className="card p-8 shadow-sm"
          style={{ boxShadow: '0 1px 3px 0 hsl(var(--foreground) / 0.05)' }}
        >
          {submitted ? (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
              >
                <CheckCircle size={24} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div>
                <p className="font-semibold text-base" style={{ color: 'hsl(var(--foreground))' }}>
                  Check your inbox
                </p>
                <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  We sent a password reset link to{' '}
                  <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                    {getValues('email')}
                  </span>
                </p>
              </div>
              <Link
                href="/login"
                className="btn-primary w-full justify-center py-2.5 mt-2"
              >
                Back to Sign in
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="flex items-start gap-3 p-3 rounded-lg mb-5 text-sm"
                  style={{
                    backgroundColor: 'hsl(var(--destructive) / 0.08)',
                    color: 'hsl(var(--destructive))',
                    border: '1px solid hsl(var(--destructive) / 0.2)',
                  }}
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
                <div>
                  <label htmlFor="email" className="label">
                    Email address
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      <Mail size={16} />
                    </span>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className={`input-base pl-9 ${errors.email ? 'input-error' : ''}`}
                      {...register('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                          message: 'Enter a valid email address',
                        },
                      })}
                    />
                  </div>
                  {errors.email && (
                    <p className="error-text">{errors.email.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full justify-center py-2.5 mt-2"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Back to login */}
        <p className="mt-6 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 font-medium transition-colors hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            <ArrowLeft size={14} />
            Back to Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
