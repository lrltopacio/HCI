import { useState, useEffect, Fragment, createContext, useContext } from 'react'
import type React from 'react'
import type { ReactNode } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────
type Screen = 'flow' | 's1' | 's2' | 's3' | 's4' | 's5'
type Status = 'Verified' | 'Needs Review' | 'Pending' | 'Missing'
// Context carried between screens so people land on the problem, not on a blank list
type Ctx = { emp?: string; item?: string; tab?: 'Overtime' | 'Leave'; col?: string; step?: number; dept?: string }
type Nav = (s: Screen, c?: Ctx) => void

const NotesCtx = createContext(false)
const HandledCtx = createContext<{ handled: Record<string, boolean>; mark: (keys: string[]) => void }>({ handled: {}, mark: () => {} })
const useHandled = () => useContext(HandledCtx)

// ─── Data: generated placeholder employees, so filters, paging and bulk actions can be tested ──
const V = 'Verified' as const, NR = 'Needs Review' as const, P = 'Pending' as const, M = 'Missing' as const
type Emp = { id: string; name: string; dept: string; att: Status; leave: Status; ot: Status; tax: Status; bonus: Status; overall: Status }
const DEPTS = ['Sales', 'Finance', 'Operations', 'IT', 'HR', 'Logistics']
const MGRS = ['Mgr. Santos', 'Mgr. Reyes', 'Mgr. Cruz', 'Mgr. Dela Rosa', 'Mgr. Gomez', 'Mgr. Lim']
const SURN = ['Aquino', 'Bautista', 'Castro', 'Diaz', 'Enriquez', 'Flores', 'Garcia', 'Hernandez', 'Ignacio', 'Javier', 'Lopez', 'Mendoza', 'Navarro', 'Ocampo', 'Perez', 'Quizon', 'Ramos', 'Salazar', 'Torres', 'Uy']
const FIRST = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'J.', 'K.', 'L.', 'M.', 'N.', 'P.', 'R.', 'S.']
const num = (id: string) => parseInt(id.slice(4), 10)
const rollup = (e: Emp): Status => { const x = [e.att, e.leave, e.ot, e.tax, e.bonus]; return x.includes(M) ? M : x.includes(NR) ? NR : x.includes(P) ? P : V }
const mk = (n: number, name: string, dept: string, att: Status, leave: Status, ot: Status, tax: Status, bonus: Status): Emp => {
  const e = { id: `EMP-${String(n).padStart(4, '0')}`, name, dept, att, leave, ot, tax, bonus, overall: V as Status }
  return { ...e, overall: rollup(e) }
}
const EXC: [keyof Emp, Status][] = [['att', NR], ['leave', P], ['ot', P], ['tax', NR], ['bonus', NR]]
const gen = (n: number): Emp => {
  const e = mk(n, `${SURN[n % SURN.length]}, ${FIRST[(n * 3) % FIRST.length]}`, DEPTS[n % DEPTS.length], V, V, V, V, V)
  const r = (n * 7919) % 100, count = r < 10 ? 1 : r < 14 ? 2 : 0
  for (let k = 0; k < count; k++) { const [c, st] = EXC[(n + k * 2) % 5]; (e as unknown as Record<string, string>)[c] = st }
  e.overall = rollup(e)
  return e
}
const EMPLOYEES: Emp[] = [
  mk(1, 'Santos, J.', 'Sales', V, V, V, V, V), mk(2, 'Reyes, M.', 'Finance', V, NR, P, V, V), mk(3, 'Cruz, P.', 'Operations', M, V, P, V, V),
  mk(4, 'Villanueva, A.', 'IT', V, V, V, NR, NR), mk(5, 'Gomez, R.', 'HR', V, P, V, V, V), mk(7, 'Bautista, C.', 'Logistics', V, V, P, V, V),
  mk(8, 'Dela Rosa, F.', 'Sales', V, V, V, V, V),
  ...Array.from({ length: 112 }, (_, k) => gen(k + 9)),
]

// ─── Issue queue (drives the "Next issue" button), derived from the data ─────
type Issue = { key: string; emp: string; cat: string; to: Screen; ctx: Ctx }
const I = (emp: string, cat: string, to: Screen, ctx: Ctx): Issue => ({ key: `${emp}|${cat}`, emp, cat, to, ctx: { emp, ...ctx } })
const CAT_COLS: [keyof Emp, string][] = [['att', 'Attendance'], ['leave', 'Leave'], ['ot', 'Overtime'], ['tax', 'Tax Deduction'], ['bonus', 'Bonus / Incentive']]
const ROUTE: Record<string, [Screen, Ctx]> = { att: ['s2', { col: 'att' }], leave: ['s4', { tab: 'Leave' }], ot: ['s4', { tab: 'Overtime' }], tax: ['s3', { item: 'Tax Deduction' }], bonus: ['s3', { item: 'Bonus / Incentive' }] }
const ISSUES: Issue[] = CAT_COLS.flatMap(([k, cat]) => EMPLOYEES.filter(e => e[k] !== V).map(e => I(e.id, cat, ROUTE[k][0], ROUTE[k][1])))

// ─── Tokens: neutral base, one teal accent, status never colour-only ─────────
const TONE: Record<string, { cls: string; icon: string }> = {
  Verified: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: '✓' },
  Approved: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: '✓' },
  'Needs Review': { cls: 'bg-amber-50 text-amber-900 ring-amber-300', icon: '!' },
  Pending: { cls: 'bg-sky-50 text-sky-900 ring-sky-200', icon: '◔' },
  'Pending Supervisor Sign-off': { cls: 'bg-sky-50 text-sky-900 ring-sky-200', icon: '◔' },
  'Follow-up sent': { cls: 'bg-sky-50 text-sky-900 ring-sky-200', icon: '↗' },
  Missing: { cls: 'bg-rose-50 text-rose-800 ring-rose-300', icon: '✕' },
}

// ─── Primitives ──────────────────────────────────────────────────────────────
// `warn` puts the anomaly marker inside the chip, so there is no separate column
function Chip({ s, warn }: { s: string; warn?: boolean }) {
  const t = TONE[s] ?? TONE.Pending
  return (
    <span title={warn ? 'Anomaly detected' : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${t.cls}`}>
      <span aria-hidden className="text-[10px] leading-none">{warn ? '⚠' : t.icon}</span>
      {s}{warn && <span className="sr-only"> (anomaly)</span>}
    </span>
  )
}

// Verified is the quiet default: a plain check. Only exceptions get a chip.
function Cell({ s }: { s: string }) {
  return s === 'Verified'
    ? <span role="img" aria-label="Verified" className="text-emerald-600 font-semibold">✓</span>
    : <Chip s={s} />
}

function Btn({ children, onClick, v = 'secondary', size = 'md', disabled = false }: {
  children: ReactNode; onClick?: () => void; v?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md'; disabled?: boolean
}) {
  const base = 'rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 '
  const look = disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
    : v === 'primary' ? 'bg-teal-700 text-white hover:bg-teal-800'
    : v === 'ghost' ? 'text-teal-800 hover:bg-teal-50'
    : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50'
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      className={base + look + (size === 'sm' ? ' px-2.5 py-1 text-xs' : ' px-3.5 py-2 text-sm')}>
      {children}
    </button>
  )
}

function Card({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white mb-5">
      {title && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone ?? 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function Note({ concept, children }: { concept?: string; children: ReactNode }) {
  if (!useContext(NotesCtx)) return null
  return (
    <div className="mb-4 rounded-md border-l-4 border-teal-600 bg-teal-50 px-3 py-2 text-xs text-teal-900">
      {concept && <span className="font-semibold">{concept}. </span>}{children}
    </div>
  )
}

function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm mb-4">
      {rows.map(([k, v]) => <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></Fragment>)}
    </dl>
  )
}

// Details open in a right-hand drawer, so something visibly happens where you are looking
function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-20 bg-slate-900/20" onClick={onClose} />
      <aside role="dialog" aria-label={title} className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-slate-300 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button autoFocus onClick={onClose} aria-label="Close details"
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">✕</button>
        </div>
        {children}
      </aside>
    </>
  )
}

const TH = 'px-3 py-2 text-left text-xs font-medium text-slate-500 bg-slate-50 border-b border-slate-200'
const TD = 'px-3 py-2.5 border-b border-slate-100 align-middle'
const INPUT = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600'
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-slate-600">{label}<div className="mt-1">{children}</div></label>
}

function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  const a = total ? (page - 1) * size + 1 : 0, b = Math.min(total, page * size)
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span aria-live="polite">Showing {a}–{b} of {total}</span>
      <span className="flex items-center gap-2">
        <Btn size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Btn>
        <span>Page {page} of {pages}</span>
        <Btn size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Btn>
      </span>
    </div>
  )
}

// Sending a request marks the related issues as handled, which removes them from the to-do queue
function ActionPanel({ title, subject, keys, onClose }: { title: string; subject: string; keys: string[]; onClose: () => void }) {
  const [sent, setSent] = useState(false)
  const { mark } = useHandled()
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 mt-4">
      <div className="text-sm font-semibold mb-3">{title} <span className="font-normal text-slate-500">for {subject}</span></div>
      {sent ? (
        <>
          <div className="text-sm mb-3 text-emerald-800">✓ Request sent. This item now shows “Follow-up sent” and leaves your to-do list until someone replies.</div>
          <Btn size="sm" onClick={onClose}>Close</Btn>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Send to"><select className={INPUT}><option>Employee</option><option>HR</option><option>Supervisor / Manager</option></select></Field>
            <Field label="Corrected value (optional)"><input className={INPUT} placeholder="e.g. 12 hrs" /></Field>
          </div>
          <div className="mb-3"><Field label="What is wrong or needed"><textarea className={INPUT} rows={2} placeholder="Describe the issue" /></Field></div>
          <div className="flex gap-2">
            <Btn v="primary" size="sm" onClick={() => { mark(keys); setSent(true) }}>Send request</Btn>
            <Btn size="sm" onClick={onClose}>Cancel</Btn>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Screen 1: Payroll Verification ──────────────────────────────────────────
const CATS: { cat: string; st: Status; ctx: Ctx; to: Screen; text: (n: number) => string }[] = [
  { cat: 'Attendance', st: NR, ctx: { col: 'att' }, to: 's2', text: n => `${n} employees with missing or incomplete time records` },
  { cat: 'Leave', st: P, ctx: { tab: 'Leave' }, to: 's4', text: n => `${n} leave requests without a supervisor approval` },
  { cat: 'Overtime', st: P, ctx: { tab: 'Overtime' }, to: 's4', text: n => `${n} overtime requests across ${new Set(OT_ROWS.filter(r => r.status !== 'Approved').map(r => r.approver)).size} approvers` },
  { cat: 'Tax Deduction', st: NR, ctx: { col: 'tax' }, to: 's2', text: n => `${n} employees with a tax status update not yet applied` },
  { cat: 'Bonus / Incentive', st: NR, ctx: { col: 'bonus' }, to: 's2', text: n => `${n} employees where the eligibility rule is not matched` },
]

function S1({ nav }: { nav: Nav }) {
  const { handled } = useHandled()
  const left = ISSUES.filter(i => !handled[i.key]).length
  const flagged = EMPLOYEES.filter(e => e.overall !== V).length
  const byDept = DEPTS.map(d => [d, EMPLOYEES.filter(e => e.dept === d && e.overall !== V).length] as const).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...byDept.map(d => d[1]))
  return (
    <div>
      <PageHead title="Payroll verification" sub="See what needs attention before you calculate payroll." />
      <Note concept="Concept 3">Purpose: let payroll staff see what requires attention before proceeding. Counts and patterns replace long lists, so the page stays readable at any headcount.</Note>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <Stat label="Payroll period" value="Sep 1–30, 2024" />
        <Stat label="Employees" value={EMPLOYEES.length} />
        <Stat label="Need a check" value={`${flagged} (${Math.round((flagged / EMPLOYEES.length) * 100)}%)`} tone="text-amber-800" />
        <Stat label="Open items" value={left} tone={left ? 'text-amber-800' : 'text-emerald-800'} />
      </div>
      <Card title="What needs attention">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{['Category', 'Status', 'Items', 'Pattern', ''].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {CATS.map(c => {
                const n = ISSUES.filter(i => i.cat === c.cat && !handled[i.key]).length
                return (
                  <tr key={c.cat} className="hover:bg-slate-50">
                    <td className={`${TD} font-medium`}>{c.cat}</td>
                    <td className={TD}><Chip s={n ? c.st : 'Follow-up sent'} /></td>
                    <td className={`${TD} tabular-nums`}>{n}</td>
                    <td className={`${TD} text-slate-600`}>{n ? c.text(n) : 'Follow-ups sent. Waiting for replies.'}</td>
                    <td className={`${TD} text-right`}><Btn size="sm" onClick={() => nav(c.to, c.ctx)}>Open</Btn></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Employees needing a check, by department">
        <ul className="space-y-2">
          {byDept.map(([d, n]) => (
            <li key={d} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-slate-700">{d}</span>
              <span className="flex-1 h-2 rounded bg-slate-100"><span className="block h-2 rounded bg-amber-400" style={{ width: `${(n / max) * 100}%` }} /></span>
              <span className="w-8 text-right tabular-nums">{n}</span>
              <Btn size="sm" onClick={() => nav('s2', { dept: d })}>Open</Btn>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

// ─── Screen 2: Pre-Payroll Validation ────────────────────────────────────────
const VAL_COLS: [keyof Emp, string][] = [['att', 'Attendance'], ['leave', 'Leave'], ['ot', 'Overtime'], ['tax', 'Tax'], ['bonus', 'Bonus']]
const VAL_ISSUES: Record<string, { what: string; source: string; action: string }> = {
  'EMP-0002': { what: 'Leave record shows 3 days taken; the approval form covers 2 days only. Overtime is pending supervisor sign-off.', source: 'Leave Application Form / OT Request #2024-09-022', action: 'Verify leave days. Follow up with the supervisor for OT sign-off.' },
  'EMP-0003': { what: 'Attendance record is incomplete: Sep 14 and 15 are not recorded. Overtime request is pending sign-off.', source: 'Time card / DTR Sep 2024', action: 'Get the complete time card. Clarify the absence before processing OT.' },
  'EMP-0004': { what: 'Tax status update was not applied. Bonus eligibility rule is not satisfied: performance rating is missing.', source: 'BIR Form / HR Performance Record', action: 'Confirm the updated tax status with HR. Request the performance rating from the manager.' },
  'EMP-0005': { what: 'Leave application submitted; supervisor sign-off is still pending.', source: 'Leave Application Form #2024-09-055', action: 'Follow up with the supervisor for approval.' },
  'EMP-0007': { what: 'Overtime hours are logged but supervisor approval has not been received.', source: 'OT Request #2024-09-047', action: 'Follow up with the supervisor.' },
}
const toCheck = (e: Emp) => VAL_COLS.filter(([k]) => e[k] !== V).length
const SORTS = ['Most items to check', 'Employee ID', 'Department']

function S2({ nav, ctx }: { nav: Nav; ctx: Ctx }) {
  const [sel, setSel] = useState<string | null>(ctx.emp ?? null)
  const [fu, setFu] = useState(false)
  const [f, setF] = useState({ q: '', dept: ctx.dept ?? '', cat: ctx.col ?? '', all: false, sort: 0, page: 1 })
  const upd = (p: Partial<typeof f>) => setF(x => ({ ...x, page: 1, ...p }))
  const rows = EMPLOYEES
    .filter(e => (e.id + ' ' + e.name).toLowerCase().includes(f.q.toLowerCase()) && (!f.dept || e.dept === f.dept) && (!f.cat || e[f.cat as keyof Emp] !== V) && (f.all || e.overall !== V))
    .sort((a, b) => (f.sort === 0 ? toCheck(b) - toCheck(a) : f.sort === 2 ? a.dept.localeCompare(b.dept) : 0) || a.id.localeCompare(b.id))
  const pageRows = rows.slice((f.page - 1) * 10, f.page * 10)
  const hl = (k: string) => (f.cat === k ? ' bg-amber-50' : '')
  const row = EMPLOYEES.find(e => e.id === sel)
  const flagged = row ? VAL_COLS.filter(([k]) => row[k] !== V).map(([, l]) => l.toLowerCase()).join(', ') : ''
  const issue = row && (VAL_ISSUES[row.id] ?? (toCheck(row) ? { what: `Items to check: ${flagged}.`, source: 'Employee record and source documents', action: 'Follow up with the approver or HR for the flagged items.' } : null))
  const keys = ISSUES.filter(i => i.emp === sel).map(i => i.key)
  const apprTab: 'Overtime' | 'Leave' = row && row.ot !== V ? 'Overtime' : 'Leave'
  const sm = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600'

  return (
    <div>
      <PageHead title="Pre-payroll validation" sub="Filter by department or category. Employees with nothing to check are hidden by default." />
      <Note concept="Concept 3">Purpose: identify missing, inconsistent, or unverified information before payroll is finalized. Filters, sorting, and paging keep large employee lists manageable.</Note>
      <Card title={`Employees to check (${rows.length})`}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input value={f.q} onChange={e => upd({ q: e.target.value })} aria-label="Search employees" placeholder="Search by ID or name" className={`${sm} w-52`} />
          <select aria-label="Department" value={f.dept} onChange={e => upd({ dept: e.target.value })} className={sm}>
            <option value="">All departments</option>{DEPTS.map(d => <option key={d}>{d}</option>)}
          </select>
          <select aria-label="Category" value={f.cat} onChange={e => upd({ cat: e.target.value })} className={sm}>
            <option value="">All categories</option>{VAL_COLS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select aria-label="Sort by" value={f.sort} onChange={e => upd({ sort: Number(e.target.value) })} className={sm}>
            {SORTS.map((l, i) => <option key={l} value={i}>Sort: {l}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={f.all} onChange={e => upd({ all: e.target.checked })} /> Include verified</label>
          {(f.q || f.dept || f.cat || f.all) && <Btn v="ghost" size="sm" onClick={() => upd({ q: '', dept: '', cat: '', all: false })}>Clear filters</Btn>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>
              <th className={TH}>Employee</th><th className={TH}>Department</th>
              {VAL_COLS.map(([k, l]) => <th key={k} className={TH + hl(k)}>{l}</th>)}
              <th className={TH}></th>
            </tr></thead>
            <tbody>
              {pageRows.map(r => (
                <tr key={r.id} className={sel === r.id ? 'bg-teal-50' : 'hover:bg-slate-50'}>
                  <td className={TD}><div className="font-medium">{r.id}</div><div className="text-xs text-slate-500">{r.name}</div></td>
                  <td className={`${TD} text-slate-600`}>{r.dept}</td>
                  {VAL_COLS.map(([k]) => <td key={k} className={TD + hl(k)}><Cell s={r[k]} /></td>)}
                  <td className={`${TD} text-right`}><Btn size="sm" onClick={() => { setSel(r.id); setFu(false) }}>Open</Btn></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">No employees match these filters. Clear the filters to see everyone.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={f.page} size={10} total={rows.length} onPage={p => setF(x => ({ ...x, page: p }))} />
      </Card>

      {row && (
        <Drawer title={`${row.id}: ${row.name}`} onClose={() => setSel(null)}>
          <div className="text-xs text-slate-500 mb-3">{row.dept}</div>
          {issue ? (
            <>
              <Facts rows={[['What needs checking', issue.what], ['Source', issue.source], ['Suggested action', issue.action]]} />
              <div className="flex flex-col gap-2">
                <Btn v="primary" onClick={() => nav('s3', { emp: row.id })}>Inspect payroll calculation</Btn>
                <Btn onClick={() => nav('s4', { tab: apprTab, emp: row.id })}>Check approval status</Btn>
                <Btn onClick={() => setFu(true)}>Flag for correction</Btn>
              </div>
              {fu && <ActionPanel title="Flag for correction" subject={row.id} keys={keys} onClose={() => setFu(false)} />}
            </>
          ) : <p className="text-sm text-slate-500">No issues found. This record is fully verified.</p>}
        </Drawer>
      )}
    </div>
  )
}

// ─── Screen 3: Payroll Calculation ───────────────────────────────────────────
type CalcItem = { label: string; amount: string; status: Status; anomaly: boolean; sourceData: string; formula: string; manualAdj: string; note: string }
const F = { base: 'Monthly rate ÷ working days × days worked', ot: 'Hourly rate × 1.25 × approved OT hours', tax: 'BIR graduated tax table, applied to taxable income', bonus: 'Based on performance rating threshold', net: 'Basic salary + overtime − tax deduction + bonus' }
const SRC = { base: 'Employment contract / HR records', bonus: 'Compensation guidelines / HR performance record', tax: 'BIR Tax Table 2024' }
const ci = (label: string, amount: string, status: Status, anomaly: boolean, sourceData: string, formula: string, note = '', manualAdj = 'None'): CalcItem =>
  ({ label, amount, status, anomaly, sourceData, formula, manualAdj, note })

const CALC_DATA: Record<string, { name: string; items: CalcItem[] }> = {
  'EMP-0001': { name: 'Santos, J.', items: [
    ci('Basic Salary', '₱ 25,000.00', V, false, SRC.base, F.base),
    ci('Overtime Pay', '₱ 900.00', V, false, 'OT Request, Sep 20 (approved)', F.ot),
    ci('Tax Deduction', '₱ 3,000.00', V, false, SRC.tax, F.tax),
    ci('Bonus / Incentive', '₱ 2,000.00', V, false, SRC.bonus, F.bonus),
    ci('Net Pay', '₱ 24,900.00', V, false, 'Computed', F.net),
  ] },
  'EMP-0002': { name: 'Reyes, M.', items: [
    ci('Basic Salary', '₱ 25,000.00', V, false, SRC.base, F.base),
    ci('Overtime Pay', '₱ 1,800.00', P, true, 'OT Request #2024-09-022', F.ot, 'Expected ₱2,700 based on 12 hrs. Recorded ₱1,800 (8 hrs). Supervisor sign-off is still pending.', 'None recorded'),
    ci('Tax Deduction', '₱ 3,218.75', NR, true, SRC.tax, F.tax, 'Tax status update (Single → Married) not yet applied. The deduction may need to be recomputed.'),
    ci('Bonus / Incentive', '₱ 5,000.00', NR, false, SRC.bonus, F.bonus, 'Performance rating not yet confirmed. Eligibility cannot be verified.'),
    ci('Net Pay', '₱ 28,581.25', NR, true, 'Computed', F.net, 'Net pay may change once the overtime and tax issues are resolved.'),
  ] },
  'EMP-0004': { name: 'Villanueva, A.', items: [
    ci('Basic Salary', '₱ 30,000.00', V, false, SRC.base, F.base),
    ci('Overtime Pay', '₱ 0.00', V, false, 'No overtime filed', F.ot),
    ci('Tax Deduction', '₱ 4,100.00', NR, true, SRC.tax, F.tax, 'Tax status update not yet applied. The deduction may need to be recomputed.'),
    ci('Bonus / Incentive', '₱ 4,000.00', NR, true, SRC.bonus, F.bonus, 'Performance rating is missing, so the eligibility rule is not satisfied.'),
    ci('Net Pay', '₱ 29,900.00', NR, true, 'Computed', F.net, 'Net pay may change once the tax and bonus issues are resolved.'),
  ] },
}
const CAT_OF: Record<string, string> = { 'Overtime Pay': 'Overtime', 'Tax Deduction': 'Tax Deduction', 'Bonus / Incentive': 'Bonus / Incentive' }

// Searchable combobox (ARIA 1.2 pattern): type to filter, arrows to move, Enter to choose, Esc to close
function EmployeePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const cur = EMPLOYEES.find(e => e.id === value)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const all = EMPLOYEES.filter(e => (e.id + ' ' + e.name + ' ' + e.dept).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.overall !== V) - Number(a.overall !== V))
  const hits = all.slice(0, 8)
  const pick = (id: string) => { onPick(id); setQ(''); setOpen(false) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && open && hits[hi]) { e.preventDefault(); pick(hits[hi].id) }
    else if (e.key === 'Escape') setOpen(false)
  }
  return (
    <div className="relative">
      <input role="combobox" aria-label="Employee" aria-expanded={open} aria-controls="emp-list" aria-autocomplete="list"
        aria-activedescendant={open && hits[hi] ? `emp-opt-${hi}` : undefined}
        value={open ? q : cur ? `${cur.id}: ${cur.name}` : ''} placeholder="Search by ID, name, or department" className={INPUT}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => { setQ(e.target.value); setHi(0); setOpen(true) }} onKeyDown={onKey} />
      {open && (
        <ul id="emp-list" role="listbox" className="absolute z-10 mt-1 w-full max-h-80 overflow-auto rounded-md border border-slate-300 bg-white shadow-lg">
          {hits.map((e, i) => (
            <li key={e.id} id={`emp-opt-${i}`} role="option" aria-selected={i === hi} onMouseDown={() => pick(e.id)} onMouseEnter={() => setHi(i)}
              className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${i === hi ? 'bg-teal-50' : ''}`}>
              <span><span className="font-medium">{e.id}</span> {e.name} <span className="text-xs text-slate-500">· {e.dept}</span></span>
              {e.overall !== V && <Chip s={e.overall} />}
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No employee matches “{q}”.</li>}
          {all.length > 8 && <li className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">Showing 8 of {all.length}. Keep typing to narrow the list. Employees needing a check are listed first.</li>}
        </ul>
      )}
    </div>
  )
}

// Hand-written detail for the three demo employees; everyone else is built from their validation flags
const getCalc = (id: string): { name: string; items: CalcItem[] } => {
  if (CALC_DATA[id]) return CALC_DATA[id]
  const e = EMPLOYEES.find(x => x.id === id)!
  const bad = (s: Status) => s !== V
  return { name: e.name, items: [
    ci('Basic Salary', '₱ 24,000.00', V, false, SRC.base, F.base),
    ci('Overtime Pay', '₱ 1,200.00', e.ot, bad(e.ot), 'OT request on file', F.ot, bad(e.ot) ? 'Overtime is waiting on supervisor sign-off.' : ''),
    ci('Tax Deduction', '₱ 2,900.00', e.tax, bad(e.tax), SRC.tax, F.tax, bad(e.tax) ? 'Tax status update not yet applied.' : ''),
    ci('Bonus / Incentive', '₱ 1,500.00', e.bonus, bad(e.bonus), SRC.bonus, F.bonus, bad(e.bonus) ? 'Performance rating not yet confirmed.' : ''),
    ci('Net Pay', '₱ 23,800.00', e.overall === V ? V : NR, e.overall !== V, 'Computed', F.net, e.overall !== V ? 'Net pay may change once open items are resolved.' : ''),
  ] }
}

function S3({ nav, ctx }: { nav: Nav; ctx: Ctx }) {
  const { handled, mark } = useHandled()
  const [emp, setEmp] = useState(ctx.emp && EMPLOYEES.some(e => e.id === ctx.emp) ? ctx.emp : 'EMP-0002')
  const [sel, setSel] = useState<string | null>(ctx.item ?? null)
  const [fu, setFu] = useState(false)
  const items = getCalc(emp).items
  const key = (l: string) => `${emp}|${CAT_OF[l] ?? l}`
  const clean = items.every(i => i.status === 'Verified' && !i.anomaly)
  const unresolved = (i: CalcItem) => i.label !== 'Net Pay' && (i.status !== 'Verified' || i.anomaly) && !handled[key(i.label)]
  const open = items.filter(unresolved)
  const item = items.find(i => i.label === sel)
  const isDone = !!handled[`${emp}|verified`]
  // Status shown in the table: flagged items read as "Follow-up sent"
  const shown = (i: CalcItem) => {
    const flagged = !clean && (i.label === 'Net Pay' ? open.length === 0 : handled[key(i.label)])
    return { st: flagged ? 'Follow-up sent' : i.status, warn: i.anomaly && !flagged }
  }

  return (
    <div>
      <PageHead title="Payroll calculation" sub="Open a figure to see where it came from and how it was calculated." />
      <Note concept="Concept 1">Purpose: let staff select a payroll figure and trace it back to its source data and formula.</Note>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs text-slate-600 mb-1">Employee</div>
          <EmployeePicker value={emp} onPick={id => { setEmp(id); setSel(null); setFu(false) }} />
        </div>
        <Stat label="Payroll period" value="September 1–30, 2024" />
      </div>

      <Card title="Payroll figures">
        <table className="w-full text-sm">
          <thead><tr><th className={TH}>Item</th><th className={`${TH} text-right`}>Amount</th><th className={TH}>Status</th><th className={TH}></th></tr></thead>
          <tbody>
            {items.map(c => {
              const { st, warn } = shown(c)
              return (
                <tr key={c.label} className={`${c.label === 'Net Pay' ? 'font-semibold border-t-2 border-slate-300' : ''} ${sel === c.label ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                  <td className={TD}>{c.label}</td>
                  <td className={`${TD} text-right tabular-nums`}>{c.amount}</td>
                  <td className={TD}><Chip s={st} warn={warn} /></td>
                  <td className={`${TD} text-right`}><Btn size="sm" onClick={() => { setSel(c.label); setFu(false) }}>Open</Btn></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <div className="rounded-lg border border-slate-300 bg-white p-4 flex items-center justify-between gap-3 flex-wrap">
        {isDone ? (
          <span className="text-sm font-medium text-emerald-800">{clean ? `✓ ${emp} verified` : `✓ ${emp} reviewed. Corrections requested.`}</span>
        ) : (
          <>
            <span className="text-sm text-slate-600">
              {open.length ? `${open.length} item${open.length > 1 ? 's' : ''} still need to be verified or flagged.`
                : clean ? 'All figures match their sources.' : 'Every open item has a follow-up. You can mark this employee as reviewed.'}
            </span>
            <Btn v="primary" disabled={open.length > 0} onClick={() => mark([`${emp}|verified`])}>{clean ? 'Mark as verified' : 'Mark as reviewed'}</Btn>
          </>
        )}
      </div>

      {item && (
        <Drawer title={`${item.label}: ${emp}`} onClose={() => setSel(null)}>
          <Facts rows={[['Source data', item.sourceData], ['Formula', item.formula], ['Manual adjustment', item.manualAdj], ['Status', <Chip key="s" s={shown(item).st} warn={shown(item).warn} />]]} />
          {item.note && (
            <div className={`rounded-md px-3 py-2 text-sm mb-4 ${item.anomaly ? 'bg-amber-50 border border-amber-300 text-amber-900' : 'bg-slate-50 text-slate-600'}`}>
              {item.anomaly && <strong>Anomaly: </strong>}{item.note}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {emp === 'EMP-0002' && item.anomaly && (item.label === 'Overtime Pay' || item.label === 'Net Pay') &&
              <Btn v="primary" onClick={() => nav('s5', { emp, step: 2 })}>Trace in audit trail</Btn>}
            {item.label === 'Overtime Pay' && <Btn onClick={() => nav('s4', { tab: 'Overtime', emp })}>Check approval status</Btn>}
            {unresolved(item) && <Btn onClick={() => setFu(true)}>Flag for correction</Btn>}
          </div>
          {fu && <ActionPanel title="Flag for correction" subject={`${emp} / ${item.label}`} keys={[key(item.label)]} onClose={() => setFu(false)} />}
        </Drawer>
      )}
    </div>
  )
}

// ─── Screen 4: Approval status ───────────────────────────────────────────────
type ApprRow = { id: string; name: string; date?: string; dates?: string; hrs?: string; days?: string; type?: string; approver: string; status: string }
const PEND = 'Pending Supervisor Sign-off'
const genAppr = (kind: 'ot' | 'leave'): ApprRow[] => EMPLOYEES.filter(e => num(e.id) >= 9 && (e[kind] !== V || num(e.id) % (kind === 'ot' ? 6 : 7) === 0)).map(e => {
  const n = num(e.id), status = e[kind] !== V ? PEND : 'Approved', approver = MGRS[n % MGRS.length]
  return kind === 'ot'
    ? { id: e.id, name: e.name, date: `Sep ${1 + (n % 28)}, 2024`, hrs: `${2 + (n % 9)} hrs`, approver, status }
    : { id: e.id, name: e.name, dates: `Sep ${1 + (n % 26)}–${2 + (n % 26)}`, days: '2 days', type: n % 2 ? 'Annual Leave' : 'Sick Leave', approver, status }
})
const OT_ROWS: ApprRow[] = [
  { id: 'EMP-0002', name: 'Reyes, M.', date: 'Sep 22, 2024', hrs: '12 hrs', approver: 'Mgr. Santos', status: PEND },
  { id: 'EMP-0003', name: 'Cruz, P.', date: 'Sep 14, 2024', hrs: '8 hrs', approver: 'Mgr. Reyes', status: PEND },
  { id: 'EMP-0007', name: 'Bautista, C.', date: 'Sep 25, 2024', hrs: '6 hrs', approver: 'Mgr. Dela Rosa', status: PEND },
  { id: 'EMP-0001', name: 'Santos, J.', date: 'Sep 20, 2024', hrs: '4 hrs', approver: 'Mgr. Santos', status: 'Approved' },
  { id: 'EMP-0008', name: 'Dela Rosa, F.', date: 'Sep 19, 2024', hrs: '3 hrs', approver: 'Mgr. Cruz', status: 'Approved' },
  ...genAppr('ot'),
]
const LEAVE_ROWS: ApprRow[] = [
  { id: 'EMP-0002', name: 'Reyes, M.', dates: 'Sep 10–11', days: '2 days', type: 'Sick Leave', approver: 'Mgr. Santos', status: PEND },
  { id: 'EMP-0005', name: 'Gomez, R.', dates: 'Sep 18–20', days: '3 days', type: 'Annual Leave', approver: 'Mgr. Gomez', status: PEND },
  { id: 'EMP-0001', name: 'Santos, J.', dates: 'Sep 5–6', days: '2 days', type: 'Annual Leave', approver: 'Mgr. Reyes', status: 'Approved' },
  ...genAppr('leave'),
]
const COLS: Record<'Overtime' | 'Leave', [keyof ApprRow, string][]> = {
  Overtime: [['id', 'Employee'], ['date', 'Date'], ['hrs', 'Hours'], ['approver', 'Approver'], ['status', 'Status']],
  Leave: [['id', 'Employee'], ['dates', 'Dates'], ['days', 'Days'], ['type', 'Type'], ['approver', 'Approver'], ['status', 'Status']],
}

function S4({ nav, ctx }: { nav: Nav; ctx: Ctx }) {
  const { handled, mark } = useHandled()
  const [tab, setTab] = useState<'Overtime' | 'Leave'>(ctx.tab ?? 'Overtime')
  const [pendingOnly, setPendingOnly] = useState(true)
  const [appr, setAppr] = useState('')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')
  const [sel, setSel] = useState<string | null>(ctx.emp ?? null)
  const [fu, setFu] = useState(false)
  const all = tab === 'Overtime' ? OT_ROWS : LEAVE_ROWS
  const isOpen = (r: ApprRow) => r.status !== 'Approved' && !handled[`${r.id}|${tab}`]
  const rows = all.filter(r => (!pendingOnly || r.status !== 'Approved') && (!appr || r.approver === appr))
  const open = rows.filter(isOpen)
  const chosen = open.filter(r => picked[r.id])
  const row = all.find(r => r.id === sel)
  const st = (r: ApprRow) => (handled[`${r.id}|${tab}`] ? 'Follow-up sent' : r.status)
  const pend = (t: 'Overtime' | 'Leave') => (t === 'Overtime' ? OT_ROWS : LEAVE_ROWS).filter(r => r.status !== 'Approved').length
  const approvers = Array.from(new Set(all.map(r => r.approver)))
  const sendAll = () => {
    const n = new Set(chosen.map(r => r.approver)).size
    mark(chosen.map(r => `${r.id}|${tab}`))
    setMsg(`Sent ${n} reminder${n > 1 ? 's' : ''}, one per approver, listing ${chosen.length} item${chosen.length > 1 ? 's' : ''}.`)
    setPicked({})
  }
  const sm = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600'

  return (
    <div>
      <PageHead title="Approval status" sub="See which overtime and leave items still need sign-off. Select several to remind approvers in one step." />
      <Note concept="Concept 2">Purpose: show which overtime and leave items still require approval or follow-up. Bulk reminders are grouped by approver, so each manager gets one message.</Note>
      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div role="tablist" className="inline-flex rounded-md border border-slate-300 overflow-hidden">
            {(['Overtime', 'Leave'] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setSel(null); setFu(false); setAppr(''); setPage(1); setPicked({}); setMsg('') }}
                className={`px-4 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${tab === t ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                {t} ({pend(t)} pending)
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select aria-label="Approver" value={appr} onChange={e => { setAppr(e.target.value); setPage(1) }} className={sm}>
              <option value="">All approvers</option>
              {approvers.map(m => <option key={m} value={m}>{m} ({all.filter(r => r.approver === m && r.status !== 'Approved').length} pending)</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={pendingOnly} onChange={e => { setPendingOnly(e.target.checked); setPage(1) }} /> Pending only
            </label>
          </div>
        </div>
        {chosen.length > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
            <span>{chosen.length} selected across {new Set(chosen.map(r => r.approver)).size} approver{new Set(chosen.map(r => r.approver)).size > 1 ? 's' : ''}</span>
            <span className="flex gap-2"><Btn size="sm" onClick={() => setPicked({})}>Clear</Btn><Btn v="primary" size="sm" onClick={sendAll}>Send reminders</Btn></span>
          </div>
        )}
        {msg && <div className="mb-3 text-sm text-emerald-800" role="status">✓ {msg}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>
              <th className={`${TH} w-8`}>
                <input type="checkbox" aria-label="Select all pending items in this list" checked={open.length > 0 && open.every(r => picked[r.id])}
                  onChange={e => setPicked(e.target.checked ? Object.fromEntries(open.map(r => [r.id, true])) : {})} />
              </th>
              {COLS[tab].map(([, l]) => <th key={l} className={TH}>{l}</th>)}<th className={TH}></th>
            </tr></thead>
            <tbody>
              {rows.slice((page - 1) * 10, page * 10).map(r => (
                <tr key={r.id} className={sel === r.id ? 'bg-teal-50' : 'hover:bg-slate-50'}>
                  <td className={TD}>{isOpen(r) && <input type="checkbox" aria-label={`Select ${r.id}`} checked={!!picked[r.id]} onChange={e => setPicked(p => ({ ...p, [r.id]: e.target.checked }))} />}</td>
                  {COLS[tab].map(([k]) => (
                    <td key={k} className={TD}>
                      {k === 'status' ? <Chip s={st(r)} /> : k === 'id' ? <><div className="font-medium">{r.id}</div><div className="text-xs text-slate-500">{r.name}</div></> : String(r[k] ?? '')}
                    </td>
                  ))}
                  <td className={`${TD} text-right`}><Btn size="sm" onClick={() => { setSel(r.id); setFu(false) }}>Open</Btn></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={COLS[tab].length + 2} className="px-3 py-8 text-center text-sm text-slate-500">Nothing pending here. Untick “Pending only” to see approved items.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} size={10} total={rows.length} onPage={setPage} />
      </Card>

      {row && (
        <Drawer title={`${tab}: ${row.id} (${row.name})`} onClose={() => setSel(null)}>
          <Facts rows={[
            ...COLS[tab].filter(([k]) => k !== 'id' && k !== 'status').map(([k, l]) => [l, String(row[k] ?? '')] as [string, ReactNode]),
            ['Status', <Chip key="s" s={st(row)} />],
          ]} />
          <div className="flex flex-col gap-2">
            {tab === 'Overtime' && row.id === 'EMP-0002' && <Btn v="primary" onClick={() => nav('s5', { emp: row.id, step: 2 })}>Trace in audit trail</Btn>}
            {isOpen(row) && <Btn onClick={() => setFu(true)}>Follow up</Btn>}
          </div>
          {fu && <ActionPanel title="Follow up" subject={row.id} keys={[`${row.id}|${tab}`]} onClose={() => setFu(false)} />}
        </Drawer>
      )}
    </div>
  )
}

// ─── Screen 5: Audit Trail ───────────────────────────────────────────────────
type TrailStep = { step: number; label: string; source: string; status: Status; mismatch?: { expected: string; recorded: string; diff: string; impact: string } }
const TRAIL: TrailStep[] = [
  { step: 1, label: 'Overtime request', source: 'OT Request Form #2024-09-022, EMP-0002', status: P },
  { step: 2, label: 'Supervisor approval', source: 'Approval record, Mgr. Santos', status: P },
  { step: 3, label: 'OT hours recorded in payroll', source: 'Payroll entry, Sep 2024 batch', status: NR, mismatch: { expected: '12 hrs', recorded: '8 hrs', diff: '−4 hrs', impact: 'Overtime pay difference: −₱900.00' } },
  { step: 4, label: 'OT pay calculation', source: 'Payroll calculation engine', status: NR },
  { step: 5, label: 'Tax recalculation', source: 'BIR Tax Table 2024', status: P },
  { step: 6, label: 'Net pay', source: 'Computed, Sep 2024 payroll', status: NR },
]

function S5({ nav, ctx }: { nav: Nav; ctx: Ctx }) {
  const [sel, setSel] = useState<number | null>(ctx.step ?? null)
  const [fu, setFu] = useState(false)
  const step = sel !== null ? TRAIL[sel] : null
  return (
    <div>
      <PageHead title="Audit trail" sub="Follow overtime pay for EMP-0002 (Reyes, M.) back to its source and find where it goes wrong." />
      <Note concept="Concept 1">Purpose: trace a payroll figure step by step to its source and identify the point of discrepancy.</Note>
      <Card title="Trace from request to net pay">
        <ol>
          {TRAIL.map((s, i) => (
            <li key={s.step} className="relative pl-10 pb-5 last:pb-0">
              {i < TRAIL.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-300" />}
              <span className={`absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-white ${s.mismatch ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {s.mismatch ? '!' : s.step}
              </span>
              <div className={`rounded-lg border p-3 ${sel === i ? 'border-teal-600 bg-teal-50' : s.mismatch ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-slate-500 mb-1.5">{s.source}</div>
                    <Chip s={s.status} warn={!!s.mismatch} />
                  </div>
                  <Btn size="sm" onClick={() => { setSel(i); setFu(false) }}>Open</Btn>
                </div>
                {s.mismatch && <div className="mt-2 text-xs text-amber-900"><strong>Mismatch:</strong> expected {s.mismatch.expected}, recorded {s.mismatch.recorded} ({s.mismatch.diff}).</div>}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {step && (
        <Drawer title={`Step ${step.step}: ${step.label}`} onClose={() => setSel(null)}>
          <Facts rows={[['Source', step.source], ['Status', <Chip key="s" s={step.status} warn={!!step.mismatch} />]]} />
          {step.mismatch && (
            <div className="rounded-md bg-amber-50 border border-amber-300 p-3 text-sm mb-4">
              <div className="font-semibold text-amber-900 mb-1">Mismatch</div>
              <div>Expected: <strong>{step.mismatch.expected}</strong></div>
              <div>Recorded: <strong>{step.mismatch.recorded}</strong></div>
              <div>Difference: <strong>{step.mismatch.diff}</strong></div>
              <div className="text-amber-900 mt-1">{step.mismatch.impact}</div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Btn v="primary" onClick={() => nav('s4', { tab: 'Overtime', emp: 'EMP-0002' })}>Check approval status</Btn>
            {step.mismatch && <Btn onClick={() => setFu(true)}>Flag for correction</Btn>}
          </div>
          {fu && <ActionPanel title="Flag for correction" subject={`Step ${step.step}`} keys={['EMP-0002|Overtime']} onClose={() => setFu(false)} />}
        </Drawer>
      )}
    </div>
  )
}

// ─── Project documentation: overview and user flow (decisions live here, not in the screens) ──
type FlowNode =
  | { t: 'screen'; label: string; sub: string; screen: Screen }
  | { t: 'decision'; q: string; yes: string; no: string; yesScreen: Screen; noScreen: Screen }
  | { t: 'end'; label: string }

const FLOW: FlowNode[] = [
  { t: 'screen', label: 'Payroll verification', sub: 'Overview: see what needs attention', screen: 's1' },
  { t: 'decision', q: 'Is pre-payroll information complete and consistent?', yes: 'Calculation', no: 'Pre-payroll data', yesScreen: 's3', noScreen: 's2' },
  { t: 'screen', label: 'Pre-payroll validation', sub: 'Attendance, leave, overtime, tax, bonus', screen: 's2' },
  { t: 'decision', q: 'Is all information complete and consistent?', yes: 'Calculation', no: 'Review record', yesScreen: 's3', noScreen: 's2' },
  { t: 'screen', label: 'Payroll calculation', sub: 'Source data, formula, verification status', screen: 's3' },
  { t: 'decision', q: 'Do all figures match their source data?', yes: 'Approval status', no: 'Audit trail', yesScreen: 's4', noScreen: 's5' },
  { t: 'screen', label: 'Audit trail', sub: 'Trace a figure to its source', screen: 's5' },
  { t: 'screen', label: 'Approval status', sub: 'Overtime and leave sign-off', screen: 's4' },
  { t: 'decision', q: 'Are all approvals complete?', yes: 'Finalize', no: 'Follow up', yesScreen: 's1', noScreen: 's4' },
  { t: 'end', label: 'Proceed to payroll finalization' },
]
const CONCEPTS: [string, string, string, Screen][] = [
  ['Concept 1: Calculation traceability and audit trail', 'Select a payroll figure to see its source data, formula, manual adjustments, and status, with a discrepancy indicator.', 'Screens 3 and 5', 's3'],
  ['Concept 2: Real-time approval and status verification', 'See which overtime and leave items are pending supervisor sign-off or need follow-up.', 'Screen 4', 's4'],
  ['Concept 3: Unified pre-payroll data and rule validation', 'One view of attendance, leave, overtime, tax, and bonus that surfaces missing, inconsistent, or unverified items.', 'Screens 1 and 2', 's1'],
]
const PATTERNS = [
  'Staff cross-reference spreadsheets, time cards, printed guidelines, and calculators.',
  'Discrepancies require tracing information back to its source.',
  'Staff may need to follow up with employees, HR, or management.',
  'Overtime, tax, leave, bonus, and salary history may all need checking.',
  'Missing or unclear information creates uncertainty.',
  'Checking continues under time pressure.',
]

function FlowView({ nav }: { nav: Nav }) {
  return (
    <div>
      <PageHead title="Overview, concepts, and user flow" sub="Payroll verification for MotorPH payroll staff." />
      <Card title="Problem statement">
        <blockquote className="border-l-4 border-slate-300 pl-4 text-sm text-slate-700 leading-relaxed max-w-prose">
          MotorPH payroll staff who process and verify employee payroll need to verify payroll information accurately and with confidence, because even after careful checking and cross-referencing, missing or inconsistent records can leave them uncertain whether the information is correct, leading to additional tracing, follow-up, and stress.
        </blockquote>
      </Card>
      <div className="grid grid-cols-2 gap-5">
        <Card title="Observed patterns from research">
          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">{PATTERNS.map(p => <li key={p}>{p}</li>)}</ul>
        </Card>
        <Card title="Design concepts">
          <div className="space-y-3">
            {CONCEPTS.map(([t, d, sc, to]) => (
              <button key={t} onClick={() => nav(to)} className="w-full text-left rounded-md border border-slate-200 p-3 hover:border-teal-600 hover:bg-teal-50">
                <div className="text-sm font-medium">{t}</div>
                <div className="text-xs text-slate-600 mt-0.5">{d}</div>
                <div className="text-xs text-teal-800 mt-1">{sc}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Card title="User flow" aside={<span className="text-xs text-slate-500">In the prototype, these decisions are shown by status and the “Next issue” button</span>}>
        <div className="flex flex-col items-center max-w-md mx-auto">
          {FLOW.map((n, i) => (
            <Fragment key={i}>
              {n.t === 'screen' && (
                <button onClick={() => nav(n.screen)} className="w-full rounded-lg border-2 border-slate-800 bg-white p-3 text-left hover:bg-teal-50">
                  <div className="text-sm font-semibold">{n.label}</div>
                  <div className="text-xs text-slate-500">{n.sub}</div>
                </button>
              )}
              {n.t === 'decision' && (
                <div className="w-full rounded-lg border border-dashed border-slate-400 bg-slate-50 p-3 text-center">
                  <div className="text-xs font-medium mb-2">{n.q}</div>
                  <div className="flex justify-center gap-2">
                    <Btn size="sm" onClick={() => nav(n.noScreen)}>No: {n.no}</Btn>
                    <Btn size="sm" onClick={() => nav(n.yesScreen)}>Yes: {n.yes}</Btn>
                  </div>
                </div>
              )}
              {n.t === 'end' && <div className="w-full rounded-lg bg-slate-800 text-white text-center text-sm font-medium p-3">{n.label}</div>}
              {i < FLOW.length - 1 && <div className="h-5 w-px bg-slate-300 relative"><span className="absolute -bottom-1 -left-[3px] text-[10px] text-slate-400">▼</span></div>}
            </Fragment>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── App shell ───────────────────────────────────────────────────────────────
const PROTO: [Screen, string][] = [
  ['s1', 'Payroll verification'], ['s2', 'Pre-payroll validation'], ['s3', 'Payroll calculation'], ['s4', 'Approval status'], ['s5', 'Audit trail'],
]

export default function App() {
  const [view, setView] = useState<{ screen: Screen; ctx: Ctx; n: number }>({ screen: 's1', ctx: {}, n: 0 })
  const [notes, setNotes] = useState(false)
  const [handled, setHandled] = useState<Record<string, boolean>>({})
  const [cur, setCur] = useState<number | null>(null)
  const [finalized, setFinalized] = useState(false)

  // `n` changes on every navigation so each screen re-initialises from the context it was given
  const go: Nav = (screen, ctx = {}) => { setView(v => ({ screen, ctx, n: v.n + 1 })); window.scrollTo({ top: 0 }) }
  const mark = (keys: string[]) => setHandled(h => ({ ...h, ...Object.fromEntries(keys.map(k => [k, true])) }))

  const todo = ISSUES.map((_, i) => i).filter(i => !handled[ISSUES[i].key])
  const left = todo.length
  const nextIdx = todo.find(i => i > (cur ?? -1)) ?? todo[0]
  const goIssue = (i: number) => { setCur(i); go(ISSUES[i].to, ISSUES[i].ctx) }
  const next = () => (nextIdx === undefined ? setFinalized(true) : goIssue(nextIdx))

  const barText = finalized ? '✓ Sent to payroll finalization (end of prototype).'
    : left === 0 ? '✓ All items handled. Follow-ups are waiting for replies.'
    : cur === null ? `${left} items need attention`
    : `Issue ${cur + 1} of ${ISSUES.length}: ${ISSUES[cur].cat}, ${ISSUES[cur].emp} · ${left} left`
  const barLabel = left === 0 ? 'Proceed to payroll finalization' : cur === null ? 'Start reviewing' : 'Next issue'

  const NavBtn = ({ s, label, badge }: { s: Screen; label: string; badge?: number }) => (
    <li>
      <button onClick={() => go(s)} aria-current={view.screen === s ? 'page' : undefined}
        className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${view.screen === s ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
        <span>{label}</span>
        {!!badge && <span className={`text-xs rounded-full px-1.5 ${view.screen === s ? 'bg-white/25' : 'bg-amber-100 text-amber-900'}`}>{badge}</span>}
      </button>
    </li>
  )

  return (
    <NotesCtx.Provider value={notes}>
      <HandledCtx.Provider value={{ handled, mark }}>
        <div className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif" }}>
          <header className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-teal-700 text-white flex items-center justify-center text-sm font-bold" aria-hidden>M</div>
            <div>
              <div className="text-sm font-semibold leading-tight">MotorPH Payroll</div>
              <div className="text-xs text-slate-500 leading-tight">Sep 1–30, 2024 batch</div>
            </div>
          </header>

          <div className="flex">
            <nav aria-label="Workflow" className="w-60 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-57px)] p-3 flex flex-col">
              <div className="px-3 pb-1 text-xs font-medium text-slate-500">Prototype</div>
              <ul className="space-y-1 mb-6">
                {PROTO.map(([s, l]) => <NavBtn key={s} s={s} label={l} badge={s === 's1' ? left : undefined} />)}
              </ul>
              <div className="px-3 pb-1 text-xs font-medium text-slate-500">Project documentation</div>
              <ul className="space-y-1">
                <NavBtn s="flow" label="Overview and user flow" />
              </ul>
              <label className="mt-3 px-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} /> Show design notes on screens
              </label>
              <p className="mt-auto px-3 pt-6 text-xs text-slate-400 leading-relaxed">Mid-fidelity wireframe. All names, IDs, and figures are placeholders.</p>
            </nav>

            <main className="flex-1 min-w-0 flex flex-col">
              <div key={view.n} className="flex-1 p-6 max-w-5xl w-full">
                {view.screen === 'flow' && <FlowView nav={go} />}
                {view.screen === 's1' && <S1 nav={go} />}
                {view.screen === 's2' && <S2 nav={go} ctx={view.ctx} />}
                {view.screen === 's3' && <S3 nav={go} ctx={view.ctx} />}
                {view.screen === 's4' && <S4 nav={go} ctx={view.ctx} />}
                {view.screen === 's5' && <S5 nav={go} ctx={view.ctx} />}
              </div>
              {view.screen !== 'flow' && (
                <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-6 py-3">
                  <div className="text-sm text-slate-600">{barText}</div>
                  <div className="flex gap-2">
                    {!finalized && cur !== null && cur > 0 && <Btn onClick={() => goIssue(cur - 1)}>Previous issue</Btn>}
                    {!finalized && <Btn v="primary" onClick={next}>{barLabel}</Btn>}
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </HandledCtx.Provider>
    </NotesCtx.Provider>
  )
}
