// src/lib/validations.ts

import { z } from 'zod';

// Pickup number format: Must be alphanumeric, 6-20 characters
export const pickupNumberSchema = z
  .string()
  .min(6, 'Pickup number must be at least 6 characters')
  .max(20, 'Pickup number must not exceed 20 characters')
  .regex(/^[A-Z0-9-]+$/i, 'Pickup number must be alphanumeric');

// Phone number validation (US format)
export const phoneSchema = z
  .string()
  .regex(/^[\d\s\-\(\)]+$/, 'Invalid phone number format')
  .min(10, 'Phone number must be at least 10 digits');

// State code validation (2-letter US state codes)
export const stateSchema = z
  .string()
  .length(2, 'State must be 2 letters')
  .regex(/^[A-Z]{2}$/i, 'Invalid state code')
  .transform(val => val.toUpperCase());

export const checkInFormSchema = z.object({
  pickup_number: pickupNumberSchema,
  carrier_name: z.string().min(2, 'Carrier name is required'),
  trailer_number: z
    .string()
    .min(2, 'Trailer number is required')
    .max(20, 'Trailer number too long'),
  destination_city: z.string().min(2, 'Destination city is required'),
  destination_state: stateSchema,
  driver_name: z.string().min(2, 'Driver name is required'),
  driver_phone: phoneSchema,
});

export type CheckInFormValues = z.infer<typeof checkInFormSchema>;
