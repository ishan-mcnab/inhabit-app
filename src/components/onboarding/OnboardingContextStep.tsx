import { ONBOARDING_CONTEXT_FIELDS } from '../../constants/onboardingContextConfig'
import type { GoalContextCategoryId } from '../../types/goalContext'

const GOAL_PURPLE = '#534AB7'

type Props = {
  categoryId: GoalContextCategoryId
  headingEmoji: string
  headingTitle: string
  stepNumber: number
  totalSteps: number
  values: Record<string, string>
  onFieldChange: (key: string, value: string) => void
  onBack: () => void
  onContinue: () => void
  submitting: boolean
  formError: string | null
}

function contextStepComplete(
  categoryId: GoalContextCategoryId,
  values: Record<string, string>,
): boolean {
  const fields = ONBOARDING_CONTEXT_FIELDS[categoryId]
  for (const f of fields) {
    if (!f.required) continue
    const v = (values[f.key] ?? '').trim()
    if (!v) return false
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
  submitting,
  formError,
}: Props) {
  const fields = ONBOARDING_CONTEXT_FIELDS[categoryId]
  const canContinue = contextStepComplete(categoryId, values)

  return (
    <div className="flex min-h-screen flex-col bg-app-bg px-5 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex h-10 w-10 items-center justify-center self-start rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-white"
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <p className="text-2xl font-bold text-white">
          <span aria-hidden>{headingEmoji}</span>{' '}
          {headingTitle}
        </p>
        <p className="mt-2 text-base font-semibold text-zinc-400">
          Help us personalize your plan
        </p>
        {categoryId === 'fitness_consistency' ? (
          <div
            className="mt-4 flex gap-3 rounded-xl border border-zinc-800/80 px-3 py-3"
            style={{
              backgroundColor: '#141418',
              borderLeftWidth: 3,
              borderLeftColor: GOAL_PURPLE,
            }}
          >
            <span className="shrink-0 text-base leading-none" aria-hidden>
              💡
            </span>
            <p className="text-[13px] font-medium leading-snug text-zinc-500">
              InHabit tracks your fitness consistency, not your workout
              programming. We&apos;ll help you show up every day — bring your own
              program or follow one you love.
            </p>
          </div>
        ) : null}
        <p className="mt-3 text-sm font-bold uppercase tracking-wider text-zinc-500">
          Step {stepNumber} of {totalSteps}
        </p>

        <div className="mt-8 flex flex-col gap-8">
          {fields.map((field) => {
            if (field.type === 'pills') {
              return (
                <div key={field.key}>
                  <p className="text-sm font-semibold text-zinc-200">
                    {field.label}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {field.options.map((opt) => {
                      const selected = values[field.key] === opt
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onFieldChange(field.key, opt)}
                          className={[
                            'rounded-full border-2 px-4 py-2.5 text-left text-sm font-bold text-white transition-colors',
                            selected
                              ? ''
                              : 'border-zinc-800 bg-app-surface hover:border-zinc-700',
                          ].join(' ')}
                          style={
                            selected
                              ? {
                                  borderColor: GOAL_PURPLE,
                                  backgroundColor: 'rgba(83, 74, 183, 0.14)',
                                }
                              : undefined
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
                <div className="flex items-start justify-between gap-3">
                  <label
                    htmlFor={`ctx-${categoryId}-${field.key}`}
                    className="text-sm font-semibold text-zinc-200"
                  >
                    {field.label}
                  </label>
                  {!field.required ? (
                    <button
                      type="button"
                      onClick={() => onFieldChange(field.key, '')}
                      className="shrink-0 text-sm font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                    >
                      Skip
                    </button>
                  ) : null}
                </div>
                <input
                  id={`ctx-${categoryId}-${field.key}`}
                  type="text"
                  value={values[field.key] ?? ''}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
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
            className="w-full rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
