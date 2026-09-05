/**
 * Typed API client for AIBuyable Gateway backend.
 * Uses fetch with JWT token from localStorage.
 * All errors are caught and surfaced as { error: string }.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  merchant_id: string;
  role: string;
  name: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  razorpay_key_id?: string;
  razorpay_key_secret?: string;
  store_website_url?: string;
}

// ─── Products ─────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  merchant_id: string;
  external_id?: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  stock_qty: number;
  image_url?: string;
  category?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MerchantProfile {
  id: string;
  name: string;
  email: string;
  store_website_url?: string;
  razorpay_key_id?: string;
  has_razorpay_secret: boolean;
  crawl_status: string;
  created_at: string;
}

// ─── Guardrails ───────────────────────────────────────────────────────────

export interface Guardrail {
  id: string;
  merchant_id: string;
  max_discount_percent: number;
  max_auto_approve_amount: number;
  require_hitl_above_amount: number;
  daily_agent_spend_cap?: number;
  allowed_payment_methods: string[];
  updated_at?: string;
}

// ─── Orders ───────────────────────────────────────────────────────────────

export interface OrderItem {
  product_id: string;
  name?: string;
  qty: number;
  unit_price: number;
  discount_percent: number;
  line_total: number;
}

export interface Order {
  id: string;
  merchant_id: string;
  source: string;
  buyer_reference?: string;
  status: string;
  items: OrderItem[];
  requested_discount_percent: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  razorpay_order_id?: string;
  razorpay_payment_link_id?: string;
  razorpay_payment_link_url?: string;
  failure_reason?: string;
  hitl_approved_by?: string;
  hitl_approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  merchant_id: string;
  order_id?: string;
  actor: string;
  step: string;
  decision: string;
  reason?: string;
  input_snapshot?: Record<string, unknown>;
  output_snapshot?: Record<string, unknown>;
  created_at: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────

export interface ChatResponse {
  final_message: string;
  current_step: string;
  order_id?: string;
  status?: string;
  payment_link_url?: string;
  guardrail_decision?: string;
  guardrail_reason?: string;
  fallback_triggered: boolean;
  llm_used?: string;
  matched_products?: Product[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem('aibuyable_token');
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errorDetail = errBody.detail || errBody.message || errorDetail;
    } catch { /* ignore */ }
    throw new Error(errorDetail);
  }

  return response.json() as Promise<T>;
}

// ─── Auth API ─────────────────────────────────────────────────────────────

export const authApi = {
  signup: (data: SignupRequest) =>
    apiFetch<TokenResponse>('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (email: string, password: string) =>
    apiFetch<TokenResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
};

// ─── Merchant API ─────────────────────────────────────────────────────────

export const merchantApi = {
  getProfile: () =>
    apiFetch<MerchantProfile>('/api/v1/merchant/me'),

  updateProfile: (update: Record<string, string | undefined>) =>
    apiFetch<MerchantProfile>('/api/v1/merchant/me', {
      method: 'PUT',
      body: JSON.stringify(update),
    }),

  startCrawl: (merchantId: string) =>
    apiFetch(`/api/v1/merchant/${merchantId}/crawl/start`, { method: 'POST' }),

  getCrawlStatus: (merchantId: string) =>
    apiFetch<{ merchant_id: string; crawl_status: string; crawl_error?: string; products_count: number }>(
      `/api/v1/merchant/${merchantId}/crawl/status`
    ),

  getProducts: (merchantId: string) =>
    apiFetch<Product[]>(`/api/v1/merchant/${merchantId}/products`),

  getAllProducts: (merchantId: string) =>
    apiFetch<Product[]>(`/api/v1/merchant/${merchantId}/products?active_only=false`),

  updateProduct: (merchantId: string, productId: string, update: Partial<Product>) =>
    apiFetch<Product>(`/api/v1/merchant/${merchantId}/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    }),

  getGuardrails: (merchantId: string) =>
    apiFetch<Guardrail>(`/api/v1/merchant/${merchantId}/guardrails`),

  updateGuardrails: (merchantId: string, update: Partial<Guardrail>) =>
    apiFetch<Guardrail>(`/api/v1/merchant/${merchantId}/guardrails`, {
      method: 'PUT',
      body: JSON.stringify(update),
    }),
};

// ─── Orders API ───────────────────────────────────────────────────────────

export const ordersApi = {
  list: (status?: string) =>
    apiFetch<Order[]>(`/api/v1/orders${status ? `?status_filter=${status}` : ''}`),

  getOrder: (orderId: string) =>
    apiFetch<Order>(`/api/v1/orders/${orderId}`),

  getHitlPending: () =>
    apiFetch<Order[]>('/api/v1/orders/hitl'),

  getAudit: (orderId: string) =>
    apiFetch<AuditLog[]>(`/api/v1/orders/${orderId}/audit`),

  hitlApprove: (orderId: string) =>
    apiFetch(`/api/v1/orders/${orderId}/hitl/approve`, { method: 'POST' }),

  hitlReject: (orderId: string, reason?: string) =>
    apiFetch(`/api/v1/orders/${orderId}/hitl/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// ─── Chat API ─────────────────────────────────────────────────────────────

export const chatApi = {
  sendMessage: (merchantId: string, message: string, buyerReference?: string) =>
    apiFetch<ChatResponse>('/api/v1/chat/message', {
      method: 'POST',
      body: JSON.stringify({ merchant_id: merchantId, message, buyer_reference: buyerReference }),
    }),
};

// ─── Admin API ────────────────────────────────────────────────────────────

export const adminApi = {
  getMerchants: () =>
    apiFetch<{ merchants: unknown[]; platform_stats: Record<string, number> }>('/api/v1/admin/merchants'),

  getMerchantDetail: (merchantId: string) =>
    apiFetch(`/api/v1/admin/merchants/${merchantId}`),
};

// ─── Internal (Fault Injection) API ───────────────────────────────────────

export const internalApi = {
  injectFault: (faultType: 'timeout' | 'insufficient_funds' | 'expired_link') =>
    apiFetch(`/api/v1/internal/fault-injection/${faultType}`, { method: 'POST' }),
};

// ─── Agentic API ──────────────────────────────────────────────────────────

export const agenticApi = {
  getCatalog: (merchantId: string) =>
    apiFetch(`/api/v1/agentic/catalog?merchant_id=${merchantId}`),

  getGuardrails: (merchantId: string) =>
    apiFetch(`/api/v1/agentic/guardrails?merchant_id=${merchantId}`),

  checkout: (request: { merchant_id: string; buyer_reference: string; items: { product_id: string; qty: number }[]; requested_discount_percent?: number }) =>
    apiFetch('/api/v1/agentic/checkout', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};
