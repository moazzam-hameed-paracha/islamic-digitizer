const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const GEMINI_ENDPOINT = GEMINI_API_KEY
	? `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
	: null;

export async function addArabicDiacritics(text: string): Promise<string> {
	if (!text.trim() || !GEMINI_ENDPOINT) {
		return text;
	}

	try {
		const prompt =
			'You are an Arabic diacritization assistant. Add full Arabic diacritics (tashkeel/eraab) to the text while preserving the exact same words, order, punctuation, and line breaks. Do not translate, explain, summarize, or add/remove words. Return only the diacritized Arabic text.\n\n' +
			text;

		const res = await fetch(GEMINI_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: { temperature: 0.1 },
			}),
		});

		if (!res.ok) {
			console.error('Gemini diacritization error:', await res.text());
			return text;
		}

		const data = (await res.json()) as {
			candidates?: Array<{
				content?: { parts?: Array<{ text?: string }> };
			}>;
		};

		const diacritized =
			data.candidates?.[0]?.content?.parts
				?.map((part) => part.text ?? '')
				.join('')
				.trim() ?? '';

		return diacritized || text;
	} catch (error) {
		console.error('Gemini diacritization exception:', error);
		return text;
	}
}
