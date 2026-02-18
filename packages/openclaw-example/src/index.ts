export default function register(api: any) {
  const config = api.config?.plugins?.entries?.["openclaw-example"]?.config ?? {};
  const greeting = config.greeting ?? "Hello from Agents Store!";

  // Agent tool — AI вызывает напрямую
  api.registerTool({
    name: "example_greet",
    description: "Send a greeting from the Example plugin",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name to greet" }
      },
      required: ["name"]
    },
    async execute(_id: string, params: { name: string }) {
      return {
        content: [{ type: "text", text: `${greeting} Nice to meet you, ${params.name}!` }]
      };
    }
  });

  // Slash command — мгновенный ответ без AI
  api.registerCommand({
    name: "example",
    description: "Show example plugin status",
    acceptsArgs: false,
    requireAuth: true,
    handler: () => ({
      text: `✅ Example plugin is running!\nGreeting: ${greeting}`
    })
  });

  // Gateway RPC method
  api.registerGatewayMethod("openclaw-example.ping", ({ respond }: any) => {
    respond(true, { status: "pong", greeting });
  });

  api.logger?.info?.("[openclaw-example] Plugin loaded");
}
