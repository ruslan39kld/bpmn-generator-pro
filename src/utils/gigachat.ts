import { BpmnStep } from './buildDrawioUrl'

const GIGACHAT_API = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions'

export async function generateBpmn(
  text: string,
  apiKey: string,
  options: { swimlanes: boolean; compact: boolean }
): Promise<{ steps: BpmnStep[]; roles: string[] }> {

  const systemPrompt = `Ты эксперт по бизнес-процессам и BPMN 2.0.
Верни ТОЛЬКО валидный JSON без markdown и без пояснений.

Структура JSON:
{
  "steps": [
    { "id": "s1", "name": "Краткое название (до 5 слов)", "type": "start|task|gateway_xor|end", "role": "Роль или null", "time": число_минут_или_null }
  ],
  "roles": ["Роль1", "Роль2"]
}

Правила:
- Первый шаг: type="start", последний: type="end"
- Условия/развилки: type="gateway_xor"
- Задачи: type="task"
${options.swimlanes ? '- Заполняй role для каждого шага обязательно' : '- role можно null'}
${options.compact ? '- Максимум 8 шагов, только ключевые' : '- Включай все шаги'}
- Названия на русском языке
- ТОЛЬКО JSON`

  const response = await fetch(GIGACHAT_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'GigaChat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Проанализируй и верни JSON:\n\n${text.slice(0, 8000)}` }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    })
  })

  if (!response.ok) throw new Error(`GigaChat error ${response.status}: ${await response.text()}`)

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned)
  return { steps: parsed.steps || [], roles: parsed.roles || [] }
}
