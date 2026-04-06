<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
	import type { ReceiptEntry, Item, Category } from '$lib/types';
	import { onMount } from 'svelte';
	import {
		Upload,
		FileText,
		X,
		Check,
		Trash2,
		Plus,
		Download,
		Users,
		Edit2,
		Save
	} from 'lucide-svelte';

	if (typeof window !== 'undefined') {
		GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
	}

	const DEFAULT_PURCHASERS = ['Toshita', 'Kavith'];

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

	let base64Images: string[] = $state([]);
	let items: Item[] = $state([]);
	let purchasers: string[] = $state([]);
	let purchaserExpenditure: { [key: string]: number } = $state({});
	let isExpenditureTableVisible = $state(false);
	let isTableLoaderVisible = $state(false);
	let isDialogOpen = $state(false);
	let isAddItemOpen = $state(false);
	let selectedFile: File | null = $state(null);
	let isDragging = $state(false);
	let uploadProgress = $state(0);

	let editingItemId: number | null = $state(null);
	let editName = $state('');
	let editCost = $state(0);

	let newItemName = $state('');
	let newItemCost = $state(0);
	let newItemQuantity = $state(1);

	let newPurchaserName = $state('');

	onMount(() => {
		const stored = localStorage.getItem('purchasers');
		if (stored) {
			purchasers = JSON.parse(stored);
		} else {
			purchasers = [...DEFAULT_PURCHASERS];
		}
		purchaserExpenditure = Object.fromEntries(purchasers.map((p) => [p, 0]));
	});

	function savePurchasers(newPurchasers: string[]) {
		purchasers = newPurchasers;
		purchaserExpenditure = Object.fromEntries(purchasers.map((p) => [p, 0]));
		if (typeof window !== 'undefined') {
			localStorage.setItem('purchasers', JSON.stringify(purchasers));
		}
	}

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

	async function setIndividualItemRecords(receiptItems: ReceiptEntry[]) {
		let itemId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;

		for (const item of receiptItems) {
			if (item.quantity === 1) {
				items.push({
					id: itemId++,
					name: item.product,
					purchasers: [],
					cost: item.cost,
					category: categorizeItem(item.product)
				});
			} else {
				const productName = item.product;
				const costPerPiece = item.cost / item.quantity;
				for (let j = 0; j < item.quantity; j++) {
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
	}

	async function processPDF() {
		if (!selectedFile) return;

		isTableLoaderVisible = true;
		uploadProgress = 10;
		isDialogOpen = false;

		const fileReader = new FileReader();

		fileReader.onload = async function () {
			uploadProgress = 30;
			const pdfData = new Uint8Array(fileReader.result as ArrayBuffer);
			const loadingTask = getDocument({ data: pdfData });
			const pdf = await loadingTask.promise;
			uploadProgress = 50;
			const numPages = pdf.numPages;

			for (let pageNum = 1; pageNum <= numPages; pageNum++) {
				const page = await pdf.getPage(pageNum);
				const viewport = page.getViewport({ scale: 2 });

				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');
				canvas.width = viewport.width;
				canvas.height = viewport.height;

				if (context) {
					await page.render({ canvasContext: context, viewport: viewport }).promise;
				}

				const base64Image = canvas.toDataURL('image/png');
				base64Images.push(base64Image);
			}

			uploadProgress = 70;
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
				.finally(() => {
					isTableLoaderVisible = false;
					uploadProgress = 100;
					selectedFile = null;
				});
		};
		fileReader.readAsArrayBuffer(selectedFile);
	}

	function handleFileDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		const files = event.dataTransfer?.files;
		if (files && files.length > 0 && files[0].type === 'application/pdf') {
			selectedFile = files[0];
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			selectedFile = input.files[0];
		}
	}

	function clearSelectedFile() {
		selectedFile = null;
	}

	function calculateExpenditure() {
		for (const key in purchaserExpenditure) purchaserExpenditure[key] = 0;

		for (const item of items) {
			if (item.purchasers.length === 0) continue;
			const perPersonCost = item.cost / item.purchasers.length;
			for (const p of item.purchasers) {
				if (purchaserExpenditure[p] !== undefined) {
					purchaserExpenditure[p] += perPersonCost;
				}
			}
		}

		for (const key in purchaserExpenditure)
			purchaserExpenditure[key] = Number(purchaserExpenditure[key].toFixed(2));

		isExpenditureTableVisible = true;
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function openDialog() {
		isDialogOpen = true;
	}

	function closeDialog() {
		isDialogOpen = false;
		selectedFile = null;
	}

	function deleteItem(id: number) {
		items = items.filter((item) => item.id !== id);
	}

	function startEditing(item: Item) {
		editingItemId = item.id;
		editName = item.name;
		editCost = item.cost;
	}

	function saveEdit() {
		if (editingItemId === null) return;
		items = items.map((item) =>
			item.id === editingItemId
				? { ...item, name: editName, cost: editCost, category: categorizeItem(editName) }
				: item
		);
		editingItemId = null;
		editName = '';
		editCost = 0;
	}

	function cancelEdit() {
		editingItemId = null;
		editName = '';
		editCost = 0;
	}

	function addItem() {
		if (!newItemName || newItemCost <= 0) return;
		const itemId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;
		for (let i = 0; i < newItemQuantity; i++) {
			items.push({
				id: itemId + i,
				name: newItemName,
				purchasers: [],
				cost: newItemCost / newItemQuantity,
				category: categorizeItem(newItemName)
			});
		}
		newItemName = '';
		newItemCost = 0;
		newItemQuantity = 1;
		isAddItemOpen = false;
	}

	function selectAllPurchasers(item: Item) {
		item.purchasers = [...purchasers];
		items = items;
	}

	function addPurchaser() {
		const name = newPurchaserName.trim();
		if (!name || purchasers.includes(name)) return;
		savePurchasers([...purchasers, name]);
		newPurchaserName = '';
	}

	function removePurchaser(name: string) {
		savePurchasers(purchasers.filter((p) => p !== name));
		for (const item of items) {
			item.purchasers = item.purchasers.filter((p) => p !== name);
		}
	}

	function groupByCategory(items: Item[]): Record<Category, Item[]> {
		const grouped: Record<Category, Item[]> = {
			dairy: [],
			meat: [],
			produce: [],
			bakery: [],
			frozen: [],
			beverages: [],
			pantry: [],
			household: [],
			other: []
		};
		for (const item of items) {
			grouped[item.category].push(item);
		}
		return grouped;
	}

	function exportCSV() {
		const headers = ['No.', 'Product', 'Category', 'Cost', 'Purchasers'];
		const rows = items.map((item) => [
			item.id,
			item.name,
			item.category,
			item.cost.toFixed(2),
			item.purchasers.join(', ')
		]);
		const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'receipt_items.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportExpenditureCSV() {
		const headers = ['Purchaser', 'Total Spent'];
		const rows = Object.entries(purchaserExpenditure).map(([name, amount]) => [
			name,
			amount.toFixed(2)
		]);
		const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'expenditure_split.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportPDF() {
		const printWindow = window.open('', '_blank');
		if (!printWindow) return;

		const grouped = groupByCategory(items);

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Receipt Split</title>
				<style>
					body { font-family: Arial, sans-serif; padding: 20px; }
					h1 { color: #00539f; }
					h2 { color: #333; border-bottom: 2px solid #00539f; padding-bottom: 5px; margin-top: 20px; }
					table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
					th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
					th { background-color: #00539f; color: white; }
					.expenditure { margin-top: 30px; }
					.expenditure th { background-color: #ff0000; }
					.category-header { text-transform: capitalize; }
				</style>
			</head>
			<body>
				<h1>Tesconomics - Receipt Split</h1>
				${Object.entries(grouped)
					.filter(([_, items]) => items.length > 0)
					.map(
						([category, catItems]) => `
					<h2 class="category-header">${category}</h2>
					<table>
						<tr><th>No.</th><th>Product</th><th>Cost</th><th>Purchasers</th></tr>
						${catItems
							.map(
								(item) => `
							<tr>
								<td>${item.id}</td>
								<td>${item.name}</td>
								<td>€${item.cost.toFixed(2)}</td>
								<td>${item.purchasers.join(', ') || '-'}</td>
							</tr>
						`
							)
							.join('')}
					</table>
				`
					)
					.join('')}
				${
					isExpenditureTableVisible
						? `
					<div class="expenditure">
						<h2>Expenditure Breakdown</h2>
						<table>
							<tr><th>Purchaser</th><th>Total Spent</th></tr>
							${Object.entries(purchaserExpenditure)
								.map(
									([name, amount]) => `
								<tr><td>${name}</td><td>€${amount.toFixed(2)}</td></tr>
							`
								)
								.join('')}
						</table>
					</div>
				`
						: ''
				}
			</body>
			</html>
		`;

		printWindow.document.write(html);
		printWindow.document.close();
		printWindow.print();
	}

	const categoryLabels: Record<Category, string> = {
		dairy: 'Dairy & Eggs',
		meat: 'Meat & Poultry',
		produce: 'Fresh Produce',
		bakery: 'Bakery',
		frozen: 'Frozen',
		beverages: 'Beverages',
		pantry: 'Pantry & Dry Goods',
		household: 'Household',
		other: 'Other'
	};
</script>

<svelte:head>
	<style>
		@keyframes fadeIn {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}
		@keyframes scaleIn {
			from {
				opacity: 0;
				transform: scale(0.95) translate(-50%, -50%);
			}
			to {
				opacity: 1;
				transform: scale(1) translate(-50%, -50%);
			}
		}
	</style>
</svelte:head>

<div class="flex min-h-screen flex-col items-center bg-white">
	<header
		class="flex w-full items-center justify-center gap-4 bg-[#00539f] py-2.5 text-center font-quintessential text-4xl font-bold text-white"
	>
		<span
			>Tesconom<span class="relative inline-block">
				<span
					class="absolute -top-2 left-1/2 -translate-x-1/2 font-quintessential text-lg text-[#ff0000]"
					>♥</span
				>
				ı
			</span>cs</span
		>
	</header>

	{#if isDialogOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center"
			style="animation: fadeIn 0.2s ease-out;"
		>
			<button class="absolute inset-0 bg-black/80" onclick={closeDialog} aria-label="Close dialog"
			></button>
			<div
				class="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
				style="animation: scaleIn 0.2s ease-out;"
			>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-gray-900">Upload PDF Receipt</h2>
					<button
						class="rounded-full p-1 transition-colors hover:bg-gray-100"
						onclick={closeDialog}
					>
						<X class="h-5 w-5 text-gray-500" />
					</button>
				</div>

				<p class="mb-6 text-sm text-gray-500">
					Drag and drop your Tesco PDF receipt or click to browse.
				</p>

				<div
					class="relative mb-6"
					role="button"
					tabindex="0"
					ondragover={(e) => {
						e.preventDefault();
						isDragging = true;
					}}
					ondragleave={() => {
						isDragging = false;
					}}
					ondrop={handleFileDrop}
				>
					{#if !selectedFile}
						<label
							for="receipt"
							class="flex h-48 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200"
							class:border-gray-300={!isDragging}
							class:border-blue-500={isDragging}
							class:bg-blue-50={isDragging}
							class:hover:border-blue-400={!isDragging}
							class:hover:bg-gray-50={!isDragging}
						>
							<div class="flex flex-col items-center justify-center pb-6 pt-5">
								<Upload class="mb-3 h-10 w-10 text-gray-400" />
								<p class="mb-2 text-sm text-gray-500">
									<span class="font-semibold text-blue-600 hover:text-blue-700"
										>Click to upload</span
									> or drag and drop
								</p>
								<p class="text-xs text-gray-400">PDF files only</p>
							</div>
							<Input
								id="receipt"
								type="file"
								accept=".pdf"
								class="hidden"
								onchange={handleFileSelect}
							/>
						</label>
					{:else}
						<div class="flex items-center gap-4 rounded-xl border-2 border-blue-200 bg-gray-50 p-4">
							<FileText class="h-12 w-12 text-blue-500" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-gray-900">{selectedFile.name}</p>
								<p class="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
							</div>
							<button
								class="rounded-full p-2 transition-colors hover:bg-gray-200"
								onclick={clearSelectedFile}
								type="button"
							>
								<X class="h-5 w-5 text-gray-500" />
							</button>
						</div>
					{/if}
				</div>

				<Button
					class="w-full rounded-lg bg-gradient-to-r from-blue-500 via-slate-500 to-red-500 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!selectedFile}
					onclick={processPDF}
				>
					<Check class="mr-2 h-5 w-5" />
					Process Receipt
				</Button>
			</div>
		</div>
	{/if}

	{#if isAddItemOpen}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center"
			style="animation: fadeIn 0.2s ease-out;"
		>
			<button
				class="absolute inset-0 bg-black/80"
				onclick={() => (isAddItemOpen = false)}
				aria-label="Close"
			></button>
			<div
				class="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
				style="animation: scaleIn 0.2s ease-out;"
			>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-gray-900">Add Missing Item</h2>
					<button
						class="rounded-full p-1 transition-colors hover:bg-gray-100"
						onclick={() => (isAddItemOpen = false)}
					>
						<X class="h-5 w-5 text-gray-500" />
					</button>
				</div>

				<div class="space-y-4">
					<div>
						<label class="mb-1 block text-sm font-medium text-gray-700">Product Name</label>
						<Input type="text" bind:value={newItemName} placeholder="e.g., Milk 1L" />
					</div>
					<div>
						<label class="mb-1 block text-sm font-medium text-gray-700">Cost (€)</label>
						<Input type="number" step="0.01" bind:value={newItemCost} placeholder="0.00" />
					</div>
					<div>
						<label class="mb-1 block text-sm font-medium text-gray-700">Quantity</label>
						<Input type="number" min="1" bind:value={newItemQuantity} />
					</div>
				</div>

				<Button class="mt-4 w-full" onclick={addItem} disabled={!newItemName || newItemCost <= 0}>
					<Plus class="mr-2 h-4 w-4" />
					Add Item
				</Button>
			</div>
		</div>
	{/if}

	<p
		class="mt-12 w-full bg-gradient-to-r from-[#00539f] via-gray-600 to-[#ff0000] bg-clip-text px-8 text-center font-['Courgette'] text-[1.375rem] leading-loose text-transparent"
	>
		Split grocery bills without the hassle<br />
		Upload your Tesco PDF receipt, assign items to each person, and get an instant breakdown<br />
		No more awkward money conversations or messy spreadsheets!
	</p>

	<Button
		variant="outline"
		class="mt-8 gap-2 rounded-lg bg-gradient-to-r from-blue-400 via-slate-400 to-red-400 px-6 py-3 text-lg font-semibold text-white transition-opacity hover:opacity-90"
		onclick={openDialog}
	>
		<Upload class="h-5 w-5" />
		Upload Receipt
	</Button>

	{#if isTableLoaderVisible}
		<div class="mt-16 flex flex-col items-center gap-4">
			<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
			<p class="text-sm text-gray-500">Processing receipt... {uploadProgress}%</p>
			<div class="h-2 w-48 overflow-hidden rounded-full bg-gray-200">
				<div
					class="h-full bg-gradient-to-r from-blue-500 to-red-500 transition-all duration-300"
					style="width: {uploadProgress}%"
				></div>
			</div>
		</div>
	{/if}

	{#if items.length !== 0}
		<div class="m-4 flex gap-2">
			<Button variant="outline" onclick={() => (isAddItemOpen = true)}>
				<Plus class="mr-2 h-4 w-4" />
				Add Item
			</Button>
			<Button variant="outline" onclick={exportCSV}>
				<Download class="mr-2 h-4 w-4" />
				Export CSV
			</Button>
			<Button variant="outline" onclick={exportPDF}>
				<Download class="mr-2 h-4 w-4" />
				Export PDF
			</Button>
		</div>

		<h2 class="m-4 text-white">Receipt Items</h2>
		<div class="m-4 max-w-[85vw] overflow-x-auto border border-gray-300">
			{#each Object.entries(groupByCategory(items)).filter(([_, items]) => items.length > 0) as [category, catItems]}
				<div class="border-b border-gray-200 last:border-b-0">
					<div class="sticky top-0 bg-gray-100 px-4 py-2 font-semibold capitalize text-gray-700">
						{categoryLabels[category as Category]}
					</div>
					<Table.Root class="m-2">
						<Table.Header>
							<Table.Row>
								<Table.Head>No.</Table.Head>
								<Table.Head>Product</Table.Head>
								<Table.Head>Cost</Table.Head>
								<Table.Head>Purchaser</Table.Head>
								<Table.Head>Actions</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each catItems as item}
								<Table.Row>
									<Table.Cell>{item.id}</Table.Cell>
									<Table.Cell>
										{#if editingItemId === item.id}
											<Input type="text" bind:value={editName} class="w-full" />
										{:else}
											{item.name}
										{/if}
									</Table.Cell>
									<Table.Cell>
										{#if editingItemId === item.id}
											<Input type="number" step="0.01" bind:value={editCost} class="w-20" />
										{:else}
											€{item.cost.toFixed(2)}
										{/if}
									</Table.Cell>
									<Table.Cell>
										<div class="flex items-center gap-1">
											<Button
												variant="ghost"
												size="sm"
												class="h-6 px-2 py-1 text-xs"
												onclick={() => selectAllPurchasers(item)}
												disabled={item.purchasers.length === purchasers.length}
											>
												<Users class="mr-1 h-3 w-3" />
												All
											</Button>
											<Select.Root
												multiple
												onSelectedChange={(s) => {
													if (s) item.purchasers = s.map((p) => p.value) as string[];
													items = items;
												}}
											>
												<Select.Trigger class="min-w-[120px]">
													<Select.Value placeholder="Select..." />
												</Select.Trigger>
												<Select.Content>
													{#each purchasers as purchaser}
														<Select.Item value={purchaser}>{purchaser}</Select.Item>
													{/each}
												</Select.Content>
											</Select.Root>
										</div>
									</Table.Cell>
									<Table.Cell>
										<div class="flex items-center gap-1">
											{#if editingItemId === item.id}
												<Button variant="ghost" size="sm" onclick={saveEdit}>
													<Save class="h-4 w-4 text-green-600" />
												</Button>
												<Button variant="ghost" size="sm" onclick={cancelEdit}>
													<X class="h-4 w-4 text-gray-500" />
												</Button>
											{:else}
												<Button variant="ghost" size="sm" onclick={() => startEditing(item)}>
													<Edit2 class="h-4 w-4 text-blue-600" />
												</Button>
												<Button variant="ghost" size="sm" onclick={() => deleteItem(item.id)}>
													<Trash2 class="h-4 w-4 text-red-600" />
												</Button>
											{/if}
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/each}
		</div>

		<Button class="m-4" onclick={calculateExpenditure}>Calculate Split</Button>
	{/if}

	{#if isExpenditureTableVisible}
		<div class="m-4 max-w-[40vw]">
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-lg font-semibold">Expenditure Breakdown</h3>
				<Button variant="outline" size="sm" onclick={exportExpenditureCSV}>
					<Download class="mr-1 h-4 w-4" />
					Export CSV
				</Button>
			</div>
			<Table.Root>
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
		</div>
	{/if}
</div>
