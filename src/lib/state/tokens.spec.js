import { describe, it, expect } from 'vitest';
import { mergeTokens, getMaxTimestamp } from './tokens.svelte';

/** @typedef {import('$lib/types').Token} Token */

describe('Tokens State - mergeTokens & getMaxTimestamp', () => {
	describe('getMaxTimestamp', () => {
		it('should return 0 for legacy tokens without updatedAt', () => {
			const token = /** @type {Token} */ ({
				id: '1',
				account: 'test',
				secret: 'secret'
			});
			expect(getMaxTimestamp(token)).toBe(0);
		});

		it('should return the maximum timestamp from updatedAt fields', () => {
			const token = /** @type {Token} */ ({
				id: '1',
				account: 'test',
				secret: 'secret',
				updatedAt: {
					account: 100,
					issuer: 200,
					secret: 150,
					params: 50
				}
			});
			expect(getMaxTimestamp(token)).toBe(200);
		});
	});

	describe('mergeTokens', () => {
		it('should let incoming (tokenB) win on tie-breaker (equal timestamps)', () => {
			const tokenA = /** @type {Token} */ ({
				id: '1',
				account: 'local-account',
				issuer: 'local-issuer',
				secret: 'local-secret',
				digits: 6,
				period: 30,
				algorithm: 'SHA1',
				type: 'TOTP',
				counter: 0,
				updatedAt: {
					account: 1000,
					issuer: 1000,
					secret: 1000,
					params: 1000
				}
			});

			const tokenB = /** @type {Token} */ ({
				id: '1',
				account: 'cloud-account',
				issuer: 'cloud-issuer',
				secret: 'cloud-secret',
				digits: 8,
				period: 60,
				algorithm: 'SHA256',
				type: 'TOTP',
				counter: 0,
				updatedAt: {
					account: 1000,
					issuer: 1000,
					secret: 1000,
					params: 1000
				}
			});

			const merged = mergeTokens(tokenA, tokenB);

			// Incoming wins on tie-break for all fields
			expect(merged.account).toBe('cloud-account');
			expect(merged.issuer).toBe('cloud-issuer');
			expect(merged.secret).toBe('cloud-secret');
			expect(merged.digits).toBe(8);
			expect(merged.period).toBe(60);
			expect(merged.algorithm).toBe('SHA256');
		});

		it('should let local (tokenA) win when its timestamp is greater', () => {
			const tokenA = /** @type {Token} */ ({
				id: '1',
				account: 'local-account',
				issuer: 'local-issuer',
				secret: 'local-secret',
				digits: 6,
				period: 30,
				algorithm: 'SHA1',
				type: 'TOTP',
				counter: 0,
				updatedAt: {
					account: 2000, // local wins
					issuer: 1000,
					secret: 1000,
					params: 1000
				}
			});

			const tokenB = /** @type {Token} */ ({
				id: '1',
				account: 'cloud-account',
				issuer: 'cloud-issuer',
				secret: 'cloud-secret',
				digits: 8,
				period: 60,
				algorithm: 'SHA256',
				type: 'TOTP',
				counter: 0,
				updatedAt: {
					account: 1000,
					issuer: 1000,
					secret: 1000,
					params: 1000
				}
			});

			const merged = mergeTokens(tokenA, tokenB);

			expect(merged.account).toBe('local-account'); // local won account
			expect(merged.issuer).toBe('cloud-issuer'); // cloud won issuer on tie-break
		});

		it('should correctly handle legacy tokens (timestamp 0)', () => {
			const tokenA = /** @type {Token} */ ({
				id: '1',
				account: 'local-account',
				issuer: 'local-issuer',
				secret: 'local-secret',
				digits: 6,
				period: 30,
				algorithm: 'SHA1',
				type: 'TOTP',
				counter: 0
				// No updatedAt (legacy)
			});

			const tokenB = /** @type {Token} */ ({
				id: '1',
				account: 'cloud-account',
				issuer: 'cloud-issuer',
				secret: 'cloud-secret',
				digits: 8,
				period: 60,
				algorithm: 'SHA256',
				type: 'TOTP',
				counter: 0,
				updatedAt: {
					account: 1000,
					issuer: 1000,
					secret: 1000,
					params: 1000
				}
			});

			const merged = mergeTokens(tokenA, tokenB);

			// Modern wins over legacy
			expect(merged.account).toBe('cloud-account');
			expect(merged.issuer).toBe('cloud-issuer');
			expect(merged.secret).toBe('cloud-secret');
			expect(merged.digits).toBe(8);
		});
	});
});
