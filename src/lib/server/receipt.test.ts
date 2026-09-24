import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTescoReceiptEmail } from './receipt';

const receiptDirectory = join(process.cwd(), 'test-receipts');
const receiptFiles = existsSync(receiptDirectory)
	? readdirSync(receiptDirectory).filter((file) => file.toLowerCase().endsWith('.eml'))
	: [];

describe('parseTescoReceiptEmail', () => {
	it('matches the checked local receipt outcomes', async () => {
		if (receiptFiles.length === 0) {
			throw new Error(
				'No local receipt fixtures found. Put final Tesco .eml receipts in test-receipts/, then run npm test again.'
			);
		}

		const expectedPath = join(receiptDirectory, 'expected.json');
		if (!existsSync(expectedPath)) {
			throw new Error(
				'Add checked outcomes to test-receipts/expected.json before running npm test.'
			);
		}

		type Expected = { lines: number; quantity: number; cents: number; sha256: string };
		const expected = JSON.parse(await readFile(expectedPath, 'utf8')) as Record<string, Expected>;
		const receiptDates = receiptFiles.map((file) => file.slice(0, 10)).sort();
		expect(receiptDates).toEqual(Object.keys(expected).sort());

		for (const file of receiptFiles) {
			const items = await parseTescoReceiptEmail(await readFile(join(receiptDirectory, file)));
			const actual = {
				lines: items.length,
				quantity: items.reduce((sum, item) => sum + item.quantity, 0),
				cents: items.reduce((sum, item) => sum + Math.round(item.cost * 100), 0),
				sha256: createHash('sha256').update(JSON.stringify(items)).digest('hex')
			};
			expect(actual, `Receipt ${file.slice(0, 10)}`).toEqual(expected[file.slice(0, 10)]);
		}
	});
});
