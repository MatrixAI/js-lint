# Rules
- [MXS-ARCH-SEC-001] (Polykey agents) Key material operations MUST respect password ops/mem limits and strict memory lock flags as configured in keys options; tests MUST assert limits are enforced during agent lifecycle.
- [MXS-ARCH-SEC-002] (Polykey agents) Schema state version mismatches MUST block agent start to prevent downgrade/upgrade corruption; the guard MUST reject incompatible migrations before any side effects.
- [MXS-ARCH-SEC-003] (Polykey agents) Root keypair renew/reset MUST emit cert change events for consumers to react to trust changes; events MUST be observable by dependent components.
- [MXS-ARCH-SEC-004] (Polykey agents) State paths (`status`, `state/keys`, `state/db`, `state/vaults`) MUST exist after start/stop; destroy MUST remove all but the status marker to prove teardown correctness.
- [MXS-ARCH-SEC-005] (Polykey agents) Access control lists MUST be managed through shared generators and tracked counts; operations MUST run within transactions to maintain consistency and auditability.

## Exhibits (non-normative)
- ACL policy shape and transactional enforcement `src/acl/policy.ts`:
  ```ts
  export type ACLRule = {
    subject: string;
    resource: string;
    action: 'read' | 'write' | 'admin';
    effect: 'allow' | 'deny';
  };

  export const policy: ACLRule[] = [
    { subject: 'agent', resource: 'vault:*', action: 'read', effect: 'allow' },
    { subject: 'agent', resource: 'vault:*', action: 'write', effect: 'deny' },
  ];
  ```
- Policy test asserting deny-overrides-allow with transaction guard `tests/acl/policy.test.ts`:
  ```ts
  it('enforces deny precedence within a transaction', async () => {
    await db.transaction(async (tx) => {
      const result = await enforce(tx, policy, { subject: 'agent', resource: 'vault:alpha', action: 'write' });
      expect(result).toEqual({ decision: 'deny', matched: policy[1] });
    });
  });
  ```
