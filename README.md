# RoadSide

*Pull over. We'll take it from here.*

Your personal onboarding agent that sets up your entire BlackRoad in minutes through simple conversation.

## The Ride

Pull over at RoadSide. First time on the road? RoadSide hops in, asks where you're headed, collects what you need, and preps the car. You just answer a few questions. It handles the rest.

## What It Does

Conversational setup wizard that walks new users through account creation, AI imports, CarKeys vault setup, RoadTrip passenger selection, and preference configuration — all through natural language chat.

## Integrations

| Service | Role |
|---------|------|
| **Clerk** | Account creation and authentication flow |
| **Cloudflare Workers** | Onboarding logic at the edge |
| **Cloudflare D1** | Onboarding progress and user preferences |
| **Ollama / Workers AI** | Powers the conversational agent |
| **CarKeys** | Auto-generates first credential vault |
| **RoadTrip** | Sets up initial agent convoy |
| **CarPool** | Handles external AI imports during setup |

## Features

- Conversational wizard — asks simple questions, handles the rest
- Auto-creates CarKeys vault and first API keys
- Imports existing AI data (ChatGPT, Claude, Google Docs) via CarPool
- Configures RoadTrip with recommended agents
- Progress dashboard showing setup completion
- "Reset and try again" with zero data loss

## Status

**PLANNED**

## How It Powers The BlackRoad

RoadSide is the friendly voice that gets you rolling before you even realize you're on the road.

---

Part of [BlackRoad OS](https://blackroad.io) — Remember the Road. Pave Tomorrow.
