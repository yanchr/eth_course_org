import type { ActivityOverride, ActivityPreset, BlockAnchor, DayPlanState, PlannerData } from '../types'

/** Missing before/after targets become ordinary flow items. */
export function resolveAnchor(anchor: BlockAnchor, targetIds: ReadonlySet<string>): BlockAnchor {
  return (anchor.type === 'before' || anchor.type === 'after') && !targetIds.has(anchor.targetId)
    ? { type: 'flow' }
    : anchor
}

export function repairDayPlanAnchors(plan: DayPlanState, presets: ActivityPreset[]): DayPlanState {
  const repairActivities = (
    selectedIds: string[],
    customs: ActivityPreset[],
    overrides: Record<string, ActivityOverride> | undefined,
  ) => {
    const selected = selectedIds.filter((id) => presets.some((preset) => preset.id === id))
    const targets = new Set([...selected, ...customs.map((item) => item.id), ...plan.todoQueue.map((item) => item.id)])
    const nextOverrides = { ...overrides }
    // Preset defaults stay reusable; a missing target gets a day-specific Flow override.
    for (const preset of presets) {
      const anchor = overrides?.[preset.id]?.anchor ?? preset.anchor
      const resolved = resolveAnchor(anchor, targets)
      if (resolved !== anchor) nextOverrides[preset.id] = { ...overrides?.[preset.id], anchor: resolved }
    }
    for (const [id, override] of Object.entries(nextOverrides)) {
      if (override.anchor) nextOverrides[id] = { ...override, anchor: resolveAnchor(override.anchor, targets) }
    }
    return {
      selected,
      targets,
      customs: customs.map((item) => ({ ...item, anchor: resolveAnchor(item.anchor, targets) })),
      overrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
    }
  }
  const active = repairActivities(plan.selectedPresetIds, plan.customActivities, plan.activityOverrides)
  const baseline = repairActivities(plan.settingsBaselineSelectedPresetIds, plan.settingsBaselineCustomActivities, plan.settingsBaselineActivityOverrides)
  return {
    ...plan,
    selectedPresetIds: active.selected,
    customActivities: active.customs,
    activityOverrides: active.overrides,
    todoQueue: plan.todoQueue.map((item) => ({ ...item, anchor: resolveAnchor(item.anchor, active.targets) })),
    settingsBaselineSelectedPresetIds: baseline.selected,
    settingsBaselineCustomActivities: baseline.customs,
    settingsBaselineActivityOverrides: baseline.overrides,
  }
}

/** Apply after edits and on restore, including saved days and Configure baselines. */
export function repairPlannerAnchors(data: PlannerData): PlannerData {
  return {
    ...data,
    dayPlan: repairDayPlanAnchors(data.dayPlan, data.activityPresets),
    dayPlansByDate: data.dayPlansByDate && Object.fromEntries(
      Object.entries(data.dayPlansByDate).map(([date, plan]) => [date, repairDayPlanAnchors(plan, data.activityPresets)]),
    ),
  }
}
