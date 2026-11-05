import { hash, verify } from '@node-rs/argon2';

// OWASP's recommended minimum for Argon2id, which is this library's default algorithm.
// Set explicitly because its default memory is far lower, which would make stolen hashes
// quicker to crack. test/auth.e2e-spec.ts checks stored hashes really use these values.
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // KiB (19 MiB)
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
