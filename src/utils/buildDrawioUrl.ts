import pako from 'pako'

export interface BpmnStep {
  id: string
  name: string
  type: 'task' | 'gateway_xor' | 'gateway' | 'start' | 'end'
  role?: string | null
  time?: number | null
}

export function buildDrawioUrl(xml: string): string {
  const encoded = encodeURIComponent(xml)
  const compressed = pako.deflateRaw(encoded)
  const base64 = btoa(
    Array.from(compressed, (b: number) => String.fromCharCode(b)).join('')
  )
  const payload = JSON.stringify({ type: 'xml', compressed: true, data: base64 })
  return `https://app.diagrams.net/?pv=0&grid=0#create=${encodeURIComponent(payload)}`
}

export function buildDrawioXml(steps: BpmnStep[], roles: string[]): string {
  const hasRoles = roles.length > 0
  let cells = ''
  const cellW = 160
  const cellH = 60
  const laneWidth = Math.max(800, steps.length * 220)
  const laneHeight = 140

  if (hasRoles) {
    const totalH = laneHeight * roles.length + 40
    cells += `<mxCell id="pool" value="Процесс" style="shape=pool;startSize=30;horizontal=1;" vertex="1" parent="1"><mxGeometry x="40" y="20" width="${laneWidth}" height="${totalH}" as="geometry"/></mxCell>\n`
    roles.forEach((role, ri) => {
      cells += `<mxCell id="lane_${ri}" value="${escXml(role)}" style="swimlane;startSize=30;horizontal=0;" vertex="1" parent="pool"><mxGeometry x="0" y="${40 + ri * laneHeight}" width="${laneWidth}" height="${laneHeight}" as="geometry"/></mxCell>\n`
    })

    let x = 60
    steps.forEach((step, i) => {
      const roleIdx = Math.max(0, roles.indexOf(step.role || ''))
      const laneId = `lane_${roleIdx}`
      const nodeId = `node_${i}`
      const nodeY = laneHeight / 2 - cellH / 2

      if (step.type === 'start') {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="ellipse;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="${laneId}"><mxGeometry x="${x}" y="${nodeY}" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (step.type === 'end') {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="ellipse;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="${laneId}"><mxGeometry x="${x}" y="${nodeY}" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (step.type.includes('gateway')) {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="${laneId}"><mxGeometry x="${x}" y="${laneHeight / 2 - 40}" width="80" height="80" as="geometry"/></mxCell>\n`
        x += 110
      } else {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="${laneId}"><mxGeometry x="${x}" y="${nodeY}" width="${cellW}" height="${cellH}" as="geometry"/></mxCell>\n`
        x += cellW + 40
      }

      if (i > 0) {
        cells += `<mxCell id="edge_${i}" edge="1" source="node_${i - 1}" target="${nodeId}" parent="pool" style="edgeStyle=orthogonalEdgeStyle;"><mxGeometry relative="1" as="geometry"/></mxCell>\n`
      }
    })

  } else {
    let x = 40
    steps.forEach((step, i) => {
      const nodeId = `node_${i}`
      if (step.type === 'start') {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="ellipse;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="${x}" y="100" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (step.type === 'end') {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="ellipse;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="${x}" y="100" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (step.type.includes('gateway')) {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1"><mxGeometry x="${x}" y="80" width="80" height="80" as="geometry"/></mxCell>\n`
        x += 110
      } else {
        cells += `<mxCell id="${nodeId}" value="${escXml(step.name)}" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="${x}" y="100" width="${cellW}" height="${cellH}" as="geometry"/></mxCell>\n`
        x += cellW + 40
      }
      if (i > 0) {
        cells += `<mxCell id="edge_${i}" edge="1" source="node_${i - 1}" target="${nodeId}" parent="1" style="edgeStyle=orthogonalEdgeStyle;"><mxGeometry relative="1" as="geometry"/></mxCell>\n`
      }
    })
  }

  return `<mxGraphModel adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
