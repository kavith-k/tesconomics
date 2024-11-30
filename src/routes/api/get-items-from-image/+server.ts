import { env } from '$env/dynamic/private';
import type { ReceiptEntry, FunctionResponse } from '$lib/types';
import { json, error } from '@sveltejs/kit';

type RequestContent =
	| string
	| {
			type: string;
			text?: string;
			image_url?: { url: string };
	  }[];

type Message = {
	role: 'user' | 'assistant' | 'system';
	content: RequestContent;
};

async function queryLlm(model: string, messages: Message[], mockRequest: boolean = true) {
	if (!mockRequest) {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: model,
				messages: messages,
				response_format: { type: 'json_object' }
			})
		});

		return response.json();
	}
	// Mock OpenRouter API Response
	else {
		return {
			id: 'gen-1742682890-bRn4x0BWEZwQC1V82XXU',
			provider: 'Anthropic',
			model: 'anthropic/claude-3.5-sonnet',
			object: 'chat.completion',
			created: 1000000000,
			choices: [
				{
					logprobs: null,
					finish_reason: 'end_turn',
					index: 0,
					message: {
						role: 'assistant',
						content:
							'[\n  {"product":"Tesco Irish Chicken Breast Fillets 500G","quantity":1,"cost":5.69},\n  {"product":"Tesco Blueberry 150G","quantity":1,"cost":1.99},\n  {"product":"Tesco Protein Blueberry Yoghurt 200G","quantity":3,"cost":3.60},\n  {"product":"Tranos Greek Feta 200G","quantity":1,"cost":1.09},\n  {"product":"Tesco Natural Yoghurt 500G","quantity":2,"cost":2.38},\n  {"product":"Tesco Irish Chicken Breast Fillet Portions 945G","quantity":3,"cost":30.00},\n  {"product":"Tesco Skim Milk 1Litre","quantity":1,"cost":1.15},\n  {"product":"Tesco Low Fat Milk 1Ltr","quantity":1,"cost":1.15},\n  {"product":"Tesco Low Fat Milk500ml","quantity":1,"cost":0.75},\n  {"product":"Tesco Raspberries 300G","quantity":1,"cost":1.75},\n  {"product":"Hughes Farming Carrot Bag 750g","quantity":1,"cost":0.69},\n  {"product":"Tesco Milled Flax Pumpkin & Chia Seed Mix 175G","quantity":1,"cost":2.80},\n  {"product":"Tesco Whole Cucumber Each","quantity":2,"cost":1.38},\n  {"product":"Tesco Smoked Paprika 48G","quantity":1,"cost":1.00},\n  {"product":"Tesco Ginger 100g","quantity":1,"cost":0.57},\n  {"product":"Tesco Lemon And Lime Zero 2 Litre","quantity":1,"cost":1.00},\n  {"product":"Tesco Mild Tandoori Curry Powder 80G","quantity":1,"cost":1.00},\n  {"product":"Tesco Red Onion 750G","quantity":3,"cost":2.07},\n  {"product":"Tesco 12 Irish Barn Eggs","quantity":1,"cost":2.75},\n  {"product":"Tesco 10 Chicken Stock Cubes 100G","quantity":1,"cost":0.45},\n  {"product":"Tesco Hazelnut Chocolate Spread 400G","quantity":1,"cost":1.50},\n  {"product":"Tesco Organic Oats 1Kg","quantity":1,"cost":1.10},\n  {"product":"Sprite Zero Sugar Lemon-Lime Soft Drink 2L","quantity":1,"cost":3.50},\n  {"product":"Tesco Cranberries 100G","quantity":1,"cost":1.35},\n  {"product":"Tesco Fun-Sized Easy Peeler 500G","quantity":1,"cost":0.99},\n  {"product":"Tesco Sliced Green Jalapenos In Brine 300G","quantity":3,"cost":3.00},\n  {"product":"Tesco Salad Tomatoes 6 Pack","quantity":1,"cost":1.29},\n  {"product":"Springforce Jumbo Kitchen Towel 240 Sheets","quantity":1,"cost":1.50},\n  {"product":"Farm Select Puro Gusto Ready To Eat Mango","quantity":1,"cost":0.69},\n  {"product":"Tesco Rich Tea Biscuit 300G","quantity":2,"cost":1.30}\n]',
						refusal: ''
					}
				}
			],
			usage: {
				prompt_tokens: 3341,
				completion_tokens: 879,
				total_tokens: 4220
			}
		};
	}
}

async function convertReceiptToJson(images: string[]): Promise<FunctionResponse> {
	let jsonReceipt: Array<ReceiptEntry> = [];

	// Using an LLM to convert the base64 images into a structured JSON
	const model = 'anthropic/claude-3.5-sonnet';

	const systemPrompt: Message = {
		role: 'system',
		content: `You are a grocery receipt processing assistant that takes in image inputs. You MUST respond with ONLY a valid JSON array containing objects with exactly these fields: "product" (string), "quantity" (number), "cost" (number). Parse receipts using these rules:

    1. Extract data from "Qty", "Product", and "Total" columns:
      - Always use the exact value from the "Total" column for cost
      - Remove currency symbols from numbers

    2. Format rules for substitutions:
      - Use ONLY the substituted product name + " [SUB]"
      - Use the Total value shown between original and substituted items
      - Ignore the original product entry entirely

    3. Skip these items:
      - Products listed under "Unavailable"
      - Text about price differences (e.g., "Was €X, now €Y")
      - Department headers (e.g., "Fridge", "Freezer", "Cupboard")
      - VAT/tax explanations

    4. Stop processing at "Payment summary" section

    Example output:
    [
      {"product":"Chicken Breast Fillets","quantity":1,"cost":5.69},
      {"product":"Shannon Baking Parchment 12M [SUB]","quantity":1,"cost":1.20},
      {"product":"Sprite Zero Sugar Lemon-Lime Soft Drink 2L","quantity":1,"cost":3.50}
    ]`
	};

	const userPrompt: Message = {
		role: 'user',
		content: images.map((base64Image: string) => {
			return { type: 'image_url', image_url: { url: base64Image } };
		})
	};

	const messages: Message[] = [systemPrompt, userPrompt];

	const llmResponse = await queryLlm(model, messages, false);

	// Making sure there's valid JSON data in the model's response, and extracting it
	try {
		if (
			!llmResponse.choices ||
			!Array.isArray(llmResponse.choices) ||
			llmResponse.choices.length === 0
		) {
			throw new Error(`Received the following response from OpenRouter: ${llmResponse}`);
		}
		try {
			jsonReceipt = JSON.parse(llmResponse.choices[0].message.content);
		} catch (parseError) {
			// If initial parse fails, try to find a JSON array substring
			const content = llmResponse.choices[0].message.content;
			const startIndex = content.indexOf('[');
			if (startIndex !== -1) {
				const endIndex = content.lastIndexOf(']') + 1;
				if (endIndex > startIndex) {
					const jsonSubstring = content.substring(startIndex, endIndex);
					jsonReceipt = JSON.parse(jsonSubstring); // Attempt to parse the extracted substring
				} else {
					throw parseError; // Re-throw if we can't find the end
				}
			} else {
				throw parseError; // Re-throw if we can't find the start
			}
		}
	} catch (error) {
		return {
			status: 'failure',
			content: `Failed to receive expected LLM response. ${error}`
		};
	}

	return {
		status: 'success',
		content: JSON.stringify(jsonReceipt)
	};
}

export async function POST({ request }: { request: Request }) {
	// Pull base64 images array from the request's body
	const requestData = await request.json();
	const { images } = requestData;

	// Converting the images to JSON
	const jsonReceiptResponse = await convertReceiptToJson(images);

	// Error converting the receipt to JSON
	if (jsonReceiptResponse.status === 'failure')
		return error(502, `Error converting the receipt to JSON. ${jsonReceiptResponse.content}`);

	// Returning items in the receipt as JSON
	return json(JSON.parse(jsonReceiptResponse.content));
}
