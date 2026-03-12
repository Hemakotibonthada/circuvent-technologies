/**
 * Form validation utilities used across contact forms,
 * newsletter subscriptions, and career application flows.
 */

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: string) => string | null;
  message?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate a form field against a set of rules
 */
export function validateField(
  value: string,
  rules: ValidationRule
): string | null {
  if (rules.required && (!value || value.trim().length === 0)) {
    return rules.message || "This field is required.";
  }

  if (rules.minLength && value.trim().length < rules.minLength) {
    return `Must be at least ${rules.minLength} characters.`;
  }

  if (rules.maxLength && value.trim().length > rules.maxLength) {
    return `Must be no more than ${rules.maxLength} characters.`;
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    return rules.message || "Invalid format.";
  }

  if (rules.custom) {
    return rules.custom(value);
  }

  return null;
}

/**
 * Validate an entire form against a rules map
 */
export function validateForm(
  data: Record<string, string>,
  rules: Record<string, ValidationRule>
): ValidationResult {
  const errors: Record<string, string> = {};
  let isValid = true;

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = data[field] || "";
    const error = validateField(value, fieldRules);
    if (error) {
      errors[field] = error;
      isValid = false;
    }
  }

  return { isValid, errors };
}

/**
 * Common validation patterns
 */
export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[+]?[\d\s()-]{7,15}$/,
  url: /^https?:\/\/.+\..+/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
};

/**
 * Pre-built validation rule sets for common forms
 */
export const contactFormRules: Record<string, ValidationRule> = {
  name: {
    required: true,
    minLength: 2,
    maxLength: 100,
    message: "Name is required (2-100 characters).",
  },
  email: {
    required: true,
    pattern: patterns.email,
    message: "Please enter a valid email address.",
  },
  company: {
    required: false,
    maxLength: 200,
  },
  message: {
    required: true,
    minLength: 20,
    maxLength: 2000,
    message: "Please provide at least 20 characters.",
  },
};

export const newsletterRules: Record<string, ValidationRule> = {
  email: {
    required: true,
    pattern: patterns.email,
    message: "Please enter a valid email address.",
  },
};
