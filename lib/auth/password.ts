import "server-only";

import bcrypt from "bcryptjs";

export function verifyPassword(password: string, passwordHash: string) {
  if (bcrypt.truncates(password)) return Promise.resolve(false);
  return bcrypt.compare(password, passwordHash);
}

export function hashPassword(password: string) {
  if (bcrypt.truncates(password)) {
    throw new Error("Password must not exceed 72 UTF-8 bytes.");
  }
  return bcrypt.hash(password, 12);
}

export function passwordWithinBcryptLimit(password: string) {
  return !bcrypt.truncates(password);
}