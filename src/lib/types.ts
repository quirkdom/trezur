/**
 * Same as {@link Token} but with some optional fields.
 * Any Token candidate starts it's life as a Tokenable; post-validation, it can be stored as a Token.
 */
export interface Tokenable {
	digits?: number;
	account: string;
	secret: string;
	period?: number;
	issuer?: string;
	type: 'HOTP' | 'TOTP';
	algorithm?: string;
	counter?: number;
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
}
