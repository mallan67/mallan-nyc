/// <reference types="jest" />
/**
 * Central broker-session invariant.
 *
 * INVARIANT: a principal BROKER must not receive a normal authenticated
 * BROKER session until broker MFA has been successfully verified.
 *
 * Enforcement lives in the ONE session writer (lib/auth/session.ts
 * createSession), because `prisma.session.create` appears nowhere else in
 * app/ or lib/. A future caller that forgets a broker check must therefore
 * FAIL CLOSED rather than silently mint a broker session.
 *
 * ASSOCIATE_BROKER is a distinct professional class and is deliberately NOT
 * covered by this gate. The role test is exact-match, never a substring of
 * free text.
 */

const sessionCreate = jest.fn(async (args: unknown) => args);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    session: {
      create: (...args: unknown[]) => sessionCreate(args[0]),
      findUnique: jest.fn(async () => null),
      delete: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
  },
}));

import {
  createSession,
  isPrincipalBrokerRole,
  BrokerSessionAssuranceError,
} from '../session';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function setEnv(nodeEnv: string, allowDevLogin?: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
  if (allowDevLogin === undefined) {
    delete (process.env as Record<string, string | undefined>).ALLOW_DEV_LOGIN;
  } else {
    (process.env as Record<string, string | undefined>).ALLOW_DEV_LOGIN = allowDevLogin;
  }
}

describe('isPrincipalBrokerRole — exact match, never substring', () => {
  it('matches the canonical and legacy principal-broker values', () => {
    expect(isPrincipalBrokerRole('BROKER')).toBe(true);
    expect(isPrincipalBrokerRole('broker')).toBe(true);
  });

  it('does NOT match ASSOCIATE_BROKER — a distinct professional class', () => {
    expect(isPrincipalBrokerRole('ASSOCIATE_BROKER')).toBe(false);
    expect(isPrincipalBrokerRole('associate_broker')).toBe(false);
  });

  it('does NOT match other roles or broker-containing free text', () => {
    expect(isPrincipalBrokerRole('SALESPERSON')).toBe(false);
    expect(isPrincipalBrokerRole('AGENT')).toBe(false);
    expect(isPrincipalBrokerRole('buyer')).toBe(false);
    expect(isPrincipalBrokerRole('Licensed Associate Real Estate Broker')).toBe(false);
    expect(isPrincipalBrokerRole('')).toBe(false);
  });
});

describe('createSession — BROKER requires explicit assurance (fail closed)', () => {
  it('REFUSES a BROKER agent session with no assurance and writes no row', async () => {
    await expect(createSession('agent', 1n, 'BROKER')).rejects.toBeInstanceOf(
      BrokerSessionAssuranceError,
    );
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('REFUSES the legacy lowercase broker role with no assurance', async () => {
    await expect(createSession('agent', 1n, 'broker')).rejects.toBeInstanceOf(
      BrokerSessionAssuranceError,
    );
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('ALLOWS a BROKER session when MFA has been verified', async () => {
    const token = await createSession('agent', 1n, 'BROKER', undefined, undefined, {
      kind: 'mfa_verified',
    });
    expect(typeof token).toBe('string');
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });
});

describe('createSession — the gate is not broadened beyond principal BROKER', () => {
  it('ALLOWS ASSOCIATE_BROKER without assurance', async () => {
    await expect(createSession('agent', 21n, 'ASSOCIATE_BROKER')).resolves.toEqual(
      expect.any(String),
    );
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('ALLOWS SALESPERSON without assurance', async () => {
    await expect(createSession('agent', 19n, 'SALESPERSON')).resolves.toEqual(
      expect.any(String),
    );
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('ALLOWS lead/client sessions without assurance', async () => {
    await expect(createSession('lead', 5n, 'buyer')).resolves.toEqual(expect.any(String));
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('does NOT gate a lead whose role string happens to be BROKER', async () => {
    // The gate is about AGENT principal brokers. A lead is never a licensee.
    await expect(createSession('lead', 6n, 'BROKER')).resolves.toEqual(expect.any(String));
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });
});

describe('delegated impersonation interaction — lane edab58bb, NOT modified here', () => {
  // app/api/crm/agents/[id]/impersonate/route.ts calls the ordinary primitive
  // as createSession("agent", agent.id, agent.role, ip, undefined). These
  // assertions pin what that call now does for each target class, so the
  // delegated-access lane can be designed against known behaviour without
  // either workstream editing the other.

  it('ordinary NON-BROKER delegated session creation is UNCHANGED', async () => {
    await expect(createSession('agent', 19n, 'SALESPERSON', '1.2.3.4')).resolves.toEqual(
      expect.any(String),
    );
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('ASSOCIATE_BROKER delegated session creation is UNCHANGED', async () => {
    await expect(
      createSession('agent', 21n, 'ASSOCIATE_BROKER', '1.2.3.4'),
    ).resolves.toEqual(expect.any(String));
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('a delegated session targeting a principal BROKER now FAILS CLOSED', async () => {
    // Independently consistent with the delegated-access policy, which already
    // rejects BROKER targets. This does not implement that policy; it proves
    // the session authority cannot be used to circumvent it.
    await expect(createSession('agent', 18n, 'BROKER', '1.2.3.4')).rejects.toBeInstanceOf(
      BrokerSessionAssuranceError,
    );
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe('createSession — dev_login assurance is environment-gated defensively', () => {
  it('REFUSES dev_login in production even when the flag is set', async () => {
    setEnv('production', 'true');
    await expect(
      createSession('agent', 1n, 'BROKER', undefined, undefined, { kind: 'dev_login' }),
    ).rejects.toBeInstanceOf(BrokerSessionAssuranceError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('REFUSES dev_login outside production when the flag is absent', async () => {
    setEnv('development', undefined);
    await expect(
      createSession('agent', 1n, 'BROKER', undefined, undefined, { kind: 'dev_login' }),
    ).rejects.toBeInstanceOf(BrokerSessionAssuranceError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('REFUSES dev_login outside production when the flag is not exactly "true"', async () => {
    setEnv('development', '1');
    await expect(
      createSession('agent', 1n, 'BROKER', undefined, undefined, { kind: 'dev_login' }),
    ).rejects.toBeInstanceOf(BrokerSessionAssuranceError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('ALLOWS dev_login only outside production with the flag exactly "true"', async () => {
    setEnv('development', 'true');
    await expect(
      createSession('agent', 1n, 'BROKER', undefined, undefined, { kind: 'dev_login' }),
    ).resolves.toEqual(expect.any(String));
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });
});
