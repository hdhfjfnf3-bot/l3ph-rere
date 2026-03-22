import type { ValidationResult, AnswerStatus } from '../types/game.types';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

// Validate a single answer using Gemini AI
async function validateWithGemini(
  word: string,
  category: string,
  letter: string
): Promise<AnswerStatus> {
  if (!GEMINI_API_KEY) {
    // Fallback: basic validation without AI
    return basicValidation(word, category, letter);
  }

  const prompt = `أنت أشرس وأقسى حكم في تاريخ لعبة "أتوبيس كومبليت". 
اللاعبون يغشون بإدخال كلمات "تبدو" عربية ولكنها وهمية أو نادرة جداً (مثل: حبيل، حبلا، شسي، فسيبس، فيشي).

الحرف المطلوب: "${letter}"
الفئة المطلوبة: "${category}"
الكلمة المُدخلة: "${word}"

مهمتك كشف الكلمات الوهمية (Hallucinations):
1. هل الكلمة "${word}" هي حروف عشوائية، أو اسم وهمي، أو مجرد وزن لغوي ليس له وجود حقيقي كاسم متعارف عليه؟
2. هل الكلمة حقيقية 100% ومشهورة جداً ويعرفها الشخص العادي؟ اشتبه في الكلمات الغريبة أو المؤلفة!
3. هل تنتمي الكلمة حصراً وبشكل قاطع للفئة "${category}"؟

أجب بمسودة JSON فقط بهذا التنسيق وبدون أي إضافة:
{
  "is_fake_or_gibberish": boolean,
  "is_real_and_famous": boolean,
  "belongs_to_category": boolean,
  "status": "valid" | "invalid",
  "reason": "سبب مختصر يشرح لماذا هي وهمية أو حقيقية"
}

قواعد صارمة جداً لتقييم status:
- لتكون "valid": يجب أن تكون is_fake_or_gibberish=false، و is_real_and_famous=true، و belongs_to_category=true، وتبدأ بالحرف الصحيح. يجب أن تكون متأكداً 100% أن الكلمة مشهورة (مثال الصحيح: "حمار" حيوان، "حسام" ولد).
- لتكون "invalid": إذا كانت الكلمة وهمية (fake) أو مجرد حروف مركبة أو لا أحد يستخدمها (مثل: حبيل، حبلا)، أو لا تنتمي للفئة، أو لا تبدأ بالحرف. ارفض بلا رحمة!`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 100,
          },
        }),
      }
    );

    if (!response.ok) throw new Error('Gemini API error');

    const data: GeminiResponse = await response.json();
    const text = data.candidates[0]?.content?.parts[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Safety override: if the AI marked it as fake or not real, force invalid regardless of what it put in status
      if (parsed.is_fake_or_gibberish === true || parsed.is_real_and_famous === false || parsed.belongs_to_category === false) {
        return 'invalid';
      }
      return parsed.status as AnswerStatus;
    }
  } catch (error) {
    console.warn('Gemini validation failed, using basic validation:', error);
  }

  return basicValidation(word, category, letter);
}

// Basic validation without AI (fallback)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function basicValidation(word: string, _category: string, _letter: string): AnswerStatus {
  if (!word || word.trim().length < 2) return 'invalid';

  // Check if it looks like random characters (mostly consonants, no vowel pattern)
  const randomPattern = /^[^اوي]{4,}$/;
  if (randomPattern.test(word)) return 'invalid';

  // Check minimum length
  if (word.trim().length < 2) return 'invalid';

  return 'valid'; // User requested no 'suspicious' status, assume valid and fair if AI is off
}

// Batch validate all answers for a round
export async function validateRoundAnswers(
  answers: Array<{ player_id: string; category: string; value: string }>,
  letter: string,
  onProgress?: (done: number, total: number) => void
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    const word = answer.value?.trim() || '';

    let status: AnswerStatus = 'invalid';

    if (!word) {
      status = 'invalid';
    } else {
      // Rate limit: 1 request per 1.2 seconds for Gemini free tier
      if (i > 0) await delay(1200);
      status = await validateWithGemini(word, answer.category, letter);
    }

    results.push({
      category: answer.category,
      value: word,
      status,
    });

    onProgress?.(i + 1, answers.length);
  }

  return results;
}

// Quick client-side pre-validation (before AI)
export function preValidate(word: string, letter: string): { ok: boolean; reason?: string } {
  if (!word || word.trim().length === 0) {
    return { ok: false, reason: 'الكلمة فارغة' };
  }

  const trimmed = word.trim();

  if (trimmed.length < 2) {
    return { ok: false, reason: 'الكلمة قصيرة جداً' };
  }

  // Check starts with letter (handle alef variants)
  const alefVariants = ['أ', 'إ', 'آ', 'ا', 'أ'];
  const letterIsAlef = alefVariants.includes(letter);
  const wordStartsWithAlef = alefVariants.some(v => trimmed.startsWith(v));

  if (letterIsAlef) {
    if (!wordStartsWithAlef) {
      return { ok: false, reason: `الكلمة يجب أن تبدأ بحرف ${letter}` };
    }
  } else {
    if (!trimmed.startsWith(letter)) {
      return { ok: false, reason: `الكلمة يجب أن تبدأ بحرف ${letter}` };
    }
  }

  // Detect obvious gibberish (repeated chars, no Arabic pattern)
  if (/(.)\1{3,}/.test(trimmed)) {
    return { ok: false, reason: 'كلمة غير منطقية' };
  }

  return { ok: true };
}
