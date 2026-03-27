import { useState, useRef, useEffect, useCallback } from 'react'
import { extractText } from './utils/fileParser'
import { buildDrawioUrl, buildDrawioXml } from './utils/buildDrawioUrl'
import { generateBpmn } from './utils/gigachat'

const TABS = ['BPMN', 'AS-IS vs TO-BE', 'Анимация', 'Для руководства'] as const
type Tab = typeof TABS[number]

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [xml, setXml] = useState('')
  const [drawioUrl, setDrawioUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gigachat_api_key') || '')
  const [showSettings, setShowSettings] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [settingsKey, setSettingsKey] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('BPMN')
  const [stats, setStats] = useState({ tasks: 0, gateways: 0, roles: 0, time: 0 })
  const [options, setOptions] = useState({
    swimlanes: true,
    asIsToBe: true,
    timeEstimates: true,
    compact: false,
  })
  const [dragOver, setDragOver] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (msg: string) =>
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

  const handleFile = (f: File) => setFile(f)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const handleGenerate = async () => {
    if (!apiKey) { setSettingsKey(apiKey); setShowSettings(true); return }
    setLoading(true)
    setLogs([])
    try {
      addLog('[INFO] Чтение источника данных...')
      const inputText = file ? await extractText(file) : text
      if (!inputText.trim()) throw new Error('Нет текста для анализа')
      addLog('[OK] Данные прочитаны')

      addLog('[INFO] Отправка запроса в GigaChat API...')
      const { steps, roles } = await generateBpmn(inputText, apiKey, {
        swimlanes: options.swimlanes,
        compact: options.compact,
      })
      addLog(`[OK] Получено ${steps.length} шагов, ${roles.length} ролей`)

      const generatedXml = buildDrawioXml(steps, options.swimlanes ? roles : [])
      const url = buildDrawioUrl(generatedXml)
      setXml(generatedXml)
      setDrawioUrl(url)
      setStats({
        tasks: steps.filter(s => s.type === 'task').length,
        gateways: steps.filter(s => s.type.includes('gateway')).length,
        roles: roles.length,
        time: steps.reduce((sum, s) => sum + (s.time || 0), 0),
      })
      addLog('[OK] BPMN сгенерирован успешно')
    } catch (err: any) {
      addLog(`[ERROR] ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const downloadDrawio = () => {
    const content = `<mxfile><diagram name="Process">${xml}</diagram></mxfile>`
    const blob = new Blob([content], { type: 'application/xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'process.drawio'
    a.click()
  }

  const copyXml = () => {
    navigator.clipboard.writeText(xml)
    addLog('[INFO] XML скопирован в буфер обмена')
  }

  const saveSettings = () => {
    const trimmed = settingsKey.trim()
    if (!trimmed) return
    localStorage.setItem('gigachat_api_key', trimmed)
    setApiKey(trimmed)
    setShowSettings(false)
    setShowApiKey(false)
  }

  const logColor = (line: string) => {
    if (line.includes('[ERROR]')) return 'text-red-400'
    if (line.includes('[OK]')) return 'text-green-400'
    return 'text-slate-400'
  }

  const ACCEPTED = '.docx,.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.txt'

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">

      {/* ── LEFT PANEL ─────────────────────────────────────────── */}
      <aside className="w-70 flex-shrink-0 flex flex-col bg-slate-800 text-white overflow-y-auto"
        style={{ width: 280 }}>

        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-700">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-blue-400">◉ BPMN</span>
            <span className="text-white"> Generator Pro</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Анализ бизнес-процессов с GigaChat</p>
        </div>

        <div className="flex-1 flex flex-col gap-4 px-4 py-4">

          {/* Drop zone / file display */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Источник данных</p>
            {file ? (
              <div className="flex items-center gap-2 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5">
                <span className="text-sm text-slate-200 truncate flex-1">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-slate-400 hover:text-white transition-colors text-lg leading-none"
                  title="Убрать файл"
                >×</button>
              </div>
            ) : (
              <>
                <div
                  className={`border-2 border-dashed rounded-xl px-3 py-5 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-900/20' : 'border-slate-600 hover:border-slate-500'}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="text-2xl mb-1">📎</div>
                  <p className="text-sm text-slate-300">Перетащите файл или нажмите</p>
                  <p className="text-xs text-slate-500 mt-1">.docx .pdf .xlsx .xls .jpg .png .txt</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
                <div className="mt-2">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="...или вставьте текст процесса сюда"
                    rows={4}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}
          </div>

          {/* Options */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Параметры</p>
            <div className="flex flex-col gap-2">
              {(
                [
                  ['swimlanes', 'Дорожки (swimlanes)'],
                  ['asIsToBe', 'AS-IS vs TO-BE анализ'],
                  ['timeEstimates', 'Оценка времени'],
                  ['compact', 'Компактный режим (≤8 шагов)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={e => setOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-sm text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {loading ? '⏳ Генерация...' : '▶ Сгенерировать BPMN'}
          </button>

          {/* Log */}
          {logs.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-3 max-h-40 overflow-y-auto">
              {logs.map((line, i) => (
                <div key={i} className={`font-mono text-[11px] leading-5 ${logColor(line)}`}>{line}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 border-t border-slate-700 pt-3">
          <button
            type="button"
            onClick={() => { setSettingsKey(apiKey); setShowSettings(true) }}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <span>⚙</span> Настройки API
            {apiKey && <span className="ml-auto text-xs text-green-400">✓ Ключ задан</span>}
          </button>
        </div>
      </aside>

      {/* ── RIGHT PANEL ────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col bg-white overflow-hidden">

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-slate-200">
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-white border border-b-white border-slate-200 text-blue-600 -mb-px z-10'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        {xml && (
          <div className="flex gap-3 px-6 py-3 bg-slate-50 border-b border-slate-200">
            {[
              ['Задач', stats.tasks, 'bg-blue-100 text-blue-700'],
              ['Шлюзов', stats.gateways, 'bg-yellow-100 text-yellow-700'],
              ['Ролей', stats.roles, 'bg-purple-100 text-purple-700'],
              ['Время', `${stats.time} мин`, 'bg-green-100 text-green-700'],
            ].map(([label, val, cls]) => (
              <span key={label as string} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cls as string}`}>
                {label}: <strong>{val}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {!xml ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
              <div className="text-6xl mb-4 opacity-30">⬡</div>
              <p className="text-lg font-medium text-slate-500">Диаграмма появится здесь</p>
              <p className="text-sm mt-1">Загрузите файл или введите описание процесса,<br />затем нажмите «Сгенерировать BPMN»</p>
            </div>
          ) : (
            <pre className="text-xs font-mono bg-gray-50 border border-slate-200 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all leading-5 text-slate-700">
              {xml}
            </pre>
          )}
        </div>

        {/* Action buttons */}
        {xml && (
          <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => window.open(drawioUrl, '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded-xl transition-colors text-sm"
            >
              Открыть в draw.io
            </button>
            <button
              type="button"
              onClick={copyXml}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-5 rounded-xl transition-colors text-sm"
            >
              Скопировать XML
            </button>
            <button
              type="button"
              onClick={downloadDrawio}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-5 rounded-xl transition-colors text-sm"
            >
              Скачать .drawio
            </button>
          </div>
        )}
      </main>

      {/* ── SETTINGS MODAL ─────────────────────────────────────── */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">Настройки API</h2>
              <button type="button" onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">GigaChat API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settingsKey}
                  onChange={e => setSettingsKey(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveSettings()}
                  placeholder="Вставьте Bearer-токен GigaChat"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Показать/скрыть ключ"
                >
                  {showApiKey ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Токен сохраняется в localStorage под ключом <code className="bg-slate-100 px-1 rounded">gigachat_api_key</code>
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                type="button"
                onClick={saveSettings}
                disabled={!settingsKey.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-xl transition-colors text-sm"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-6 rounded-xl transition-colors text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
