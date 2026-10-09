<script setup lang="ts">
  import { computed } from "vue";
  import type { EntitySummary } from "~/lib/api/types/data-contracts";
  import DataTable from "./table/data-table.vue";
  import { makeColumns } from "./table/columns";
  import { useI18n } from "vue-i18n";

  defineProps<{
    items: EntitySummary[];
  }>();

  const { t } = useI18n();

  const columnPreset = ["assetId", "name", "quantity", "purchasePrice", "location", "createdAt"];
  const columns = computed(() => makeColumns({ t }).filter(c => columnPreset.includes(c.id ?? "")));
</script>

<template>
  <DataTable view="table" :data="items" :columns="columns" :column-preset="columnPreset" disable-controls />
</template>
