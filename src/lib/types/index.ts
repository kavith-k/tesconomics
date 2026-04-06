export type ReceiptEntry = {
	product: string;
	quantity: number;
	cost: number;
};

export type Category =
	| 'dairy'
	| 'meat'
	| 'produce'
	| 'bakery'
	| 'frozen'
	| 'beverages'
	| 'pantry'
	| 'household'
	| 'other';

export type Item = {
	id: number;
	name: string;
	purchasers: string[];
	cost: number;
	category: Category;
};

export type FunctionResponse = {
	status: 'success' | 'failure';
	content: string;
};
