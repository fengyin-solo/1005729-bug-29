<template>
  <section class="page" data-module="dcsystem-detail">
    <header class="page-head">
      <div>
        <h2>直流监测明细</h2>
        <p class="page-desc">明细与监测台账读的是同一份落库数据：状态、单体电压、内阻在此与列表完全一致。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="goBack">返回监测列表</button>
      </div>
    </header>

    <div v-if="errorMessage" class="page-foot">
      <span class="error-text">{{ errorMessage }}</span>
    </div>

    <table v-else-if="row" class="data-table">
      <tbody>
        <tr v-for="item in detailItems" :key="item.label">
          <th style="width: 180px">{{ item.label }}</th>
          <td>{{ item.value }}</td>
        </tr>
        <tr>
          <th>当前状态</th>
          <td>{{ row.status }}</td>
        </tr>
      </tbody>
    </table>

    <footer v-if="row" class="page-foot">
      <span>结论为「异常告警」的蓄电池组会进入设备巡视的待复查清单</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getEntry, moduleMeta } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const router = useRouter()
const meta = moduleMeta('dcsystem')

const row = ref<EntryRow | undefined>()
const errorMessage = ref('')

// 明细字段沿用既有监测口径：直接从台账同一存储读取，不另存副本；当前状态单独成行，与台账同源。
const detailItems = computed(() =>
  meta.fields
    .filter((field) => field !== '直流状态')
    .map((field) => ({ label: field, value: row.value?.[field] ?? '—' })),
)

function load() {
  const id = Number(route.params.id)
  row.value = getEntry(meta.key, id)
  if (!row.value) {
    errorMessage.value = `没有找到编号为 ${id} 的直流监测记录`
  }
}

function goBack() {
  router.push({ name: 'dcsystem' })
}

onMounted(load)
</script>
