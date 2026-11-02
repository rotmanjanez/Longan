<template>
	<USwitch
		v-if="type.kind === 'bool'"
		:id="id"
		:model-value="settingBool(modelValue)"
		:aria-label="label"
		:disabled="disabled"
		@update:model-value="(v: boolean) => emit('update:modelValue', v ? '1' : '0')"
	/>
	<UInput
		v-else-if="type.kind === 'int'"
		:id="id"
		type="number"
		inputmode="numeric"
		:min="type.min"
		:max="type.max"
		step="1"
		class="w-40"
		:model-value="modelValue ?? ''"
		:aria-label="label"
		:aria-invalid="invalid || undefined"
		:color="invalid ? 'error' : undefined"
		:disabled="disabled"
		@update:model-value="(v: string | number) => emit('update:modelValue', String(v))"
	/>
	<USelect
		v-else-if="type.kind === 'enum'"
		:id="id"
		class="w-56"
		:items="type.options"
		:model-value="modelValue ?? undefined"
		:aria-label="label"
		:disabled="disabled"
		@update:model-value="(v: string) => emit('update:modelValue', v)"
	/>
	<UTextarea
		v-else-if="type.kind === 'json'"
		:id="id"
		class="w-full font-mono"
		autoresize
		:rows="2"
		:maxrows="12"
		:model-value="modelValue ?? ''"
		:aria-label="label"
		:aria-invalid="invalid || undefined"
		:color="invalid ? 'error' : undefined"
		:disabled="disabled"
		@update:model-value="(v: string) => emit('update:modelValue', v)"
	/>
	<div v-else-if="type.kind === 'color'" class="flex items-center gap-2">
		<input
			type="color"
			class="size-8 rounded-md cursor-pointer bg-transparent"
			:value="/^#[0-9a-f]{6}$/i.test(modelValue ?? '') ? modelValue : '#000000'"
			:aria-label="label"
			:disabled="disabled"
			@input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
		/>
		<UInput
			:id="id"
			class="w-32 font-mono"
			placeholder="#rrggbb"
			:model-value="modelValue ?? ''"
			:aria-label="label"
			:aria-invalid="invalid || undefined"
			:color="invalid ? 'error' : undefined"
			:disabled="disabled"
			@update:model-value="(v: string | number) => emit('update:modelValue', String(v))"
		/>
	</div>
	<UInput
		v-else
		:id="id"
		class="w-full"
		:model-value="modelValue ?? ''"
		:aria-label="label"
		:disabled="disabled"
		@update:model-value="(v: string | number) => emit('update:modelValue', String(v))"
	/>
</template>

<script setup lang="ts">
import { type SettingType, settingBool } from "@/lib/settingType.ts";

/** One settings value, rendered according to its type DSL (see lib/settingType.ts). */
defineProps<{
	id: string;
	type: SettingType;
	modelValue: string | null;
	label: string;
	invalid?: boolean;
	disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>
