import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WooCommerceClient } from './wc-client.js';
import {
  ListProductsInputSchema,
  CreateProductInputSchema,
  ListOrdersInputSchema,
  GetOrderInputSchema,
  UpdateOrderStatusInputSchema,
} from './security/input-guard.js';

export function registerWooCommerceTools(server: Server, client: WooCommerceClient) {
  const tools: Tool[] = [
    {
      name: 'woocommerce_list_products',
      description:
        'List products from the WooCommerce store with optional filtering by search keyword, category, and pagination.',
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search keyword to filter products by title or description',
          },
          category: {
            type: 'string',
            description: 'Category name or slug to filter products',
          },
          per_page: {
            type: 'number',
            description: 'Number of products to return (1-100, default 10)',
            default: 10,
          },
          page: {
            type: 'number',
            description: 'Page number for pagination (default 1)',
            default: 1,
          },
        },
      },
    },
    {
      name: 'woocommerce_create_product',
      description:
        'Create a new product in the WooCommerce store with a name, price, description, and status.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name / title of the product',
          },
          regular_price: {
            type: 'string',
            description: 'The regular price as a decimal string (e.g. "49.99")',
          },
          description: {
            type: 'string',
            description: 'Detailed description of the product',
          },
          status: {
            type: 'string',
            enum: ['publish', 'draft', 'pending', 'private'],
            description: 'Product publication status (default: "publish")',
            default: 'publish',
          },
        },
        required: ['name', 'regular_price'],
      },
    },
    {
      name: 'woocommerce_list_orders',
      description:
        'List orders placed on the WooCommerce store with optional filtering by status (e.g. "pending", "processing", "completed") and pagination.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
            description: 'Filter orders by order status',
          },
          per_page: {
            type: 'number',
            description: 'Number of orders to return (1-100, default 10)',
            default: 10,
          },
          page: {
            type: 'number',
            description: 'Page number for pagination (default 1)',
            default: 1,
          },
          customer: {
            type: 'number',
            description: 'Filter orders by customer ID',
          },
        },
      },
    },
    {
      name: 'woocommerce_get_order',
      description:
        'Retrieve full details of a specific WooCommerce order by its order ID, including line items, customer details, and payment status.',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: {
            type: 'number',
            description: 'The numeric ID of the order to retrieve',
          },
        },
        required: ['order_id'],
      },
    },
    {
      name: 'woocommerce_update_order_status',
      description:
        'Update the fulfillment or payment status of an existing WooCommerce order (e.g. change from "pending" to "processing" or "completed").',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: {
            type: 'number',
            description: 'The numeric ID of the order to update',
          },
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
            description: 'The new order status',
          },
        },
        required: ['order_id', 'status'],
      },
    },
  ];

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Call tool handler with guardrails
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'woocommerce_list_products': {
          const validated = ListProductsInputSchema.parse(args || {});
          const products = await client.listProducts(validated);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    regular_price: p.regular_price,
                    status: p.status,
                    permalink: p.permalink,
                    categories: p.categories?.map((c) => c.name) || [],
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'woocommerce_create_product': {
          const validated = CreateProductInputSchema.parse(args || {});
          const product = await client.createProduct(validated);
          return {
            content: [
              {
                type: 'text',
                text: `Successfully created product "${product.name}" with ID #${product.id} (Price: $${product.price}, Status: ${product.status}).\nURL: ${product.permalink}`,
              },
            ],
          };
        }

        case 'woocommerce_list_orders': {
          const validated = ListOrdersInputSchema.parse(args || {});
          const orders = await client.listOrders(validated);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  orders.map((o) => ({
                    id: o.id,
                    status: o.status,
                    total: o.total,
                    currency: o.currency,
                    date_created: o.date_created,
                    payment_method: o.payment_method_title,
                    customer: `${o.billing.first_name} ${o.billing.last_name}`.trim(),
                    email: o.billing.email,
                    items: o.line_items.map((item) => ({
                      product_id: item.product_id,
                      name: item.name,
                      quantity: item.quantity,
                      total: item.total,
                    })),
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'woocommerce_get_order': {
          const validated = GetOrderInputSchema.parse(args || {});
          const order = await client.getOrder(validated.order_id);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    id: order.id,
                    status: order.status,
                    total: order.total,
                    currency: order.currency,
                    date_created: order.date_created,
                    payment_method: order.payment_method_title,
                    billing: order.billing,
                    line_items: order.line_items,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'woocommerce_update_order_status': {
          const validated = UpdateOrderStatusInputSchema.parse(args || {});
          const updated = await client.updateOrderStatus(validated.order_id, validated.status);
          return {
            content: [
              {
                type: 'text',
                text: `Order #${updated.id} status successfully updated to "${updated.status}".`,
              },
            ],
          };
        }

        default:
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Unknown tool "${name}". Available tools: ${tools.map((t) => t.name).join(', ')}`,
              },
            ],
          };
      }
    } catch (error: any) {
      const errorMessage =
        error.errors && Array.isArray(error.errors)
          ? `Input validation failed: ${error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          : error.message || String(error);

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${errorMessage}`,
          },
        ],
      };
    }
  });
}
