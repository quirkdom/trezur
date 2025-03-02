/**
 *
 * A token is the collection of information needed to generate a TOTP or HOTP code for an MFA secured account from a compliant issuer.
 */
export interface Token {
	digits: number;
	account: string;
	secret: string;
	period: number;
	issuer: string;
	type: string;
	algorithm: string;
	pinned: boolean;
	counter: number;
}

export interface Settings {
	[key: string]: any;
	showNextCode: boolean;
	useBiometricUnlock: boolean;
	sortOrder: 'asc' | 'desc' | 'none';
}

export interface Conditions {
	[key: string]: any;
	isUserPasscodeSet: boolean;
	isAppLocked: boolean;
}
