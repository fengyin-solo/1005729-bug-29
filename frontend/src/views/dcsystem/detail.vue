<template>
  <section class="page" data-module="dcsystem-detail">
    <header class="page-head">
      <div>
        <h2>直流监测详情</h2>
        <p class="page-desc">单体电压、内阻与直流状态均取自监测台账落库的同一条记录，退回列表看到的数值与本页一致。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/dcsystem">返回监测台账</RouterLink>
      </div>
    </header>

    <template v-if="entry">
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">直流状态</span>
          <strong class="stat-value">{{ entry.status }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">单体电压</span>
          <strong class="stat-value">{{ entry['单体电压'] ?? '—' }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">内阻（与台账同一监测口径）</span>
          <strong class="stat-value">{{ entry['内阻'] ?? '—' }}</strong>
        </article>
      </div>

      <table class="data-table">
        <tbody>
          <tr v-for="field in fields" :key="field">
            <th style="width: 180px">{{ field }}</th>
            <td>{{ entry[field] ?? '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div class="detail-actions">
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          :class="{ primary: action === '标记异常' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>

      <footer class="page-foot">
        <span>监测编号 {{ entry['监测编号'] }} · 蓄电池组号 {{ entry['蓄电池组号'] }}</span>
        <span v-if="message" :class="ok ? 'ok-text' : 'error-text'">{{ message }}</span>
      </footer>
    </template>

    <section v-else class="data-table empty-state" style="padding: 24px">
      <p>没有找到这条直流监测记录，可能已被重置。</p>
      <RouterLink class="link" to="/dcsystem">返回监测台账</RouterLink>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { getEntry, moduleMeta, runAction as applyAction } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('dcsystem')
// 明细字段沿用既有监测口径：与台账列完全一致，不另存一份。
const fields = meta.fields
const actions = meta.actions

const route = useRoute()
const entryId = Number(route.params.id)
const entry = ref<EntryRow | undefined>()
const message = ref('')
const ok = ref(false)

function reload() {
  message.value = ''
  // 重新进入页面直接读落库那份：状态、单体电压、内阻都以这一条为准。
  entry.value = getEntry(meta.key, entryId)
}

function runAction(action: string) {
  const result = applyAction(meta.key, entryId, action)
  ok.value = result.ok
  message.value = result.message
  if (result.ok) {
    reload()
  }
}

onMounted(reload)
</script>

<style scoped>
.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.ok-text {
  color: #157f3b;
}
</style>
