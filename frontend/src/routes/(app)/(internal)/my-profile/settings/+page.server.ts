import { ALLAUTH_API_URL, BASE_API_URL } from '$lib/utils/constants';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { activateTOTPSchema } from './mfa/utils/schemas';
import { message, setError, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { setFlash } from 'sveltekit-flash-message/server';
import { m } from '$paraglide/messages';
import { safeTranslate } from '$lib/utils/i18n';
import { z } from 'zod';
import { AuthTokenCreateSchema } from '$lib/utils/schemas';

export const load: PageServerLoad = async (event) => {
	const authenticatorsEndpoint = `${ALLAUTH_API_URL}/account/authenticators`;
	const authenticatorsResponse = await event
		.fetch(authenticatorsEndpoint)
		.then((res) => res.json());
	if (authenticatorsResponse.status !== 200) {
		console.error('Could not get authenticators', authenticatorsResponse);
		fail(authenticatorsResponse.status, { error: 'Could not get authenticators' });
	}
	const authenticators = authenticatorsResponse.data;

	let totp = null;
	let recoveryCodes = null;

	const totpEndpoint = `${authenticatorsEndpoint}/totp`;
	const totpResponse = await event.fetch(totpEndpoint).then((res) => res.json());
	totp = totpResponse.meta;

	if (authenticators.find((auth) => auth.type === 'recovery_codes')) {
		const recoveryCodesEndpoint = `${authenticatorsEndpoint}/recovery-codes`;
		const recoveryCodesResponse = await event
			.fetch(recoveryCodesEndpoint)
			.then((res) => res.json());
		if (recoveryCodesResponse.status === 200) {
			recoveryCodes = recoveryCodesResponse.data;
		}
	}

	const activateTOTPForm = await superValidate(zod(activateTOTPSchema));

	const personalAccessTokensEndpoint = `${BASE_API_URL}/iam/auth-tokens/`;
	const personalAccessTokensResponse = await event.fetch(personalAccessTokensEndpoint);
	if (!personalAccessTokensResponse.ok) {
		console.error('Could not get personal access tokens', personalAccessTokensResponse);
		fail(personalAccessTokensResponse.status, { error: 'Could not get personal access tokens' });
	}
	const personalAccessTokens = await personalAccessTokensResponse.json();
	const personalAccessTokenCreateForm = await superValidate(zod(AuthTokenCreateSchema));
	const personalAccessTokenDeleteForm = await superValidate(zod(z.object({ id: z.string() })));

	return {
		authenticators,
		totp,
		activateTOTPForm,
		recoveryCodes,
		personalAccessTokens,
		personalAccessTokenCreateForm,
		personalAccessTokenDeleteForm,
		title: m.settings()
	};
};

export const actions: Actions = {
	activateTOTP: async (event) => {
		const formData = await event.request.formData();
		if (!formData) return fail(400, { error: 'No form data' });

		const form = await superValidate(formData, zod(activateTOTPSchema));
		if (!form.valid) return fail(400, { form });

		const endpoint = `${ALLAUTH_API_URL}/account/authenticators/totp`;
		const requestInitOptions: RequestInit = {
			method: 'POST',
			body: JSON.stringify(form.data)
		};

		const response = await event.fetch(endpoint, requestInitOptions);
		const data = await response.json();

		if (data.status !== 200) {
			console.error('Could not activate TOTP', data);
			if (Object.hasOwn(data, 'errors')) {
				data.errors.forEach((error) => {
					console.log('error', error.param, safeTranslate(error.code));
					setError(form, error.param, error.message);
				});
			}
			return fail(data.status, { form });
		}

		setFlash({ type: 'success', message: m.successfullyActivatedTOTP() }, event);
		return { form };
	},
	deactivateTOTP: async (event) => {
		const formData = await event.request.formData();
		if (!formData) return fail(400, { error: 'No form data' });

		const form = await superValidate(
			formData,
			zod(
				z.object({
					any: z.any()
				})
			)
		);

		const endpoint = `${ALLAUTH_API_URL}/account/authenticators/totp`;
		const requestInitOptions: RequestInit = {
			method: 'DELETE'
		};

		const response = await event.fetch(endpoint, requestInitOptions).then((res) => res.json());
		if (response.status !== 200) {
			console.error('Could not deactivate TOTP', response);
			return fail(response.status, { error: 'Could not deactivate TOTP' });
		}

		setFlash({ type: 'success', message: m.successfullyDeactivatedTOTP() }, event);
		return { form };
	},
	regenerateRecoveryCodes: async (event) => {
		const recoveryCodesEndpoint = `${ALLAUTH_API_URL}/account/authenticators/recovery-codes`;
		const requestInitOptions: RequestInit = {
			method: 'POST'
		};

		const response = await event
			.fetch(recoveryCodesEndpoint, requestInitOptions)
			.then((res) => res.json());

		if (response.status !== 200) {
			console.error('Could not regenerate recovery codes', response);
			setFlash({ type: 'error', message: m.errorRegeneratingRecoveryCodes() }, event);
			return fail(response.status, { error: 'Could not regenerate recovery codes' });
		}

		return { recoveryCodes: response.data };
	},
	createPAT: async (event) => {
		const formData = await event.request.formData();
		if (!formData) return fail(400, { error: 'No form data' });

		const form = await superValidate(formData, zod(AuthTokenCreateSchema));
		if (!form.valid) return fail(400, { form });

		const endpoint = `${BASE_API_URL}/iam/auth-tokens/`;
		const requestInitOptions: RequestInit = {
			method: 'POST',
			body: JSON.stringify(form.data)
		};

		const response = await event.fetch(endpoint, requestInitOptions);

		if (!response.ok) {
			console.error('Could not create PAT');
			try {
				const errorResponse = await response.json();
				const errorMessage = errorResponse?.error || m.errorCreatingPersonalAccessToken();
				setFlash({ type: 'error', message: safeTranslate(errorMessage) }, event);
			} catch (e) {
				setFlash({ type: 'error', message: m.errorCreatingPersonalAccessToken() }, event);
			}
			return fail(response.status, { form });
		}

		const data = await response.json();
		return message(form, { status: response.status, data });
	},
	deletePAT: async (event) => {
		const formData = await event.request.formData();
		if (!formData) return fail(400, { error: 'No form data' });

		const form = await superValidate(formData, zod(z.object({ id: z.string() })));
		if (!form.valid) return fail(400, { form });

		const endpoint = `${BASE_API_URL}/iam/auth-tokens/${form.data.id}/`;
		const requestInitOptions: RequestInit = {
			method: 'DELETE'
		};

		const response = await event.fetch(endpoint, requestInitOptions);

		if (!response.ok) {
			console.error('Could not delete PAT');
			return fail(response.status, { form });
		}

		setFlash({ type: 'success', message: m.successfullyDeletedPersonalAccessToken() }, event);
		return message(form, { status: response.status });
	}
};
