export type ReceiptEntry = {
	product: string;
	quantity: number;
	cost: number;
};

export type Item = {
	id: number;
	name: string;
	purchasers: string[];
	cost: number;
};

export type FunctionResponse = {
	status: 'success' | 'failure';
	content: string;
};
