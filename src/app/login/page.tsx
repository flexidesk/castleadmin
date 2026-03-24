'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Eye, EyeOff, AlertCircle, ArrowRight, Package, MapPin, Truck, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';


interface LoginFormData {
  email: string;
  password: string;
}

const features = [
  { icon: Package, label: 'Order Management', desc: 'Track every order in real-time' },
  { icon: Truck, label: 'Driver Dispatch', desc: 'Assign and monitor your fleet' },
  { icon: MapPin, label: 'Live Tracking', desc: 'GPS visibility across all routes' },
  { icon: BarChart3, label: 'Analytics', desc: 'Revenue and performance insights' },
];

export default function LoginPage() {
  const { signIn } = useAuth();
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
  } = useForm<LoginFormData>({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormData) => {
    if (rateLimitCooldown > 0) return;
    setIsLoading(true);
    setAuthError(null);

    try {
      await signIn(data.email, data.password);
      toast.success('Welcome back!');
      // Small delay to allow Supabase to write the auth cookie before the
      // middleware checks it on the next request.
      await new Promise((resolve) => setTimeout(resolve, 300));
      window.location.href = '/orders-dashboard';
      return;
    } catch (e: any) {
      setIsLoading(false);
      const rawMsg: string = e?.message || '';
      const isRateLimit =
        rawMsg.toLowerCase().includes('rate limit') ||
        rawMsg.toLowerCase().includes('too many requests') ||
        rawMsg.toLowerCase().includes('request rate limit');

      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (isRateLimit) {
        setAuthError('Too many sign-in attempts. Please wait 60 seconds before trying again.');
        let seconds = 60;
        setRateLimitCooldown(seconds);
        const interval = setInterval(() => {
          seconds -= 1;
          setRateLimitCooldown(seconds);
          if (seconds <= 0) clearInterval(interval);
        }, 1000);
      } else {
        const remaining = MAX_ATTEMPTS - newAttempts;
        if (remaining > 0) {
          setAuthError(
            `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lockout.`
          );
        } else {
          setAuthError(
            'Too many failed attempts. Please wait a moment before trying again, or use "Forgot password?" to reset your credentials.'
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
    <div className="min-h-screen flex" style={{ backgroundColor: 'hsl(var(--background))' }}>
      {/* ── Left panel ── */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col relative overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--primary))' }}
      >
        {/* Decorative circles */}
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10"
          style={{ backgroundColor: 'hsl(var(--accent))' }}
        />
        <div
          className="absolute top-1/3 -right-16 w-64 h-64 rounded-full opacity-10"
          style={{ backgroundColor: 'hsl(var(--primary-foreground))' }}
        />
        <div
          className="absolute -bottom-20 left-1/4 w-80 h-80 rounded-full opacity-[0.07]"
          style={{ backgroundColor: 'hsl(var(--accent))' }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-12 py-10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-white/15 rounded-xl p-2">
              <AppLogo size={28} />
            </div>
            <span className="text-white text-xl font-semibold tracking-tight">CastleAdmin</span>
          </div>

          {/* Hero text */}
          <div className="mt-auto mb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
              style={{ backgroundColor: 'hsl(var(--accent) / 0.2)', color: 'hsl(var(--accent))' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Inflatable Events Platform
            </div>
            <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-4">
              Manage your<br />
              <span style={{ color: 'hsl(var(--accent))' }}>entire operation</span><br />
              from one place.
            </h2>
            <p className="text-white/60 text-base leading-relaxed max-w-sm">
              Orders, drivers, deliveries and analytics — all in a single, streamlined dashboard built for inflatable hire businesses.
            </p>
          </div>

          {/* Feature tiles */}
          <div className="grid grid-cols-2 gap-3 mb-10">
            {features.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="rounded-xl p-4 backdrop-blur-sm"
                style={{ backgroundColor: 'hsl(var(--primary-foreground) / 0.07)', border: '1px solid hsl(var(--primary-foreground) / 0.12)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: 'hsl(var(--accent) / 0.15)' }}
                >
                  <Icon size={16} style={{ color: 'hsl(var(--accent))' }} />
                </div>
                <p className="text-white text-sm font-medium leading-tight">{label}</p>
                <p className="text-white/50 text-xs mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 lg:px-12 xl:px-16">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2.5 mb-10">
          <AppLogo size={32} />
          <span className="text-lg font-semibold" style={{ color: 'hsl(var(--primary))' }}>CastleAdmin</span>
        </div>

        <div className="w-full max-w-[400px]">
          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
              Welcome back
            </h1>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Sign in to access your admin dashboard
            </p>
          </div>

          {/* Error banner */}
          {authError && (
            <div
              className="flex items-start gap-3 p-3.5 rounded-xl mb-5 text-sm"
              style={{
                backgroundColor: 'hsl(var(--destructive) / 0.07)',
                color: 'hsl(var(--destructive))',
                border: '1px solid hsl(var(--destructive) / 0.18)',
              }}
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Attempt counter */}
          {failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && !rateLimitCooldown && (
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl mb-5 text-xs"
              style={{
                backgroundColor: 'hsl(var(--warning) / 0.08)',
                color: 'hsl(var(--muted-foreground))',
                border: '1px solid hsl(var(--warning) / 0.2)',
              }}
            >
              <span className="font-semibold" style={{ color: 'hsl(var(--warning))' }}>{failedAttempts}/{MAX_ATTEMPTS}</span>
              <span>failed attempts — locked after {MAX_ATTEMPTS} failures.</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'hsl(var(--foreground))' }}
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={`input-base ${errors.email ? 'input-error' : ''}`}
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address',
                  },
                })}
              />
              {errors.email && (
                <p className="error-text mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium transition-colors hover:underline"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`input-base pr-10 ${errors.password ? 'input-error' : ''}`}
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
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p className="error-text mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || rateLimitCooldown > 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-150 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
              }}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : rateLimitCooldown > 0 ? (
                `Try again in ${rateLimitCooldown}s`
              ) : (
                <>
                  Sign in
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'hsl(var(--border))' }} />
          </div>

          {/* Footer links */}
          <div className="space-y-3 text-center">
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Don&apos;t have an account?{' '}
              <Link
                href="/register"
                className="font-medium transition-colors hover:underline"
                style={{ color: 'hsl(var(--primary))' }}
              >
                Create one
              </Link>
            </p>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Looking for your delivery?{' '}
              <Link
                href="/track"
                className="font-medium transition-colors hover:underline"
                style={{ color: 'hsl(var(--primary))' }}
              >
                Track your order
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
