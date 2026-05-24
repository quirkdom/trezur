/**
 * Same as {@link Token} but with some optional fields.
 * Any Token candidate starts its life as a Tokenable; post-validation, it can be stored as a Token.
 */
export interface Tokenable {
	digits?: number;
	account: string;
	secret: string;
	period?: number; // only used for TOTP
	issuer?: string;
	type: 'HOTP' | 'TOTP';
	algorithm?: string;
	counter?: number; // only used for HOTP
}

/**
 * A token is a structure needed to generate a TOTP or HOTP code for an MFA secured account from a compliant issuer.
 */
export interface Token extends Required<Tokenable> {
	id: string;
	updatedAt?: {
		account?: number;
		issuer?: number;
		secret?: number;
		params?: number;
	};
}

export interface Settings {
	// [key: string]: any;
	showNextCode: boolean;
	useBiometricUnlock: boolean;
	sortOrder: 'asc' | 'desc' | 'none';
}

export interface Conditions {
	// [key: string]: any;
	isUserPasscodeSet: boolean;
	isAppLocked: boolean;
	isAppleDevice: boolean;
	clientId?: string;
}

export interface KVStorage {
	get(key: string): Promise<any>;
	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
}

export interface SyncState {
	tokens: Token[];
	tombstones: Record<string, number>;
}
