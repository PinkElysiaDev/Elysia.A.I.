/**
 * Elysia canonical 统一模型（TypeScript 权威版本）。
 *
 * 本文件与 Elysia-Api（Go）`backend/relay/canonical.go` 逐字段对齐：
 * - 属性名与 Go 结构体的 JSON 标签完全一致（snake_case），
 *   因此 `JSON.parse` 出的线上对象可以直接断言为本模块的类型，
 *   Go 与 TS 两套测试可共享同一批 golden fixture。
 * - Go 的 `json.RawMessage` / `any` 对应 `unknown`；
 *   `map[string]any` 对应 `Record<string, unknown>`。
 * - `RawExtra` / `Raw` 系列字段承担保真透传职责：解析方把协议里
 *   canonical 未显式建模的未知字段原样存进去，构造方在需要时回填，
 *   保证 X → canonical → Y 的转换不丢厂商私有扩展。
 */

/** 流式请求选项。 */
export interface CanonicalStreamOptions {
  include_usage?: boolean
  include_obfuscation?: boolean
  raw?: Record<string, unknown>
}

/** 单条消息。content 为多模态部件数组；role 为 user/assistant/tool 等。 */
export interface CanonicalMessage {
  role: string
  content?: CanonicalContentPart[]
  tool_calls?: CanonicalToolCall[]
  tool_call_id?: string
  name?: string
  audio?: CanonicalAudioConfig
  cache_control?: unknown
  metadata?: Record<string, unknown>
  /** 解析时捕获的未建模字段（Go: `json:"-"`，不参与 canonical 自身的序列化）。 */
  RawExtra?: Record<string, unknown>
}

/**
 * 多模态内容部件。一个部件按 type 取用对应字段组：
 * text / image（url 或 base64）/ audio / video / file / tool_output /
 * reasoning / 缓存控制等，未识别内容走 raw。
 */
export interface CanonicalContentPart {
  type: string

  text?: string

  image_url?: string
  image_base64?: string
  media_type?: string
  mime_type?: string
  uri?: string
  detail?: string

  audio_url?: string
  audio_base64?: string
  video_url?: string
  video_base64?: string
  data?: string
  thought?: boolean

  file_id?: string
  file_name?: string
  file_data?: string

  tool_call_id?: string
  tool_output?: string

  reasoning_text?: string
  signature?: string
  signature_provider?: string
  encrypted_content?: string
  reasoning_summary?: CanonicalReasoningSummary[]
  cache_control?: unknown
  annotations?: Record<string, unknown>[]
  metadata?: Record<string, unknown>

  raw?: unknown
}

/** Responses 风格的输入项（item 级而非 message 级）。 */
export interface CanonicalInputItem {
  type: string
  role?: string
  content?: CanonicalContentPart[]
  call_id?: string
  output?: string
  item_id?: string
  reasoning?: CanonicalReasoning
  RawExtra?: Record<string, unknown>
}

/** 工具定义。parameters（OpenAI 风格）与 input_schema（Anthropic 风格）二选一。 */
export interface CanonicalTool {
  type: string
  name?: string
  description?: string
  parameters?: Record<string, unknown>
  input_schema?: Record<string, unknown>
  strict?: boolean
  provider?: string
  config?: Record<string, unknown>
  cache_control?: unknown

  /** OpenAI 内置 web_search 工具的参数。 */
  search_context_size?: string
  vector_store_ids?: string[]

  raw?: Record<string, unknown>
}

/** 一次工具调用（assistant 侧产出）。arguments 为原始 JSON 值。 */
export interface CanonicalToolCall {
  id?: string
  type: string
  name?: string
  arguments?: unknown
  /** 原始 JSON 文本。部分上游只回传未解析的参数字符串时保留在这里。 */
  arguments_text?: string
  thought_signature?: string
  thought_signature_provider?: string
  raw?: Record<string, unknown>
}

/** 推理/思考配置与产出。 */
export interface CanonicalReasoning {
  effort?: string
  summary?: string
  summary_parts?: CanonicalReasoningSummary[]
  text?: string
  encrypted_content?: string
  raw?: Record<string, unknown>
}

/** 思考开关（Anthropic thinking / Gemini thinkingConfig 风格）。 */
export interface CanonicalThinking {
  enabled: boolean
  effort?: string
  budget_tokens?: number
  include_summary?: boolean
}

/** 音频输出配置（TTS / 音频模态输出）。 */
export interface CanonicalAudioConfig {
  voice?: string
  format?: string
  codec?: string
  sample_rate?: number
  channels?: number
}

/** Gemini 风格的安全设置。 */
export interface CanonicalSafetySetting {
  category?: string
  threshold?: string
  action?: string
}

/** 结构化输出（JSON Schema / json_object）。 */
export interface CanonicalResponseFormat {
  type: string
  name?: string
  description?: string
  schema?: Record<string, unknown>
  strict?: boolean
  raw?: Record<string, unknown>
}

/**
 * 统一请求。字段覆盖四种协议的公共能力与各家扩展；
 * 未知厂商字段解析进 RawExtra，由构造方决定是否透传。
 */
export interface CanonicalRequest {
  model: string
  instructions?: string

  messages?: CanonicalMessage[]
  input_items?: CanonicalInputItem[]

  max_output_tokens?: number
  min_output_tokens?: number
  max_tool_calls?: number
  n?: number
  temperature?: number
  top_p?: number
  top_k?: number
  stop?: unknown
  seed?: number

  presence_penalty?: number
  frequency_penalty?: number
  repetition_penalty?: number
  logprobs?: boolean
  top_logprobs?: number
  typical_p?: number
  min_p?: number
  top_a?: number

  stream?: boolean
  stream_options?: CanonicalStreamOptions

  tools?: CanonicalTool[]
  tool_choice?: unknown
  parallel_tool_calls?: boolean

  response_format?: CanonicalResponseFormat
  reasoning?: CanonicalReasoning
  thinking?: CanonicalThinking
  modalities?: string[]
  audio?: CanonicalAudioConfig
  prediction?: unknown
  service_tier?: string
  safety_identifier?: string
  verbosity?: string
  safety_settings?: CanonicalSafetySetting[]
  cache_control?: unknown

  user?: string
  metadata?: Record<string, unknown>

  previous_response_id?: string
  store?: boolean
  include?: string[]
  truncation?: string
  background?: boolean
  conversation?: unknown
  prompt?: unknown

  prompt_cache_key?: string
  prompt_cache_retention?: unknown
  request_id?: string
  session_id?: string
  timeout_ms?: number

  RawExtra?: Record<string, unknown>
}

/** 统一响应（非流式）。 */
export interface CanonicalResponse {
  id: string
  model: string
  created_at: number
  status: string

  output?: CanonicalOutputItem[]

  stop_reason?: string
  incomplete_details?: Record<string, unknown>
  metadata?: Record<string, unknown>
  service_tier?: string
  system_fingerprint?: string

  usage?: CanonicalUsage
  error?: CanonicalError

  RawExtra?: Record<string, unknown>
}

/** 响应输出项：消息 / 工具调用 / 推理等。 */
export interface CanonicalOutputItem {
  id?: string
  type: string
  status?: string
  role?: string

  content?: CanonicalContentPart[]

  call_id?: string
  name?: string
  arguments?: unknown
  tool_calls?: CanonicalToolCall[]
  reasoning?: CanonicalReasoning

  summary?: CanonicalReasoningSummary[]
  metadata?: Record<string, unknown>

  raw?: Record<string, unknown>
}

/** 推理摘要部件。 */
export interface CanonicalReasoningSummary {
  type?: string
  text?: string
}

/**
 * 统一用量。基本三段为必有字段；其余按上游支持情况可选填充，
 * estimated 系列与 estimated 标记用于无精确计量时的估算值。
 */
export interface CanonicalUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number

  cached_input_tokens?: number
  cache_creation_input_tokens?: number
  reasoning_tokens?: number

  text_input_tokens?: number
  text_output_tokens?: number
  image_input_tokens?: number
  image_output_tokens?: number
  audio_input_tokens?: number
  audio_output_tokens?: number
  tool_use_tokens?: number
  accepted_prediction_tokens?: number
  rejected_prediction_tokens?: number

  web_search_call_count?: number
  file_search_call_count?: number
  image_generation_call_count?: number
  code_interpreter_call_count?: number
  computer_use_call_count?: number

  estimated_input_tokens?: number
  estimated_output_tokens?: number
  estimated_total_tokens?: number
  estimated?: boolean

  source?: string
  raw?: Record<string, unknown>
  provider?: string
}

/** 统一错误。 */
export interface CanonicalError {
  message: string
  type?: string
  param?: string
  code?: string
  details?: unknown
  raw?: Record<string, unknown>
}

/**
 * 统一流事件。type 决定哪些字段有值：
 * 文本增量（delta / text_done）、工具调用增量、推理增量、拒绝增量、
 * 完成（finish_reason + usage）、错误、以及 Responses 风格的
 * 完整对象快照（response / output_item / content_part）。
 */
export interface CanonicalStreamEvent {
  type: string

  response_id?: string
  item_id?: string
  model?: string
  status?: string

  output_index?: number
  content_index?: number

  role?: string

  delta?: string
  text_done?: string

  tool_call_id?: string
  tool_call_index?: number
  tool_name?: string
  tool_arguments_delta?: string
  tool_arguments_done?: string
  reasoning_delta?: string
  reasoning_done?: string
  reasoning_signature_delta?: string
  reasoning_signature_provider?: string
  refusal_delta?: string
  refusal_done?: string
  finish_reason?: string
  stop_sequence?: string
  choice_index?: number
  sequence?: number
  created_at?: number

  usage?: CanonicalUsage
  response?: CanonicalResponse
  output_item?: CanonicalOutputItem
  content_part?: CanonicalContentPart
  error?: CanonicalError

  raw?: Record<string, unknown>
}

// Maheshvara 是内部协议的稳定名称，以下别名保持与 Go 侧
// canonical.go 的别名表一一对应。
export type MaheshvaraRequest = CanonicalRequest
export type MaheshvaraMessage = CanonicalMessage
export type MaheshvaraContentPart = CanonicalContentPart
export type MaheshvaraInputItem = CanonicalInputItem
export type MaheshvaraTool = CanonicalTool
export type MaheshvaraToolCall = CanonicalToolCall
export type MaheshvaraReasoning = CanonicalReasoning
export type MaheshvaraResponse = CanonicalResponse
export type MaheshvaraOutputItem = CanonicalOutputItem
export type MaheshvaraUsage = CanonicalUsage
export type MaheshvaraError = CanonicalError
export type MaheshvaraStreamEvent = CanonicalStreamEvent
