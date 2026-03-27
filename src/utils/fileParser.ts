import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export async function extractText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'docx') {
    const buffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer: buffer })
    return result.value

  } else if (ext === 'pdf') {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
    const buffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    let text = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map((item: any) => item.str).join(' ') + '\n'
    }
    return text

  } else if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    let text = ''
    workbook.SheetNames.forEach(name => {
      text += `[Sheet: ${name}]\n` + XLSX.utils.sheet_to_csv(workbook.Sheets[name]) + '\n'
    })
    return text

  } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  } else if (ext === 'txt') {
    return await file.text()

  } else {
    throw new Error(`Неподдерживаемый формат: .${ext}`)
  }
}
