import { config } from './config.js';

export interface WCProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  status: string;
  description: string;
  short_description: string;
  categories: Array<{ id: number; name: string }>;
}

export interface WCOrder {
  id: number;
  status: string;
  currency: string;
  total: string;
  date_created: string;
  payment_method: string;
  payment_method_title: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    city: string;
    country: string;
  };
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    quantity: number;
    price: number;
    total: string;
  }>;
}

export class WooCommerceClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = config.WC_URL.replace(/\/+$/, '') + '/wp-json/wc/v3';
    const authString = `${config.WC_CONSUMER_KEY}:${config.WC_CONSUMER_SECRET}`;
    this.authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
    this.timeoutMs = config.REQUEST_TIMEOUT_MS;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Urumi-WooCommerce-MCP/1.0',
          ...options.headers,
        },
      });

      clearTimeout(timer);

      if (!response.ok) {
        let errorBody = '';
        try {
          const json = await response.json();
          errorBody = json.message || JSON.stringify(json);
        } catch {
          errorBody = await response.text();
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error('WooCommerce API authentication failed. Verify Consumer Key & Secret.');
        } else if (response.status === 404) {
          throw new Error(`Resource not found at ${endpoint}.`);
        } else {
          throw new Error(`WooCommerce API Error (${response.status}): ${errorBody || response.statusText}`);
        }
      }

      return (await response.json()) as T;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`WooCommerce API request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    }
  }

  async listProducts(params: { search?: string; category?: string; per_page?: number; page?: number }): Promise<WCProduct[]> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.category) query.set('category', params.category);
    if (params.per_page) query.set('per_page', String(params.per_page));
    if (params.page) query.set('page', String(params.page));

    const qs = query.toString();
    return this.request<WCProduct[]>(`/products${qs ? `?${qs}` : ''}`);
  }

  async createProduct(data: { name: string; regular_price: string; description?: string; status?: string }): Promise<WCProduct> {
    return this.request<WCProduct>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listOrders(params: { status?: string; per_page?: number; page?: number; customer?: number }): Promise<WCOrder[]> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.per_page) query.set('per_page', String(params.per_page));
    if (params.page) query.set('page', String(params.page));
    if (params.customer) query.set('customer', String(params.customer));

    const qs = query.toString();
    return this.request<WCOrder[]>(`/orders${qs ? `?${qs}` : ''}`);
  }

  async getOrder(orderId: number): Promise<WCOrder> {
    return this.request<WCOrder>(`/orders/${orderId}`);
  }

  async updateOrderStatus(orderId: number, status: string): Promise<WCOrder> {
    return this.request<WCOrder>(`/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }
}
