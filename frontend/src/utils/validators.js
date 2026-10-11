// ✅ Email Validation (Professional)
export function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return regex.test(email);
}

// ✅ Password Validation (Strong)
export function validatePassword(password) {
  // At least 6 characters
  // Minimum 2 letters, 2 numbers, 1 special character
  const regex =
    /^(?=.*[A-Za-z])(?=(?:.*[A-Za-z]){2,})(?=(?:.*\d){2,})(?=.*[@$!%*?&]).{6,}$/;

  return regex.test(password);
}