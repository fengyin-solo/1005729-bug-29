/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
  // 状态机：当前状态 -> 允许流转到的状态。不填表示沿用旧的“任意状态可流转”口径。
  allowedTransitions?: Record<string, string[]>
  // 异常态：落库后按状态本身判定 abnormal，而不是按动作字眼，刷新后读到的结论一致。
  abnormalStatus?: string
  // 业务上的终态：非终态才算待处理（pending）。不填时取状态列表最后一个。
  terminalStatus?: string
  // 同一业务对象的分组字段：按该字段去重，同组重复提交只算一遍。
  groupField?: string
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
