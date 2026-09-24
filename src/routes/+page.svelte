<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import type { ReceiptEntry, Item } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let items: Item[] = $state([]);
	let purchaserExpenditure: Record<string, number> = $state(
		Object.fromEntries(data.housemates.map((name) => [name, 0]))
	);
	let isExpenditureTableVisible = $state(false);
	let isTableLoaderVisible = $state(false);
	let uploadError = $state('');
	let receiptVersion = $state(0);

	// Utility function to make sure there's an individual item record for every item in the receipt
	// E.g. If there's an item with quantity=2, two identical records will be returned with quantity=1,
	//   with the total cost of the original record being split evenly across both.
	function getIndividualItemRecords(receiptItems: ReceiptEntry[]): Item[] {
		const individualItems: Item[] = [];
		let itemId = 1;

		for (const item of receiptItems) {
			if (item.quantity === 1)
				individualItems.push({ id: itemId++, name: item.product, purchasers: [], cost: item.cost });
			else {
				const productName = item.product;
				const costPerPiece = item.cost / item.quantity;
				for (let j = 0; j < item.quantity; j++)
					individualItems.push({
						id: itemId++,
						name: productName,
						purchasers: [],
						cost: costPerPiece
					});
			}
		}

		return individualItems;
	}

	async function uploadReceipt(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isTableLoaderVisible = true;
		uploadError = '';
		const formData = new FormData();
		formData.set('receipt', file);

		try {
			const response = await fetch('/api/parse-receipt', {
				method: 'POST',
				body: formData
			});
			const result = await response.json();
			if (!response.ok)
				throw new Error(result.message ?? 'The receipt could not be processed. Please try again.');

			items = getIndividualItemRecords(result as ReceiptEntry[]);
			for (const purchaser in purchaserExpenditure) purchaserExpenditure[purchaser] = 0;
			isExpenditureTableVisible = false;
			receiptVersion += 1;
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'The receipt could not be processed.';
		} finally {
			isTableLoaderVisible = false;
			input.value = '';
		}
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

<div class="m-4 grid w-full max-w-sm items-center gap-1.5">
	<Label for="receipt">Tesco receipt email</Label>
	<Input
		id="receipt"
		type="file"
		accept=".eml,message/rfc822"
		disabled={isTableLoaderVisible}
		on:change={uploadReceipt}
	/>
	{#if isTableLoaderVisible}
		<div class="mt-4 h-6 w-6 animate-spin rounded-full border-b-2 border-gray-900"></div>
	{/if}
	{#if uploadError}
		<p class="mt-2 text-sm text-red-700" role="alert">{uploadError}</p>
	{/if}
</div>

{#if items.length !== 0}
	{#key receiptVersion}
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
	{/key}
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
