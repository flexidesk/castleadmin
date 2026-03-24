-- Add field_mapping JSONB column to woocommerce_settings
ALTER TABLE public.woocommerce_settings
  ADD COLUMN IF NOT EXISTS field_mapping JSONB NOT NULL DEFAULT '{
    "order_id": "id",
    "customer_name": "billing.first_name + billing.last_name",
    "customer_email": "billing.email",
    "customer_phone": "billing.phone",
    "delivery_address": "shipping.address_1",
    "delivery_city": "shipping.city",
    "delivery_postcode": "shipping.postcode",
    "order_notes": "customer_note",
    "order_total": "total",
    "order_status": "status"
  }'::jsonb;
