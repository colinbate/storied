import assert from 'node:assert/strict';
import test from 'node:test';
import { database } from './database.mjs';
import { createMagicLink, verifyMagicLinkCode } from '../src/lib/server/auth.ts';
import { sendMagicLinkEmail } from '../src/lib/server/email.ts';

// The former 220-character preview cut this code down to five digits.
test('disabled email logs the complete magic link and all six code digits for local origins', async (context) => {
	const logger = context.mock.method(console, 'log', () => {});
	const delivery = context.mock.fn(async () => {
		throw new Error('Email should stay disabled');
	});
	const platform = { env: { SEND_EMAILS: false, EMAIL: { send: delivery } } };
	const token = 'x'.repeat(48);
	for (const origin of [
		'http://localhost:5999',
		'http://192.168.1.10:5999',
		'https://local-testing.example.test'
	]) {
		await sendMagicLinkEmail(platform, 'reader@example.test', token, '012345', origin);
		const body = logger.mock.calls.at(-1).arguments[1].text;
		assert.ok(body.includes(`${origin}/auth/verify?token=${token}`));
		assert.ok(body.includes('\n\n012345\n\n'));
		assert.ok(body.endsWith("If you didn't request this, you can safely ignore this email."));
	}
	assert.equal(delivery.mock.callCount(), 0);
});

test('a code starting with zero survives generation, terminal logging and one-time verification', async (context) => {
	const { db } = database();
	const randomValues = crypto.getRandomValues.bind(crypto);
	context.mock.method(crypto, 'getRandomValues', (values) => {
		if (values instanceof Uint32Array && values.length === 1) {
			values[0] = 12345;
			return values;
		}
		return randomValues(values);
	});
	const logger = context.mock.method(console, 'log', () => {});
	const link = await createMagicLink(db, 'reader@example.test');
	assert.equal(link.code, '012345');
	await sendMagicLinkEmail(
		{ env: { SEND_EMAILS: false } },
		'reader@example.test',
		link.token,
		link.code,
		'http://192.168.1.10:5999'
	);
	const loggedCode = logger.mock.calls.at(-1).arguments[1].text.match(/\n\n(\d{6})\n\n/)[1];
	assert.deepEqual(await verifyMagicLinkCode(db, 'reader@example.test', loggedCode), {
		email: 'reader@example.test',
		userId: null
	});
	assert.deepEqual(await verifyMagicLinkCode(db, 'reader@example.test', loggedCode), {
		error: 'invalid'
	});
});
