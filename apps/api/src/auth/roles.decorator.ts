import { SetMetadata } from '@nestjs/common';

import type { AccountRecord } from './auth.repository.js';

/** Clé de métadonnée lue par la garde de rôle. */
export const REQUIRED_ROLES = 'mijote.roles';

/** Restreint une route à certains rôles. Sans elle, tout rôle passe. */
export function Roles(...roles: AccountRecord['role'][]): MethodDecorator & ClassDecorator {
  return SetMetadata(REQUIRED_ROLES, roles);
}
