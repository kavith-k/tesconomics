import { json } from '@sveltejs/kit';
import { parseTescoReceiptEmail, ReceiptParseError } from '$lib/server/receipt';

const MAX_RECEIPT_SIZE = 4 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set([
	'',
	'application/eml',
	'application/octet-stream',
	'application/x-eml',
	'message/rfc822',
	'text/plain'
]);

function messageResponse(message: string, status: number) {
	return json({ message }, { status });
}

export async function POST({ request }: { request: Request }) {
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return messageResponse('Upload one Tesco receipt email in the receipt field.', 400);
	}

	const receiptFields = formData.getAll('receipt');
	if (receiptFields.length !== 1)
		return messageResponse('Upload exactly one Tesco receipt email in the receipt field.', 400);
	const receipt = receiptFields[0];
	if (!(receipt instanceof File))
		return messageResponse('Choose a Tesco receipt email to upload.', 400);
	if (!receipt.name.toLowerCase().endsWith('.eml'))
		return messageResponse('The receipt must be an .eml file.', 400);
	if (receipt.size === 0) return messageResponse('The receipt file is empty.', 400);
	if (receipt.size > MAX_RECEIPT_SIZE)
		return messageResponse('The receipt email must be 4 MiB or smaller.', 413);
	if (!ACCEPTED_MIME_TYPES.has(receipt.type.toLowerCase()))
		return messageResponse('The uploaded file is not recognised as an email.', 400);

	try {
		const items = await parseTescoReceiptEmail(Buffer.from(await receipt.arrayBuffer()));
		return json(items);
	} catch (error) {
		if (error instanceof ReceiptParseError) return messageResponse(error.message, 422);
		return messageResponse('The receipt could not be processed. Please try again.', 500);
	}
}
