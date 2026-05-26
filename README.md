# Trezur

<img src="./static/trezur_logo.svg" align="right" alt="Trezur logo by Abhishek Bhattacharya" height="24">

Trezur is a fast, simple, light-weight web-app to generate TOTP and HOTP[^1] codes for two-factor authentication.

- No sign up, ever! Trezur doesn't have any concept of user accounts and doesn't need any personal information to be functional.
- Trezur works entirely browser-side. After first load, you can use a majority of features offline[^2]. It's also a [Progressive Web App (PWA)](https://en.wikipedia.org/wiki/Progressive_web_app), so you can install it on your device for a native app-like experience.
- Your confidential token data never leaves browser storage[^3]; it is always stored encrypted at rest, with AES-256-GCM. Optionally, you can set a passcode for additional protection.
- You can choose to backup and sync your tokens securely via your preferred cloud sync provider. Currently we support Google Drive (Application Data folder), and support for S3-like providers is coming soon. Please [reach out](#support) if you have a specific provider in mind.
- To help you get started, you can import your existing tokens from a plethora of 2FA apps.

## Why?

Commentary by the author [@babhishek21](https://github.com/babhishek21/):

> I had been a long-time user of Authy, and I liked their cross-platform (including desktop) availability. It didn't hurt that I trusted Twilio and Authy's E2E encryption. In early 2024, Twilio decided to sunset Authy Desktop. At that time I started exploring alternatives and realized that it was ridiculously hard to export tokens out of Authy; this raised major red flags for me.
>
> I started looking for alternatives and landed on Raivo, which was an amazing open-source iOS option at that time. While the lack of cross-platform availability was a sore point, I was sold on the ease of import/export and the large user base. Unbeknownst to me at that time, Raivo had already been acquired by a Moroccan mobile app development company the year before. Sure enough, in the summer of 2024, Raivo switched to a paid subscription model, with reports of user data being kept hostage. I was fortunate enough to have exported my tokens out of Raivo before lockout.
>
> This was a major wake-up call for me and a great source of frustration. I don't want to migrate tokens or go through account recovery every year. I just want my 2FA tokens to be available across all my devices, without worrying about lockouts, data loss, or security. I wanted a solution that was open and auditable, cross-platform, secure and didn't require me to trust a third party with my data.
>
> I looked around at that time for something I could migrate to for _one last time._ Most options were missing one or more key requirements.
> - Bitwarden Authenticator had just come out and sync required signing up for a Bitwarden plan.
> - Ente required signing up to their Photo Cloud for sync, where the authenticator was a byproduct. Yes, I could self-host, but do I really want to host an entire cloud product suite just for 2FA?
> - 2FAS Auth cannot do syncs across OSs.
> - Google and Microsoft Authenticator are closed-source, don't have desktop apps and have a poor track record on user support and privacy.
> - I'm fairly ingrained into the Apple ecosystem, and squarely trust them with my passwords, but their modern replacement Passwords app (which has TOTP support) didn't exist then.
>
> Out of options and lacking the one-and-done solution that I desired, I decided to do it myself. Trezur is the result of that frustration and the desire to create a better solution for myself and others. It's still early days, but I'm committed to making it a great app that meets those goals.

Trezur was born out of a dual motivation:

1. The reasons that I have talked about in the commentary above.

2. Modern web technology has come a long way; the web browser is where people spend most of their time daily. It is now possible to build a secure, performant, cross-platform authenticator app that works entirely in the browser. I wanted to leverage this to create a web-app that is more accessible and easier to maintain than native apps.

## What's next?

Please read [TODO.md](TODO.md).

## Licensing & Terms

Trezur is free to use at [trezur.quirkdom.com](https://trezur.quirkdom.com). Please read the [Terms of Service](https://trezur.quirkdom.com/terms).

We don't track nor do we collect any user data. Please read the [Privacy Policy](https://trezur.quirkdom.com/privacy).

This repository is free to view and audit. An explicit license is not included. Ergo, copyright applies (subject to the rights afforded to the user due to publishing this repository on GitHub). For permission related queries, or to request other permissive licenses, please [reach out](#support).

## Support

There is no explicit support provided; please use at your own risk. However, we are committed to improving the app and keeping it secure. Please email contact@quirkdom.com with issues or questions.

### Alternatives

We highly recommend that you use **two** authenticator apps for a good balance between availability, reliability and risk. Here are some alternatives that might pair well with Trezur:

- [Chronos](https://github.com/joeldavidw/Chronos) is a lean open-source option on iOS, with encrypted iCloud sync. Early versions of Trezur were inspired by Chronos.
- [Aegis Authenticator](https://github.com/beemdevelopment/aegis) is a free and open-source authenticator app for Android only.
- [Bitwarden Authenticator](https://bitwarden.com/products/authenticator/) is a good option if you are already using Bitwarden for password management, but it doesn't have a desktop app and doesn't support cross-platform sync without using Bitwarden's password manager.
- [Ente](https://github.com/ente-io/ente) cloud provides an open source alternative to Authy via Ente Auth. Provides E2E encryption but backups are made to their own cloud (requires signing up for an account). Possible to self-host.
- [2FAS Auth](https://2fas.com/auth/) is another popular open-source option, but with limited cross-platform sync features.

We don't recommend other options like Google Authenticator, Microsoft Authenticator, Apple Passwords, Duo nor Authy for various reasons, including lack of cross-platform interoperability, lack of auditable source code, cross-selling paid products, and/or lack of security guarantees.

## Credits

### Stack
- [Svelte](https://svelte.dev/) + SvelteKit
- [TailwindCSS](https://tailwindcss.com/)
- [Vite](https://vitejs.dev/) (through SvelteKit)
- [Cloudflare Workers](https://www.cloudflare.com/products/workers/)
- Other pieces of software used can be found listed in the [package.json](package.json) file.

Trezur is almost entirely written in JavaScript, with JSDoc type hints used for type checking and documentation.

### Special thanks
- [Andrey Sitnik](https://github.com/ai) for the excellent [nanoid library](https://github.com/ai/nanoid).
- [Héctor Molinero Fernández](https://github.com/hectorm) for the excellent [otpauth library](https://github.com/hectorm/otpauth).
- [Maxwell Barvian](https://github.com/barvian) for the excellent [number-flow library](https://github.com/barvian/number-flow).
- [Paul Miller](https://github.com/paulmillr) for the excellent [QR code library](https://github.com/paulmillr/qr).
- [Paul Miller](https://github.com/paulmillr) and [Patricio Palladino](https://github.com/alcuadrado) for the excellent [scure library](https://paulmillr.com/noble/#scure).
- Favicon: Key by [Bucky Clarke](https://thenounproject.com/creator/indur/) from [Noun Project](https://thenounproject.com/browse/icons/term/key/) (CC BY 3.0).
    - Modification: Color of the icon material changed from black to orange.


[^1]: Not implemented yet; coming soon.
[^2]: Features like QR code scanning & generation require dynamically loading libraries on-demand when the features are utilized; once loaded, they will be available for use offline. Other features like Cloud Sync & Backup require network connection.
[^3]: Except when a Cloud Sync provider is connected.
