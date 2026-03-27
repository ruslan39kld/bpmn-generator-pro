export interface BpmnStep {
  id: string
  name: string
  type: 'start' | 'task' | 'gateway_xor' | 'gateway' | 'end'
  role?: string | null
  time?: number | null
}

const CELL_W = 160
const CELL_H = 60
const LANE_H = 140

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isGateway(type: BpmnStep['type']): boolean {
  return type === 'gateway_xor' || type === 'gateway'
}

export function buildDrawioXml(steps: BpmnStep[], roles: string[]): string {
  const hasRoles = roles.length > 0
  const laneWidth = Math.max(800, steps.length * 220)
  let cells = ''

  if (hasRoles) {
    const totalH = LANE_H * roles.length + 40

    // Pool
    cells += `<mxCell id="pool" value="Процесс" style="shape=pool;startSize=30;horizontal=1;" vertex="1" parent="1">`
    cells += `<mxGeometry x="40" y="20" width="${laneWidth}" height="${totalH}" as="geometry"/>`
    cells += `</mxCell>\n`

    // Lanes
    roles.forEach((role, ri) => {
      cells += `<mxCell id="lane_${ri}" value="${esc(role)}" style="swimlane;startSize=30;horizontal=0;" vertex="1" parent="pool">`
      cells += `<mxGeometry x="0" y="${40 + ri * LANE_H}" width="${laneWidth}" height="${LANE_H}" as="geometry"/>`
      cells += `</mxCell>\n`
    })

    // Nodes
    let x = 60
    steps.forEach((step, i) => {
      const roleIdx = Math.max(0, roles.indexOf(step.role ?? ''))
      const parent = `lane_${roleIdx}`
      const id = `node_${i}`
      const nodeY = LANE_H / 2 - CELL_H / 2

      if (step.type === 'start') {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="ellipse;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="${parent}">`
        cells += `<mxGeometry x="${x}" y="${nodeY}" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (step.type === 'end') {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="ellipse;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="${parent}">`
        cells += `<mxGeometry x="${x}" y="${nodeY}" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (isGateway(step.type)) {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="${parent}">`
        cells += `<mxGeometry x="${x}" y="${LANE_H / 2 - 40}" width="80" height="80" as="geometry"/></mxCell>\n`
        x += 110
      } else {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="${parent}">`
        cells += `<mxGeometry x="${x}" y="${nodeY}" width="${CELL_W}" height="${CELL_H}" as="geometry"/></mxCell>\n`
        x += CELL_W + 40
      }

      if (i > 0) {
        cells += `<mxCell id="edge_${i}" edge="1" source="node_${i - 1}" target="${id}" parent="pool" style="edgeStyle=orthogonalEdgeStyle;">`
        cells += `<mxGeometry relative="1" as="geometry"/></mxCell>\n`
      }
    })

  } else {
    // Flat layout (no swimlanes)
    let x = 40
    steps.forEach((step, i) => {
      const id = `node_${i}`

      if (step.type === 'start') {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="ellipse;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">`
        cells += `<mxGeometry x="${x}" y="100" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (step.type === 'end') {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="ellipse;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">`
        cells += `<mxGeometry x="${x}" y="100" width="80" height="60" as="geometry"/></mxCell>\n`
        x += 110
      } else if (isGateway(step.type)) {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="rhombus;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">`
        cells += `<mxGeometry x="${x}" y="80" width="80" height="80" as="geometry"/></mxCell>\n`
        x += 110
      } else {
        cells += `<mxCell id="${id}" value="${esc(step.name)}" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">`
        cells += `<mxGeometry x="${x}" y="100" width="${CELL_W}" height="${CELL_H}" as="geometry"/></mxCell>\n`
        x += CELL_W + 40
      }

      if (i > 0) {
        cells += `<mxCell id="edge_${i}" edge="1" source="node_${i - 1}" target="${id}" parent="1" style="edgeStyle=orthogonalEdgeStyle;">`
        cells += `<mxGeometry relative="1" as="geometry"/></mxCell>\n`
      }
    })
  }

  return `<mxGraphModel adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
}
