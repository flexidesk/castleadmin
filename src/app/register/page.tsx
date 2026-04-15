'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Mail, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AppLogo from '@/components/ui/AppLogo';

interface RegisterFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const passwordRequirements = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains a number', test: (p: string) => /\d/.test(p) },
  { label: 'Contains a letter', test: (p: string) => /[a-zA-Z]/.test(p) },
];

export default function RegisterPage() {
  const { signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password', '');

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      await signUp(data.email, data.password, { fullName: data.fullName });
      toast.success('Account created! Welcome to CastleAdmin.');
      window.location.href = '/orders-dashboard';
    } catch (error: any) {
      const msg = error?.message || 'Failed to create account. Please try again.';
      setAuthError(msg);
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
            Create your account
          </h1>
          <p className="mt-1 text-sm text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Get started with CastleAdmin today
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

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="label">
                Full name
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <User size={16} />
                </span>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  className={`input-base pl-9 ${errors.fullName ? 'input-error' : ''}`}
                  {...register('fullName', {
                    required: 'Full name is required',
                    minLength: { value: 2, message: 'Name must be at least 2 characters' },
                  })}
                />
              </div>
              {errors.fullName && (
                <p className="error-text">{errors.fullName.message}</p>
              )}
            </div>

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
              <label htmlFor="password" className="label">
                Password
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
                    minLength: { value: 8, message: 'Password must be at least 8 characters' },
                    validate: (v) =>
                      /\d/.test(v) || 'Password must contain at least one number',
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

              {/* Password strength hints */}
              {passwordValue.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {passwordRequirements.map((req) => {
                    const met = req.test(passwordValue);
                    return (
                      <li
                        key={req.label}
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: met ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))' }}
                      >
                        <CheckCircle2 size={12} />
                        {req.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="label">
                Confirm password
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
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={`input-base pl-9 pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (v) => v === passwordValue || 'Passwords do not match',
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="error-text">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Submit */}
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
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>
        </div>

        {/* Login link */}
        <p className="mt-6 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium transition-colors hover:underline"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
