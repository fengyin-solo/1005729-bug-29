import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

const DC_KEY = 'dcsystem'

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const meta = moduleMeta(key)
  const matched = filterRows(latestByGroup(listRows(key), meta.groupField), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  // 越级挡回：登记了状态机就只能沿允许的边流转，例如“状态正常”不能直接再“标记异常”。
  const allowed = meta.allowedTransitions?.[current]
  if (allowed && !allowed.includes(target)) {
    return { ok: false, message: `当前是「${current}」，不能直接「${action}」，请按状态流转顺序操作` }
  }
  const terminal = meta.terminalStatus ?? meta.statuses[meta.statuses.length - 1]
  // 异常结论按落库的状态本身判定：配了 abnormalStatus 就以状态为准，刷新、重进读到的都是同一份。
  const abnormal = meta.abnormalStatus
    ? target === meta.abnormalStatus
    : NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== terminal,
    abnormal,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// 同组蓄电池只认最近一次落库的记录：提交多遍监测，台账、概览、待复查都只算一遍。
function latestByGroup(rows: EntryRow[], groupField?: string): EntryRow[] {
  if (!groupField) {
    return rows
  }
  const latest = new Map<string, EntryRow>()
  for (const row of rows) {
    const group = String(row[groupField] ?? '')
    const previous = latest.get(group)
    if (!previous || Number(row.id) > Number(previous.id)) {
      latest.set(group, row)
    }
  }
  return [...latest.values()]
}

// 直流模块统一的台账口径：台账列表、详情、概览、巡视待复查都走这一份。
export function dcRows(): EntryRow[] {
  const meta = moduleMeta(DC_KEY)
  return latestByGroup(listRows(DC_KEY), meta.groupField)
}

export function getEntry(key: string, id: number): EntryRow | undefined {
  const meta = moduleMeta(key)
  return latestByGroup(listRows(key), meta.groupField).find((row) => Number(row.id) === id)
}

// 直流指标：按落库状态重算，同组去重。异常告警也算待处理（还要巡视复查）。
export function dcStats(): { pending: number; normal: number; abnormal: number } {
  const meta = moduleMeta(DC_KEY)
  const terminal = meta.terminalStatus ?? meta.statuses[meta.statuses.length - 1]
  const abnormalStatus = meta.abnormalStatus ?? meta.statuses[meta.statuses.length - 1]
  let pending = 0
  let normal = 0
  let abnormal = 0
  for (const row of dcRows()) {
    if (row.status === abnormalStatus) {
      abnormal += 1
      pending += 1
    } else if (row.status === terminal) {
      normal += 1
    } else {
      pending += 1
    }
  }
  return { pending, normal, abnormal }
}

// 判成异常的直流记录驱动设备巡视的待复查清单：同一蓄电池组重复告警只列一遍。
export function dcReviewList(): EntryRow[] {
  const meta = moduleMeta(DC_KEY)
  const abnormalStatus = meta.abnormalStatus ?? meta.statuses[meta.statuses.length - 1]
  return dcRows().filter((row) => row.status === abnormalStatus)
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of latestByGroup(listRows(key), meta.groupField)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    // 直流模块按落库状态重算并按蓄电池组去重：异常告警既是异常量也仍是待处理。
    if (meta.key === DC_KEY) {
      const stats = dcStats()
      return {
        name: meta.name,
        created: dcRows().length,
        pending: stats.pending,
        abnormal: stats.abnormal,
      }
    }
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
