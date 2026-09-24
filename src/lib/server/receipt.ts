import type { ReceiptEntry } from '$lib/types';
import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { simpleParser } from 'mailparser';

const REQUIRED_SUMMARY_LABELS = [
	'Basket value before offers',
	'Offers',
	'Total basket value',
	'Total paid'
] as const;

const OPTIONAL_ITEM_ADJUSTMENTS = ['Deposits', 'Vouchers', 'Refund The Difference'] as const;

const ORDER_CHARGE_LABELS = new Set([
	'Minimum basket charge',
	'Min basket charge',
	'Pick, pack and deliver',
	'Service charge',
	'Minimum basket charge removed',
	'Min basket charge removed',
	'Delivery Saver discount'
]);

export class ReceiptParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReceiptParseError';
	}
}

function normaliseText(value: string): string {
	return value
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normaliseLabel(value: string): string {
	return normaliseText(value).replace(/^#\s*/, '');
}

function cellText($cell: Cheerio<AnyNode>): string {
	const copy = $cell.clone();
	copy.find('table').remove();
	return normaliseText(copy.text());
}

function cleanProductName(value: string): string {
	return normaliseText(value).replace(/^[†‡§*#]+\s*/u, '');
}

function parseMoney(value: string, description: string): number {
	const normalised = normaliseText(value)
		.replace(/\s/g, '')
		.replace(/^[†‡§*#]+/u, '')
		.replace(/[†‡§*#]+$/u, '');
	const match = normalised.match(/^(-?)€(\d+(?:,\d{3})*)\.(\d{2})$/u);
	if (!match) throw new ReceiptParseError(`Invalid ${description}: "${normaliseText(value)}".`);

	const cents = Number(match[2].replace(/,/g, '')) * 100 + Number(match[3]);
	return match[1] === '-' ? -cents : cents;
}

function isHidden($: cheerio.CheerioAPI, element: AnyNode): boolean {
	return $(element)
		.add($(element).parents())
		.toArray()
		.some((node) => {
			const style = ($(node).attr('style') ?? '').replace(/\s/g, '').toLowerCase();
			return style.includes('display:none') || $(node).attr('hidden') !== undefined;
		});
}

function headingIndex(
	$: cheerio.CheerioAPI,
	elements: AnyNode[],
	label: string
): number | undefined {
	const heading = elements.find(
		(element) =>
			/^h[1-6]$/i.test(element.type === 'tag' ? element.name : '') &&
			normaliseText($(element).text()).toLowerCase().startsWith(label.toLowerCase())
	);
	return heading ? elements.indexOf(heading) : undefined;
}

type ColumnMap = { quantity: number; product: number; total: number };

function mapColumns($: cheerio.CheerioAPI, row: AnyNode): ColumnMap | undefined {
	const headers = $(row)
		.children('th, td')
		.map((_, cell) => normaliseText($(cell).text()).toLowerCase())
		.get();
	const quantity = headers.indexOf('qty');
	const product = headers.indexOf('product');
	const total = headers.indexOf('total');

	if (quantity < 0 || product < 0 || total < 0) return undefined;
	return { quantity, product, total };
}

function sectionTables(
	$: cheerio.CheerioAPI,
	elements: AnyNode[],
	section: string,
	nextSections: string[]
): Array<{ table: AnyNode; columns: ColumnMap }> {
	const start = headingIndex($, elements, section);
	if (start === undefined) return [];

	const possibleEnds = nextSections
		.map((label) => headingIndex($, elements, label))
		.filter((index): index is number => index !== undefined && index > start);
	const end = possibleEnds.length > 0 ? Math.min(...possibleEnds) : elements.length;
	const tables = new Map<AnyNode, ColumnMap>();

	for (const element of elements.slice(start + 1, end)) {
		if (element.type !== 'tag' || element.name !== 'tr') continue;
		const columns = mapColumns($, element);
		if (!columns) continue;
		const table = $(element).closest('table').get(0);
		if (table) tables.set(table, columns);
	}

	return [...tables].map(([table, columns]) => ({ table, columns }));
}

function rowValues($: cheerio.CheerioAPI, row: AnyNode): string[] {
	return $(row)
		.children('th, td')
		.map((_, cell) => cellText($(cell)))
		.get();
}

function directTableRows($: cheerio.CheerioAPI, table: AnyNode): AnyNode[] {
	return $(table)
		.children('thead, tbody, tfoot')
		.children('tr')
		.add($(table).children('tr'))
		.toArray();
}

function parseQuantity(value: string): number {
	if (!/^\d+$/.test(value)) throw new ReceiptParseError(`Invalid product quantity: "${value}".`);
	const quantity = Number(value);
	if (!Number.isSafeInteger(quantity) || quantity <= 0)
		throw new ReceiptParseError('Product quantities must be positive whole numbers.');
	return quantity;
}

function extractRegularItems(
	$: cheerio.CheerioAPI,
	table: AnyNode,
	columns: ColumnMap
): ReceiptEntry[] {
	const items: ReceiptEntry[] = [];

	for (const row of directTableRows($, table)) {
		if (isHidden($, row) || mapColumns($, row)) continue;
		const values = rowValues($, row);
		const quantityText = values[columns.quantity] ?? '';
		const productText = values[columns.product] ?? '';
		const totalText = values[columns.total] ?? '';

		if (!productText && !totalText) continue;
		if (!quantityText || !productText || !totalText)
			throw new ReceiptParseError('A product row is missing its quantity, name or total.');

		const product = cleanProductName(productText);
		if (!product) throw new ReceiptParseError('A product row has an empty name.');
		const quantity = parseQuantity(quantityText);
		const costInCents = parseMoney(totalText, `total for ${product}`);
		if (costInCents < 0)
			throw new ReceiptParseError(`The total for ${product} cannot be negative.`);

		items.push({ product, quantity, cost: costInCents / 100 });
	}

	return items;
}

function extractSubstitutions(
	$: cheerio.CheerioAPI,
	table: AnyNode,
	columns: ColumnMap
): ReceiptEntry[] {
	const rows = directTableRows($, table).filter((row) => !isHidden($, row));
	const items: ReceiptEntry[] = [];

	for (let index = 0; index < rows.length; index += 1) {
		const values = rowValues($, rows[index]);
		if (!values.some((value) => normaliseLabel(value).toLowerCase() === 'substituted with:'))
			continue;

		const totalText = values[columns.total] ?? '';
		if (!totalText) throw new ReceiptParseError('A substitution is missing its charged total.');

		const replacementRows: string[][] = [];
		for (let next = index + 1; next < rows.length; next += 1) {
			const candidate = rowValues($, rows[next]);
			if (candidate.some((value) => normaliseLabel(value).toLowerCase() === 'substituted with:'))
				break;
			if (candidate[columns.quantity] || candidate[columns.product])
				replacementRows.push(candidate);
			else if (replacementRows.length > 0) break;
		}

		if (replacementRows.length !== 1)
			throw new ReceiptParseError(
				'A substitution must contain exactly one replacement with an individual charged total.'
			);

		const replacement = replacementRows[0];
		const product = cleanProductName(replacement[columns.product] ?? '');
		if (!product) throw new ReceiptParseError('A substitution replacement has an empty name.');
		const quantity = parseQuantity(replacement[columns.quantity] ?? '');
		const costInCents = parseMoney(totalText, `substitution total for ${product}`);
		if (costInCents < 0)
			throw new ReceiptParseError(`The substitution total for ${product} cannot be negative.`);

		items.push({
			product: product.endsWith(' [SUB]') ? product : `${product} [SUB]`,
			quantity,
			cost: costInCents / 100
		});
	}

	return items;
}

function paymentSummaryAmounts(
	$: cheerio.CheerioAPI,
	elements: AnyNode[],
	paymentStart: number
): Map<string, number[]> {
	const totalPaidRow = elements
		.slice(paymentStart + 1)
		.find(
			(element) =>
				element.type === 'tag' &&
				element.name === 'tr' &&
				normaliseLabel(rowValues($, element)[0] ?? '').toLowerCase() === 'total paid'
		);
	const table = totalPaidRow ? $(totalPaidRow).closest('table').get(0) : undefined;
	if (!table) throw new ReceiptParseError('The payment summary must contain one Total paid entry.');

	const knownLabels = new Set(
		[...REQUIRED_SUMMARY_LABELS, ...OPTIONAL_ITEM_ADJUSTMENTS, ...ORDER_CHARGE_LABELS].map(
			(label) => label.toLowerCase()
		)
	);
	const amounts = new Map<string, number[]>();

	for (const row of $(table).find('tr').toArray()) {
		if (isHidden($, row)) continue;
		const [rawLabel = '', amount = ''] = rowValues($, row);
		const label = normaliseLabel(rawLabel);
		const key = label.toLowerCase();

		if (knownLabels.has(key)) {
			amounts.set(key, [...(amounts.get(key) ?? []), parseMoney(amount, label)]);
		} else if (
			amount.includes('€') &&
			!/^\d+\s*x\s*€\d/u.test(label) &&
			!/Clubcard Price$/i.test(label)
		) {
			throw new ReceiptParseError(`Unsupported payment summary adjustment: ${label}.`);
		}

		if (key === 'total paid') break;
	}

	return amounts;
}

function validateSummary(
	$: cheerio.CheerioAPI,
	elements: AnyNode[],
	paymentStart: number,
	items: ReceiptEntry[]
): void {
	const amounts = paymentSummaryAmounts($, elements, paymentStart);
	const required = (label: string): number => {
		const values = amounts.get(label.toLowerCase()) ?? [];
		if (values.length !== 1)
			throw new ReceiptParseError(`The payment summary must contain one ${label} entry.`);
		return values[0];
	};

	const basketBeforeOffers = required('Basket value before offers');
	const offers = required('Offers');
	const basketTotal = required('Total basket value');
	const totalPaid = required('Total paid');
	if (basketBeforeOffers + offers !== basketTotal)
		throw new ReceiptParseError('The payment summary offer totals do not reconcile.');

	const adjustmentTotal = OPTIONAL_ITEM_ADJUSTMENTS.reduce((total, label) => {
		const values = amounts.get(label.toLowerCase()) ?? [];
		if (values.length > 1)
			throw new ReceiptParseError(`The payment summary contains more than one ${label} entry.`);
		return total + (values[0] ?? 0);
	}, 0);
	const itemTotal = items.reduce((total, item) => total + Math.round(item.cost * 100), 0);
	const expectedItemTotal = basketTotal + adjustmentTotal;
	if (itemTotal !== expectedItemTotal)
		throw new ReceiptParseError(
			`The extracted items total €${(itemTotal / 100).toFixed(2)}, but the receipt summary requires €${(expectedItemTotal / 100).toFixed(2)}.`
		);

	const orderCharges = [...ORDER_CHARGE_LABELS].reduce(
		(total, label) =>
			total + (amounts.get(label.toLowerCase()) ?? []).reduce((sum, amount) => sum + amount, 0),
		0
	);
	if (itemTotal + orderCharges !== totalPaid)
		throw new ReceiptParseError(
			'The receipt total paid does not reconcile with its items and order charges.'
		);
}

export async function parseTescoReceiptEmail(raw: Buffer): Promise<ReceiptEntry[]> {
	let parsed;
	try {
		parsed = await simpleParser(raw, {
			skipHtmlToText: true,
			skipTextToHtml: true,
			keepCidLinks: true
		});
	} catch {
		throw new ReceiptParseError('The uploaded file is not a valid email.');
	}

	if (typeof parsed.html !== 'string' || !parsed.html.trim())
		throw new ReceiptParseError('The email does not contain a usable HTML receipt.');

	const $ = cheerio.load(parsed.html);
	const elements = $('body *').toArray();
	const paymentStart = headingIndex($, elements, 'Payment summary');
	if (
		paymentStart === undefined ||
		elements.some(
			(element) =>
				element.type === 'tag' &&
				/^(td|th)$/i.test(element.name) &&
				normaliseText($(element).text()).toLowerCase().startsWith('total (estimated)')
		)
	)
		throw new ReceiptParseError(
			'Please upload the final Tesco receipt email, not an order confirmation.'
		);

	const substitutions = sectionTables($, elements, 'Substitutions', [
		'Unavailable',
		'The rest of your items',
		'Payment summary'
	]).flatMap(({ table, columns }) => extractSubstitutions($, table, columns));
	const regularItems = sectionTables($, elements, 'The rest of your items', [
		'Payment summary'
	]).flatMap(({ table, columns }) => extractRegularItems($, table, columns));
	const items = [...substitutions, ...regularItems];

	if (items.length === 0)
		throw new ReceiptParseError('No delivered products were found in the receipt.');
	validateSummary($, elements, paymentStart, items);
	return items;
}
