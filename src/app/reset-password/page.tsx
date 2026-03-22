'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';

interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    defaultValues: { password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password');

  useEffect(() => {
    // Check if we have a valid session (set by auth callback after token exchange)
    const checkSession = async () => {
      const supabase = createClient();
      const { data, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !data.session) {
        setSessionError(true);
      } else {
        setSessionReady(true);
      }
    };
    checkSession();
  }, []);

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password. Please try again.');
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
            Set new password
          </h1>
          <p className="mt-1 text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Choose a strong password for your account
          </p>
        </div>

        {/* Card */}
        <div
          className="card p-8 shadow-sm"
          style={{ boxShadow: '0 1px 3px 0 hsl(var(--foreground) / 0.05)' }}
        >
          {/* Invalid / expired token */}
          {sessionError && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: 'hsl(var(--destructive) / 0.1)' }}
              >
                <AlertCircle size={24} style={{ color: 'hsl(var(--destructive))' }} />
              </div>
              <div>
                <p className="font-semibold text-base" style={{ color: 'hsl(var(--foreground))' }}>
                  Invalid or expired link
                </p>
                <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  This password reset link is no longer valid. Please request a new one.
                </p>
              </div>
              <Link href="/forgot-password" className="btn-primary w-full justify-center py-2.5 mt-2">
                Request new link
              </Link>
            </div>
          )}

          {/* Success state */}
          {success && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
              >
                <CheckCircle size={24} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div>
                <p className="font-semibold text-base" style={{ color: 'hsl(var(--foreground))' }}>
                  Password updated!
                </p>
                <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Your password has been changed successfully. Redirecting you to sign in…
                </p>
              </div>
              <Link href="/login" className="btn-primary w-full justify-center py-2.5 mt-2">
                Go to Sign in
              </Link>
            </div>
          )}

          {/* Form — only shown when session is valid and not yet succeeded */}
          {sessionReady && !success && (
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
                {/* New password */}
                <div>
                  <label htmlFor="password" className="label">
                    New password
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      <Lock size={16} />
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className={`input-base pl-9 pr-10 ${errors.password ? 'input-error' : ''}`}
                      {...register('password', {
                        required: 'Password is required',
                        minLength: {
                          value: 8,
                          message: 'Password must be at least 8 characters',
                        },
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="error-text">{errors.password.message}</p>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label htmlFor="confirmPassword" className="label">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      <Lock size={16} />
                    </span>
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className={`input-base pl-9 pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                      {...register('confirmPassword', {
                        required: 'Please confirm your password',
                        validate: (value) =>
                          value === passwordValue || 'Passwords do not match',
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="error-text">{errors.confirmPassword.message}</p>
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
                      Updating…
                    </>
                  ) : (
                    'Update password'
                  )}
                </button>
              </form>
            </>
          )}

          {/* Loading skeleton while checking session */}
          {!sessionReady && !sessionError && (
            <div className="flex flex-col items-center gap-3 py-6">
              <svg
                className="animate-spin h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                style={{ color: 'hsl(var(--primary))' }}
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Validating reset link…
              </p>
            </div>
          )}
        </div>

        {/* Back to login */}
        <p className="mt-6 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <Link
            href="/login"
            className="font-medium transition-colors hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Back to Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
