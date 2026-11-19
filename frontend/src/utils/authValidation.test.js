import { describe, expect, it } from 'vitest';
import {
  emailValidationMessage,
  normalizeEmail,
  passwordValidationMessage,
  confirmPasswordMessage,
  PASSWORD_HINT,
} from './validators';

describe('auth validation messages', () => {
  it('covers email rules with short messages', () => {
    expect(emailValidationMessage('')).toBe('Email is required.');
    expect(emailValidationMessage('   ')).toBe('Email is required.');
    expect(emailValidationMessage('ada @example.com')).toBe('Email cannot contain spaces.');
    expect(emailValidationMessage('a'.repeat(255))).toBe('Email is too long.');
    expect(emailValidationMessage('ada@')).toBe('Enter a valid email.');
    expect(emailValidationMessage('ada@@example.com')).toBe('Enter a valid email.');
    expect(emailValidationMessage('.ada@example.com')).toBe('Enter a valid email.');
    expect(emailValidationMessage('ada.@example.com')).toBe('Enter a valid email.');
    expect(emailValidationMessage('ada..x@example.com')).toBe('Enter a valid email.');
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(emailValidationMessage('ada.l_ace+lab@example.com')).toBe('');
  });

  it('covers password and confirm rules without changing the value', () => {
    expect(passwordValidationMessage('')).toBe('Password is required.');
    expect(passwordValidationMessage('Secur1!')).toBe('Password is too short.');
    expect(passwordValidationMessage(`Aa1!${'a'.repeat(126)}`)).toBe('Password is too long.');
    expect(passwordValidationMessage('secure1!x')).toBe('Add an uppercase letter.');
    expect(passwordValidationMessage('SECURE1!X')).toBe('Add a lowercase letter.');
    expect(passwordValidationMessage('Secure!!X')).toBe('Add a number.');
    expect(passwordValidationMessage('Secure12X')).toBe('Add a special character.');
    expect(passwordValidationMessage('Secure 1!')).toBe('Password cannot contain spaces.');
    expect(passwordValidationMessage('Secure1!')).toBe('');
    expect(confirmPasswordMessage('Secure1!', '')).toBe('Confirm your password.');
    expect(confirmPasswordMessage('Secure1!', 'secure1!')).toBe('Passwords do not match.');
    expect(confirmPasswordMessage('Secure1!', 'Secure1! ')).toBe('Passwords do not match.');
    expect(confirmPasswordMessage('Secure1!', 'Secure1!')).toBe('');
    expect(PASSWORD_HINT).toMatch(/Min\. 8 characters/);
  });
});
