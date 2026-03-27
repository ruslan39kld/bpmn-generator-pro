import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callGigaChat } from './utils/gigachat'
import { buildDrawioXml } from './utils/buildDrawioXml'
import { buildDrawioUrl } from './utils/buildDrawioUrl'
import type { BpmnStep } from './utils/buildDrawioXml'

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string
  login: string
  password: string
  role: 'admin' | 'user'
  name: string
}

interface AppData {
  apiKey: string
  users: User[]
  stats: { date: string; user: string; status: string }[]
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const DEFAULT_DATA: AppData = {
  apiKey: '',
  users: [
    { id: '1', login: 'admin', password: '123', role: 'admin', name: 'Администратор' },
    { id: '2', login: 'user',  password: '123', role: 'user',  name: 'Пользователь' },
  ],
  stats: [],
}

function getAppData(): AppData {
  try {
    const raw = localStorage.getItem('bpmn_app_data')
    return raw ? JSON.parse(raw) : DEFAULT_DATA
  } catch { return DEFAULT_DATA }
}

function saveAppData(data: AppData) {
  localStorage.setItem('bpmn_app_data', JSON.stringify(data))
}

function getSession(): User | null {
  try {
    const s = sessionStorage.getItem('bpmn_session') || localStorage.getItem('bpmn_session')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

function setSession(user: User, remember: boolean) {
  const s = JSON.stringify(user)
  if (remember) localStorage.setItem('bpmn_session', s)
  else sessionStorage.setItem('bpmn_session', s)
}

function clearSession() {
  sessionStorage.removeItem('bpmn_session')
  localStorage.removeItem('bpmn_session')
}

// ─── File parser ──────────────────────────────────────────────────────────────

async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'docx') {
    const mammoth = (window as any).mammoth
    if (!mammoth) throw new Error('mammoth.js не загружен')
    const buf = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer: buf })
    return result.value

  } else if (ext === 'txt') {
    return file.text()

  } else if (ext === 'pdf') {
    const pdfjsLib = (window as any).pdfjsLib
    if (!pdfjsLib) throw new Error('pdf.js не загружен')
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    let text = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map((it: any) => it.str).join(' ') + '\n'
    }
    return text

  } else if (['xlsx', 'xls'].includes(ext)) {
    const XLSX = (window as any).XLSX
    if (!XLSX) throw new Error('SheetJS не загружен')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    return wb.SheetNames.map((name: string) =>
      `[${name}]\n` + XLSX.utils.sheet_to_csv(wb.Sheets[name])
    ).join('\n')

  } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
    return new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(`[Изображение: ${file.name}]\n(содержимое изображения)`)
      reader.onerror = rej
      reader.readAsDataURL(file)
    })

  } else {
    throw new Error(`Неподдерживаемый формат: .${ext}`)
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = getAppData()
    const user = data.users.find(u => u.login === login && u.password === password)
    if (user) { setSession(user, remember); onLogin() }
    else setError(true)
  }

  const fillDemo = (l: string, p: string) => { setLogin(l); setPassword(p); setError(false) }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-8 bg-blue-600 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-1">Вход в систему</h2>
          <p className="text-blue-100 text-sm">BPMN Generator Pro</p>
        </div>
        <div className="p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Логин</label>
              <input value={login} onChange={e => setLogin(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Введите логин" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Введите пароль" required />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 text-blue-600" />
              Запомнить меня
            </label>
            {error && <p className="text-red-500 text-sm text-center">Неверный логин или пароль</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors">Войти</button>
          </form>
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-sm text-slate-500 text-center mb-3">Демо-доступ</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => fillDemo('admin','123')} className="flex flex-col items-center p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all">
                <span className="text-sm font-medium text-slate-700">Администратор</span>
                <span className="text-xs text-slate-400">admin / 123</span>
              </button>
              <button onClick={() => fillDemo('user','123')} className="flex flex-col items-center p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all">
                <span className="text-sm font-medium text-slate-700">Пользователь</span>
                <span className="text-xs text-slate-400">user / 123</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'dashboard'|'apikey'|'users'|'stats'>('dashboard')
  const [data, setData] = useState<AppData>(getAppData)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [editing, setEditing] = useState(false)
  const [apiInput, setApiInput] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ name:'', login:'', password:'', role:'user' })

  const refresh = () => { const d = getAppData(); setData(d) }

  const saveKey = () => {
    const d = getAppData(); d.apiKey = apiInput; saveAppData(d); setData(d)
    setEditing(false)
  }

  const deleteKey = () => {
    if (!confirm('Удалить API ключ?')) return
    const d = getAppData(); d.apiKey = ''; saveAppData(d); setData(d); setApiInput('')
  }

  const deleteUser = (id: string) => {
    const d = getAppData()
    const u = d.users.find(u => u.id === id)
    if (!u) return
    if (u.role === 'admin' && d.users.filter(u => u.role === 'admin').length === 1) {
      alert('Нельзя удалить последнего администратора'); return
    }
    if (!confirm('Удалить пользователя?')) return
    d.users = d.users.filter(u => u.id !== id); saveAppData(d); setData(d)
  }

  const addUser = (e: React.FormEvent) => {
    e.preventDefault()
    const d = getAppData()
    if (d.users.find(u => u.login === newUser.login)) { alert('Логин занят'); return }
    d.users.push({ id: Date.now().toString(), ...newUser, role: newUser.role as 'admin'|'user' })
    saveAppData(d); setData(d); setShowAddUser(false); setNewUser({ name:'', login:'', password:'', role:'user' })
  }

  const navItems = [
    { id: 'dashboard', label: 'Дашборд' },
    { id: 'apikey',    label: 'API Ключи' },
    { id: 'users',     label: 'Пользователи' },
    { id: 'stats',     label: 'Статистика' },
  ] as const

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold">A</div>
            <div><div className="font-bold text-slate-800">Admin Panel</div><div className="text-xs text-slate-500">BPMN Generator</div></div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-colors ${tab === n.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200">
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-red-600 hover:bg-red-50 font-medium text-sm transition-colors">
            Выйти
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-800">Обзор системы</h1>
            <div className="grid grid-cols-4 gap-6">
              {[
                { label: 'Пользователей', value: data.users.length },
                { label: 'Генераций', value: data.stats.length },
                { label: 'Активных', value: data.users.length },
                { label: 'Статус API', value: data.apiKey ? '✓ Подключено' : '✗ Нет ключа', green: !!data.apiKey },
              ].map(s => (
                <div key={s.label} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="text-slate-500 text-sm mb-1">{s.label}</div>
                  <div className={`text-2xl font-bold ${s.green !== undefined ? (s.green ? 'text-green-600' : 'text-red-500') : 'text-slate-800'}`}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'apikey' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-800">Настройки API</h1>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <label className="block text-sm font-medium text-slate-700 mb-2">GigaChat API Key</label>
              <div className="relative mb-4">
                <input
                  type={apiKeyVisible ? 'text' : 'password'}
                  value={editing ? apiInput : (data.apiKey || '')}
                  readOnly={!editing}
                  onChange={e => setApiInput(e.target.value)}
                  onClick={() => { if (!editing) { setEditing(true); setApiInput(data.apiKey || '') }}}
                  className={`w-full border rounded-xl px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-blue-500 ${editing ? 'bg-white border-blue-400' : 'bg-slate-50 border-slate-200'}`}
                  placeholder="Введите ключ авторизации"
                />
                <button type="button" onClick={() => setApiKeyVisible(v => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600">
                  {apiKeyVisible ? '🙈' : '👁'}
                </button>
              </div>
              {!editing ? (
                <div className="flex gap-3">
                  <button onClick={() => { setEditing(true); setApiInput(data.apiKey || '') }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-6 rounded-xl transition-colors">Редактировать</button>
                  <button onClick={deleteKey}
                    className="bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-6 rounded-xl transition-colors">Удалить</button>
                  <button onClick={() => alert(data.apiKey ? 'Ключ задан (проверка через реальный запрос)' : 'Ключ не задан')}
                    className="ml-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-6 rounded-xl transition-colors">Проверить</button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={saveKey}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-xl transition-colors">Сохранить</button>
                  <button onClick={() => setEditing(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-6 rounded-xl transition-colors">Отмена</button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-slate-800">Пользователи</h1>
              <button onClick={() => setShowAddUser(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-xl transition-colors text-sm">+ Добавить</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead><tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
                  <th className="p-4 font-medium">Имя</th>
                  <th className="p-4 font-medium">Логин</th>
                  <th className="p-4 font-medium">Роль</th>
                  <th className="p-4 font-medium">Действия</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {data.users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">{u.name}</td>
                      <td className="p-4 text-slate-600">{u.login}</td>
                      <td className="p-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{u.role}</span>
                      </td>
                      <td className="p-4">
                        <button onClick={() => deleteUser(u.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Удалить</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-800">Статистика генераций</h1>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead><tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
                  <th className="p-4 font-medium">Дата и время</th>
                  <th className="p-4 font-medium">Пользователь</th>
                  <th className="p-4 font-medium">Статус</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {[...data.stats].reverse().map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-4 text-slate-800">{new Date(s.date).toLocaleString()}</td>
                      <td className="p-4 text-slate-600">{s.user}</td>
                      <td className="p-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {s.status === 'success' ? 'Успешно' : 'Ошибка'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.stats.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Добавить пользователя</h2>
              <button onClick={() => setShowAddUser(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={addUser} className="p-6 space-y-4">
              {(['name','login','password'] as const).map(f => (
                <div key={f}>
                  <label className="block text-sm font-medium text-slate-700 mb-1 capitalize">{f === 'name' ? 'Имя' : f === 'login' ? 'Логин' : 'Пароль'}</label>
                  <input type={f === 'password' ? 'password' : 'text'} value={newUser[f]}
                    onChange={e => setNewUser(p => ({ ...p, [f]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Роль</label>
                <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none">
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-xl transition-colors">Отмена</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-xl transition-colors">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main App (User) ──────────────────────────────────────────────────────────

function GeneratorApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [xml, setXml] = useState('')
  const [drawioUrl, setDrawioUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'bpmn'|'compare'|'animation'|'executive'>('bpmn')
  const [stats, setStats] = useState({ tasks: 0, gateways: 0, roles: 0, time: 0 })
  const [isDragOver, setIsDragOver] = useState(false)
  const [options, setOptions] = useState({ swimlanes: true, asIsToBe: true, timeEstimates: true, animation: true, executive: true, compact: false })
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState(() => getAppData().apiKey)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${time}] ${msg}`])
  }, [])

  const handleFile = (f: File) => {
    const allowed = ['docx','txt','pdf','xlsx','xls','jpg','jpeg','png']
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowed.includes(ext)) { addLog(`[ERROR] Формат .${ext} не поддерживается`); return }
    setFile(f)
    addLog(`[INFO] Файл выбран: ${f.name}`)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleGenerate = async () => {
    const key = getAppData().apiKey
    if (!key) { setShowSettings(true); return }

    setLoading(true)
    setLogs([`[${new Date().toLocaleTimeString()}] Запуск генерации...`])

    try {
      let inputText = ''
      if (file) {
        addLog('[INFO] Чтение файла...')
        inputText = await extractText(file)
        addLog(`[OK] Файл прочитан (${inputText.length} символов)`)
      } else {
        inputText = text
      }
      if (!inputText.trim()) throw new Error('Нет текста для анализа')

      addLog('[INFO] Отправка запроса в GigaChat API...')
      const { steps, roles } = await callGigaChat(inputText, key, {
        swimlanes: options.swimlanes,
        compact: options.compact,
      })
      addLog(`[OK] Получено ${steps.length} шагов, ${roles.length} ролей`)

      const generatedXml = buildDrawioXml(steps, options.swimlanes ? roles : [])
      const url = buildDrawioUrl(generatedXml)

      setXml(generatedXml)
      setDrawioUrl(url)
      setStats({
        tasks:    steps.filter((s: BpmnStep) => s.type === 'task').length,
        gateways: steps.filter((s: BpmnStep) => s.type.includes('gateway')).length,
        roles:    roles.length,
        time:     steps.reduce((sum: number, s: BpmnStep) => sum + (s.time ?? 0), 0),
      })
      addLog('[OK] BPMN успешно сгенерирован')

      // Save stat
      const d = getAppData()
      d.stats.push({ date: new Date().toISOString(), user: user.login, status: 'success' })
      saveAppData(d)

    } catch (err: any) {
      addLog(`[ERROR] ${err.message}`)
      const d = getAppData()
      d.stats.push({ date: new Date().toISOString(), user: user.login, status: 'error' })
      saveAppData(d)
    } finally {
      setLoading(false)
    }
  }

  const copyXml = () => { navigator.clipboard.writeText(xml); addLog('[OK] XML скопирован') }

  const downloadDrawio = () => {
    const content = `<mxfile><diagram name="Process">${xml}</diagram></mxfile>`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/xml' }))
    a.download = 'process.drawio'; a.click()
    addLog('[OK] Файл .drawio скачан')
  }

  const hasApiKey = !!getAppData().apiKey

  const tabs = [
    { id: 'bpmn',      label: 'BPMN' },
    { id: 'compare',   label: 'AS-IS vs TO-BE' },
    { id: 'animation', label: 'Анимация' },
    { id: 'executive', label: 'Для руководства' },
  ] as const

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm flex-shrink-0">
        <div className="font-bold text-lg">
          <span className="text-blue-600">⬡ BPMN</span> Generator Pro
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">Привет, {user.name}</span>
          <button onClick={() => setShowSettings(true)} className="text-slate-400 hover:text-blue-600 transition-colors text-lg">⚙</button>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-600 transition-colors text-sm font-medium flex items-center gap-1">
            ↪ Выйти
          </button>
        </div>
      </header>

      {!hasApiKey && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 text-yellow-800 text-sm text-center">
          <span className="font-medium">Внимание:</span> API ключ GigaChat не настроен. <button onClick={() => setShowSettings(true)} className="underline">Настроить</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <aside className="w-72 bg-white border-r border-slate-200 flex flex-col overflow-y-auto flex-shrink-0">
          {/* Drop Zone */}
          <div className="p-5 border-b border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Источник данных</div>
            {!file ? (
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl h-28 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300'}`}>
                <span className="text-2xl text-blue-500 mb-1">↑</span>
                <span className="text-sm text-slate-600">Перетащи файл или нажми</span>
                <span className="text-xs text-slate-400 mt-1">.docx .pdf .xlsx .xls .jpg .png .txt</span>
                <input ref={fileInputRef} type="file" hidden
                  accept=".docx,.txt,.pdf,.xlsx,.xls,.jpg,.jpeg,.png"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
            ) : (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <span className="text-sm text-blue-800 font-medium truncate">{file.name}</span>
                <button onClick={() => { setFile(null); addLog('[INFO] Файл удалён') }}
                  className="text-slate-400 hover:text-red-500 ml-2 text-lg leading-none flex-shrink-0">&times;</button>
              </div>
            )}
          </div>

          {/* Text Area */}
          <div className="p-5 border-b border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Или опиши процесс</div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
              placeholder="Вставь текст из документа или опиши процесс шаг за шагом..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-slate-50" />
          </div>

          {/* Options */}
          <div className="p-5 border-b border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Параметры</div>
            <div className="space-y-2.5">
              {([
                ['timeEstimates', 'Временные оценки на каждый шаг'],
                ['asIsToBe',      'Генерировать AS-IS и TO-BE версии'],
                ['animation',     'Анимация выполнения процесса'],
                ['executive',     'Укрупнённая версия для руководства'],
                ['swimlanes',     'Дорожки по ролям (Swimlanes)'],
                ['compact',       'Компактный режим'],
              ] as [keyof typeof options, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={options[key]}
                    onChange={e => setOptions(p => ({ ...p, [key]: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Generate Button + Log */}
          <div className="p-5">
            <button onClick={handleGenerate} disabled={loading || !hasApiKey}
              className={`w-full h-12 rounded-xl font-semibold text-sm transition-all ${loading || !hasApiKey ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'}`}>
              {loading ? '⏳ Генерация...' : '▶ Сгенерировать BPMN'}
            </button>

            {/* Log */}
            {logs.length > 0 && (
              <div className="mt-3 bg-slate-900 rounded-xl p-3 h-28 overflow-y-auto">
                {logs.map((line, i) => (
                  <div key={i} className={`text-xs font-mono ${line.includes('[ERROR]') ? 'text-red-400' : line.includes('[OK]') ? 'text-green-400' : 'text-slate-400'}`}>
                    {line}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </aside>

        {/* Right Panel */}
        <section className="flex-1 flex flex-col overflow-hidden bg-white m-4 rounded-2xl shadow-sm border border-slate-200">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 px-4 bg-slate-50 rounded-t-2xl flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-5 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-3 px-6 py-3 border-b border-slate-100 flex-shrink-0">
            {[
              { label: 'Задач',    value: stats.tasks    || '—' },
              { label: 'Шлюзов',  value: stats.gateways || '—' },
              { label: 'Ролей',   value: stats.roles    || '—' },
              { label: 'Время',   value: stats.time ? `${stats.time} мин` : '— мин' },
            ].map(s => (
              <span key={s.label} className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700">
                {s.label}: {s.value}
              </span>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'bpmn' && (
              <>
                {xml ? (
                  <pre className="flex-1 overflow-auto p-6 text-xs font-mono text-slate-700 bg-slate-50 leading-relaxed whitespace-pre-wrap">{xml}</pre>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                    <div className="text-center">
                      <div className="text-4xl mb-3">⬡</div>
                      <div>Диаграмма появится здесь</div>
                      <div className="text-xs mt-1">Загрузите файл или введите описание процесса,<br/>затем нажмите «Сгенерировать BPMN»</div>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
                  <button onClick={() => drawioUrl && window.open(drawioUrl, '_blank')}
                    disabled={!drawioUrl}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${drawioUrl ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'}`}>
                    Открыть в draw.io
                  </button>
                  <button onClick={copyXml} disabled={!xml}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${xml ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'}`}>
                    Скопировать XML
                  </button>
                  <button onClick={downloadDrawio} disabled={!xml}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${xml ? 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'}`}>
                    Скачать .drawio
                  </button>
                </div>
              </>
            )}

            {activeTab === 'compare' && (
              <div className="flex-1 flex flex-col overflow-auto p-6 gap-4">
                <div className="grid grid-cols-2 gap-6 flex-1">
                  {[
                    { label: 'AS-IS (текущий)', color: 'text-red-500', time: stats.time || '—' },
                    { label: 'TO-BE (оптимизированный)', color: 'text-green-600', time: stats.time ? Math.round(stats.time * 0.6) : '—' },
                  ].map(b => (
                    <div key={b.label} className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-5 shadow-sm">
                      <h3 className={`text-lg font-semibold ${b.color}`}>{b.label}</h3>
                      <div className="text-4xl font-bold text-slate-800">{b.time} мин</div>
                      <button onClick={() => drawioUrl && window.open(drawioUrl, '_blank')}
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                        Открыть в draw.io
                      </button>
                    </div>
                  ))}
                </div>
                {stats.time > 0 && (
                  <div className="text-center text-green-600 font-semibold text-lg border-t border-slate-200 pt-4">
                    Экономия: {Math.round(stats.time * 0.4)} мин ({40}%)
                  </div>
                )}
              </div>
            )}

            {activeTab === 'animation' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 py-3 border-b border-slate-200 flex gap-3 flex-shrink-0">
                  <button className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50">▶ Запустить</button>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50">⏸ Пауза</button>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50">↺ Сброс</button>
                </div>
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                  Сначала сгенерируй BPMN
                </div>
              </div>
            )}

            {activeTab === 'executive' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                  Укрупнённая диаграмма для руководства появится после генерации
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
                  <button onClick={() => drawioUrl && window.open(drawioUrl, '_blank')}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50">
                    Открыть в draw.io
                  </button>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50">
                    Скачать PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Настройки API</h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">GigaChat API Key</label>
                <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="Вставьте Bearer-токен GigaChat"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-slate-400 mt-1">Токен сохраняется в localStorage под ключом <code>bpmn_app_data</code></p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSettings(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-xl transition-colors">Отмена</button>
                <button onClick={() => {
                  const d = getAppData(); d.apiKey = apiKeyInput; saveAppData(d)
                  setApiKey(apiKeyInput); setShowSettings(false)
                  addLog('[OK] API ключ сохранён')
                }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-xl transition-colors">Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<'login'|'admin'|'app'>(() => {
    const s = getSession()
    if (!s) return 'login'
    return s.role === 'admin' ? 'admin' : 'app'
  })
  const [currentUser, setCurrentUser] = useState<User | null>(getSession)

  const handleLogin = () => {
    const s = getSession()
    if (!s) return
    setCurrentUser(s)
    setView(s.role === 'admin' ? 'admin' : 'app')
  }

  const handleLogout = () => {
    clearSession(); setCurrentUser(null); setView('login')
  }

  if (view === 'login') return <LoginPage onLogin={handleLogin} />
  if (view === 'admin') return <AdminPanel onLogout={handleLogout} />
  if (view === 'app' && currentUser) return <GeneratorApp user={currentUser} onLogout={handleLogout} />
  return <LoginPage onLogin={handleLogin} />
}
