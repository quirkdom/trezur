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

export interface AsyncStorageEngine {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
	clear(): Promise<void>;
	keys(): Promise<string[]>;
}

export interface EncryptedStorage {
	get(key: string): Promise<any>;
	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;
	purge(): Promise<void>;
	needsMigration: boolean; // TODO: remove this once we have migrated all users
	msk?: Uint8Array;
}
