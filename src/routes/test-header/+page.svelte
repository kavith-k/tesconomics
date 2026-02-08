<script lang="ts">
	import '../../app.css';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
	import type { ReceiptEntry, Item } from '$lib/types';

	// Set up the worker with the correct path
	if (typeof window !== 'undefined') {
		GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
	}

	let base64Images: string[] = $state([]);
	let items: Item[] = $state([]);
	let purchaserExpenditure: { [key: string]: number } = $state({
		Barbara: 0,
		Toshita: 0,
		Kavith: 0
	});
	let isExpenditureTableVisible = $state(false);
	let isTableLoaderVisible = $state(false);

	// Utility function to make sure there's an individual item record for every item in the receipt
	// E.g. If there's an item with quantity=2, two identical records will be returned with quantity=1,
	//   with the total cost of the original record being split evenly across both.
	async function setIndividualItemRecords(receiptItems: ReceiptEntry[]) {
		let itemId = 1;

		for (const item of receiptItems) {
			if (item.quantity === 1)
				items.push({ id: itemId++, name: item.product, purchasers: [], cost: item.cost });
			else {
				const productName = item.product;
				const costPerPiece = item.cost / item.quantity;
				for (let j = 0; j < item.quantity; j++)
					items.push({ id: itemId++, name: productName, purchasers: [], cost: costPerPiece });
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
	Tesconomics
</header>

<div class="mt-36 px-4 text-center">
	<p class="mx-auto whitespace-nowrap text-lg leading-loose text-gray-800">
		<span class="font-['Quintessential'] text-2xl font-bold">Tesconomics</span>
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

<div class="flex min-h-screen flex-col">
	{#if items.length !== 0}
		<h2 class="m-4">Receipt Items</h2>
		<div class="m-4 max-w-[65vw] border border-gray-300">
			<Table.Root class="m-2 max-w-[60vw]">
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
								<Select.Root
									multiple
									onSelectedChange={(s) => {
										if (s) item.purchasers = s.map((p) => p.value) as string[];
									}}
								>
									<Select.Trigger>
										<Select.Value placeholder="Purchaser" />
									</Select.Trigger>
									<Select.Content>
										{#each Object.keys(purchaserExpenditure) as purchaser}
											<Select.Item value={purchaser}>{purchaser}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<Button class="m-4" on:click={calculateExpenditure}>Calculate</Button>
	{/if}

	{#if isExpenditureTableVisible}
		<Table.Root class="m-4 max-w-[40vw]">
			<Table.Header>
				<Table.Row>
					<Table.Head>Purchaser</Table.Head>
					<Table.Head>Total Spent</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each Object.entries(purchaserExpenditure) as [name, expenditure]}
					<Table.Row>
						<Table.Cell>{name}</Table.Cell>
						<Table.Cell>€{expenditure}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}

	<div class="mt-24 flex w-full items-center justify-center pb-8 pt-8">
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
