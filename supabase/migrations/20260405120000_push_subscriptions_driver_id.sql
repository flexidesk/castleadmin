-- Add driver_id column to push_subscriptions for driver-specific push notifications
-- Migration: 20260405120000_push_subscriptions_driver_id.sql

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_driver_id
  ON public.push_subscriptions(driver_id)
  WHERE driver_id IS NOT NULL;
