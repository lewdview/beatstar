# Agent Development Guidelines & Rules

## CRITICAL WORKFLOW DIRECTIVE: BEATSTAR-VAULT IS PRIMARY

All AI assistants, developers, and autonomous subagents working on this repository MUST strictly follow this workflow hierarchy:

> [!CAUTION]
> ### 1. Primary Focus: `beatstar-vault` (`artifacts/beatstar-vault`)
> - **ALWAYS** perform development, code modifications, UI features, rhythm engine updates, database logic, gacha tuning, audio filter adjustments, and documentation directly in **`artifacts/beatstar-vault`** (`@workspace/beatstar-vault`).
> - `beatstar-vault` is the single source of truth and primary live-service client application.

> [!NOTE]
> ### 2. Secondary Sync: `rhythm-game` (`artifacts/rhythm-game`)
> - **`artifacts/rhythm-game`** (`@workspace/rhythm-game`) is a secondary standalone client package.
> - Only pop back to `rhythm-game` to sync features, maps, tutorials, or fixes **AFTER** they have been fully built, tested, and validated in `beatstar-vault`.

---

## Workspace Layout Overview

- **Primary Client**: `artifacts/beatstar-vault`
- **Secondary Client**: `artifacts/rhythm-game`
- **Shared Docs & Dossiers**: `project_dossier.md` (root and `artifacts/beatstar-vault/project_dossier.md`)
- **Smart Contracts**: `lib/contracts`
- **Backend / DB**: `supabase/` + Supabase Edge Functions (`vault-engine`, `auth-smart-wallet`)
