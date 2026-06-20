// Cliente HTTP utilitario para os adaptadores de API (Leavo/DataCrazy/Meta).
// - Auth Bearer opcional
// - Retry com backoff exponencial respeitando Retry-After em 429/5xx
// - Helper de paginacao
//
// fetch e sleep sao injetaveis para permitir testes sem rede.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export type FetchJsonOpts = {
  token?: string // vira header Authorization: Bearer <token>
  method?: string
  body?: unknown // serializado como JSON
  headers?: Record<string, string>
  fetchImpl?: FetchLike // default: globalThis.fetch (injetavel p/ teste)
  maxRetries?: number // default 4
  now?: () => number // injetavel (default Date.now) — so p/ calculo de espera se precisar
  sleep?: (ms: number) => Promise<void> // injetavel p/ teste (default real)
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

// Calcula quanto esperar (ms). Respeita Retry-After (em segundos) quando presente,
// senao usa backoff exponencial: 2^attempt * 250ms.
function computeWaitMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get('Retry-After')
  if (retryAfter != null) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000
    }
  }
  return Math.pow(2, attempt) * 250
}

// Le um trecho do corpo para incluir na mensagem de erro, sem estourar tamanho.
async function readBodySnippet(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.slice(0, 500)
  } catch {
    return ''
  }
}

/**
 * Faz a request, trata 429/5xx com backoff exponencial (2^attempt * 250ms) respeitando
 * Retry-After (segundos), e retorna o JSON parseado (tipado como T).
 * Lanca Error com status/corpo em erros nao-recuperaveis (4xx != 429).
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOpts = {}): Promise<T> {
  const {
    token,
    method,
    body,
    headers: extraHeaders,
    fetchImpl = globalThis.fetch,
    maxRetries = 4,
    sleep = defaultSleep,
  } = opts

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetchJson: nenhum fetch disponivel (passe opts.fetchImpl)')
  }

  const headers = new Headers(extraHeaders)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const hasBody = body !== undefined
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const init: RequestInit = {
    method: method ?? (hasBody ? 'POST' : 'GET'),
    headers,
  }
  if (hasBody) {
    init.body = JSON.stringify(body)
  }

  let lastSnippet = ''
  let lastStatus = 0

  // attempt 0 = tentativa inicial; attempts 1..maxRetries = retries.
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetchImpl(url, init)

    if (res.ok) {
      return (await res.json()) as T
    }

    lastStatus = res.status

    if (isRetryable(res.status)) {
      lastSnippet = await readBodySnippet(res)
      if (attempt < maxRetries) {
        const waitMs = computeWaitMs(res, attempt)
        await sleep(waitMs)
        continue
      }
      // Estourou maxRetries.
      throw new Error(
        `fetchJson: request falhou apos ${maxRetries + 1} tentativas com status ${res.status}: ${lastSnippet}`,
      )
    }

    // 4xx nao-recuperavel (!= 429): lanca imediatamente.
    const snippet = await readBodySnippet(res)
    throw new Error(`fetchJson: request falhou com status ${res.status}: ${snippet}`)
  }

  // Inalcancavel na pratica, mas garante o tipo de retorno.
  throw new Error(`fetchJson: request falhou com status ${lastStatus}: ${lastSnippet}`)
}

/**
 * Itera paginas chamando fetchPage(cursor), acumulando items, ate:
 *  - items vazio, OU
 *  - nextCursor nulo, OU
 *  - atingir maxPages (trava de seguranca, default 1000).
 */
export async function paginate<TItem, TCursor>(
  fetchPage: (cursor: TCursor | null) => Promise<{ items: TItem[]; nextCursor: TCursor | null }>,
  startCursor: TCursor | null = null,
  maxPages = 1000,
): Promise<TItem[]> {
  const out: TItem[] = []
  let cursor: TCursor | null = startCursor

  for (let page = 0; page < maxPages; page++) {
    const { items, nextCursor } = await fetchPage(cursor)

    if (items.length === 0) break
    out.push(...items)

    if (nextCursor == null) break
    cursor = nextCursor
  }

  return out
}
