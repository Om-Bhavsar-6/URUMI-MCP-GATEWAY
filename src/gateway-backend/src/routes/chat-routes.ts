import { Router, Response } from 'express';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { aggregator } from '../mcp/aggregator.js';
import { authMiddleware, AuthenticatedRequest } from '../security/auth.js';

export const chatRouter = Router();

chatRouter.use(authMiddleware);

const ChatInputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

chatRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, history } = ChatInputSchema.parse(req.body);
    const user = req.user!;
    const tools = await aggregator.getAggregatedTools();

    const toolExecutionLog: any[] = [];
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const functionDeclarations = tools.map((t) => ({
          name: t.name,
          description: t.description || `Execute ${t.name}`,
          parameters: t.inputSchema || { type: 'object', properties: {} },
        }));

        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          tools: [{ functionDeclarations: functionDeclarations as any }],
          systemInstruction: 'You are the Urumi E-Commerce Team MCP Assistant. You have access to real store tools (WooCommerce), logistics/weather tools, and customer CRM notes. Always execute relevant tools through the gateway when asked. Be helpful, concise, and structured.',
        });

        const chat = model.startChat({
          history: history.map((h) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
          })),
        });

        let result = await chat.sendMessage(prompt);
        let call = result.response.functionCalls()?.[0];
        let maxIterations = 5;

        while (call && maxIterations > 0) {
          maxIterations--;
          const toolName = call.name;
          const toolArgs = (call.args as Record<string, any>) || {};
          const startTime = Date.now();

          let toolResult: any;
          try {
            toolResult = await aggregator.executeTool(toolName, toolArgs, user);
          } catch (err: any) {
            toolResult = { error: err.message };
          }

          const durationMs = Date.now() - startTime;
          toolExecutionLog.push({
            tool: toolName,
            args: toolArgs,
            result: toolResult,
            durationMs,
          });

          result = await chat.sendMessage([
            {
              functionResponse: {
                name: toolName,
                response: toolResult,
              },
            },
          ]);
          call = result.response.functionCalls()?.[0];
        }

        return res.json({
          reply: result.response.text(),
          toolCalls: toolExecutionLog,
        });
      } catch (geminiErr: any) {
        console.warn('[Chat] Gemini API error, falling back to local intent tool execution:', geminiErr.message);
      }
    }

    // Local Intent Engine (Runs when no external LLM API key is present or on API fallback)
    const lowerPrompt = prompt.toLowerCase();
    let reply = '';

    if (lowerPrompt.includes('list products') || lowerPrompt.includes('show products') || lowerPrompt.includes('catalog')) {
      const startTime = Date.now();
      const result = await aggregator.executeTool('woocommerce_list_products', { per_page: 5 }, user);
      toolExecutionLog.push({ tool: 'woocommerce_list_products', args: { per_page: 5 }, result, durationMs: Date.now() - startTime });
      const products = JSON.parse(result.content[0].text);
      reply = `I retrieved ${products.length} products from the store:\n` +
        products.map((p: any) => `• **${p.name}** (ID: ${p.id}) - $${p.price} [${p.status}]`).join('\n');

    } else if (lowerPrompt.includes('create product') || lowerPrompt.includes('add product')) {
      const nameMatch = prompt.match(/(?:named|called)\s+['"]?([^'",]+)['"]?/i) || prompt.match(/product\s+['"]?([^'",]+)['"]?\s+(?:priced|for|\$)/i);
      const priceMatch = prompt.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
      const name = nameMatch ? nameMatch[1].trim() : 'Pro Wireless Earbuds';
      const price = priceMatch ? priceMatch[1] : '79.99';

      const startTime = Date.now();
      const result = await aggregator.executeTool('woocommerce_create_product', { name, regular_price: price }, user);
      toolExecutionLog.push({ tool: 'woocommerce_create_product', args: { name, regular_price: price }, result, durationMs: Date.now() - startTime });
      const created = JSON.parse(result.content[0].text);
      reply = `Successfully created product **${created.name}** with ID #${created.id} priced at $${created.price}!`;

    } else if (lowerPrompt.includes('order') && (lowerPrompt.includes('list') || lowerPrompt.includes('show') || lowerPrompt.includes('recent'))) {
      const startTime = Date.now();
      const result = await aggregator.executeTool('woocommerce_list_orders', { per_page: 5 }, user);
      toolExecutionLog.push({ tool: 'woocommerce_list_orders', args: { per_page: 5 }, result, durationMs: Date.now() - startTime });
      const orders = JSON.parse(result.content[0].text);
      reply = `Found ${orders.length} orders in the store:\n` +
        orders.map((o: any) => `• **Order #${o.id}** (${o.billing_name}) - $${o.total} [${o.status}]`).join('\n');

    } else if (lowerPrompt.includes('weather') || lowerPrompt.includes('forecast')) {
      const cityMatch = prompt.match(/(?:for|in)\s+([a-zA-Z\s]+)/i);
      const city = cityMatch ? cityMatch[1].trim() : 'Bengaluru';
      const startTime = Date.now();
      const result = await aggregator.executeTool('weather_get_forecast', { city, days: 3 }, user);
      toolExecutionLog.push({ tool: 'weather_get_forecast', args: { city, days: 3 }, result, durationMs: Date.now() - startTime });
      const weather = JSON.parse(result.content[0].text);
      reply = `Weather forecast for **${weather.city}**:\n` +
        weather.forecast.map((f: any) => `• ${f.day}: ${f.temperature}, ${f.condition} (${f.precipitation_chance} rain)`).join('\n');

    } else if (lowerPrompt.includes('shipping') || lowerPrompt.includes('rate') || lowerPrompt.includes('carrier')) {
      const startTime = Date.now();
      const result = await aggregator.executeTool('shipping_get_rates', { destination_country: 'IN', weight_kg: 2.0, service_level: 'express' }, user);
      toolExecutionLog.push({ tool: 'shipping_get_rates', args: { destination_country: 'IN', weight_kg: 2.0, service_level: 'express' }, result, durationMs: Date.now() - startTime });
      const rates = JSON.parse(result.content[0].text);
      reply = `Shipping estimate to **${rates.destination}** via ${rates.carrier}: **${rates.cost_usd}** (${rates.service_level}, est. ${rates.estimated_days}).`;

    } else if (lowerPrompt.includes('note') && lowerPrompt.includes('save')) {
      const emailMatch = prompt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const email = emailMatch ? emailMatch[1] : 'alice@example.com';
      const noteText = prompt.replace(/.*(?:note|save)\s+/i, '').trim() || 'Customer requested expedited priority support.';
      const startTime = Date.now();
      const result = await aggregator.executeTool('customer_notes_save', { customer_email: email, note: noteText, category: 'vip' }, user);
      toolExecutionLog.push({ tool: 'customer_notes_save', args: { customer_email: email, note: noteText }, result, durationMs: Date.now() - startTime });
      reply = `Saved internal customer note for **${email}** successfully.`;

    } else if (lowerPrompt.includes('note')) {
      const emailMatch = prompt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const email = emailMatch ? emailMatch[1] : 'alice@example.com';
      const startTime = Date.now();
      const result = await aggregator.executeTool('customer_notes_get', { customer_email: email }, user);
      toolExecutionLog.push({ tool: 'customer_notes_get', args: { customer_email: email }, result, durationMs: Date.now() - startTime });
      const notesData = JSON.parse(result.content[0].text);
      reply = `Found ${notesData.total_notes} notes for **${email}**:\n` +
        notesData.notes.map((n: any) => `• [${n.category.toUpperCase()}] ${n.note} (${new Date(n.created_at).toLocaleDateString()})`).join('\n');

    } else {
      reply = `I am connected to the Team MCP Gateway. I can help you with:\n` +
        `• **WooCommerce**: Create products, list inventory, view orders, update order status\n` +
        `• **Logistics**: Calculate shipping rates and check weather forecasts for delivery destinations\n` +
        `• **CRM**: Retrieve customer notes and save internal preferences\n\n` +
        `Try: *"Show me the store products"*, *"Create a product 'Mechanical Keyboard' for $89"*, or *"Get weather for London"*!`;
    }

    res.json({
      reply,
      toolCalls: toolExecutionLog,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
