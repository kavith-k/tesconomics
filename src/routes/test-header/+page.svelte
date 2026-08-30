<script lang="ts">
	import '../../app.css';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
	import type { ReceiptEntry, Item } from '$lib/types';
	import { User, Users } from 'lucide-svelte';

	type Category =
		| 'dairy'
		| 'meat'
		| 'produce'
		| 'bakery'
		| 'frozen'
		| 'beverages'
		| 'pantry'
		| 'household'
		| 'other';

	const CATEGORY_KEYWORDS: Record<Category, string[]> = {
		dairy: ['milk', 'cheese', 'yoghurt', 'yogurt', 'butter', 'cream', 'egg', 'feta', 'fromage'],
		meat: ['chicken', 'beef', 'pork', 'bacon', 'sausage', 'ham', 'turkey', 'lamb', 'fillet'],
		produce: [
			'lettuce',
			'tomato',
			'onion',
			'garlic',
			'ginger',
			'carrot',
			'potato',
			'broccoli',
			'cucumber',
			'pepper',
			'spinach',
			'celery',
			'cabbage',
			'zucchini',
			'cauliflower',
			'mushroom'
		],
		bakery: ['bread', 'roll', 'bagel', 'croissant', 'bun', 'muffin', 'scone', 'loaf'],
		frozen: ['frozen', 'ice cream', 'pizza'],
		beverages: [
			'juice',
			'soda',
			'cola',
			'water',
			'tea',
			'coffee',
			'sprite',
			'fanta',
			'pepsi',
			'coca',
			'drink',
			'lemonade',
			'sprite',
			'zero'
		],
		pantry: [
			'rice',
			'pasta',
			'sauce',
			'oil',
			'flour',
			'sugar',
			'salt',
			'spice',
			'herb',
			'curry',
			'paprika',
			'stock',
			'cube',
			'oats',
			'cereal',
			'nut',
			'seed',
			'flax',
			'chia',
			'hazelnut',
			'chocolate',
			'spread'
		],
		household: ['paper', 'tissue', 'detergent', 'soap', 'clean', 'dish', 'wash', 'spray', 'wipe'],
		other: []
	};

	function categorizeItem(productName: string): Category {
		const lower = productName.toLowerCase();
		for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
			if (category === 'other') continue;
			if (keywords.some((kw) => lower.includes(kw))) {
				return category as Category;
			}
		}
		return 'other';
	}

	// Set up the worker with the correct path
	if (typeof window !== 'undefined') {
		GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
	}

	let base64Images: string[] = $state([]);
	let items: Item[] = $state([]);
	let purchaserExpenditure: { [key: string]: number } = $state({
		Toshita: 0,
		Kavith: 0
	});
	let isExpenditureTableVisible = $state(false);
	let isTableLoaderVisible = $state(false);

	// Color and icon mapping for purchasers
	const purchaserStyles: {
		[key: string]: { textColor: string; bgColor: string; rowBgColor: string; icon: string };
	} = {
		Toshita: {
			textColor: 'text-blue-800',
			bgColor: 'bg-blue-100',
			rowBgColor: 'bg-blue-50',
			icon: 'user'
		},
		Kavith: {
			textColor: 'text-red-800',
			bgColor: 'bg-red-100',
			rowBgColor: 'bg-red-50',
			icon: 'user'
		}
	};

	function getPurchaserColor(purchaser: string): string {
		return purchaserStyles[purchaser]?.textColor || 'text-gray-800';
	}

	function getPurchaserStyle(purchaser: string): {
		textColor: string;
		bgColor: string;
		rowBgColor: string;
	} {
		return (
			purchaserStyles[purchaser] || {
				textColor: 'text-gray-800',
				bgColor: 'bg-gray-100',
				rowBgColor: 'bg-gray-50'
			}
		);
	}

	// Utility function to make sure there's an individual item record for every item in the receipt
	// E.g. If there's an item with quantity=2, two identical records will be returned with quantity=1,
	//   with the total cost of the original record being split evenly across both.
	async function setIndividualItemRecords(receiptItems: ReceiptEntry[]) {
		let itemId = 1;

		for (const item of receiptItems) {
			if (item.quantity === 1)
				items.push({
					id: itemId++,
					name: item.product,
					purchasers: [],
					cost: item.cost,
					category: categorizeItem(item.product)
				});
			else {
				const productName = item.product;
				const costPerPiece = item.cost / item.quantity;
				for (let j = 0; j < item.quantity; j++)
					items.push({
						id: itemId++,
						name: productName,
						purchasers: [],
						cost: costPerPiece,
						category: categorizeItem(productName)
					});
			}
		}
	}

	async function getItemsFromPDF(event: Event) {
		isTableLoaderVisible = true;

		const input = event.target as HTMLInputElement;
		if (!input.files) return;
		const file = input.files[0];
		const fileReader = new FileReader();

		fileReader.onload = async function () {
			const pdfData = new Uint8Array(fileReader.result as ArrayBuffer);
			const loadingTask = getDocument({ data: pdfData });
			const pdf = await loadingTask.promise;
			const numPages = pdf.numPages;

			for (let pageNum = 1; pageNum <= numPages; pageNum++) {
				const page = await pdf.getPage(pageNum);
				const viewport = page.getViewport({ scale: 2 }); // Adjust scale for image quality

				// Create a canvas element
				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');
				canvas.width = viewport.width;
				canvas.height = viewport.height;

				// Render the PDF page into the canvas context
				if (context) {
					await page.render({ canvasContext: context, viewport: viewport }).promise;
				}

				// Convert the canvas to a Base64 encoded image
				const base64Image = canvas.toDataURL('image/png');
				base64Images.push(base64Image);
			}

			await fetch('/api/get-items-from-image', {
				method: 'POST',
				body: JSON.stringify({ images: base64Images })
			})
				.then((response) => {
					if (!response.ok)
						throw new Error(`Backend errored out. ${response.status} - ${response.statusText}`);
					return response.json();
				})
				.then((receiptItems: ReceiptEntry[]) => {
					setIndividualItemRecords(receiptItems);
				})
				.catch((error) => {
					console.error('Error getting receipt items from image.', error);
				})
				.finally(() => (isTableLoaderVisible = false));
		};
		fileReader.readAsArrayBuffer(file);
	}

	function calculateExpenditure() {
		// Always reset expenditure before calculating
		for (const key in purchaserExpenditure) purchaserExpenditure[key] = 0;

		// Calculating expenditure
		for (const item of items) {
			const perPersonCost = item.cost / item.purchasers.length;
			for (const p of item.purchasers) purchaserExpenditure[p] += perPersonCost;
		}

		// Rounding final values to 2 decimal places
		for (const key in purchaserExpenditure)
			purchaserExpenditure[key] = Number(purchaserExpenditure[key].toFixed(2));

		// Making sure the total expenditure table is visible
		isExpenditureTableVisible = true;
	}
</script>

<header
	class="fixed left-0 right-0 top-0 z-50 flex items-center justify-center border-b-4 border-red-500 bg-blue-900 px-4 py-1 font-['Quintessential'] text-4xl text-white"
>
	Tesconom<span
		class="relative inline-block"
		style="width: 0.25em; display: inline-flex; flex-direction: column; align-items: center; gap: 0;"
	>
		<span class="leading-none text-red-500" style="font-size: 0.3em;">❤</span>
		<span class="h-4 w-px bg-white"></span>
	</span>cs
</header>

<div class="mt-28 px-4 text-center">
	<p class="mx-auto whitespace-nowrap text-lg leading-loose text-gray-800">
		<span class="inline-block font-['Quintessential'] text-2xl font-bold">
			Tesconom<span
				class="relative inline-block"
				style="width: 0.25em; display: inline-flex; flex-direction: column; align-items: center; gap: 0;"
			>
				<span class="leading-none text-red-500" style="font-size: 0.3em;">❤</span>
				<span class="h-4 w-px bg-gray-800"></span>
			</span>cs
		</span>
		<span class="font-['Montserrat']">
			is a smart receipt-splitting app that helps you divide expenses fairly among friends, family,
			or roommates.</span
		>
	</p>
	<p class="mx-auto mt-4 max-w-3xl font-['Montserrat'] text-lg leading-loose text-gray-800">
		Simply upload a PDF receipt, and our tool automatically extracts items, lets you assign who
		bought what, and calculates individual totals instantly.
	</p>
	<p
		class="mx-auto mt-4 whitespace-nowrap bg-gradient-to-r from-blue-600 via-gray-700 to-red-500 bg-clip-text font-['Montserrat'] text-lg font-bold italic leading-loose text-transparent"
	>
		No more awkward math or disagreements - just fair, hassle-free bill splitting!
	</p>
</div>

<!-- Upload Container - Always visible below description -->
<div class="flex w-full items-center justify-center pb-8 pt-20">
	<!-- Glow Effect Container -->
	<div
		class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-50 to-gray-100 p-8"
		style="
			background: linear-gradient(135deg, #f8fafc, #f1f5f9);
			box-shadow: 
				0 0 20px rgba(59, 130, 246, 0.2),
				0 0 40px rgba(59, 130, 246, 0.1),
				0 0 60px rgba(59, 130, 246, 0.05),
				inset 0 0 30px rgba(255, 255, 255, 0.8);
		"
	>
		<!-- Animated glow effect -->
		<div
			class="absolute inset-0 opacity-40"
			style="
				background: radial-gradient(
					circle at 50% 50%, 
					rgba(59, 130, 246, 0.15) 0%, 
					rgba(139, 92, 246, 0.1) 25%, 
					rgba(236, 72, 153, 0.05) 50%, 
					transparent 70%
				);
				animation: glow 4s ease-in-out infinite;
			"
		></div>

		<div class="relative z-10 grid w-full max-w-sm items-center gap-6 text-center">
			<Label class="text-lg font-semibold text-gray-800">Upload PDF Receipt</Label>
			<Input id="receipt" type="file" accept=".pdf" on:change={getItemsFromPDF} class="hidden" />
			<button
				on:click={() => {
					const input = document.getElementById('receipt');
					if (input) input.click();
				}}
				class="rounded-lg bg-gradient-to-r from-blue-500 via-slate-500 to-red-500 px-4 py-2 text-sm font-bold text-white transition-all hover:scale-105 hover:shadow-xl active:scale-95"
				style="box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);"
			>
				Browse
			</button>
			{#if isTableLoaderVisible}
				<div
					class="mx-auto mt-4 h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"
				></div>
			{/if}
		</div>
	</div>
</div>

<!-- Receipt Items - Only visible after upload -->
<div class="flex min-h-screen flex-col items-center">
	{#if items.length !== 0}
		<h2 class="m-4 text-lg font-bold">Receipt Items</h2>
		<div class="m-4 border border-gray-300">
			<Table.Root class="m-2">
				<Table.Header>
					<Table.Row>
						<Table.Head>No.</Table.Head>
						<Table.Head>Product</Table.Head>
						<Table.Head>Cost</Table.Head>
						<Table.Head>Purchaser</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each items as item}
						<Table.Row>
							<Table.Cell>{item.id}</Table.Cell>
							<Table.Cell>{item.name}</Table.Cell>
							<Table.Cell>€{item.cost}</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col gap-2">
									{#each Object.keys(purchaserExpenditure) as purchaser}
										<label class="flex items-center gap-2">
											<input
												type="checkbox"
												checked={item.purchasers.includes(purchaser)}
												on:change={(e: Event) => {
													const target = e.currentTarget as HTMLInputElement;
													if (target.checked) {
														item.purchasers = [...item.purchasers, purchaser];
													} else {
														item.purchasers = item.purchasers.filter((p) => p !== purchaser);
													}
												}}
												class="h-4 w-4 rounded border-gray-300"
											/>
											<span class={`text-sm font-medium ${getPurchaserColor(purchaser)}`}
												>{purchaser}</span
											>
										</label>
									{/each}
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<div class="flex justify-center">
			<Button class="m-4" on:click={calculateExpenditure}>Calculate</Button>
		</div>
	{/if}

	{#if isExpenditureTableVisible}
		<div class="flex justify-center py-8">
			<div
				class="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 via-purple-50 to-red-50 p-6 shadow-lg"
			>
				<Table.Root class="m-4">
					<Table.Header>
						<Table.Row>
							<Table.Head class="text-sm font-bold text-black">Purchaser</Table.Head>
							<Table.Head class="text-sm font-bold text-black">Total Spent</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each Object.entries(purchaserExpenditure) as [name, expenditure]}
							{@const style = getPurchaserStyle(name)}
							<Table.Row class={`${style.rowBgColor} transition-colors hover:opacity-80`}>
								<Table.Cell class="font-semibold">
									<div class="flex items-center gap-2">
										<div class={`${style.bgColor} rounded-full p-2`}>
											<User class={`h-4 w-4 ${style.textColor}`} />
										</div>
										<span class={style.textColor}>{name}</span>
									</div>
								</Table.Cell>
								<Table.Cell class="text-sm font-bold text-black">
									€{expenditure}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</div>
	{/if}

	<style>
		@keyframes glow {
			0%,
			100% {
				opacity: 0.3;
				transform: scale(1);
			}
			50% {
				opacity: 0.5;
				transform: scale(1.05);
			}
		}
	</style>
</div>
