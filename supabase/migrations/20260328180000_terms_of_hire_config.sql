-- Add terms_of_hire to system_config if it doesn't already exist
INSERT INTO public.system_config (config_key, config_value, config_type, category, label, description, is_sensitive)
VALUES (
  'terms_of_hire',
  '1. Safety: The hirer is responsible for ensuring the bouncy castle is used safely. Adult supervision is required at all times. Maximum user weight and age restrictions must be observed as displayed on the unit.

2. Weather: The bouncy castle must be deflated and not used in wind speeds exceeding 24mph, heavy rain, or lightning. The driver will advise at setup.

3. Footwear: No shoes, sharp objects, face paint, or silly string are permitted on or near the inflatable.

4. Damage: The hirer accepts responsibility for any damage caused through misuse. Accidental damage may be covered under the standard hire agreement — please ask the driver for details.

5. Collection: The inflatable must be accessible and ready for collection within the agreed collection window. Late collection fees may apply.

6. Power: The hirer is responsible for providing a suitable power supply (13A socket within 25 metres) unless a generator has been arranged. Do not use an extension lead longer than 25 metres.

7. Liability: CastleAdmin Ltd accepts no liability for injury arising from misuse of the equipment. By signing, the hirer confirms they have read, understood, and accepted all terms.',
  'text',
  'booking',
  'Terms of Hire',
  'The terms and conditions displayed to customers at point of delivery. Customers must sign to accept these terms before a booking can be marked as complete.',
  false
)
ON CONFLICT (config_key) DO NOTHING;
