import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

const DC_KEY = 'dcsystem'
const PATROL_KEY = 'patrol'
const DC_ABNORMAL_STATUS = '异常告警'
const DC_GROUP_FIELD = '蓄电池组号'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function isPending(meta: ModuleMeta, status: string): boolean {
  if (meta.pendingStatuses) {
    return meta.pendingStatuses.includes(status)
  }
  // 未单独登记的模块沿用既有口径：除末态外都算待处理。
  return status !== meta.statuses[meta.statuses.length - 1]
}

export function isAbnormal(meta: ModuleMeta, row: EntryRow): boolean {
  if (meta.abnormalStatuses) {
    return meta.abnormalStatuses.includes(String(row.status))
  }
  return Boolean(row.abnormal)
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
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function getEntry(key: string, id: number): EntryRow | undefined {
  return listRows(key).find((row) => Number(row.id) === id)
}

// 直流系统按蓄电池组号去重统计：同一组重复提交监测只算一遍。
export function countGroupsByStatus(rows: EntryRow[], statuses: string[]): number {
  const groups = new Set<string>()
  for (const row of rows) {
    if (statuses.includes(String(row.status))) {
      groups.add(String(row[DC_GROUP_FIELD] ?? row.id))
    }
  }
  return groups.size
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function codeFromId(id: number): string {
  return `PATR-${String(id).padStart(4, '0')}`
}

// 判成异常的结论驱动设备巡视的待复查清单：同一蓄电池组只挂一条待复查，重复判异常不重复登记。
function syncPatrolRechecks() {
  const abnormalRows = listRows(DC_KEY).filter((row) => String(row.status) === DC_ABNORMAL_STATUS)
  const abnormalGroups = new Set(abnormalRows.map((row) => String(row[DC_GROUP_FIELD] ?? '')))
  const patrolRows = [...listRows(PATROL_KEY)]

  for (const group of abnormalGroups) {
    if (!group) {
      continue
    }
    const source = abnormalRows.find((row) => String(row[DC_GROUP_FIELD] ?? '') === group)
    const exists = patrolRows.some(
      (row) => row['来源模块'] === DC_KEY && String(row[DC_GROUP_FIELD] ?? '') === group,
    )
    // 同一组重复判异常不重复登记；巡视复查完成后该条自然离开待复查清单。
    if (exists) {
      continue
    }
    const id = nextId(patrolRows)
    patrolRows.push({
      id,
      status: '待巡视',
      pending: true,
      abnormal: false,
      巡视编号: codeFromId(id),
      巡视变电站: String(source?.['所属变电站'] ?? ''),
      巡视路线: `直流异常复查-${group}`,
      巡视人: '待派发',
      巡视日期: new Date().toISOString().slice(0, 10),
      发现缺陷数: 0,
      处理情况: `直流监测判异待复查（${source?.['监测编号'] ?? group}）`,
      巡视状态: '待巡视',
      来源模块: DC_KEY,
      蓄电池组号: group,
    })
  }
  saveRows(PATROL_KEY, patrolRows)
}

// 设备巡视待复查清单：直流判异自动挂入，且只取尚未复查完成的。
export function listPatrolRechecks(): EntryRow[] {
  return listRows(PATROL_KEY).filter(
    (row) => row['来源模块'] === DC_KEY && ['待巡视', '巡视中'].includes(String(row.status)),
  )
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
  // 状态机来源校验：只允许从登记的状态发起，越级动作挡回。
  const allowedSources = meta.actionSources?.[action]
  if (allowedSources && !allowedSources.includes(current)) {
    let message: string
    if (current === '状态正常') {
      message =
        action === '标记异常'
          ? '该组已判定状态正常，需重新提交监测、回到监测中后才能标记异常'
          : '该组已判定状态正常，请先重新提交监测'
    } else {
      message = `当前状态「${current}」不能执行「${action}」，请按流程逐级操作`
    }
    return { ok: false, message }
  }
  const updated: EntryRow = { ...rows[index], status: target }
  // pending/abnormal 一律按落库状态重算，概览异常量、待处理数与列表始终同一份口径。
  updated.pending = isPending(meta, target)
  updated.abnormal = meta.abnormalStatuses
    ? meta.abnormalStatuses.includes(target)
    : updated.abnormal || NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))
  // 业务状态字段与流程状态同写：单体电压、内阻、直流状态都在这同一条记录上落库。
  if (meta.statusField) {
    updated[meta.statusField] = target
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  if (key === DC_KEY) {
    syncPatrolRechecks()
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
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
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      // 异常量与待处理按落库那份状态重算，不再吃动作执行瞬间算出的旧标记。
      pending: entries.filter((row) => isPending(meta, String(row.status))).length,
      abnormal: entries.filter((row) => isAbnormal(meta, row)).length,
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
