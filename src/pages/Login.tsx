import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

type FieldErrors = {
  email?: string
  password?: string
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!email.trim()) {
    errors.email = 'Email is required'
  }
  if (!password) {
    errors.password = 'Password is required'
  }
  return errors
}

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const next = validate(email, password)
    setFieldErrors(next)
    if (Object.keys(next).length > 0) {
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setSubmitting(false)

    if (error) {
      setFormError(error.message)
      return
    }

    void navigate('/today', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-bg px-6 py-10">
      <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Inhabit
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
          Log in
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Pick up where you left off.
        </p>

        <form
          className="mt-10 flex flex-col gap-5"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="flex flex-col gap-2">
            <label
              htmlFor="login-email"
              className="text-sm font-semibold text-zinc-200"
            >
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => {
                setEmail(ev.target.value)
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }))
                }
              }}
              className="rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none ring-app-accent/0 transition-[border-color,box-shadow] placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
              placeholder="you@example.com"
            />
            {fieldErrors.email ? (
              <p className="text-sm font-medium text-red-400" role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="login-password"
              className="text-sm font-semibold text-zinc-200"
            >
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => {
                setPassword(ev.target.value)
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }))
                }
              }}
              className="rounded-xl border border-zinc-800 bg-app-surface px-4 py-3.5 text-base font-medium text-white outline-none ring-app-accent/0 transition-[border-color,box-shadow] placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-2 focus:ring-app-accent/30"
              placeholder="••••••••"
            />
            {fieldErrors.password ? (
              <p className="text-sm font-medium text-red-400" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          {formError ? (
            <p className="text-sm font-medium text-red-400" role="alert">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-xl bg-white py-4 text-base font-bold tracking-wide text-app-bg transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{' '}
          <Link
            to="/signup"
            className="font-semibold text-white underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
