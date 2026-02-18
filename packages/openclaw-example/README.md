# @agents-store/openclaw-example

Example OpenClaw plugin by [Agents Store](https://agents.store).

## Install

```bash
openclaw plugins install @agents-store/openclaw-example
openclaw gateway restart
```

## Configure

```json
{
  "plugins": {
    "entries": {
      "openclaw-example": {
        "enabled": true,
        "config": {
          "greeting": "Hello from Agents Store!"
        }
      }
    }
  }
}
```

## Usage

- **Tool:** AI can call `example_greet` automatically
- **Command:** Type `/example` for status check
- **RPC:** `openclaw-example.ping`
