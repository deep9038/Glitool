# glitool

AI coding assistant for your terminal. Powered by OpenAI.


## Install

```bash
npm install -g glitool
```

## Setup

On first run, glitool will ask for your OpenAI API key. Get one at https://platform.openai.com/api-keys

Or set it manually:

```bash
mkdir ~/.glitool
echo "OPENAI_API_KEY=sk-..." > ~/.glitool/.env
```

## Usage

```bash
glitool              # start AI chat session
glitool --explain    # explain every change in simple language
glitool config --set-name "Your Name"
glitool config --set-model gpt-4o
glitool config --show
```

## Commands (inside chat)

| Command | Description |
|---------|-------------|
| /help   | Show available commands |
| /clear  | Clear current session |
| /reset  | Clear session + memory |
| /exit   | Save and exit |

## Requirements

- Node.js 18+
- OpenAI API key
