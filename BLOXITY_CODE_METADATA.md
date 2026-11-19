---
# Answers to the Bloxity SDK integration questions (docs.bloxity.io, used by audit_sdk / review).
canDie: false # falling off the lane only teleports you back to the hub: no death, no loss
hasScore: true # leaderboards: total-earned, jump-power, rebirths (declared in src/config.js, reported by the server)
rewards: true # one rewarded ad: the "Free Boost" offer (config ADS), granted only on `completed`
notApplicable:
  - feature: death-screen
    reason: The player cannot die. Falling below the world only respawns them at their base (R / respawn_request), with no penalty.
  - feature: gems
    reason: By design nothing in this game costs a premium currency; every price is in-game money (see CLAUDE.md).
  - feature: party
    reason: The game runs on Bloxity-hosted servers, which handle party play automatically (the SDK loads from the pinned v1 URL and the room size is set).
  - feature: character-kit
    reason: The avatar is dressed by the game's own loader (src/avatar), not Legion.SDK.character.
---

# Jump to Reach the Sky: Bloxity integration notes

SDK integrations in the client (`src/bloxity.js` is the only place that calls the SDK):

- init, loading steps, `loadingEnd` + `gameplayStart` after the first frame, `gameplayEnd` on unload
- auth (`onUserChanged`) and the player's token, sent to the game server which verifies it with Bloxity
- settings: `graphics_quality`, `camera_sensitivity`, `show_fps`, `fullscreen`, `master_volume`,
  `music_volume` (ambience bed), `enable_chat` (chat bubbles), `background_transparency` (window panels)
- avatar + proportions, avatar customizer (drawn by Boxity), `respawn_request`, `portal.showMenu` on Esc
- reserved UI areas (the HUD keeps clear of Boxity's toolbar and chat)
- ads: break handlers (pause + mute), `declareScreens` (`panel`, `gameplay`), banner ads while a window
  is open, one rewarded ad placement `free-boost`
- leaderboards: `leaderboard.define` (client) + hosted score reports (server, `src/reporter.ts` in the backend)
- chat bubbles over the local player, emotes (`registerFeature('emotes')`, `play_emote`, the catalogue clip
  player in `src/avatar/emotes.js`)
- multiplayer: matchmaker `net.resolveEndpoint`, `updateRoom`, the `?roomId=` launch room, friend-join toasts
  (`playerJoined` / `playerInRoom`); room size = the number of bases in the hub
