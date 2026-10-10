import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded border border-line bg-background p-5 shadow-soft">
      {title ? <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2> : null}
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted">
      <span className="font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

const control =
  'rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${control} ${props.className ?? ''}`} />
}

export function Button({
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-hover',
    ghost: 'bg-surface text-ink border border-line hover:bg-primary-soft',
    danger: 'bg-danger text-white hover:opacity-90'
  }
  return (
    <button
      {...props}
      className={`rounded px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}
    />
  )
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  const tones: Record<string, string> = {
    ok: 'bg-success/10 text-success',
    warn: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-primary-soft text-primary'
  }
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'error'; children: ReactNode }) {
  const tone = kind === 'error' ? 'text-danger bg-danger/5 border-danger/30' : 'text-muted bg-surface border-line'
  return <p className={`rounded border px-3 py-2 text-sm ${tone}`}>{children}</p>
}
