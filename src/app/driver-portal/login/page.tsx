'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Lock, Mail, AlertCircle, Truck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';

interface DriverLoginFormData {
  email: string;
  password: string;
}

export default function DriverLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [rateLimitCooldown, setRateLimitCooldown] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const MAX_ATTEMPTS = 5;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DriverLoginFormData>({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: DriverLoginFormData) => {
    if (rateLimitCooldown > 0) return;
    setIsLoading(true);
    setAuthError(null);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      // Verify this user is linked to a driver record
      const { data: driverData, error: driverError } = await supabase
        .from('drivers')
        .select('id, name')
        .eq('auth_user_id', authData.user.id)
        .single();

      if (driverError || !driverData) {
        // Sign out — not a driver account
        await supabase.auth.signOut();
        throw new Error('No driver account found for these credentials. Please contact your administrator.');
      }

      setFailedAttempts(0);
      router.push('/driver-portal');
      router.refresh();
    } catch (error: any) {
      setIsLoading(false);
      const rawMsg: string = error?.message || '';
      const isRateLimit =
        rawMsg.toLowerCase().includes('rate limit') ||
        rawMsg.toLowerCase().includes('too many requests') ||
        rawMsg.toLowerCase().includes('request rate limit');

      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (isRateLimit) {
        setAuthError(
          'Too many sign-in attempts. Please wait 60 seconds before trying again.'
        );
        let seconds = 60;
        setRateLimitCooldown(seconds);
        const interval = setInterval(() => {
          seconds -= 1;
          setRateLimitCooldown(seconds);
          if (seconds <= 0) clearInterval(interval);
        }, 1000);
      } else if (rawMsg.includes('No driver account')) {
        setAuthError(rawMsg);
      } else {
        const remaining = MAX_ATTEMPTS - newAttempts;
        if (remaining > 0) {
          setAuthError(
            `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lockout.`
          );
        } else {
          setAuthError(
            'Too many failed attempts. Please wait before trying again, or contact your administrator if you need access.'
          );
          let seconds = 30;
          setRateLimitCooldown(seconds);
          const interval = setInterval(() => {
            seconds -= 1;
            setRateLimitCooldown(seconds);
            if (seconds <= 0) {
              clearInterval(interval);
              setFailedAttempts(0);
            }
          }, 1000);
        }
      }
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
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-sm font-medium"
            style={{
              backgroundColor: 'hsl(var(--primary) / 0.1)',
              color: 'hsl(var(--primary))',
            }}
          >
            <Truck size={14} />
            Driver Portal
          </div>
          <h1
            className="text-2xl font-semibold text-center"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            Driver Sign In
          </h1>
          <p className="mt-1 text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Sign in to view and manage your assigned orders
          </p>
        </div>

        {/* Card */}
        <div
          className="card p-8 shadow-sm"
          style={{ boxShadow: '0 1px 3px 0 hsl(var(--foreground) / 0.05)' }}
        >
          {/* Auth error banner */}
          {authError && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg mb-5 text-sm"
              style={{
                backgroundColor: 'hsl(var(--destructive) / 0.08)',
                color: 'hsl(var(--destructive))',
                border: '1px solid hsl(var(--destructive) / 0.2)',
              }}
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && !rateLimitCooldown && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs"
              style={{
                color: 'hsl(var(--muted-foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              <span className="font-medium">{failedAttempts}/{MAX_ATTEMPTS} failed attempts</span>
              <span>— account will be temporarily locked after {MAX_ATTEMPTS} failures.</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Email */}
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

            {/* Password */}
            <div>
              <label htmlFor="password" className="label mb-0">
                Password
              </label>
              <div className="relative mt-1">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <Lock size={16} />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`input-base pl-9 pr-10 ${errors.password ? 'input-error' : ''}`}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters',
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

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || rateLimitCooldown > 0}
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
                  Signing in…
                </>
              ) : rateLimitCooldown > 0 ? (
                `Try again in ${rateLimitCooldown}s`
              ) : (
                'Sign in as Driver'
              )}
            </button>
          </form>
        </div>

        {/* Admin login link */}
        <p className="mt-6 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Admin?{' '}
          <a
            href="/login"
            className="font-medium transition-colors hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Sign in to Admin Dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
