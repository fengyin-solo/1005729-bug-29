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
  /** 动作允许从哪些状态发起：不登记时沿用旧口径（任意状态都可流转）。 */
  actionSources?: Record<string, string[]>
  /** 计入「待处理/待监测」的状态：不登记时默认除末态外都算。 */
  pendingStatuses?: string[]
  /** 计入「异常量」的状态：不登记时按历史异常标记兜底。 */
  abnormalStatuses?: string[]
  /** 与流程状态保持同步的业务字段：流转时一并落库，页面各处读到同一份。 */
  statusField?: string
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
