'use client'

import { useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import type { ProviderStage } from '@/ingestion/catalog'
import type { FunnelStage, StageMapping as StageMap } from '@/ingestion/mapping'
import { loadStagesAction, saveMappingAction, type LoadStagesResult } from './actions'

const FUNNEL_OPTIONS: { value: FunnelStage; label: string }[] = [
  { value: 'leads', label: 'Leads' },
  { value: 'mql', label: 'MQL' },
  { value: 'agendadas', label: 'Agendadas' },
  { value: 'realizadas', label: 'Realizadas' },
  { value: 'negociacoes', label: 'Negociações' },
  { value: 'vendas', label: 'Vendas' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'hsl(var(--foreground))',
  background: 'hsl(var(--muted) / .5)',
  border: '1px solid hsl(var(--input))',
  borderRadius: 9,
  padding: '8px 10px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 5,
  color: 'hsl(var(--foreground))',
}

const mapIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
)

function SaveMappingButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: 'hsl(var(--primary))',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '9px 15px',
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: 500,
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.7 : 1,
      }}
    >
      {pending ? 'Salvando…' : 'Salvar mapeamento'}
    </button>
  )
}

// Agrupa os estágios por `group` (nome do pipeline), preservando a ordem de
// aparição dos grupos. Estágios sem `group` ficam num grupo "Outros".
function groupStages(stages: ProviderStage[]): { group: string; stages: ProviderStage[] }[] {
  const order: string[] = []
  const byGroup = new Map<string, ProviderStage[]>()
  for (const stage of stages) {
    const group = stage.group ?? 'Outros'
    if (!byGroup.has(group)) {
      byGroup.set(group, [])
      order.push(group)
    }
    byGroup.get(group)!.push(stage)
  }
  return order.map((group) => ({ group, stages: byGroup.get(group)! }))
}

export default function StageMapping({ provider }: { provider: 'leavo' | 'datacrazy' }) {
  const [pending, startTransition] = useTransition()
  const [loaded, setLoaded] = useState<{ stages: ProviderStage[]; current: StageMap } | null>(null)
  // Estado CONTROLADO das escolhas (por stageId) — assim as seleções nunca "somem"
  // numa re-renderização (selects controlados em vez de defaultValue/uncontrolled).
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saveState, formAction] = useActionState(
    (prev: Awaited<ReturnType<typeof saveMappingAction>> | null, fd: FormData) =>
      saveMappingAction(provider, prev, fd),
    null,
  )

  function handleLoad() {
    setError(null)
    startTransition(async () => {
      const res: LoadStagesResult = await loadStagesAction(provider)
      if (res.ok) {
        const init: Record<string, string> = {}
        for (const s of res.stages) init[s.id] = res.current[s.id] ?? 'ignore'
        setValues(init)
        setLoaded({ stages: res.stages, current: res.current })
      } else {
        setLoaded(null)
        setError(res.error)
      }
    })
  }

  return (
    <div
      style={{
        marginTop: 14,
        borderTop: '1px dashed hsl(var(--border))',
        paddingTop: 13,
      }}
    >
      {!loaded && (
        <button
          type="button"
          onClick={handleLoad}
          disabled={pending}
          style={{
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 10,
            padding: 10,
            fontFamily: 'inherit',
            fontSize: 13.5,
            fontWeight: 500,
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          <span style={{ fontSize: 15, display: 'inline-flex' }}>{mapIcon}</span>
          {pending ? 'Carregando etapas…' : 'Mapear etapas'}
        </button>
      )}

      {error && (
        <p style={{ fontSize: 12.5, margin: '10px 0 0', color: 'hsl(var(--destructive, 0 84% 60%))' }}>
          {error}
        </p>
      )}

      {loaded && (
        <form
          action={formAction}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'hsl(var(--muted-foreground))',
              fontWeight: 600,
            }}
          >
            Mapeamento de etapas
          </div>

          {loaded.stages.length === 0 && (
            <p style={{ fontSize: 13, margin: 0, color: 'hsl(var(--muted-foreground))' }}>
              Nenhum estágio encontrado no CRM.
            </p>
          )}

          {groupStages(loaded.stages).map(({ group, stages }) => (
            <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                {group}
              </div>
              {stages.map((stage) => {
                const fieldId = `stage_${stage.id}`
                return (
                  <div
                    key={stage.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                  >
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
                        {stage.name}
                      </div>
                    </div>
                    <select
                      name={fieldId}
                      value={values[stage.id] ?? 'ignore'}
                      onChange={(e) => setValues((v) => ({ ...v, [stage.id]: e.target.value }))}
                      style={{ ...inputStyle, width: 'auto', minWidth: 150 }}
                    >
                      <option value="ignore">— não usar —</option>
                      {FUNNEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          ))}

          {provider === 'datacrazy' && (
            <div
              style={{
                display: 'flex',
                gap: 11,
                flexWrap: 'wrap',
                borderTop: '1px dashed hsl(var(--border))',
                paddingTop: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 150 }}>
                <label htmlFor="datacrazy-valueUnit" style={labelStyle}>
                  Unidade do valor
                </label>
                <select id="datacrazy-valueUnit" name="valueUnit" defaultValue="reais" style={inputStyle}>
                  <option value="reais">Reais</option>
                  <option value="cents">Centavos</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label htmlFor="datacrazy-sourceField" style={labelStyle}>
                  Campo de origem (opcional)
                </label>
                <input
                  id="datacrazy-sourceField"
                  name="sourceField"
                  type="text"
                  autoComplete="off"
                  placeholder="ex.: utm_source"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {saveState?.ok && (
            <p style={{ fontSize: 12.5, margin: 0, color: 'hsl(142 64% 40%)', fontWeight: 500 }}>
              ✓ Mapeamento salvo
            </p>
          )}
          {saveState && !saveState.ok && saveState.error && (
            <p style={{ fontSize: 12.5, margin: 0, color: 'hsl(var(--destructive, 0 84% 60%))' }}>
              {saveState.error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 3 }}>
            <SaveMappingButton />
            <button
              type="button"
              onClick={() => setLoaded(null)}
              style={{
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 10,
                padding: '9px 15px',
                fontFamily: 'inherit',
                fontSize: 13.5,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
