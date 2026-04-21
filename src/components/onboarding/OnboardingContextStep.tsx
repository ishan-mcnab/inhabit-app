import {
  ONBOARDING_CONTEXT_FIELDS,
  type ContextFieldConfig,
  type ContextPillField,
} from '../../constants/onboardingContextConfig'
import type { GoalContextCategoryId } from '../../types/goalContext'

const GOAL_PURPLE = '#534AB7'
const CARD_BG = '#141418'
const CARD_BORDER = 'rgba(255,255,255,0.08)'
const MUTED_BODY = '#888780'

type Props = {
  categoryId: GoalContextCategoryId
  headingEmoji: string
  headingTitle: string
  stepNumber: number
  totalSteps: number
  values: Record<string, string | string[]>
  onFieldChange: (key: string, value: string | string[]) => void
  onBack: () => void
  onContinue: () => void
  onSkipSetupLater?: () => void
  submitting: boolean
  formError: string | null
}

function isMultiPillField(f: ContextFieldConfig): f is ContextPillField & {
  multiSelect: true
} {
  return f.type === 'pills' && f.multiSelect === true
}

function contextStepComplete(
  categoryId: GoalContextCategoryId,
  values: Record<string, string | string[]>,
): boolean {
  const fields = ONBOARDING_CONTEXT_FIELDS[categoryId]
  for (const f of fields) {
    if (!f.required) continue
    if (f.type === 'text') {
      const v = String(values[f.key] ?? '').trim()
      if (!v) return false
    } else if (isMultiPillField(f)) {
      const raw = values[f.key]
      const arr = Array.isArray(raw) ? raw : []
      if (arr.length === 0) return false
    } else {
      const rawVal = values[f.key]
      const v = typeof rawVal === 'string' ? rawVal.trim() : ''
      if (!v) return false
    }
  }
  return true
}

export function OnboardingContextStep({
  categoryId,
  headingEmoji,
  headingTitle,
  stepNumber,
  totalSteps,
  values,
  onFieldChange,
  onBack,
  onContinue,
  onSkipSetupLater,
  submitting,
  formError,
}: Props) {
  const fields = ONBOARDING_CONTEXT_FIELDS[categoryId]
  const canContinue = contextStepComplete(categoryId, values)

  return (
    <div
      className="flex min-h-screen flex-col px-4 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]"
      style={{ backgroundColor: '#0D0D0F' }}
    >
      <div className="relative flex h-11 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
          aria-label="Back"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <p className="text-xs font-medium" style={{ color: MUTED_BODY }}>
          Step {stepNumber} of {totalSteps}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col pt-2">
        <p className="text-[20px] font-semibold text-white">
          <span aria-hidden>{headingEmoji}</span> {headingTitle}
        </p>
        <p className="mt-2 text-sm font-medium" style={{ color: MUTED_BODY }}>
          Help us personalize your plan
        </p>
        {categoryId === 'fitness_consistency' ? (
          <div
            className="mt-4 flex gap-3 rounded-xl border px-3 py-3"
            style={{
              backgroundColor: CARD_BG,
              borderColor: CARD_BORDER,
              borderLeftWidth: 3,
              borderLeftColor: GOAL_PURPLE,
            }}
          >
            <span className="shrink-0 text-base leading-none" aria-hidden>
              {'\u{1F4A1}'}
            </span>
            <p
              className="text-[13px] font-medium leading-snug"
              style={{ color: MUTED_BODY }}
            >
              InHabit tracks your fitness consistency, not your workout
              programming. We&apos;ll help you show up every day — bring your own
              program or follow one you love.
            </p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-8">
          {fields.map((field) => {
            if (field.type === 'pills') {
              return (
                <div key={field.key}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-[13px] font-medium text-white">
                      {field.label}
                    </p>
                    {!field.required ? (
                      <button
                        type="button"
                        onClick={() =>
                          onFieldChange(
                            field.key,
                            field.type === 'pills' && isMultiPillField(field)
                              ? []
                              : '',
                          )
                        }
                        className="shrink-0 text-xs font-medium underline-offset-2 transition-colors hover:underline"
                        style={{ color: MUTED_BODY }}
                      >
                        Skip
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {field.options.map((opt) => {
                      const raw = values[field.key]
                      const multi = isMultiPillField(field)
                      const selected = multi
                        ? Array.isArray(raw) && raw.includes(opt)
                        : raw === opt
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            if (multi) {
                              const cur = Array.isArray(raw)
                                ? [...raw]
                                : typeof raw === 'string' && raw
                                  ? [raw]
                                  : []
                              const i = cur.indexOf(opt)
                              if (i >= 0) {
                                if (field.required && cur.length <= 1) return
                                cur.splice(i, 1)
                                onFieldChange(field.key, cur)
                              } else {
                                onFieldChange(field.key, [...cur, opt])
                              }
                            } else {
                              onFieldChange(field.key, opt)
                            }
                          }}
                          className={[
                            'inline-flex h-9 items-center rounded-lg border px-[14px] py-2 text-left text-[13px] font-medium transition-colors',
                            selected ? '' : 'text-white hover:bg-white/[0.04]',
                          ].join(' ')}
                          style={
                            selected
                              ? {
                                  borderColor: GOAL_PURPLE,
                                  backgroundColor: 'rgba(83, 74, 183, 0.1)',
                                  color: '#fff',
                                }
                              : {
                                  borderColor: CARD_BORDER,
                                  backgroundColor: CARD_BG,
                                }
                          }
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            }

            return (
              <div key={field.key}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <label
                    htmlFor={`ctx-${categoryId}-${field.key}`}
                    className="text-[13px] font-medium text-white"
                  >
                    {field.label}
                  </label>
                  {!field.required ? (
                    <button
                      type="button"
                      onClick={() => onFieldChange(field.key, '')}
                      className="shrink-0 text-xs font-medium underline-offset-2 transition-colors hover:underline"
                      style={{ color: MUTED_BODY }}
                    >
                      Skip
                    </button>
                  ) : null}
                </div>
                <input
                  id={`ctx-${categoryId}-${field.key}`}
                  type="text"
                  value={
                    typeof values[field.key] === 'string'
                      ? values[field.key]
                      : ''
                  }
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="h-11 w-full rounded-xl border px-4 text-base font-medium text-white outline-none placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-[#534AB7]/50"
                  style={{
                    backgroundColor: CARD_BG,
                    borderColor: CARD_BORDER,
                  }}
                />
              </div>
            )
          })}
        </div>

        {formError ? (
          <p className="mt-6 text-sm font-medium text-red-400" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="mt-auto pt-10">
          <button
            type="button"
            disabled={!canContinue || submitting}
            onClick={onContinue}
            className="btn-press h-[52px] w-full rounded-xl text-base font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: GOAL_PURPLE }}
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
          {onSkipSetupLater ? (
            <button
              type="button"
              disabled={submitting}
              onClick={onSkipSetupLater}
              className="mt-4 w-full text-center text-[12px] font-medium transition-opacity disabled:opacity-40"
              style={{ color: MUTED_BODY }}
            >
              Skip for now — set up later
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
