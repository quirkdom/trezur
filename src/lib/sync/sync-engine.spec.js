import { describe, it, expect } from 'vitest';
import { resolveSyncConflicts } from './sync-engine';

/** @typedef {import('$lib/types').Token} Token */

describe('Sync Engine Conflict Resolution', () => {
	it('should adopt a legacy cloud token (timestamp 0) when no tombstone exists', () => {
		const local = {
			tokens: /** @type {Token[]} */ ([]),
			tombstones: {}
		};

		const cloud = {
			tokens: /** @type {Token[]} */ ([
				{
					id: 'token-1',
					account: 'test-legacy',
					secret: 'secret1',
					issuer: '',
					digits: 6,
					period: 30,
					algorithm: 'SHA1',
					type: 'TOTP',
					counter: 0
					// No updatedAt timestamp (legacy)
				}
			]),
			tombstones: {}
		};

		const merged = resolveSyncConflicts(local, cloud);

		expect(merged.tokens).toHaveLength(1);
		expect(merged.tokens[0]).toEqual({
			id: 'token-1',
			account: 'test-legacy',
			secret: 'secret1',
			issuer: '',
			digits: 6,
			period: 30,
			algorithm: 'SHA1',
			type: 'TOTP',
			counter: 0
		});
		expect(merged.tombstones).toEqual({});
	});

	it('should discard a legacy cloud token (timestamp 0) when a tombstone exists', () => {
		const local = {
			tokens: /** @type {Token[]} */ ([]),
			tombstones: {
				'token-1': 1700000000000
			}
		};

		const cloud = {
			tokens: /** @type {Token[]} */ ([
				{
					id: 'token-1',
					account: 'test-legacy',
					secret: 'secret1',
					issuer: '',
					digits: 6,
					period: 30,
					algorithm: 'SHA1',
					type: 'TOTP',
					counter: 0
				}
			]),
			tombstones: {}
		};

		const merged = resolveSyncConflicts(local, cloud);

		expect(merged.tokens).toHaveLength(0);
		expect(merged.tombstones).toEqual({
			'token-1': 1700000000000
		});
	});

	it('should adopt a modern cloud token with timestamps when no tombstone exists', () => {
		const local = {
			tokens: /** @type {Token[]} */ ([]),
			tombstones: {}
		};

		const cloud = {
			tokens: /** @type {Token[]} */ ([
				{
					id: 'token-2',
					account: 'test-modern',
					secret: 'secret2',
					issuer: '',
					digits: 6,
					period: 30,
					algorithm: 'SHA1',
					type: 'TOTP',
					counter: 0,
					updatedAt: {
						account: 1700000000000,
						issuer: 1700000000000,
						secret: 1700000000000,
						params: 1700000000000
					}
				}
			]),
			tombstones: {}
		};

		const merged = resolveSyncConflicts(local, cloud);

		expect(merged.tokens).toHaveLength(1);
		expect(merged.tokens[0].id).toBe('token-2');
		expect(merged.tokens[0].account).toBe('test-modern');
	});

	it('should merge a local token and cloud token using LWW per-field logic', () => {
		const local = {
			tokens: /** @type {Token[]} */ ([
				{
					id: 'token-3',
					account: 'local-account',
					issuer: 'local-issuer',
					secret: 'secret3',
					digits: 6,
					period: 30,
					algorithm: 'SHA1',
					type: 'TOTP',
					counter: 0,
					updatedAt: {
						account: 2000000000000, // local wins
						issuer: 1000000000000, // cloud wins
						secret: 1000000000000, // tie-break (cloud wins)
						params: 1000000000000
					}
				}
			]),
			tombstones: {}
		};

		const cloud = {
			tokens: /** @type {Token[]} */ ([
				{
					id: 'token-3',
					account: 'cloud-account',
					issuer: 'cloud-issuer',
					secret: 'secret3-new',
					digits: 6,
					period: 30,
					algorithm: 'SHA1',
					type: 'TOTP',
					counter: 0,
					updatedAt: {
						account: 1000000000000,
						issuer: 2000000000000,
						secret: 1000000000000,
						params: 1000000000000
					}
				}
			]),
			tombstones: {}
		};

		const merged = resolveSyncConflicts(local, cloud);

		expect(merged.tokens).toHaveLength(1);
		const mergedT = merged.tokens[0];

		expect(mergedT.account).toBe('local-account');
		expect(mergedT.issuer).toBe('cloud-issuer');
		expect(mergedT.secret).toBe('secret3-new'); // cloud wins tie-break
	});

	it('should delete a local token when a newer cloud tombstone is present', () => {
		const local = {
			tokens: /** @type {Token[]} */ ([
				{
					id: 'token-4',
					account: 'active-local',
					issuer: '',
					secret: 'secret4',
					digits: 6,
					period: 30,
					algorithm: 'SHA1',
					type: 'TOTP',
					counter: 0,
					updatedAt: {
						account: 1000000000000,
						issuer: 1000000000000,
						secret: 1000000000000,
						params: 1000000000000
					}
				}
			]),
			tombstones: {}
		};

		const cloud = {
			tokens: /** @type {Token[]} */ ([]),
			tombstones: {
				'token-4': 2000000000000 // newer deletion
			}
		};

		const merged = resolveSyncConflicts(local, cloud);

		expect(merged.tokens).toHaveLength(0);
		expect(merged.tombstones).toEqual({
			'token-4': 2000000000000
		});
	});
});
